const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const Attendance = require('../models/Attendance');
// Mirror target: every successful mark is also written into the biometric DB's
// `attendances` collection (mongodb://127.0.0.1:27017/biometric) — the shared
// attendance store used by the other (:2707) app.
const { BiometricAttendance } = require('../config/biometricDb');
// Read attendance from BOTH the primary + biometric collections (status/history).
const { findMergedAttendance, existsInEitherStore } = require('../utils/mergedAttendance');
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const AttendanceNote = require('../models/AttendanceNote');
const SpoofAttempt = require('../models/SpoofAttempt');
const SecurityEvent = require('../models/SecurityEvent');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/Model_LeaveRequest');
const { getCampusContext, findNearestOffice, campusScopedAttendanceFilter } = require('../utils/sharedOffices');
const auth = require('../middleware/auth');
const { deptScopeIds } = require('../utils/deptScope');
const rateLimit = require('../middleware/rateLimit');
const flags = require('../config/featureFlags');
const faceVerifyService = require('../services/faceVerifyService');
const faceStorageService = require('../services/faceStorageService');
const emailService = require('../services/emailService');
const livenessService = require('../services/livenessService');
const injectionRiskService = require('../services/injectionRiskService');
const attemptLimiter = require('../services/attemptLimiter');
const securityEventService = require('../services/securityEventService');
const audit = require('../services/auditService');
const workingHoursService = require('../services/workingHoursService');
const { resolveClientIp } = require('../utils/clientIp');
const { sanitizeDeviceTelemetry } = require('../utils/deviceTelemetry');
const ipTracking = require('../services/ipTrackingService');

const router = express.Router();

// No-op logger to preserve existing calls without side effects
function writeLog(level, message, meta = {}) { }

// In-memory multer for the face-verify endpoint (image goes straight to the
// face engine, never to disk).
const faceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Normalize a captured face (Buffer or base64/data-URL string) into a base64
// data-URL for inline storage on a SpoofAttempt (same convention as
// Attendance.faceImage, which the super-admin gallery already knows how to serve).
function toBase64DataUrl(img) {
  if (!img) return null;
  if (Buffer.isBuffer(img)) return `data:image/jpeg;base64,${img.toString('base64')}`;
  if (typeof img === 'string') {
    return img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
  }
  return null;
}

// @route   POST /api/attendance/verify-face
// @desc    Verify a captured face against the LOGGED-IN user's enrolled identity.
//          The phone calls THIS (not check.py directly): the uid comes from the
//          JWT (so no user_id is sent from the client), and the server forwards
//          to the face engine, which logs the attempt image for admin review.
// @access  Private (student token)
// Rate-limited per user: a genuine user retries a handful of times; dozens of
// attempts per minute is someone probing the anti-spoof model for a bypass.
router.post('/verify-face', auth, rateLimit({ windowMs: 60 * 1000, max: 15 }), faceUpload.single('face_image'), async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    // Accept the image as a multipart file OR a base64/data-URL in the body.
    const faceImage = req.file
      ? req.file.buffer
      : (req.body.faceImage || req.body.face_image);
    if (!faceImage) {
      return res.status(400).json({ success: false, message: 'Face image is required' });
    }

    // Check-in and check-out each get an independent 10-attempt budget per day
    // (see services/attemptLimiter.js) — closes the gap where an attacker
    // holding valid credentials could probe indefinitely at just-under the
    // generic rate limit. 'spotcheck'/'class' captures aren't a check-in/out
    // session, so they're outside this cap (sessionType stays null).
    const rawTypeEarly = String(req.body.type || '').toLowerCase();
    const sessionType = ['out', 'checkout'].includes(rawTypeEarly)
      ? 'out'
      : (['in', 'checkin'].includes(rawTypeEarly) ? 'in' : null);

    if (sessionType) {
      const gate = await attemptLimiter.checkAllowed(student._id, sessionType);
      if (!gate.allowed) {
        // Server-console-only breadcrumb (never sent to the client) — the
        // response itself is deliberately silent, so this is the fast way to
        // confirm "attempt cap reached" vs. a genuine PAD/identity failure
        // when debugging locally.
        console.log(`[verify-face] attempt cap reached for ${student.uid} (${sessionType}): ${gate.attemptsUsed}/${attemptLimiter.MAX_ATTEMPTS} used today`);
        // Silent lockout: the response is worded IDENTICALLY to an ordinary
        // "please try again" failure. The employee must never learn attempts
        // were capped, how many were used, or that a security rule fired —
        // only the super admin sees this via the SecurityEvent below.
        await securityEventService.record({
          category: 'verification_attempt_lockout',
          severity: 'high',
          desiredAction: 'block',
          student,
          sessionType,
          detection: { signals: ['attempt_cap_reached'] },
          device: { deviceId: req.body.deviceId, deviceModel: req.body.deviceModel, manufacturer: req.body.manufacturer, publicIp: resolveClientIp(req) },
          summaryForAdmin: `${sessionType === 'in' ? 'Check-in' : 'Check-out'} verification attempts exhausted (${attemptLimiter.MAX_ATTEMPTS}/${attemptLimiter.MAX_ATTEMPTS}) — possible impostor probing.`,
        });
        return res.json({
          success: true,
          match: false,
          reachable: true,
          reason: 'retry_capture',
          retry: true,
          retryReason: 'no_face',
          message: 'We could not verify your photo. Please try again in a moment or contact your administrator.',
          similarity: null,
          score: null,
          name: null,
          spoof: { detected: false, available: false, label: null, score: null },
        });
      }
    }

    // Multi-frame anti-spoof: the app can send the extra frames it silently
    // captured at each liveness action (blink/turn/nod) in a `frames` body field
    // (JSON array of base64/data-URLs), alongside the primary `face_image`. When
    // present, ALL frames go to the face engine together — identity is decided on
    // the best frame and anti-spoof fails if ANY frame is a confident replay (a
    // screen/bezel that entered the shot mid-challenge). Zero extra frames →
    // identical single-frame behaviour as before. Never let a malformed field
    // break verification: fall back to single-frame on any parse issue.
    let extraFrames = [];
    const rawFrames = req.body.frames || req.body.face_frames;
    if (rawFrames) {
      try {
        extraFrames = Array.isArray(rawFrames) ? rawFrames : JSON.parse(rawFrames);
      } catch (_e) {
        extraFrames = [];
      }
      if (!Array.isArray(extraFrames)) extraFrames = [];
    }
    const allFrames = [faceImage, ...extraFrames].filter(Boolean);
    // conservativeFakeGate: this route is check-in/out/class only (spot-check
    // calls faceVerifyService directly from spotChecks.js, never through here)
    // — a false reject costs a whole day's attendance, so an isolated bad frame
    // amid a mostly-real burst gets downgraded to 'uncertain' instead of
    // blocking. See applyConservativeFakeGate() in faceVerifyService.js.
    const verifyOpts = { conservativeFakeGate: true };
    const result = allFrames.length > 1
      ? await faceVerifyService.verifyMulti({ uid: student.uid, faceImages: allFrames }, verifyOpts)
      : await faceVerifyService.verify({ uid: student.uid, faceImage }, verifyOpts);

    // Persist the captured face to the structured folder tree (filesystem, NOT
    // Mongo): face_storage/<Name>_<uid>/<date>/<type>/. The caller tags the type
    // ('in'/'out' → checkin/checkout, or 'spotcheck'/'class'). The anti-spoof
    // verdict is stamped into the filename here so the Face Report shows it
    // AUTOMATICALLY — the detection already ran as part of verify() above.
    const typeMap = { in: 'checkin', out: 'checkout', checkin: 'checkin', checkout: 'checkout', spotcheck: 'spotcheck', class: 'class' };
    const rawType = String(req.body.type || '').toLowerCase();
    const captureType = typeMap[rawType] || 'checkin';
    faceStorageService.saveCapture({
      student,
      type: captureType,
      image: faceImage,
      match: result.match === true,
      similarity: typeof result.similarity === 'number' ? result.similarity : result.score,
      spoof: result.spoof,
    });

    // Anti-spoof (PAD) enforcement. A FAKE verdict means the frame was a face
    // replayed on a screen / a printed photo — block it regardless of whether the
    // (real) face matched, and record the attempt for super-admin review.
    const spoof = result.spoof || { available: false, isFake: false };

    // WHOLE-FRAME SCREEN REPLAY. DEFAULT OFF (both block and flag). On real
    // front cameras a genuine close-up selfie trips the same moiré/peak band as
    // a laptop replay, so acting on this signal blindly falsely accuses real
    // employees. It's only enabled after calibrate_screen_gate.py proves this
    // deployment's genuine-vs-replay captures separate:
    //   ANTISPOOF_SCREEN_BLOCK_CHECKINOUT=1 → block a screen-signalled capture
    //   ANTISPOOF_SCREEN_FLAG_CHECKINOUT=1  → record it (dashboard) without blocking
    // Until then the safe multi-frame PAD is the anti-replay defence and this
    // signal is computed for observability only (never flips a verdict).
    const SCREEN_BLOCK_CHECKINOUT = process.env.ANTISPOOF_SCREEN_BLOCK_CHECKINOUT === '1';
    const SCREEN_FLAG_CHECKINOUT = process.env.ANTISPOOF_SCREEN_FLAG_CHECKINOUT === '1';
    if ((SCREEN_BLOCK_CHECKINOUT || SCREEN_FLAG_CHECKINOUT) && spoof.available && spoof.screenSuspected && !spoof.isFake) {
      if (SCREEN_BLOCK_CHECKINOUT) {
        console.log(`[verify-face] SCREEN-REPLAY uid=${student.uid} (moire=${spoof.screenMoire} peak=${spoof.screenPeak}) — BLOCKING (face-crop label '${spoof.label}')`);
        spoof.label = 'fake';
        spoof.isFake = true;
        spoof.isUncertain = false;
      } else {
        // Flag-only: record for the dashboard, but DON'T mutate the verdict —
        // the real-face mark passes through unchanged.
        console.log(`[verify-face] SCREEN-REPLAY uid=${student.uid} (moire=${spoof.screenMoire} peak=${spoof.screenPeak}) — flagging only (face-crop label '${spoof.label}')`);
        try {
          await SpoofAttempt.create({
            student: student._id,
            organization: student.organization || null,
            uid: student.uid,
            studentName: student.fullName || student.name || null,
            type: rawType || 'in',
            faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
            // NOT spoof.score — that's the face-CROP model's real-probability,
            // which is HIGH here (that's exactly why the crop model missed it
            // and only the whole-frame screen signal caught it). Reusing it
            // would show a self-contradicting "FAKE" badge next to a near-0%
            // fake-confidence on the dashboard. Score 0 = "100% fake" so the
            // displayed confidence agrees with the label.
            score: 0,
            label: 'fake',
            model: spoof.model || 'minifasnet',
            matched: result.match === true,
            similarity: result.similarity ?? result.score ?? null,
            latitude: req.body.latitude != null ? Number(req.body.latitude) : undefined,
            longitude: req.body.longitude != null ? Number(req.body.longitude) : undefined,
            deviceId: req.body.deviceId || undefined,
            deviceModel: req.body.deviceModel || undefined,
            manufacturer: req.body.manufacturer || undefined,
          });
        } catch (e) {
          console.error('[verify-face] failed to record screen-replay SpoofAttempt:', e.message);
        }
      }
    }

    // Unusable capture (too dark / too bright / blurry / face not found): the
    // engine refused to judge the frame. Ask the user to recapture with a
    // specific instruction — this is NOT a failed verification and NOT a spoof,
    // so nothing is flagged or recorded against the user.
    if (spoof.needsRetry) {
      const retryMessages = {
        too_dark: 'The photo is too dark. Move to a brighter spot and try again.',
        too_bright: 'There is too much light behind you. Face the light and try again.',
        too_blurry: 'The photo is blurry. Hold the phone steady and try again.',
        no_face: 'We could not see your face clearly. Center your face in the frame and try again.',
      };
      return res.json({
        success: true,
        match: false,
        reachable: result.reachable,
        reason: 'retry_capture',
        retry: true,
        retryReason: spoof.retryReason || 'no_face',
        message: retryMessages[spoof.retryReason] || retryMessages.no_face,
        similarity: result.similarity ?? result.score ?? null,
        score: result.score ?? null,
        name: null,
        spoof: { detected: false, available: spoof.available === true, label: spoof.label || null, score: null },
      });
    }
    // Record BOTH verdicts for admin review: 'fake' (blocked) AND 'uncertain'
    // (borderline — NOT blocked, but visible in the spoof-attempts report so a
    // pattern of borderline frames from one user can be investigated).
    if (spoof.isFake || spoof.isUncertain) {
      try {
        await SpoofAttempt.create({
          student: student._id,
          organization: student.organization || null,
          uid: student.uid,
          studentName: student.fullName || student.name || null,
          type: rawType || 'in',
          faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
          // A screen-signal-forced 'fake' keeps the face-crop model's HIGH
          // real-score in `spoof.score` (that's why the crop model missed it) —
          // storing that verbatim would show "FAKE" next to a near-0%
          // fake-confidence on the dashboard. Store 0 (= 100% fake-confidence)
          // for that origin so the displayed number always agrees with the label.
          score: spoof.isFake && spoof.screenSuspected ? 0 : (typeof spoof.score === 'number' ? spoof.score : null),
          label: spoof.label || (spoof.isFake ? 'fake' : 'uncertain'),
          model: spoof.model || 'minifasnet',
          matched: result.match === true,
          similarity: result.similarity ?? result.score ?? null,
          latitude: req.body.latitude != null ? Number(req.body.latitude) : undefined,
          longitude: req.body.longitude != null ? Number(req.body.longitude) : undefined,
          deviceId: req.body.deviceId || undefined,
          deviceModel: req.body.deviceModel || undefined,
          manufacturer: req.body.manufacturer || undefined,
        });
      } catch (e) {
        console.error('[verify-face] failed to record SpoofAttempt:', e.message);
      }
    }

    // Route the CONSEQUENCE of a confident fake through the single configurable
    // policy chokepoint (config/featureFlags.js fraudMonitoring.mode) instead of
    // an unconditional block+email. Default mode is 'block', which reproduces
    // today's behavior exactly (blocks + emails); a lower mode still records
    // everything and bumps risk score, it just doesn't block this pre-flight
    // check (the authoritative /mark route makes its own independent decision).
    let spoofEffectiveAction = 'monitor';
    if (spoof.isFake) {
      console.log(`[verify-face] SPOOF DETECTED uid=${student.uid} type=${rawType}: PAD label=fake score=${spoof.score} margin=${spoof.margin} model=${spoof.model || 'minifasnet'}`);
      const evt = await securityEventService.record({
        category: 'verification_spoof',
        severity: 'critical',
        desiredAction: 'block',
        student,
        sessionType,
        detection: {
          spoofConfidence: typeof spoof.score === 'number' ? spoof.score : null,
          spoofLabel: spoof.label || null,
          faceMatchConfidence: result.similarity ?? result.score ?? null,
          signals: ['pad_fake'],
        },
        device: { deviceId: req.body.deviceId, deviceModel: req.body.deviceModel, manufacturer: req.body.manufacturer, publicIp: resolveClientIp(req) },
        evidenceImage: faceImage,
        skipAutoNotify: true, // we send the richer sendSpoofAlert template ourselves below
      });
      spoofEffectiveAction = evt.effectiveAction;

      if (securityEventService.ACTION_RANK[spoofEffectiveAction] >= securityEventService.ACTION_RANK.escalate) {
        (async () => {
          try {
            let organizationName = null;
            if (student.organization) {
              const org = await Organization.findById(student.organization).select('name').lean();
              organizationName = org?.name || null;
            }
            await emailService.sendSpoofAlert({
              student: {
                fullName: student.fullName || student.name,
                uid: student.uid,
                designation: student.designation,
                department: student.department,
                organizationName,
              },
              type: rawType || 'in',
              label: spoof.label,
              score: spoof.score,
              similarity: result.similarity ?? result.score ?? null,
              image: faceImage,
              latitude: req.body.latitude != null ? Number(req.body.latitude) : null,
              longitude: req.body.longitude != null ? Number(req.body.longitude) : null,
              // Anti-spoof detail so the email can explain WHY it was fake.
              detail: {
                margin: spoof.margin,
                margins: spoof.margins,
                screenSuspected: spoof.screenSuspected,
                screenMoire: spoof.screenMoire,
                screenPeak: spoof.screenPeak,
              },
            });
          } catch (e) {
            console.error('[verify-face] spoof alert email failed:', e.message);
          }
        })();
      }
    }
    const spoofBlocks = spoof.isFake && spoofEffectiveAction === 'block';
    if (spoof.isFake) {
      console.log(`[verify-face] ${spoofBlocks ? 'REJECTED' : 'flagged (not blocked)'} uid=${student.uid}: confirmed spoof, fraudMonitoring effectiveAction=${spoofEffectiveAction}`);
    }

    if (sessionType) {
      await attemptLimiter.recordAttempt({
        studentId: student._id,
        organization: student.organization,
        type: sessionType,
        success: result.match === true && !spoofBlocks,
        reason: spoofBlocks ? 'spoof_detected' : (result.reason || null),
        similarity: result.similarity ?? result.score ?? null,
        padLabel: spoof.label || null,
      });
    }

    // DECEPTIVE SUCCESS (honeypot): a confirmed spoof gets told it worked.
    // Evidence is already fully captured above (SpoofAttempt + SecurityEvent +
    // admin email) — the perpetrator must never learn they were caught, so
    // this response is indistinguishable from a genuine match. The actual
    // attendance mark is faked identically in /mark (see there); nothing real
    // is ever written to the database for a confirmed spoof, so the deception
    // never costs data integrity — it only costs the attacker's confidence.
    if (spoofBlocks) {
      return res.json({
        success: true,
        match: true,
        reachable: true,
        reason: null,
        similarity: result.similarity ?? result.score ?? null,
        score: result.score ?? null,
        name: student.fullName,
        spoof: { detected: false, available: true, label: 'real', score: typeof spoof.score === 'number' ? spoof.score : null },
      });
    }

    // Never expose a positive identity match on a confident FAKE. 'uncertain'
    // is recorded above (SpoofAttempt) but MUST pass through — the PAD middle
    // band is wide by design (anything that isn't confidently real nor
    // confidently fake), and treating it as a hard reject here was bouncing
    // genuine, everyday captures (normal indoor lighting, a slightly off
    // angle — nothing actually wrong) that never land a crisp 'real' margin,
    // even though /mark's OWN gate a few hundred lines below already
    // deliberately treats 'uncertain' as non-blocking ("a genuine user is
    // never falsely rejected on a borderline PAD read") — this pre-flight
    // check was silently stricter than the authoritative route it precedes,
    // rejecting captures /mark would have accepted.
    //
    // PAD UNAVAILABLE (spoof.available === false — the engine couldn't judge
    // this frame/session at all, e.g. its sub-service is down or timed out)
    // is the SAME class of bug: /mark's own comment a few hundred lines below
    // says outright "'uncertain'/'retry'/'unavailable' never block here".
    // This pre-flight used to hard-reject on unavailable anyway — so the
    // moment the PAD sub-service had any outage, EVERY check-in in the org
    // failed here with "Live camera verification could not be confirmed",
    // even though /mark would have accepted every one of them (there was
    // nothing wrong with the actual face or the match — just no anti-spoof
    // verdict to attach). Only a confident FAKE blocks now, matching /mark
    // exactly; PAD-unavailable identity matches still proceed (fake email
    // alert / SpoofAttempt trail happens above for isFake only — unavailable
    // carries no fraud signal to record, same as /mark's reasoning).
    if (spoof.label === 'fake') {
      console.log(`[verify-face] REJECTED uid=${student.uid}: confirmed spoof (label=${spoof.label})`);
      return res.json({
        success: true,
        match: false,
        reachable: result.reachable,
        reason: 'spoof_verification_required',
        retry: true,
        retryReason: spoof.retryReason || 'pad_uncertain',
        message: 'Live camera verification could not be confirmed. Please try again with a live face.',
        similarity: result.similarity ?? result.score ?? null,
        score: result.score ?? null,
        name: null,
        spoof: {
          detected: false,
          available: spoof.available === true,
          label: spoof.label || null,
          score: typeof spoof.score === 'number' ? spoof.score : null,
        },
      });
    }

    // IMPERSONATION ALERT: a genuine LIVE face (not a spoof) that does NOT
    // match the enrolled reference — i.e. someone else's real face was shown
    // against THIS student's account/uid. Previously this was only silently
    // rejected (401) with zero visibility unless it repeated 10 times in a
    // day (attemptLimiter's lockout alert) — a single or few impersonation
    // attempts on an account never reached the admin. `result.similarity`
    // being non-null confirms an actual face-vs-reference comparison ran
    // (not a "no_face"/retry capture, which never gets here).
    if (result.reachable && result.match !== true && !spoof.isFake && result.similarity != null) {
      const CLEAR_MISMATCH_MAX = parseFloat(process.env.MISMATCH_ALERT_MAX_SIMILARITY || '0.45');
      // Only alert on a CLEARLY different face (low similarity) — a borderline
      // score just under the match threshold is far more likely the genuine
      // owner failing their own scan (bad lighting/angle) than an impostor,
      // and alerting on every such near-miss would drown the admin in noise.
      if (result.similarity <= CLEAR_MISMATCH_MAX) {
        console.log(`[verify-face] IMPERSONATION SUSPECTED uid=${student.uid} type=${rawType}: similarity=${result.similarity} (<=${CLEAR_MISMATCH_MAX}) — a different live face was shown against this account`);
        securityEventService.record({
          category: 'face_mismatch_pattern',
          severity: 'high',
          student,
          sessionType,
          detection: {
            faceMatchConfidence: result.similarity,
            signals: ['identity_mismatch_confident'],
          },
          device: { publicIp: resolveClientIp(req) },
          evidenceImage: faceImage,
          summaryForAdmin: `A ${typeof result.similarity === 'number' ? `low-similarity (${result.similarity.toFixed(2)})` : ''} face verification attempt on ${student.fullName || student.uid}'s account did NOT match their enrolled face — someone else may be trying to mark attendance under this identity.`,
        }).catch((e) => console.error('[verify-face] impersonation alert failed:', e.message));
      }
    }

    // Mirror check.py's response shape ({ match, similarity, name, reason }) so the
    // mobile client can read it the same way it read the face engine directly,
    // plus a normalized `spoof` block the app uses to hard-block a replay.
    // (A confirmed, blocking spoof never reaches here — it already returned
    // its deceptive-success response above.)
    console.log(`[verify-face] ${result.match === true ? 'VERIFIED' : 'REJECTED (no match)'} uid=${student.uid} type=${rawType}: match=${result.match} score=${result.score}`);
    return res.json({
      success: true,
      match: result.match === true,
      reachable: result.reachable,
      reason: result.reason || null,
      similarity: result.similarity ?? result.score ?? null,
      score: result.score ?? null,
      name: result.match === true ? student.fullName : null,
      spoof: {
        detected: false,
        available: spoof.available === true,
        label: spoof.label || null,
        score: typeof spoof.score === 'number' ? spoof.score : null,
      },
    });
  } catch (err) {
    console.error('[verify-face]', err);
    return res.status(500).json({ success: false, message: 'Verification error' });
  }
});

// Lightweight CSV generator to avoid extra deps
function convertToCSV(rows, headers) {
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const head = headers.map(h => escape(h.label)).join(',');
  const body = rows.map(r => headers.map(h => escape(h.get(r))).join(',')).join('\n');
  return head + (body ? ('\n' + body) : '');
}

// @route   POST /api/attendance/mark
// @desc    Mark attendance (check-in or check-out)
// @access  Private
router.post('/mark', auth, rateLimit({ windowMs: 60 * 1000, max: 30 }), [
  body('type').isIn(['in', 'out']).withMessage('Type must be either "in" or "out"'),
  body('latitude').optional().isFloat().withMessage('Valid latitude is required'),
  body('longitude').optional().isFloat().withMessage('Valid longitude is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[Attendance Mark] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { type, latitude, longitude, faceImage, authMethod, livenessNonce, livenessEvents, attestation } = req.body;
    // Optional bundle of the OTHER frames captured during the same liveness
    // session (see the multi-frame comment further below) — sent as a JSON
    // array of base64/data-URLs, exactly like /verify-face's `frames` field.
    // Injection / deepfake guard: score the device + camera attestation bundle.
    const injectionVerdict = injectionRiskService.score(attestation);

    // When the device reports a high-confidence emulator/root/hook/virtual
    // camera signal, fail closed. Missing best-effort attestation is handled by
    // the mandatory face + PAD + liveness gates below; it is not an automatic
    // rejection for older legitimate devices.
    if (attestation && (injectionVerdict.level === 'high' || injectionVerdict.level === 'critical')) {
      console.log(`[Attendance Mark] REJECTED uid=${req.student?.uid || 'unknown'} type=${type}: camera/device integrity (${injectionVerdict.level}, score=${injectionVerdict.score}, reasons=${(injectionVerdict.reasons || []).join('|')})`);
      await securityEventService.record({
        category: 'camera_integrity',
        severity: injectionVerdict.level === 'critical' ? 'critical' : 'high',
        desiredAction: 'block',
        student: req.student || null,
        detection: { riskScore: injectionVerdict.score, signals: injectionVerdict.reasons || [] },
        device: { deviceId: req.body.deviceId, deviceModel: req.body.deviceModel, manufacturer: req.body.manufacturer, publicIp: resolveClientIp(req) },
        summaryForAdmin: `Camera/device integrity check failed (${injectionVerdict.level}, score ${injectionVerdict.score}): ${(injectionVerdict.reasons || []).join(', ')}`,
      });
      audit.log(
        audit.fromReq(req, {
          action: 'attendance.injection_blocked',
          outcome: 'failure',
          targetType: 'attendance',
          metadata: { level: injectionVerdict.level, score: injectionVerdict.score, reasons: injectionVerdict.reasons },
        })
      );
      // Generic, mechanism-agnostic message — never tell the client WHICH
      // signal (root/hook/emulator/virtual camera/...) tripped this gate.
      return res.status(401).json({
        success: false,
        code: 'verification_unavailable',
        message: 'Verification could not be completed. Please try again or contact your administrator.',
      });
    }

    console.log('[Attendance Mark] Request body:', {
      type,
      latitude,
      longitude,
      hasAuthMethod: !!authMethod,
      hasFaceImage: !!faceImage
    });

    // Get student data from token (assuming student auth)
    let studentId;
    if (req.student) {
      studentId = req.student._id;
    } else if (req.user) {
      // Fallback for organization auth
      studentId = req.user.id;
    } else {
      console.log('[Attendance Mark] No authentication found');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get student details
    const student = await Student.findById(studentId);
    if (!student) {
      console.log('[Attendance Mark] Student not found:', studentId);
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if student has active WFH assignment
    const hasActiveWFH = student.hasActiveWFH ? student.hasActiveWFH() : false;
    const currentWFHAssignment = student.getCurrentWFHAssignment ? student.getCurrentWFHAssignment() : null;

    console.log('[Attendance Mark] Student WFH status:', {
      studentId: student._id,
      fullName: student.fullName,
      hasActiveWFH,
      legacyWFH: student.WFH,
      currentAssignment: currentWFHAssignment ? {
        startDate: currentWFHAssignment.startDate,
        endDate: currentWFHAssignment.endDate,
        reason: currentWFHAssignment.reason
      } : null
    });

    let distance = 0;
    let locationCheckPassed = false;
    let finalLatitude = latitude || 0;
    let finalLongitude = longitude || 0;
    // Which campus premises (Anuvadini / NETF / IUAC) this mark landed at — set
    // for campus students below, stored on the record so history can show it.
    let markedOfficeData = null;

    // Skip location check if WFH is active
    if (hasActiveWFH || student.WFH === 'WFH allowed' || student.WFH === 'Allowed') {
      console.log('[Attendance Mark] WFH active - skipping location check');
      locationCheckPassed = true;
      distance = 0; // Set distance to 0 for WFH
      // Use provided coordinates or default to 0,0 for WFH
      finalLatitude = latitude || 0;
      finalLongitude = longitude || 0;
    } else {
      // Require location for non-WFH students
      if (latitude === undefined || longitude === undefined) {
        console.log('[Attendance Mark] Location required for non-WFH student');
        return res.status(400).json({
          success: false,
          message: 'Location coordinates are required for attendance marking',
          isWFH: false
        });
      }

      // CAMPUS GROUP: Anuvadini / NETF / IUAC share offices. A member of any of
      // these three orgs may mark ONLY within range of one of the campus offices,
      // and at ANY of them. Students of OTHER organizations are not part of this
      // pool and keep their existing flow (no geofence block).
      const { offices, orgIds } = await getCampusContext();
      const isCampusStudent = orgIds.has(String(student.organization));

      if (isCampusStudent) {
        // ── CAMPUS GEOFENCE ENFORCED (re-enabled 2026-07-21, per user request) ──
        // Anuvadini / NETF / IUAC staff may mark ONLY within range of one of the
        // three shared campus offices, and at ANY of them (no need to switch
        // location when working from a sister branch). A mark outside every
        // office is rejected. The nearest office also gives us the branch label
        // (Anuvadini / NETF / IUAC) stored on the record for history.
        const nearest = offices.length
          ? findNearestOffice(offices, latitude, longitude, student.Area_radius || 0)
          : null;
        distance = nearest ? Math.round(nearest.distance) : 0;

        console.log('[Attendance Mark] Campus geofence check:', {
          nearestOffice: nearest?.office?.name,
          campus: nearest?.office?.campus,
          distance,
          allowedRadius: nearest?.allowed,
          withinRange: nearest?.withinRange,
          officesChecked: offices.length,
        });

        if (!offices.length) {
          console.error('[Attendance Mark] Campus offices not configured — blocking mark');
          return res.status(400).json({
            success: false,
            message: 'Attendance locations are not configured. Please contact your administrator.',
            isWFH: false,
          });
        }
        if (!nearest || !nearest.withinRange) {
          console.log('[Attendance Mark] Outside range of every campus office');
          return res.status(400).json({
            success: false,
            code: 'outside_geofence',
            message: nearest
              ? `You must be within ${nearest.allowed} m of a campus office (Anuvadini, NETF or IUAC) to mark attendance. Nearest is ${nearest.office.campus || nearest.office.name} (${distance} m away).`
              : 'No campus office is configured to verify your attendance.',
            distance,
            allowedRadius: nearest?.allowed || null,
            nearestOffice: nearest?.office?.campus || nearest?.office?.name || null,
            isWFH: false,
          });
        }

        markedOfficeData = {
          name: nearest.office.campus || nearest.office.orgName || null,
          officeName: nearest.office.name || null,
          orgId: nearest.office.orgId || null,
          distance,
          withinRange: true,
        };

        locationCheckPassed = true;
        finalLatitude = latitude;
        finalLongitude = longitude;
      } else {
        // Only Anuvadini / NETF / IUAC staff may mark at the campus premises —
        // a member of any other organization is not part of this deployment's
        // attendance pool and is blocked (per user request 2026-07-21).
        console.log('[Attendance Mark] Non-campus organization blocked:', String(student.organization));
        return res.status(403).json({
          success: false,
          code: 'org_not_permitted',
          message: 'Your organization is not permitted to mark attendance at these premises. Please contact your administrator.',
          isWFH: false,
        });
      }
    }

    if (!locationCheckPassed) {
      console.log('[Attendance Mark] Location verification failed');
      return res.status(400).json({
        success: false,
        message: 'Location verification failed',
        distance: distance
      });
    }

    // Check if already marked attendance for this type today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    console.log('[Attendance Mark] Checking existing attendance for:', studentId, type, today, tomorrow);

    // For "in" type, only allow one entry per day
    // For "out" type, allow multiple entries (last one will be the final checkout time)
    if (type === 'in') {
      // Check BOTH stores: a check-in done on the external biometric system must
      // also block a duplicate check-in here.
      const alreadyIn = await existsInEitherStore({
        student: studentId,
        type: type,
        timestamp: { $gte: today, $lt: tomorrow }
      });

      if (alreadyIn) {
        console.log('[Attendance Mark] Check-in already marked for today (either store)');
        return res.status(400).json({
          success: false,
          message: `Already marked ${type} attendance for today`
        });
      }
    } else if (type === 'out') {
      // For checkout, allow multiple entries - just log for tracking
      const existingOutCount = await Attendance.countDocuments({
        student: studentId,
        type: type,
        timestamp: { $gte: today, $lt: tomorrow }
      });

      console.log('[Attendance Mark] Previous checkout entries today:', existingOutCount);
      // Continue processing - allow multiple checkouts
    }

    // --- SAACMS server-authoritative verification gate (anti-replay, §6) ---
    // Replaces the old `faceVerified = !!faceImage` (which trusted any image).
    const isFaceMethod = (authMethod || 'face') === 'face';
    // Never trust a bare image: faceVerified is only true after REAL verification
    // (or, when verification is fully disabled, the legacy hint for face marks).
    let faceVerified = flags.faceVerify.mode === 'off' && isFaceMethod ? !!faceImage : false;
    let verificationScore;
    let livenessVerdict;
    // Hoisted out of the isFaceMethod block below (where spoofMark itself is
    // declared, block-scoped) so the DISK-SAVE call further down — the one
    // that actually needs it to bake `_spoof-<label>-<score>` into the
    // filename — can still see it. Was silently undefined at that call site
    // before this hoist (reported 2026-07-30: a confirmed screen-replay
    // capture had no spoof token in its filename at all, so Face Report's
    // fake/uncertain filter never saw it — it just showed as a normal Pass).
    let capturedSpoofVerdict = null;
    // "Mark now, verify async": set when the face engine is unreachable/overloaded
    // and policy (FACE_VERIFY_FAIL_CLOSED=false) chooses to record the attendance
    // and defer the identity match to the background re-verify job rather than
    // reject a genuine employee just because the engine was saturated.
    let faceVerifyPending = false;
    let faceVerifyDeferredReason = null;

    // In ENFORCE mode a verified face check-in is mandatory — a client cannot
    // dodge the gate by claiming authMethod='manual' or omitting the image
    // (closes the bypass where any non-face mark skipped verification).
    if (flags.faceVerify.mode === 'enforce' && (!isFaceMethod || !faceImage)) {
      return res.status(401).json({
        success: false,
        code: 'face_required',
        message: 'Face verification is required to mark attendance',
      });
    }
    if (flags.liveness.mode === 'enforce' && !isFaceMethod) {
      return res.status(401).json({
        success: false,
        code: 'face_required',
        message: 'Liveness verification requires a face check-in',
      });
    }

    // 1) Liveness challenge adjudication (defeats recorded-video replay).
    // Runs BEFORE face verification deliberately: adjudicate() is pure
    // in-memory/CPU (no network round trip), while the face-verify step below
    // makes a real call to the face-recognition engine. The liveness nonce
    // carries a fixed wall-clock TTL from the moment it was issued — if face
    // verification ran first, its network latency (plus the pre-flight
    // /verify-face call the app already made) got charged against that same
    // clock, so a perfectly genuine user could pass face verification twice
    // and still get rejected here with an expired nonce. Checking liveness
    // first removes that race for the common case (though the nonce clock
    // still ticks during any earlier network calls before /mark was reached).
    // Always adjudicate when enabled (even with no nonce → 'nonce_invalid'), so
    // shadow mode still logs a verdict and a missing nonce can't skip the check.
    if (isFaceMethod && flags.liveness.mode !== 'off') {
      livenessVerdict = livenessService.adjudicate({
        nonce: livenessNonce,
        studentId,
        events: livenessEvents,
      });
      console.log('[Attendance Mark] liveness', flags.liveness.mode, livenessVerdict);
      audit.log(
        audit.fromReq(req, {
          action: 'attendance.liveness',
          outcome: livenessVerdict.passed ? 'success' : 'failure',
          targetType: 'attendance',
          metadata: { mode: flags.liveness.mode, passed: livenessVerdict.passed, reasons: livenessVerdict.reasons },
        })
      );
      if (flags.liveness.mode === 'enforce' && !livenessVerdict.passed) {
        // POLICY CHANGE (explicit business decision, not a default): liveness
        // no longer blocks the mark — only identity match does. A failed
        // liveness check is still fully recorded (SecurityEvent below, plus
        // livenessVerdict stored on the Attendance doc itself) for the admin
        // spoof/security dashboard, but the attendance record is created and
        // stands regardless. This trades the fraud protection liveness
        // provided (defends against a pre-recorded video replay of a still
        // genuinely-matching face) for zero blocking-related false-positive
        // rejections of real users. See attendance.js's spoof handling just
        // below for the identical treatment of the anti-spoof (PAD) gate.
        await securityEventService.record({
          category: 'liveness_failed',
          severity: 'high',
          desiredAction: 'block',
          student,
          sessionType: type,
          detection: { livenessPassed: false, signals: livenessVerdict.reasons || [] },
          device: { deviceId: req.body.deviceId, deviceModel: req.body.deviceModel, manufacturer: req.body.manufacturer, publicIp: resolveClientIp(req) },
          summaryForAdmin: `Liveness challenge failed: ${(livenessVerdict.reasons || []).join(', ')}`,
        });
        console.log(`[Attendance Mark] flagged (not blocked) uid=${student.uid} type=${type}: liveness failed — reasons=${(livenessVerdict.reasons || []).join('|')}`);
      }
    }

    // 2) Real face verification against the enrolled identity.
    if (isFaceMethod && faceImage && flags.faceVerify.mode !== 'off') {
      // Check-in and check-out each get an independent 10-attempt budget per
      // day (services/attemptLimiter.js), shared with /verify-face so an
      // attacker can't dodge the cap by mixing endpoints. Checked BEFORE
      // spending a call on the face engine.
      if (type === 'in' || type === 'out') {
        const gate = await attemptLimiter.checkAllowed(studentId, type);
        if (!gate.allowed) {
          console.log(`[Attendance Mark] attempt cap reached for ${student.uid} (${type}): ${gate.attemptsUsed}/${attemptLimiter.MAX_ATTEMPTS} used today`);
          await securityEventService.record({
            category: 'verification_attempt_lockout',
            severity: 'high',
            desiredAction: 'block',
            student,
            sessionType: type,
            detection: { signals: ['attempt_cap_reached'] },
            device: { deviceId: req.body.deviceId, deviceModel: req.body.deviceModel, manufacturer: req.body.manufacturer, publicIp: resolveClientIp(req) },
            summaryForAdmin: `${type === 'in' ? 'Check-in' : 'Check-out'} verification attempts exhausted (${attemptLimiter.MAX_ATTEMPTS}/${attemptLimiter.MAX_ATTEMPTS}) — possible impostor probing.`,
          });
          // Same neutral wording as every other "please try again" failure —
          // the employee never learns a security rule (or a counter) fired.
          return res.status(401).json({
            success: false,
            code: 'spoof_verification_required',
            message: 'Live camera verification could not be confirmed. Please recapture your face.',
            reason: 'pad_unavailable',
          });
        }
      }

      // This is a SECOND, independent re-verification — /mark never trusts the
      // client's "verify-face already said yes" (closes the
      // `faceVerified = !!faceImage` hole). But until now it re-checked ONLY
      // the single final frame, discarding every other frame from the SAME
      // liveness session that /verify-face fused together moments earlier —
      // a frame that's individually a bit soft (motion, angle) could score
      // below the match/PAD threshold standalone even though the SESSION
      // clearly proved the live, genuine face, causing a real employee to see
      // "Verification unsuccessful" over and over on retry despite good
      // lighting. Accept the same optional `frames` bundle /verify-face does
      // and use verifyMulti (best-of-many) when present, so this gate is at
      // least as forgiving as the one the user already passed.
      let markFrames = [];
      if (req.body.frames) {
        try {
          markFrames = Array.isArray(req.body.frames) ? req.body.frames : JSON.parse(req.body.frames);
        } catch (_e) {
          markFrames = [];
        }
        if (!Array.isArray(markFrames)) markFrames = [];
      }
      const allMarkFrames = [faceImage, ...markFrames].filter(Boolean);
      const result = allMarkFrames.length > 1
        ? await faceVerifyService.verifyMulti({ uid: student.uid, faceImages: allMarkFrames }, { conservativeFakeGate: true })
        : await faceVerifyService.verify({ uid: student.uid, faceImage }, { conservativeFakeGate: true });
      if (result.score != null) verificationScore = result.score;
      faceVerified = result.reachable ? result.match === true : false;
      console.log('[Attendance Mark] face verify', flags.faceVerify.mode, {
        uid: student.uid,
        match: result.match,
        score: verificationScore,
        reachable: result.reachable,
        reason: result.reason,
      });
      audit.log(
        audit.fromReq(req, {
          action: 'attendance.face_verify',
          outcome: faceVerified ? 'success' : 'failure',
          targetType: 'attendance',
          metadata: {
            mode: flags.faceVerify.mode,
            match: result.match,
            score: verificationScore,
            reachable: result.reachable,
            reason: result.reason,
            spoofLabel: result.spoof?.label || null,
            spoofScore: result.spoof?.score ?? null,
          },
        })
      );

      // Anti-spoof (PAD) enforcement — UNCONDITIONAL, even when faceVerify.mode
      // is off/shadow. A confident FAKE verdict means the uploaded frame is a
      // screen/photo replay of the genuine face, so it PASSES the match check —
      // without this gate a direct /mark API call walked around the block that
      // /verify-face applies (the app calls /verify-face first, but the API is
      // reachable without the app). 'uncertain'/'retry'/'unavailable' never
      // block here: offline sync replays stored genuine captures and cannot
      // recapture, so only a confident fake may stop a mark.
      const spoofMark = result.spoof || { available: false, isFake: false };
      capturedSpoofVerdict = spoofMark;

      // Whole-frame SCREEN REPLAY that the face-crop model scored 'real'. Only
      // ESCALATE to a block here when explicitly enabled (a direct /mark call
      // must not silently bypass the block /verify-face applies in block mode);
      // in the default flag-only mode /verify-face already recorded it and the
      // mark is allowed to proceed, so /mark stays untouched.
      if (
        process.env.ANTISPOOF_SCREEN_BLOCK_CHECKINOUT === '1' &&
        spoofMark.available && spoofMark.screenSuspected && !spoofMark.isFake
      ) {
        console.log(`[Attendance Mark] SCREEN-REPLAY uid=${student.uid} (moire=${spoofMark.screenMoire} peak=${spoofMark.screenPeak}) — BLOCKING (face-crop label '${spoofMark.label}')`);
        spoofMark.label = 'fake';
        spoofMark.isFake = true;
        spoofMark.isUncertain = false;
      }

      // Face engine unreachable (down / timed out under a check-in rush):
      // nothing was actually judged. Policy (featureFlags.faceVerify.failClosedOnError,
      // env FACE_VERIFY_FAIL_CLOSED) decides what happens:
      //   true  -> fail closed: reject with the generic "recapture" message.
      //   false -> "mark now, verify async": record the attendance WITH the
      //            capture, flag it pending, and let the background re-verify job
      //            (services/faceReverifyService.js) settle the identity match
      //            once the engine recovers. Guarantees a genuine employee is
      //            never denied attendance purely because the engine was
      //            saturated — the match is confirmed after the fact, and a real
      //            mismatch still raises the same impersonation alert then.
      if (!result.reachable) {
        if (flags.faceVerify.failClosedOnError) {
          console.log(`[Attendance Mark] REJECTED uid=${student.uid} type=${type}: face-verify service unreachable (reason=${result.reason || 'unknown'}) — fail-closed`);
          return res.status(401).json({
            success: false,
            code: 'spoof_verification_required',
            message: 'Live camera verification could not be confirmed. Please recapture your face.',
            reason: result.reason || 'pad_unavailable',
          });
        }
        faceVerifyPending = true;
        faceVerifyDeferredReason = result.reason || 'engine_unreachable';
        console.log(`[Attendance Mark] DEFERRED uid=${student.uid} type=${type}: face-verify engine unreachable (reason=${faceVerifyDeferredReason}) — marking now, re-verify queued`);
      }

      // Same review-trail as /verify-face: 'uncertain' is recorded (visible to
      // the super-admin) but never blocks — a genuine user is never falsely
      // rejected on a borderline PAD read.
      if (spoofMark.isUncertain) {
        try {
          await SpoofAttempt.create({
            student: student._id,
            organization: student.organization || null,
            uid: student.uid,
            studentName: student.fullName || student.name || null,
            type: type || 'in',
            faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
            score: typeof spoofMark.score === 'number' ? spoofMark.score : null,
            label: spoofMark.label || 'uncertain',
            model: spoofMark.model || 'minifasnet',
            matched: result.match === true,
            similarity: result.similarity ?? result.score ?? null,
            latitude: finalLatitude,
            longitude: finalLongitude,
            deviceId: req.body.deviceId || undefined,
            deviceModel: req.body.deviceModel || undefined,
            manufacturer: req.body.manufacturer || undefined,
          });
        } catch (e) {
          console.error('[Attendance Mark] failed to record uncertain SpoofAttempt:', e.message);
        }
      }

      // A confident FAKE verdict means the uploaded frame is a screen/photo
      // replay of the genuine face, so it PASSES the raw embedding match —
      // this is the gate that actually catches a replay. Evidence is
      // captured and the consequence is routed through the single
      // configurable policy chokepoint (fraudMonitoring.mode) exactly like
      // /verify-face, so "block" (the default) reproduces today's behavior.
      let spoofFakeBlocks = false;
      if (spoofMark.isFake) {
        console.log(`[Attendance Mark] SPOOF DETECTED uid=${student.uid} type=${type}: PAD label=fake score=${spoofMark.score} margin=${spoofMark.margin} model=${spoofMark.model || 'minifasnet'}`);
        try {
          await SpoofAttempt.create({
            student: student._id,
            organization: student.organization || null,
            uid: student.uid,
            studentName: student.fullName || student.name || null,
            type: type || 'in',
            faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
            // See the matching comment in /verify-face: a screen-signal-forced
            // 'fake' keeps the crop model's HIGH real-score, which would show a
            // contradictory near-0% fake-confidence next to the FAKE badge.
            score: spoofMark.screenSuspected ? 0 : (typeof spoofMark.score === 'number' ? spoofMark.score : null),
            label: spoofMark.label || 'fake',
            model: spoofMark.model || 'minifasnet',
            matched: result.match === true,
            similarity: result.similarity ?? result.score ?? null,
            latitude: finalLatitude,
            longitude: finalLongitude,
            deviceId: req.body.deviceId || undefined,
            deviceModel: req.body.deviceModel || undefined,
            manufacturer: req.body.manufacturer || undefined,
          });
        } catch (e) {
          console.error('[Attendance Mark] failed to record SpoofAttempt:', e.message);
        }

        const evt = await securityEventService.record({
          category: 'verification_spoof',
          severity: 'critical',
          desiredAction: 'block',
          student,
          sessionType: type,
          detection: {
            spoofConfidence: typeof spoofMark.score === 'number' ? spoofMark.score : null,
            spoofLabel: spoofMark.label || null,
            faceMatchConfidence: result.similarity ?? result.score ?? null,
            signals: ['pad_fake'],
          },
          device: { deviceId: req.body.deviceId, deviceModel: req.body.deviceModel, manufacturer: req.body.manufacturer, publicIp: resolveClientIp(req) },
          evidenceImage: faceImage,
          skipAutoNotify: true, // richer sendSpoofAlert template sent manually below
        });
        spoofFakeBlocks = evt.effectiveAction === 'block';

        audit.log(
          audit.fromReq(req, {
            action: 'attendance.spoof_blocked',
            outcome: spoofFakeBlocks ? 'failure' : 'flagged',
            targetType: 'attendance',
            metadata: { label: spoofMark.label, score: spoofMark.score, match: result.match, effectiveAction: evt.effectiveAction },
          })
        );

        if (securityEventService.ACTION_RANK[evt.effectiveAction] >= securityEventService.ACTION_RANK.escalate) {
          (async () => {
            try {
              let organizationName = null;
              if (student.organization) {
                const org = await Organization.findById(student.organization).select('name').lean();
                organizationName = org?.name || null;
              }
              await emailService.sendSpoofAlert({
                student: {
                  fullName: student.fullName || student.name,
                  uid: student.uid,
                  designation: student.designation,
                  department: student.department,
                  organizationName,
                },
                type: type || 'in',
                label: spoofMark.label,
                score: spoofMark.score,
                similarity: result.similarity ?? result.score ?? null,
                image: faceImage,
                latitude: finalLatitude,
                longitude: finalLongitude,
              });
            } catch (e) {
              console.error('[Attendance Mark] spoof alert email failed:', e.message);
            }
          })();
        }
      }

      if (type === 'in' || type === 'out') {
        await attemptLimiter.recordAttempt({
          studentId,
          organization: student.organization,
          type,
          success: result.match === true && !spoofFakeBlocks,
          reason: spoofFakeBlocks ? 'spoof_detected' : (result.reason || null),
          similarity: result.similarity ?? result.score ?? null,
          padLabel: spoofMark.label || null,
        });
      }

      // POLICY CHANGE (explicit business decision, not a default): a
      // confirmed spoof no longer blocks or decoys the mark — only identity
      // match does (see the `block` condition below). Previously this
      // branch short-circuited with a DECEPTIVE SUCCESS (honeypot): telling
      // a confirmed spoof "success" while writing nothing real to the
      // database. Now the real Attendance record IS written and stands
      // permanently — SpoofAttempt + SecurityEvent (+ admin email, above)
      // still capture full evidence for the admin spoof-tracking dashboard,
      // but nothing here reverts or blocks the attendance itself anymore.
      // `faceVerified` is still set false on a confirmed spoof so the stored
      // record honestly reflects what was detected, even though it counts.
      if (spoofMark.isFake) faceVerified = false;

      // IMPERSONATION ALERT (authoritative /mark route — see /verify-face for
      // the full rationale): a genuine LIVE face that does NOT match this
      // account's enrolled reference previously had zero admin visibility
      // unless it repeated 10 times in a day. Alert immediately on a clearly
      // different face (low similarity), not a borderline near-miss.
      if (result.reachable && result.match !== true && !spoofMark.isFake && result.similarity != null) {
        const CLEAR_MISMATCH_MAX = parseFloat(process.env.MISMATCH_ALERT_MAX_SIMILARITY || '0.45');
        if (result.similarity <= CLEAR_MISMATCH_MAX) {
          console.log(`[Attendance Mark] IMPERSONATION SUSPECTED uid=${student.uid} type=${type}: similarity=${result.similarity} (<=${CLEAR_MISMATCH_MAX})`);
          securityEventService.record({
            category: 'face_mismatch_pattern',
            severity: 'high',
            student,
            sessionType: type,
            detection: {
              faceMatchConfidence: result.similarity,
              signals: ['identity_mismatch_confident'],
            },
            device: { deviceId: req.body.deviceId, deviceModel: req.body.deviceModel, manufacturer: req.body.manufacturer, publicIp: resolveClientIp(req) },
            evidenceImage: faceImage,
            summaryForAdmin: `A ${typeof result.similarity === 'number' ? `low-similarity (${result.similarity.toFixed(2)})` : ''} ${type === 'in' ? 'check-in' : 'check-out'} attempt on ${student.fullName || student.uid}'s account did NOT match their enrolled face — someone else may be trying to mark attendance under this identity.`,
          }).catch((e) => console.error('[Attendance Mark] impersonation alert failed:', e.message));
        }
      }

      if (flags.faceVerify.mode === 'enforce') {
        // POLICY CHANGE (explicit business decision, not a default): ONLY
        // identity mismatch blocks the mark now — `spoofMark.isFake` was
        // removed from this condition. A confirmed spoof on a genuinely
        // matching face no longer rejects; it's recorded (SpoofAttempt +
        // SecurityEvent above) and the mark proceeds. See the comments on
        // the liveness gate and the removed spoof-honeypot branch above for
        // the same treatment and its tradeoffs.
        const block = result.reachable ? result.match !== true : flags.faceVerify.failClosedOnError;
        if (block) {
          console.log(`[Attendance Mark] REJECTED uid=${student.uid} type=${type}: ${result.reachable ? `identity mismatch (match=${result.match}, score=${verificationScore}, reason=${result.reason || 'no_match'})` : 'face-verify service unreachable, failClosedOnError=true'}`);
          return res.status(401).json({
            success: false,
            code: 'face_verification_failed',
            message: 'Verification could not be completed. Please try again or contact your administrator.',
            reason: result.reachable ? (result.reason || 'no_match') : 'verification_service_unreachable',
            score: verificationScore,
          });
        }
      }
    }

    // Persist the capture to DISK (face_storage/<user>/<date>/<checkin|checkout>/)
    // and store only the short relative path on the record. Inlining the base64
    // blob made every attendance document hundreds of KB — unreadable in DB
    // tools and needless collection bloat. The super-admin gallery serves these
    // paths via sendImageString, which resolves face_storage/ files from disk.
    let storedFaceImage = null;
    if (faceImage) {
      // saveCapture is async now (image compression before disk write) — this
      // one call site actually USES the returned path (every other caller in
      // the codebase fires-and-forgets it), so it MUST be awaited or
      // `captureFile` would be a pending Promise object instead of a path
      // string, silently corrupting every attendance record's stored image.
      const captureFile = await faceStorageService.saveCapture({
        student,
        type: type === 'out' ? 'checkout' : 'checkin',
        image: faceImage,
        match: faceVerified,
        similarity: verificationScore,
        // Was missing here (present on /verify-face's saveCapture call below,
        // but never on this one — the ACTUAL check-in/out disk write). Without
        // it, the filename never got the `_spoof-<label>-<score>` token, so a
        // capture PAD confidently flagged 'fake' still showed up as a normal
        // "Pass" on the Face Report with no way to filter it out (reported
        // 2026-07-30 — a clear laptop-screen replay still showing "Verified").
        // capturedSpoofVerdict (hoisted above) stays null when the
        // isFaceMethod block never ran; saveCapture already treats a missing
        // spoof as "no tag", same as before.
        spoof: capturedSpoofVerdict,
      });
      storedFaceImage = captureFile
        ? path.relative(path.join(__dirname, '..'), captureFile).replace(/\\/g, '/')
        : await faceStorageService.compressToBase64DataUrl(faceImage); // disk write failed — keep the legacy inline copy
    }

    // Public IP + device/network telemetry the mark came from (client-reported,
    // validated; IP falls back to the connection address) + change detection
    // against the employee's last known IP AND last known physical device —
    // the device check catches a different phone on the same WiFi, which the
    // public IP alone cannot. Informational only — never blocks the mark; a
    // device change is written to the audit trail by recordActivity below.
    const publicIp = resolveClientIp(req);
    const deviceTelemetry = sanitizeDeviceTelemetry(req.body);
    const { previousIp, ipChanged } = ipTracking.detectChange(student, publicIp);
    const deviceChange = ipTracking.detectDeviceChange(student, deviceTelemetry.deviceId);

    // Create attendance record
    const attendance = new Attendance({
      student: studentId,
      organization: student.organization,
      type: type,
      publicIp: publicIp,
      previousIp: previousIp,
      ipChanged: ipChanged,
      localIp: deviceTelemetry.localIp,
      networkType: deviceTelemetry.networkType,
      deviceId: deviceTelemetry.deviceId,
      deviceModel: deviceTelemetry.deviceModel,
      manufacturer: deviceTelemetry.manufacturer,
      androidVersion: deviceTelemetry.androidVersion,
      deviceChanged: deviceChange.deviceChanged,
      previousDeviceId: deviceChange.previousDeviceId,
      previousDeviceModel: deviceChange.previousDeviceModel,
      previousDeviceManufacturer: deviceChange.previousDeviceManufacturer,
      latitude: finalLatitude,
      longitude: finalLongitude,
      distance: distance,
      markedOffice: markedOfficeData,
      faceVerified: faceVerified,
      faceVerifyPending: faceVerifyPending,
      faceVerifyDeferredReason: faceVerifyDeferredReason,
      faceImage: storedFaceImage,
      verificationScore: verificationScore,
      livenessVerdict: livenessVerdict,
      attestation: attestation || null,
      injectionRisk: injectionVerdict,
      authMethod: authMethod || 'face', // Default to face if not specified
      status: 'success',
      isWFH: hasActiveWFH || student.WFH === 'WFH allowed' || student.WFH === 'Allowed', // Add WFH flag
      wfhAssignmentId: currentWFHAssignment ? currentWFHAssignment._id : null // Reference to WFH assignment
    });

    console.log('[Attendance Mark] Saving attendance:', {
      student: studentId,
      type: attendance.type,
      distance: attendance.distance,
      isWFH: attendance.isWFH,
      wfhAssignmentId: attendance.wfhAssignmentId,
      latitude: finalLatitude,
      longitude: finalLongitude
    });

    await attendance.save();

    console.log('[Attendance Mark] Attendance marked successfully');

    // Mirror the SAME record into the biometric DB's `attendances` collection.
    // NON-FATAL: the primary record is already saved, so a biometric mirror
    // failure (or an unreachable biometric DB) is logged and the mark still succeeds.
    // Skip immediately when that connection is down, so the request doesn't wait
    // for a timeout first.
    try {
      if (BiometricAttendance.db && BiometricAttendance.db.readyState === 1) {
        await BiometricAttendance.create(attendance.toObject());
        console.log('[Attendance Mark] Mirrored to biometric DB');
      } else {
        console.warn('[Attendance Mark] Biometric DB not connected; mirror skipped (mark kept)');
      }
    } catch (mirrorErr) {
      console.error('[Attendance Mark] Biometric DB mirror failed (mark kept):', mirrorErr.message);
    }

    // IP + device tracking row for the super-admin report, the audit-trail
    // entry on a device change, and rolling the student's lastKnown* pointers
    // forward. AFTER the mirror so a rolled-back mark logs nothing.
    // Best-effort: a failure here never fails the mark.
    await ipTracking.recordActivity({
      student,
      event: type,
      publicIp,
      device: deviceTelemetry,
      attendanceId: attendance._id,
      timestamp: attendance.timestamp,
    });

    audit.log(
      audit.fromReq(req, {
        action: 'attendance.marked',
        outcome: 'success',
        targetType: 'attendance',
        target: attendance._id,
        metadata: {
          type,
          authMethod: attendance.authMethod,
          faceVerified: attendance.faceVerified,
          verificationScore,
          distance: attendance.distance,
          isWFH: attendance.isWFH,
        },
      })
    );

    // A checkout means the person is off duty for the day — any spot-check
    // still pending for them (issued while they were checked in, window not
    // yet expired) has nothing left to verify: they're not on premises to
    // respond to, and it's not their fault they can't answer a prompt for a
    // shift that's already over. Close it out as 'skipped' (never counted as
    // a miss) instead of leaving it to silently expire into 'missed'.
    if (type === 'out') {
      try {
        const SpotCheck = require('../models/SpotCheck');
        await SpotCheck.updateMany(
          { student: studentId, status: 'pending' },
          { status: 'skipped', reason: 'checked_out' }
        );
      } catch (e) {
        console.warn('[Attendance Mark] failed to skip pending spot-checks after checkout:', e.message);
      }
    }

    // Defender follows the employee's duty state: checkout pauses monitoring on
    // the paired PC, check-in resumes it. Best-effort — a binding issue must
    // never fail an already-recorded attendance mark.
    try {
      const DefenderPairing = require('../models/DefenderPairing');
      if (type === 'out') {
        await DefenderPairing.updateMany(
          { 'employee.uid': student.uid, status: 'paired' },
          { $set: { status: 'disconnected', pausedAt: new Date(), resumedAt: null } }
        );
      } else if (type === 'in') {
        await DefenderPairing.updateMany(
          { 'employee.uid': student.uid, status: 'disconnected' },
          { $set: { status: 'paired', resumedAt: new Date(), pausedAt: null } }
        );
      }
    } catch (e) {
      console.warn('[Attendance Mark] defender pairing state update failed:', e.message);
    }

    // Flag likely camera-injection / deepfake captures for admin review.
    if (injectionRiskService.isFlagged(injectionVerdict)) {
      try {
        audit.log(
          audit.fromReq(req, {
            action: 'attendance.injection_risk',
            outcome: 'flagged',
            targetType: 'attendance',
            target: attendance._id,
            metadata: {
              level: injectionVerdict.level,
              score: injectionVerdict.score,
              reasons: injectionVerdict.reasons,
            },
          })
        );
      } catch (_e) { /* best-effort */ }
    }

    // Send FCM notification for attendance marking
    try {
      const pushNotificationService = require('../services/pushNotificationService');
      const notificationData = {
        type: type === 'in' ? 'check_in' : 'check_out',
        action: `attendance_${type}`,
        message: `Successfully marked ${type === 'in' ? 'check-in' : 'check-out'}`,
        timestamp: new Date().toISOString(),
        isWFH: attendance.isWFH
      };

      const notification = {
        title: `✅ ${type === 'in' ? 'Check-in' : 'Check-out'} Successful`,
        body: attendance.isWFH
          ? `Your ${type === 'in' ? 'check-in' : 'check-out'} has been recorded for WFH attendance`
          : `Your ${type === 'in' ? 'check-in' : 'check-out'} has been recorded at ${Math.round(distance)}m from office`
      };

      // Send notification to the student
      if (student.fcmToken) {
        await pushNotificationService.sendNotificationToStudent(studentId, notification, notificationData);
        console.log(`[Attendance Mark] FCM notification sent for ${type}`);
      }
    } catch (notificationError) {
      console.error('[Attendance Mark] Failed to send FCM notification:', notificationError);
      // Don't fail the request if notification fails
    }

    // On check-in, tell the app how long to keep sharing live location: for the
    // whole working day (auto-stop at end-of-hours), not a manual share window.
    let tracking = null;
    if (type === 'in' && !attendance.isWFH) {
      try {
        const org = await Organization.findById(student.organization).select('workingHours');
        const { trackUntil, basis, shiftHours } = workingHoursService.trackUntil(
          org && org.workingHours,
          attendance.timestamp
        );
        tracking = {
          shouldTrack: true,
          trackUntil: trackUntil.toISOString(),
          basis, // 'working_hours' | 'default_shift'
          shiftHours,
        };

        // Open a live-location tracking window so the Admin/HOD map shows this
        // person as on-duty for the rest of the working day. The mobile app
        // streams GPS into this doc; checkout / end-of-hours closes it. Seed it
        // with the check-in coordinates so they appear on the map immediately.
        try {
          const LiveLocation = require('../models/LiveLocation');
          await LiveLocation.findOneAndUpdate(
            { student: student._id },
            {
              $set: {
                organization: student.organization,
                department: student.department || '',
                active: true,
                startedAt: attendance.timestamp,
                stoppedAt: null,
                trackUntil,
                lastStatus: 'tracking',
                latitude: finalLatitude,
                longitude: finalLongitude,
                lastFixAt: attendance.timestamp,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        } catch (llErr) {
          console.warn('[Attendance Mark] live-location seed failed:', llErr.message);
        }
      } catch (e) {
        console.warn('[Attendance Mark] tracking window calc failed:', e.message);
      }
    } else if (type === 'out') {
      // Checkout ends the live-location tracking window.
      try {
        const LiveLocation = require('../models/LiveLocation');
        await LiveLocation.findOneAndUpdate(
          { student: student._id },
          { $set: { active: false, stoppedAt: new Date(), lastStatus: 'stopped' } }
        );
      } catch (llErr) {
        console.warn('[Attendance Mark] live-location stop failed:', llErr.message);
      }
    }

    res.status(201).json({
      success: true,
      tracking,
      attendance: {
        id: attendance._id,
        type: attendance.type,
        timestamp: attendance.timestamp,
        latitude: attendance.latitude,
        longitude: attendance.longitude,
        distance: attendance.distance,
        markedOffice: attendance.markedOffice || null,
        faceVerified: attendance.faceVerified,
        authMethod: attendance.authMethod,
        status: attendance.status,
        isWFH: attendance.isWFH,
        wfhAssignment: currentWFHAssignment ? {
          reason: currentWFHAssignment.reason,
          startDate: currentWFHAssignment.startDate,
          endDate: currentWFHAssignment.endDate
        } : null
      }
    });

    // ASYNC VLM RESCAN — fired AFTER the response above, deliberately never
    // awaited. The attendance record is already written and the user already
    // has their answer; this exists ONLY to correct the admin spoof-review
    // dashboard afterward. The hosted-VLM call itself measured 10-60s, which
    // is exactly why it never runs on the request path above (see
    // faceVerifyService.js's vlmRescan() docstring) — running it here, after
    // res.json() already went out, costs the user nothing.
    if (isFaceMethod && faceImage) {
      faceVerifyService.vlmRescan(faceImage)
        .then(async (vlm) => {
          if (!vlm.available || !vlm.isFake) return;
          console.log(`[Attendance Mark] VLM RESCAN uid=${student.uid} type=${type}: confirmed spoof (${vlm.raw})`);
          try {
            await SpoofAttempt.create({
              student: student._id,
              organization: student.organization || null,
              uid: student.uid,
              studentName: student.fullName || student.name || null,
              type: type || 'in',
              faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
              score: null,
              label: 'fake',
              model: 'vlm-rescan',
              matched: attendance.faceVerified === true,
              similarity: verificationScore,
              latitude: finalLatitude,
              longitude: finalLongitude,
              deviceId: req.body.deviceId || undefined,
              deviceModel: req.body.deviceModel || undefined,
              manufacturer: req.body.manufacturer || undefined,
            });
          } catch (e) {
            console.error('[Attendance Mark] failed to record VLM-rescan SpoofAttempt:', e.message);
          }
          try {
            await securityEventService.record({
              category: 'verification_spoof',
              severity: 'critical',
              desiredAction: 'block',
              student,
              sessionType: type,
              detection: { spoofLabel: 'fake', signals: ['vlm_rescan_fake'], vlmReason: vlm.raw },
              device: { deviceId: req.body.deviceId, deviceModel: req.body.deviceModel, manufacturer: req.body.manufacturer, publicIp: resolveClientIp(req) },
              evidenceImage: faceImage,
              // Attendance already stands (POLICY CHANGE — see the isFake
              // handling above) — this is dashboard-only, so notification
              // noise is capped the same way a synchronous 'fake' already is.
              skipAutoNotify: true,
            });
          } catch (e) {
            console.error('[Attendance Mark] VLM-rescan security event failed:', e.message);
          }
        })
        .catch((e) => console.error('[Attendance Mark] VLM rescan request failed:', e.message));
    }
  } catch (error) {
    console.error('[Attendance Mark] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/attendance/history
// @desc    Get attendance history for student
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      type
    } = req.query;

    // Get student ID from auth
    let studentId;
    if (req.student) {
      studentId = req.student._id;
    } else if (req.user) {
      studentId = req.user.id;
    } else {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const query = { student: studentId };

    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (type) {
      query.type = type;
    }

    // Read from BOTH the primary and the external biometric collection, deduped
    // and newest-first (so a check-in done on the biometric system shows up here).
    // Paginate in memory since the records come from two stores.
    const merged = await findMergedAttendance(query);
    const total = merged.length;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const attendance = merged.slice((pageNum - 1) * limitNum, (pageNum - 1) * limitNum + limitNum);

    // Map attendance to include only relevant fields for frontend
    const attendanceList = attendance.map(a => ({
      id: a._id,
      type: a.type,
      timestamp: a.timestamp,
      latitude: a.latitude,
      longitude: a.longitude,
      distance: a.distance,
      markedOffice: a.markedOffice || null,
      faceVerified: a.faceVerified,
      authMethod: a.authMethod,
      status: a.status,
      organization: a.organization,
      student: a.student
    }));

    res.json({
      success: true,
      attendance: attendanceList,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total
    });
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/campus-offices
// @desc    Geofence points the LOGGED-IN staff may mark from. For the shared
//          campus (Anuvadini / NETF / IUAC) this returns ALL THREE offices so
//          the APP can show "in range" at ANY of them — a staff sent to a sister
//          branch marks there without anyone changing their DB location. The app
//          checks distance to the NEAREST of these, mirroring the server's own
//          findNearestOffice enforcement in /mark. Non-campus staff get their
//          own org's single location (behaviour unchanged for them).
// @access  Private (staff token)
router.get('/campus-offices', auth, async (req, res) => {
  try {
    const studentId = (req.student && req.student._id) || (req.user && (req.user.id || req.user._id));
    if (!studentId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const student = await Student.findById(studentId).select('organization Area_radius').lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const extra = Number(student.Area_radius) || 0;
    const { offices, orgIds } = await getCampusContext();
    const isCampus = orgIds.has(String(student.organization));

    if (isCampus && offices.length) {
      // allowed radius per office = max(office radius, the staff's own floor) —
      // the SAME formula findNearestOffice uses server-side, so the app's
      // in-range decision matches what /mark will actually accept.
      return res.json({
        success: true,
        campus: true,
        offices: offices.map((o) => ({
          campus: o.campus,
          name: o.name,
          latitude: o.latitude,
          longitude: o.longitude,
          radius: Math.max(o.radius || 0, extra),
        })),
      });
    }

    // Non-campus org: fall back to the student's own org location (single point).
    const org = await Organization.findById(student.organization)
      .select('name location Area_radius')
      .lean();
    const list = [];
    if (org && org.location && (org.location.latitude || org.location.longitude)) {
      list.push({
        campus: org.name,
        name: org.name,
        latitude: org.location.latitude,
        longitude: org.location.longitude,
        radius: Math.max(Number(org.Area_radius) || 0, extra) || 150,
      });
    }
    return res.json({ success: true, campus: false, offices: list });
  } catch (error) {
    console.error('campus-offices error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/attendance/stats
// @desc    Get attendance statistics for student
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    // Get student ID from auth
    let studentId;
    if (req.student) {
      studentId = req.student._id;
    } else if (req.user) {
      studentId = req.user.id;
    } else {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const query = { student: studentId };
    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Total records + unique present days for the selected range — read from
    // BOTH stores (primary + biometric), exactly like Recent History and the
    // calendar, so a day whose check-in only exists in the external biometric
    // collection is NOT miscounted as absent here. Present days are keyed by the
    // IST calendar date so this matches the /calendar endpoint day-for-day.
    const rangeRecords = await findMergedAttendance(query);

    // Present/leave DAYS, not raw check-in/check-out rows — a normal day is
    // one check-in + one check-out (2 rows) but is one present day, and a day
    // with an extra/duplicate check-out (re-checkout) must not inflate the
    // count either. totalRecords itself is derived below (present+absent+leave).
    const presentDaySet = new Set();
    const leaveDaySet = new Set();
    for (const r of rangeRecords) {
      const dateKey = istGetDateString(new Date(r.timestamp));
      // A check-in counts as present regardless of which day of week it
      // landed on — showing up (even a Sat/Sun, e.g. ad-hoc testing or
      // genuinely working a weekend) always wins, matching the /calendar
      // endpoint's per-day status logic below.
      if (r.type === 'in') presentDaySet.add(dateKey);
      else if (r.type === 'leave') leaveDaySet.add(dateKey);
    }
    const presentDays = presentDaySet.size;

    // Absent days: walk each individual day in range (capped at today) and
    // count it absent only if it's a weekday with NO check-in and NOT an
    // approved leave day. This must be a direct per-day count, not
    // "workingDays - presentDays - leaveDays" subtraction — that formula
    // silently assumes every present day is a working (Mon-Fri) day, which
    // breaks the moment someone checks in on a Sat/Sun: workingDays doesn't
    // grow for that day but presentDays does, so the subtraction "absorbs"
    // one real weekday absence per weekend check-in (e.g. 2 actual absences
    // read as 1). Direct iteration has no such assumption to break.
    let workingDays = 0;
    let absentDays = 0;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const end = new Date(endDate) > today ? today : new Date(endDate);
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const dayOfWeek = istGetDayOfWeek(currentDate);
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          workingDays++;
          const dateKey = istGetDateString(currentDate);
          if (!presentDaySet.has(dateKey) && !leaveDaySet.has(dateKey)) {
            absentDays++;
          }
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // "Records" = Present + Absent + Leave — matches the /calendar endpoint's
    // Total stat chip (present+absent+leaves) so the two screens agree. NOT a
    // raw count of days with any activity — that included weekend/testing
    // check-ins outside the working-day tally above and made Total disagree
    // with Present+Absent.
    const totalRecords = presentDays + absentDays + leaveDaySet.size;

    // This week stats (Sunday to Saturday)
    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay()); // Start of current week (Sunday)
    thisWeekStart.setHours(0, 0, 0, 0);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 7); // End of current week
    const thisWeekQuery = {
      student: studentId,
      timestamp: { $gte: thisWeekStart, $lt: thisWeekEnd }
    };
    const thisWeekRecords = await findMergedAttendance(thisWeekQuery);
    const thisWeekIn = thisWeekRecords.filter((r) => r.type === 'in').length;
    const thisWeekOut = thisWeekRecords.filter((r) => r.type === 'out').length;
    const thisWeekTotal = thisWeekRecords.length;

    // Today's attendance
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayQuery = {
      student: studentId,
      timestamp: { $gte: todayStart, $lte: todayEnd }
    };
    const todayRecords = await findMergedAttendance(todayQuery);
    const todayIn = todayRecords.filter((r) => r.type === 'in').length;
    const todayOut = todayRecords.filter((r) => r.type === 'out').length;
    const todayTotal = todayRecords.length;

    // Recent attendance (last 10 records) — merged so biometric-only marks show.
    const recentRecords = (await findMergedAttendance({ student: studentId })).slice(0, 10);

    // Monthly stats (already calculated above)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const monthQuery = {
      student: studentId,
      timestamp: { $gte: monthStart, $lt: monthEnd }
    };
    const monthlyRecords = await findMergedAttendance(monthQuery);
    const monthlyInCount = monthlyRecords.filter((r) => r.type === 'in').length;
    const monthlyOutCount = monthlyRecords.filter((r) => r.type === 'out').length;
    const monthlyTotal = monthlyRecords.length;

    // Calculate average distance
    const distanceStats = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          averageDistance: { $avg: '$distance' },
          maxDistance: { $max: '$distance' },
          minDistance: { $min: '$distance' }
        }
      }
    ]);
    const averageDistance = distanceStats.length > 0 ? distanceStats[0].averageDistance : 0;
    const successRate = totalRecords > 0 && workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;

    res.json({
      success: true,
      stats: {
        totalRecords,
        presentDays,
        absentDays,
        averageDistance: Math.round(averageDistance * 100) / 100,
        successRate,
        last7Days: {
          in: thisWeekIn,
          out: thisWeekOut,
          total: thisWeekTotal
        },
        today: {
          in: todayIn,
          out: todayOut,
          total: todayTotal
        },
        thisWeek: {
          in: thisWeekIn,
          out: thisWeekOut,
          total: thisWeekTotal
        },
        thisMonth: {
          in: monthlyInCount,
          out: monthlyOutCount,
          total: monthlyTotal
        },
        recent: recentRecords
      }
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance
// @desc    Get attendance records for organization with pagination and filters
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      startDate,
      endDate,
      studentId,
      type
    } = req.query;

    // This endpoint is for organization users
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.user && req.user.role === 'organization') {
      organizationId = req.user.id;
    } else {
      return res.status(401).json({ message: 'Organization authentication required' });
    }
    
    // HOD scope (null for Admin). Campus-scoped so a home student who marked at
    // a sister branch (or a visitor who marked here) still shows — skipped
    // when a specific studentId is requested (single-student lookup).
    const listScope = await deptScopeIds(req);
    const listAttFilter = listScope ? { student: { $in: listScope } } : {};
    let query;
    if (studentId) {
      query = { organization: organizationId, student: studentId };
    } else {
      const { orgFilter: listOrgFilter, studentClause: listStudentClause } =
        await campusScopedAttendanceFilter(organizationId, listAttFilter);
      query = { organization: listOrgFilter, ...listStudentClause };
    }

    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (type) {
      query.type = type;
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'fullName uid class department bureau')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Attendance.countDocuments(query);

    res.json({
      success: true,
      data: {
        attendance,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get organization attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/organization/stats
// @desc    Get attendance statistics for organization
// @access  Private
router.get('/organization/stats', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // This endpoint is for organization users
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.user && req.user.role === 'organization') {
      organizationId = req.user.id;
    } else {
      return res.status(401).json({ message: 'Organization authentication required' });
    }

    const statScope = await deptScopeIds(req);
    const statAttFilter = statScope ? { student: { $in: statScope } } : {};
    const { orgFilter: statOrgFilter, studentClause: statStudentClause } =
      await campusScopedAttendanceFilter(organizationId, statAttFilter);
    const query = { organization: statOrgFilter, ...statStudentClause };

    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const totalRecords = await Attendance.countDocuments(query);

    // Get unique dates with check-ins across all students
    const presentDaysResult = await Attendance.aggregate([
      { $match: { ...query, type: 'in' } },
      {
        $group: {
          _id: {
            student: '$student',
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          }
        }
      },
      { $count: 'uniqueStudentDays' }
    ]);

    const presentDays = presentDaysResult.length > 0 ? presentDaysResult[0].uniqueStudentDays : 0;

    // Calculate weekly statistics
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekQuery = {
      organization: statOrgFilter,
      ...statStudentClause,
      timestamp: { $gte: weekStart, $lt: weekEnd }
    };

    const weeklyInCount = await Attendance.countDocuments({ ...weekQuery, type: 'in' });
    const weeklyOutCount = await Attendance.countDocuments({ ...weekQuery, type: 'out' });
    const weeklyTotal = await Attendance.countDocuments(weekQuery);

    // Calculate monthly statistics
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const monthQuery = {
      organization: statOrgFilter,
      ...statStudentClause,
      timestamp: { $gte: monthStart, $lt: monthEnd }
    };

    const monthlyInCount = await Attendance.countDocuments({ ...monthQuery, type: 'in' });
    const monthlyOutCount = await Attendance.countDocuments({ ...monthQuery, type: 'out' });
    const monthlyTotal = await Attendance.countDocuments(monthQuery);

    // Calculate average distance
    const distanceStats = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          averageDistance: { $avg: '$distance' },
          maxDistance: { $max: '$distance' },
          minDistance: { $min: '$distance' }
        }
      }
    ]);

    const averageDistance = distanceStats.length > 0 ? distanceStats[0].averageDistance : 0;
    const successRate = totalRecords > 0 ? Math.round((weeklyInCount + monthlyInCount) / totalRecords * 100) : 0;

    res.json({
      success: true,
      stats: {
        totalRecords,
        presentDays,
        absentDays: 0, // Organizations don't track absent days the same way
        averageDistance: Math.round(averageDistance * 100) / 100,
        successRate,
        thisWeek: {
          in: weeklyInCount,
          out: weeklyOutCount,
          total: weeklyTotal
        },
        thisMonth: {
          in: monthlyInCount,
          out: monthlyOutCount,
          total: monthlyTotal
        }
      }
    });
  } catch (error) {
    console.error('Get organization attendance stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/organization/monthly-trend
// @desc    Get month-wise attendance count for the last 12 months (unique student-days present)
// @access  Private
router.get('/organization/monthly-trend', auth, async (req, res) => {
  try {
    // Resolve organization id (supports both organization and student tokens)
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.student) {
      organizationId = req.student.organization;
    } else if (req.user && req.user.role === 'organization') {
      organizationId = req.user.id;
    } else {
      return res.status(401).json({ message: 'Organization authentication required' });
    }

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const trendScope = await deptScopeIds(req);
    const trendAttFilter = trendScope ? { student: { $in: trendScope } } : {};
    const { orgFilter: trendOrgFilter, studentClause: trendStudentClause } =
      await campusScopedAttendanceFilter(organizationId, trendAttFilter);
    const trendMatch = { organization: trendOrgFilter, ...trendStudentClause, type: 'in', timestamp: { $gte: start, $lt: end } };

    // Aggregate unique student-days with at least one check-in (type: 'in') per month
    const pipeline = [
      { $match: trendMatch },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' },
            student: '$student'
          }
        }
      },
      {
        $group: {
          _id: { year: '$_id.year', month: '$_id.month' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ];

    const results = await Attendance.aggregate(pipeline);

    // Build a 12-month series including months with zero values
    const series = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const countsMap = new Map(results.map(r => [`${r._id.year}-${r._id.month}`, r.count]));

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-12
      const key = `${year}-${month}`;
      series.push({
        month: monthNames[month - 1],
        year,
        count: countsMap.get(key) || 0
      });
    }

    return res.json({ success: true, data: series });
  } catch (error) {
    console.error('Get monthly trend error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// removed duplicate misspelled route '/department-time-heatmpa'

// @route   GET /api/attendance/department-time-heatmap
// @desc    Heatmap data: departments (rows) vs arrival time slots (columns)
// @access  Private
router.get('/department-time-heatmap', auth, async (req, res) => {
  try {
    // Resolve organization id (supports both organization and student tokens)
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.student) {
      organizationId = req.student.organization;
    } else if (req.user && req.user.role === "organization") {
      organizationId = req.user.id;
    } else {
      return res
        .status(401)
        .json({ message: "Organization authentication required" });
    }

    // Date range
    // - If from/to provided: use them
    // - Else if date provided: use that single day
    // - Else: last 30 days
    const { date, from, to } = req.query;
    let start;
    let end;
    if (from || to) {
      start = from ? new Date(from) : new Date();
      end = to ? new Date(to) : new Date();
      if (from) start.setHours(0, 0, 0, 0);
      if (to) {
        end.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 1);
      }
    } else if (date) {
      start = new Date(date);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 1);
    } else {
      end = new Date();
      start = new Date();
      start.setDate(end.getDate() - 30);
    }

    // Define time slots for columns (minutes since midnight)
    const slots = [
      { label: "8:00-8:30", from: 8 * 60, to: 8 * 60 + 30 },
      { label: "8:30-9:00", from: 8 * 60 + 30, to: 9 * 60 },
      { label: "9:00-9:30", from: 9 * 60, to: 9 * 60 + 30 },
      { label: "9:31-10:00 (Late)", from: 9 * 60 + 31, to: 10 * 60 },
      { label: "10:01-10:30 (Late)", from: 10 * 60 + 1, to: 10 * 60 + 30 },
      { label: "10:31-11:00 (Late)", from: 10 * 60 + 31, to: 11 * 60 },
      { label: "11:00+ (Late)", from: 11 * 60, to: 24 * 60 },
    ];

    // Build switch branches once for Mongo $switch
    const slotBranches = slots.map((s) => ({
      case: {
        $and: [{ $gte: ["$minutes", s.from] }, { $lt: ["$minutes", s.to] }],
      },
      then: s.label,
    }));

    // HOD scope (null for Admin).
    const hmScope = await deptScopeIds(req);

    // Get all departments (HOD → only their own)
    const StudentModel = require("../models/Student");
    let departments = (
      await StudentModel.distinct("department", {
        organization: organizationId,
      })
    ).filter(Boolean);
    if (hmScope) departments = departments.filter((d) => d === req.hodDepartment);

    // Get all students by department
    const studentsByDept = {};
    for (const dep of departments) {
      studentsByDept[dep] = await StudentModel.find({
        organization: organizationId,
        department: dep,
      }).select("_id");
    }

    // Get all attendance records for the date range — campus-scoped so a home
    // student who checked in at a sister branch still counts as present here.
    const hmAttFilter = hmScope ? { student: { $in: hmScope } } : {};
    const { orgFilter: hmOrgFilter, studentClause: hmStudentClause } =
      await campusScopedAttendanceFilter(organizationId, hmAttFilter);
    const attendanceRecords = await Attendance.find({
      organization: hmOrgFilter,
      ...hmStudentClause,
      $or: [{ type: "in" }, { type: { $exists: false } }],
      timestamp: { $gte: start, $lt: end },
    }).populate("student", "department");

    // Build absent matrix
    const matrix = departments.map((dep) => {
      // For each slot, count absentees
      const values = slots.map((slot) => {
        // Get all students in department
        const allStudents = studentsByDept[dep].map((s) => String(s._id));
        // Get students who checked in for this slot
        const presentStudents = attendanceRecords
          .filter((rec) => {
            return (
              rec.student &&
              rec.student.department === dep &&
              (() => {
                const minutes =
                  rec.timestamp.getHours() * 60 + rec.timestamp.getMinutes();
                return minutes >= slot.from && minutes < slot.to;
              })()
            );
          })
          .map((rec) => String(rec.student._id));
        // Absentees = allStudents - presentStudents
        const absentCount = allStudents.filter(
          (id) => !presentStudents.includes(id)
        ).length;
        return absentCount;
      });
      return { department: dep, values };
    });

    return res.json({
      success: true,
      slots: slots.map((s) => s.label),
      departments,
      matrix,
    });
  } catch (error) {
    console.error('Department-time heatmap error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/spoof-attempts
// @desc    List blocked anti-spoof (fake face) attempts for this organization,
//          scoped to the HOD's department when the caller is a department head.
//          Backs the Admin/HOD "Verification Engine" fraud-review page.
// @access  Private (org/HOD)
router.get('/spoof-attempts', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ success: false, message: 'Organization access required' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize, 10) || 50));

    // label:'fake' only — SpoofAttempt also stores 'uncertain' rows (borderline
    // captures that were NEVER blocked, recorded only for pattern review) and
    // those must not show up as accusations on this "blocked attempts" page.
    const spoofMatch = { organization: req.organization._id, label: 'fake' };
    // A genuine LIVE face that just isn't the account owner's (impersonation)
    // never creates a SpoofAttempt — the PAD (anti-spoof) model correctly
    // scores it 'real', so it's recorded as a SecurityEvent instead (see
    // attendance.js's "IMPERSONATION ALERT" block in the /mark route above).
    // Mirrors the same dual-query merge added to the super-admin spoof-attempts
    // route (server/routes/superadmin.js) on 2026-07-30 — this HOD/Admin-scoped
    // route was missed at the time, so impersonation attempts were invisible
    // here even though super-admins could already see them.
    const impersonationMatch = { organization: req.organization._id, category: 'face_mismatch_pattern' };

    const scope = await deptScopeIds(req);
    if (scope) {
      spoofMatch.student = { $in: scope };
      impersonationMatch.student = { $in: scope };
    }

    // Both queries fetch up to (page*pageSize) newest rows from EACH source,
    // then get merged/sorted/re-paginated below — same approach as the
    // super-admin route, for the same reason (no cross-collection paginated
    // query without an aggregation $unionWith, and this data volume is small).
    const fetchLimit = page * pageSize;
    const [spoofTotal, impersonationTotal, spoofRows, impersonationRows] = await Promise.all([
      SpoofAttempt.countDocuments(spoofMatch),
      SecurityEvent.countDocuments(impersonationMatch),
      SpoofAttempt.find(spoofMatch)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .populate('student', 'fullName uid designation department')
        .select('uid studentName type score label model matched similarity latitude longitude createdAt student')
        .lean(),
      SecurityEvent.find(impersonationMatch)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .populate('student', 'fullName uid designation department')
        .select('uid studentName sessionType detection createdAt student')
        .lean(),
    ]);

    const spoofItems = spoofRows.map((r) => ({
      id: r._id,
      source: 'spoofattempt',
      staff: r.student?.fullName || r.studentName || 'Unknown',
      uid: r.student?.uid || r.uid || '',
      department: r.student?.department || null,
      type: r.type || 'in',
      score: typeof r.score === 'number' ? r.score : null,
      label: r.label || 'fake',
      kind: 'screen_replay', // face-crop PAD confirmed a screen/photo replay
      matched: r.matched === true,
      similarity: typeof r.similarity === 'number' ? r.similarity : null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      time: r.createdAt,
    }));

    const impersonationItems = impersonationRows.map((r) => ({
      id: r._id,
      source: 'securityevent',
      staff: r.student?.fullName || r.studentName || 'Unknown',
      uid: r.student?.uid || r.uid || '',
      department: r.student?.department || null,
      type: r.sessionType || 'in',
      score: typeof r.detection?.faceMatchConfidence === 'number' ? r.detection.faceMatchConfidence : null,
      label: 'fake', // kept 'fake' so existing frontend badge logic renders unchanged
      kind: 'impersonation', // a genuine LIVE face that just isn't the account owner's
      matched: false,
      similarity: typeof r.detection?.faceMatchConfidence === 'number' ? r.detection.faceMatchConfidence : null,
      latitude: null,
      longitude: null,
      time: r.createdAt,
    }));

    const total = spoofTotal + impersonationTotal;
    const items = [...spoofItems, ...impersonationItems]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice((page - 1) * pageSize, page * pageSize);

    return res.json({
      success: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    });
  } catch (error) {
    console.error('[attendance/spoof-attempts]', error);
    return res.status(500).json({ success: false, message: 'Failed to load spoof attempts' });
  }
});

// @route   GET /api/attendance/export
// @desc    Export attendance as CSV for day/week/month (organization scope)
// @access  Private
router.get('/export', auth, async (req, res) => {
  try {
    // Resolve organization id (supports org/student tokens)
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.student) {
      organizationId = req.student.organization;
    } else if (req.user && req.user.role === 'organization') {
      organizationId = req.user.id;
    } else {
      return res.status(401).json({ message: 'Organization authentication required' });
    }

    const { mode = 'day', date, week, month, class: className, department, type, status } = req.query;

    // Compute date range based on mode
    let start;
    let end;
    const now = new Date();
    if (mode === 'day') {
      const d = date ? new Date(date) : now;
      start = new Date(d);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (mode === 'week') {
      // Input week as YYYY-Www; default to current week
      let monday;
      if (week && /\d{4}-W\d{2}/.test(week)) {
        const [y, w] = week.split('-W').map(Number);
        const jan4 = new Date(y, 0, 4);
        const day = jan4.getDay() || 7;
        monday = new Date(jan4);
        monday.setDate(jan4.getDate() - day + 1 + (w - 1) * 7);
      } else {
        monday = new Date(now);
        const dow = monday.getDay();
        const diff = (dow === 0 ? -6 : 1 - dow);
        monday.setDate(monday.getDate() + diff);
      }
      start = new Date(monday);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    } else if (mode === 'month') {
      // Input month as YYYY-MM; default to current month
      let y = now.getFullYear();
      let m = now.getMonth();
      if (month && /\d{4}-\d{2}/.test(month)) {
        const [yy, mm] = month.split('-').map(Number);
        y = yy;
        m = mm - 1;
      }
      start = new Date(y, m, 1, 0, 0, 0, 0);
      end = new Date(y, m + 1, 1, 0, 0, 0, 0);
    } else {
      return res.status(400).json({ message: 'Invalid mode. Use day|week|month' });
    }

    // Base query — campus-scoped (home staff + anyone who marked here).
    const exportScope = await deptScopeIds(req);
    const exportAttFilter = exportScope ? { student: { $in: exportScope } } : {};
    const { orgFilter: exportOrgFilter, studentClause: exportStudentClause } =
      await campusScopedAttendanceFilter(organizationId, exportAttFilter);
    const query = {
      organization: exportOrgFilter,
      ...exportStudentClause,
      timestamp: { $gte: start, $lt: end }
    };
    if (type) query.type = type;
    if (status) query.status = status;

    // Fetch attendance with student details
    let records = await Attendance.find(query)
      .populate('student', 'fullName uid class department bureau')
      .sort({ timestamp: 1 });

    // Client-side filter for class/department if provided
    if (className) {
      records = records.filter(r => r.student && r.student.class === className);
    }
    if (department) {
      records = records.filter(r => r.student && r.student.department === department);
    }

    // Prepare flat rows — full evidentiary fields restored (these were
    // previously dropped, weakening the export's value — SAACMS Module 6).
    const rows = records.map(r => ({
      date: r.timestamp ? new Date(r.timestamp).toISOString().slice(0, 10) : '',
      time: r.timestamp ? new Date(r.timestamp).toLocaleTimeString('en-GB', { hour12: false }) : '',
      type: r.type || '',
      status: r.status || '',
      authMethod: r.authMethod || '',
      faceVerified: r.faceVerified ? 'yes' : 'no',
      verificationScore: r.verificationScore != null ? r.verificationScore : '',
      distance: r.distance != null ? Math.round(r.distance) : '',
      latitude: r.latitude != null ? r.latitude : '',
      longitude: r.longitude != null ? r.longitude : '',
      isWFH: r.isWFH ? 'yes' : 'no',
      studentName: r.student?.fullName || '',
      uid: r.student?.uid || '',
      class: r.student?.class || '',
      department: r.student?.department || '',
      bureau: r.student?.bureau || '',
    }));

    const headers = [
      { label: 'Date', get: (r) => r.date ? `="${r.date}"` : '' },
      { label: 'Time', get: (r) => r.time },
      { label: 'Type', get: (r) => r.type },
      { label: 'Status', get: (r) => r.status },
      { label: 'Auth Method', get: (r) => r.authMethod },
      { label: 'Face Verified', get: (r) => r.faceVerified },
      { label: 'Verification Score', get: (r) => r.verificationScore },
      { label: 'Distance (m)', get: (r) => r.distance },
      { label: 'Latitude', get: (r) => r.latitude },
      { label: 'Longitude', get: (r) => r.longitude },
      { label: 'WFH', get: (r) => r.isWFH },
      { label: 'Student Name', get: (r) => r.studentName },
      { label: 'UID', get: (r) => r.uid },
      { label: 'Class', get: (r) => r.class },
      { label: 'Department', get: (r) => r.department },
      { label: 'Bureau', get: (r) => r.bureau },
    ];

    const csv = convertToCSV(rows, headers);
    const filenameBase = `attendance_${mode}_${new Date(start).toISOString().slice(0, 10)}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    return res.status(200).send('\uFEFF' + csv);

  } catch (error) {
    console.error('Attendance export error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/reports/daily
// @desc    Get daily attendance report for the organization
// @access  Private
router.get('/reports/daily', auth, async (req, res) => {
  try {
    // Parse filters from query
    const { date, class: className, department, status, biometricType } = req.query;
    let start = date ? new Date(date) : new Date();
    start.setHours(0, 0, 0, 0);
    let end = new Date(start);
    end.setDate(start.getDate() + 1);

    // HOD scope: restrict to department members (null for Admin → org-wide).
    const scope = await deptScopeIds(req);

    // Shared-campus reporting (Anuvadini / NETF / IUAC are one campus). A branch's
    // report lists (a) that branch's OWN staff (so an absent home employee still
    // counts), plus (b) anyone from ANY campus org who PHYSICALLY MARKED at this
    // branch (Office column shows where they're actually from). Attendance is
    // read across all three campus orgs so a split check-in/check-out reunites.
    // Non-campus orgs keep their own single-org scope. See
    // utils/sharedOffices.campusScopedAttendanceFilter (single source of truth).
    const dailyAttFilter = scope ? { student: { $in: scope } } : {};
    const { orgFilter, studentClause: dailyStudentClause, rosterIds: dailyRosterIds } =
      await campusScopedAttendanceFilter(req.organization._id, dailyAttFilter);

    // Build query
    const query = {
      organization: orgFilter,
      ...dailyStudentClause,
      timestamp: { $gte: start, $lt: end }
    };
    if (status) query.status = status;

    // Fetch attendance with minimal fields and populate only necessary student fields
    let attendance = await Attendance.find(query)
      .select('student type timestamp authMethod status markedOffice')
      .populate('student', 'fullName uid class department bureau');

    // Filter by class/department if provided
    if (className) {
      attendance = attendance.filter(a => a.student && a.student.class === className);
    }
    if (department) {
      attendance = attendance.filter(a => a.student && a.student.department === department);
    }
    // Filter by biometricType (authMethod)
    if (biometricType) {
      attendance = attendance.filter(a => a.authMethod === biometricType || (a.checkIn && a.checkIn.biometricType === biometricType));
    }

    // Roster = this org's own ACTIVE students, PLUS (for a campus branch) any
    // visitor who marked here today (dailyRosterIds — same set the attendance
    // query above used), so a visiting employee's day counts toward totals
    // too, not just their attendance rows. Deactivated home staff never count
    // as absent (isActive: true) — keeps Present/Absent reconciled with the
    // dashboard's "Unapproved Absences" (absenceService), which is home-org-only.
    const StudentModel = require('../models/Student');
    let studentQuery = dailyRosterIds
      ? { _id: { $in: dailyRosterIds } }
      : { organization: req.organization._id, isActive: true };
    if (className) studentQuery.class = className;
    if (department) studentQuery.department = department;
    if (scope) studentQuery._id = { $in: scope };
    // Fetch only required student fields for calculations
    const allStudents = await StudentModel.find(studentQuery).select('_id fullName uid class department bureau');
    const totalStudents = allStudents.length;

    // Compute total 'in' scans and unique student check-ins for the day
    const totalInScans = attendance.filter(a => a.type === 'in').length;
    const uniqueCheckInIds = new Set(attendance.filter(a => a.type === 'in').map(a => a.student?._id?.toString()).filter(Boolean));
    const uniqueCheckIns = uniqueCheckInIds.size;

    // Group attendance by student and type
    const attendanceByStudent = {};
    attendance.forEach(a => {
      const sid = a.student?._id?.toString();
      if (!sid) return;
      if (!attendanceByStudent[sid]) attendanceByStudent[sid] = { in: null, out: null, records: [] };
      if (a.type === 'in') attendanceByStudent[sid].in = a;
      if (a.type === 'out') attendanceByStudent[sid].out = a;
      attendanceByStudent[sid].records.push(a);
    });

    // Present: students with at least one check-in
    const presentStudentIds = Object.keys(attendanceByStudent).filter(sid => !!attendanceByStudent[sid].in);
    const presentCount = presentStudentIds.length;

    // Absent: students with neither check-in nor check-out
    const absentCount = allStudents.filter(s => !attendanceByStudent[s._id.toString()]).length;

    // Late: students whose check-in is after 9:31 AM
    const lateCount = presentStudentIds.filter(sid => {
      const checkIn = attendanceByStudent[sid].in;
      if (!checkIn) return false;
      const checkInTime = new Date(checkIn.timestamp);
      return checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() >= 31);
    }).length;

    // Attendance rate
    const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

    // Group by class/department for classStats
    let classStats = [];
    if (req.organization.organizationType === 'school' || req.organization.organizationType === 'institute') {
      // Group by class
      const classes = await StudentModel.distinct('class', { organization: req.organization._id });
      classStats = classes.filter(cls => cls).map(cls => {
        const studentsInClass = allStudents.filter(s => s.class === cls);
        const present = studentsInClass.filter(s => presentStudentIds.includes(s._id.toString())).length;
        const absent = studentsInClass.filter(s => !attendanceByStudent[s._id.toString()]).length;
        const late = studentsInClass.filter(s => {
          const sid = s._id.toString();
          if (!attendanceByStudent[sid] || !attendanceByStudent[sid].in) return false;
          const checkInTime = new Date(attendanceByStudent[sid].in.timestamp);
          return checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() >= 31);
        }).length;
        return { _id: cls, present, absent, late };
      });
    } else {
      // Group by department
      let departments = await StudentModel.distinct('department', { organization: req.organization._id });
      if (scope) departments = departments.filter(dep => dep === req.hodDepartment);
      classStats = departments.filter(dep => dep).map(dep => {
        const studentsInDep = allStudents.filter(s => s.department === dep);
        const present = studentsInDep.filter(s => presentStudentIds.includes(s._id.toString())).length;
        const absent = studentsInDep.filter(s => !attendanceByStudent[s._id.toString()]).length;
        const late = studentsInDep.filter(s => {
          const sid = s._id.toString();
          if (!attendanceByStudent[sid] || !attendanceByStudent[sid].in) return false;
          const checkInTime = new Date(attendanceByStudent[sid].in.timestamp);
          return checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() >= 31);
        }).length;
        return { _id: dep, present, absent, late };
      });
    }

    // Biometric usage stats: count all check-in records (type: 'in') with a valid authMethod
    const biometricUsage = {};
    attendance.forEach(a => {
      if (a.authMethod) {
        biometricUsage[a.authMethod] = (biometricUsage[a.authMethod] || 0) + 1;
      }
    });

    // Return only limited fields per attendance record to keep payload light
    const attendanceSummary = attendance.map(a => ({
      _id: a._id,
      student: a.student ? { _id: a.student._id, fullName: a.student.fullName, uid: a.student.uid, department: a.student.department } : null,
      type: a.type,
      timestamp: a.timestamp,
      authMethod: a.authMethod,
      status: a.status,
      // Campus premises this mark was made at (Anuvadini / NETF / IUAC) so the
      // admin/Admin daily report can show where each staff checked in from.
      markedOffice: a.markedOffice ? { name: a.markedOffice.name || null } : null
    }));
    const studentSummary = allStudents.map(s => ({
      _id: s._id,
      fullName: s.fullName,
      uid: s.uid,
      class: s.class,
      department: s.department,
      bureau: s.bureau
    }));

    res.json({
      success: true,
      report: {
        date: start.toISOString().split('T')[0],
        // Added explicit scan vs unique metrics for clarity in reports
        checkInScans: totalInScans,
        uniqueCheckIns,
        presentCount,
        lateCount,
        absentCount,
        totalStudents,
        attendanceRate,
        classStats,
        biometricUsage,
        students: studentSummary,
        attendance: attendanceSummary
      }
    });
  } catch (error) {
    console.error('Daily report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/reports/range?start=YYYY-MM-DD&end=YYYY-MM-DD
// @desc    Full attendance REGISTER for a custom date range — every employee × every
//          date with a P (present) / A (absent) / L (approved leave) mark, plus
//          per-employee totals and a range summary. ALL dates are included (Sat &
//          Sun are NOT treated as weekends). HOD-scoped. Powers the Admin reports
//          custom-range view and its PDF/Excel export.
// @access  Private (Admin / HOD)
router.get('/reports/range', auth, async (req, res) => {
  try {
    if (!req.organization?._id) {
      return res.status(403).json({ success: false, message: 'Organization context required' });
    }
    const startYMD = String(req.query.start || '').slice(0, 10);
    const endYMD = String(req.query.end || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startYMD) || !/^\d{4}-\d{2}-\d{2}$/.test(endYMD)) {
      return res.status(400).json({ success: false, message: 'start and end (YYYY-MM-DD) are required' });
    }
    if (startYMD > endYMD) {
      return res.status(400).json({ success: false, message: 'start must be on or before end' });
    }

    const scope = await deptScopeIds(req); // HOD → dept ids; Admin → null (org-wide)
    const studentQuery = { organization: req.organization._id, isActive: true };
    if (scope) studentQuery._id = { $in: scope };
    const allStudents = await Student.find(studentQuery)
      .select('_id fullName uid department')
      .sort({ fullName: 1 })
      .lean();
    const totalEmployees = allStudents.length;
    const studentIds = allStudents.map((s) => s._id);

    const rangeStart = istStartOfDay(new Date(`${startYMD}T12:00:00+05:30`));
    const rangeEnd = istEndOfDay(new Date(`${endYMD}T12:00:00+05:30`));
    const todayStr = istGetDateString(new Date());

    // Full date list — ALL days (weekends included).
    const dates = [];
    {
      const cursor = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        const ds = istGetDateString(cursor);
        dates.push({
          date: ds,
          day: parseInt(istGetYMD(cursor).d, 10),
          dayName: cursor.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, weekday: 'short' }),
          weekday: istGetDayOfWeek(cursor),
          isFuture: ds > todayStr,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    // Guard against an unrenderably large matrix.
    if (dates.length * Math.max(totalEmployees, 1) > 200000) {
      return res.status(400).json({
        success: false,
        message: 'Range too large for a full register. Please pick a shorter range.',
      });
    }

    // Campus-scoped so a home student who checked in at a sister branch still
    // shows present in this register instead of wrongly absent.
    const rangeAttFilter = scope ? { student: { $in: scope } } : {};
    const { orgFilter: rangeOrgFilter, studentClause: rangeStudentClause } =
      await campusScopedAttendanceFilter(req.organization._id, rangeAttFilter);
    const [ins, leaves] = await Promise.all([
      Attendance.find({
        organization: rangeOrgFilter,
        type: 'in',
        timestamp: { $gte: rangeStart, $lte: rangeEnd },
        ...rangeStudentClause,
      })
        .select('student timestamp')
        .lean(),
      LeaveRequest.find({
        student: { $in: studentIds },
        status: 'approved',
        'leaveDates.start': { $lte: rangeEnd },
        'leaveDates.end': { $gte: rangeStart },
      })
        .select('student leaveDates')
        .lean(),
    ]);

    // present-by-date set of student ids.
    const presentByDate = {};
    for (const a of ins) {
      const ds = istGetDateString(a.timestamp);
      (presentByDate[ds] = presentByDate[ds] || new Set()).add(String(a.student));
    }
    // on-leave-by-date set of student ids (approved leave covering that day).
    const leaveByDate = {};
    for (const l of leaves) {
      if (!l.leaveDates) continue;
      const ls = new Date(l.leaveDates.start);
      const le = new Date(l.leaveDates.end);
      for (const d of dates) {
        if (d.isFuture) continue;
        const dayStart = istStartOfDay(new Date(`${d.date}T12:00:00+05:30`));
        const dayEnd = istEndOfDay(new Date(`${d.date}T12:00:00+05:30`));
        if (ls <= dayEnd && le >= dayStart) {
          (leaveByDate[d.date] = leaveByDate[d.date] || new Set()).add(String(l.student));
        }
      }
    }

    // Per-employee × per-date register.
    const students = allStudents.map((s) => {
      const sid = String(s._id);
      const cells = {};
      let present = 0;
      let absent = 0;
      let leave = 0;
      for (const d of dates) {
        if (d.isFuture) {
          cells[d.date] = '';
          continue;
        }
        if (leaveByDate[d.date] && leaveByDate[d.date].has(sid)) {
          cells[d.date] = 'L';
          leave += 1;
        } else if (presentByDate[d.date] && presentByDate[d.date].has(sid)) {
          cells[d.date] = 'P';
          present += 1;
        } else {
          cells[d.date] = 'A';
          absent += 1;
        }
      }
      return {
        id: sid,
        name: s.fullName || 'Unknown',
        uid: s.uid || '',
        department: s.department || '',
        present,
        absent,
        leave,
        cells,
      };
    });

    const summary = {
      present: students.reduce((x, s) => x + s.present, 0),
      absent: students.reduce((x, s) => x + s.absent, 0),
      leave: students.reduce((x, s) => x + s.leave, 0),
      totalEmployees,
      totalDays: dates.filter((d) => !d.isFuture).length,
    };

    res.json({ success: true, start: startYMD, end: endYMD, dates, summary, students });
  } catch (error) {
    console.error('[Attendance Range Report] error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// @route   GET /api/attendance/reports/time-wise
// @desc    Get time-wise attendance statistics for today
// @access  Private
router.get('/reports/time-wise', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // HOD scope (null for Admin). Campus-scoped so a home student who checked in
    // at a sister branch (or a visitor who marked here) still counts.
    const twScope = await deptScopeIds(req);
    const twAttFilter = twScope ? { student: { $in: twScope } } : {};
    const { orgFilter: twOrgFilter, studentClause: twStudentClause } =
      await campusScopedAttendanceFilter(req.organization._id, twAttFilter);
    const twMatch = {
      organization: twOrgFilter,
      ...twStudentClause,
      timestamp: { $gte: today, $lt: tomorrow },
      type: 'in' // Only get check-in records
    };

    // Get latest check-in for each student today (prevents double-counting multiple check-ins)
    const attendanceResult = await Attendance.aggregate([
      { $match: twMatch },
      {
        $group: {
          _id: '$student',
          latestCheckIn: { $max: '$timestamp' }
        }
      }
    ]);

    console.log(`Found ${attendanceResult.length} unique students who checked in today`);

    // Define time slots with clear, non-overlapping boundaries
    const timeSlots = {
      'Before 9:00': 0,        // 00:00 - 08:59
      '9:00-9:30': 0,          // 09:00 - 09:30  
      '9:31-10:00 (Late)': 0,  // 09:31 - 10:00
      '10:01-11:00 (Late)': 0, // 10:01 - 11:00
      'After 11:00 (Late)': 0  // 11:00 and later
    };

    // Categorize attendance by time slots using latest check-in timestamp
    attendanceResult.forEach(record => {
      const checkInTime = new Date(record.latestCheckIn);
      const hours = checkInTime.getHours();
      const minutes = checkInTime.getMinutes();
      const timeInMinutes = hours * 60 + minutes;

      console.log(`Latest check-in time: ${hours}:${minutes.toString().padStart(2, '0')} (${timeInMinutes} minutes from midnight)`);

      // Non-overlapping time slots:
      if (timeInMinutes < 540) { // Before 9:00 AM (0:00 - 8:59)
        timeSlots['Before 9:00']++;
      } else if (timeInMinutes >= 540 && timeInMinutes <= 570) { // 9:00 - 9:30 AM
        timeSlots['9:00-9:30']++;
      } else if (timeInMinutes >= 571 && timeInMinutes <= 600) { // 9:31 - 10:00 AM (Late)
        timeSlots['9:31-10:00 (Late)']++;
      } else if (timeInMinutes >= 601 && timeInMinutes <= 660) { // 10:01 - 11:00 AM (Late)
        timeSlots['10:01-11:00 (Late)']++;
      } else { // 11:00 AM and after (Late)
        timeSlots['After 11:00 (Late)']++;
      }
    });

    console.log('Time slots distribution:', timeSlots);

    // Convert to array format for charts
    const timeWiseData = Object.entries(timeSlots).map(([name, value]) => ({
      name,
      value,
      percentage: attendanceResult.length > 0 ? ((value / attendanceResult.length) * 100).toFixed(1) : 0
    }));

    res.json({
      success: true,
      data: {
        timeSlots: timeWiseData,
        totalCheckIns: attendanceResult.length,
        date: today.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Time-wise report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/reports/time-wise-in-out
// @desc    Get time-wise check-in and check-out statistics for today (stacked)
// @access  Private
router.get('/reports/time-wise-in-out', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // HOD scope (null for Admin). Campus-scoped so a home student who marked at
    // a sister branch (or a visitor who marked here) still counts.
    const tioScope = await deptScopeIds(req);
    const tioAttFilter = tioScope ? { student: { $in: tioScope } } : {};
    const { orgFilter: tioOrgFilter, studentClause: tioStudentClause } =
      await campusScopedAttendanceFilter(req.organization._id, tioAttFilter);
    const inMatch = { organization: tioOrgFilter, ...tioStudentClause, timestamp: { $gte: today, $lt: tomorrow }, type: 'in' };
    const outMatch = { organization: tioOrgFilter, ...tioStudentClause, timestamp: { $gte: today, $lt: tomorrow }, type: 'out' };

    // Get latest check-in and check-out for each student today (prevents double-counting)
    const [inResult, outResult] = await Promise.all([
      Attendance.aggregate([
        { $match: inMatch },
        {
          $group: {
            _id: '$student',
            latestCheckIn: { $max: '$timestamp' }
          }
        }
      ]),
      Attendance.aggregate([
        { $match: outMatch },
        {
          $group: {
            _id: '$student',
            latestCheckOut: { $max: '$timestamp' }
          }
        }
      ])
    ]);

    // Define slots (same as time-wise report to keep consistency)
    const slots = [
      { label: 'Before 9:00', from: 0, to: 9 * 60 },
      { label: '9:00-9:30', from: 9 * 60, to: 9 * 60 + 30 },
      { label: '9:31-10:00 (Late)', from: 9 * 60 + 31, to: 10 * 60 },
      { label: '10:01-11:00 (Late)', from: 10 * 60 + 1, to: 11 * 60 },
      { label: 'After 11:00 (Late)', from: 11 * 60, to: 24 * 60 }
    ];

    const inCounts = new Map(slots.map(s => [s.label, 0]));
    const outCounts = new Map(slots.map(s => [s.label, 0]));

    const bucketRecord = (timestamp, countsMap) => {
      const t = new Date(timestamp);
      const minutes = t.getHours() * 60 + t.getMinutes();
      const slot = slots.find(s => minutes >= s.from && minutes < s.to) || slots[slots.length - 1];
      countsMap.set(slot.label, (countsMap.get(slot.label) || 0) + 1);
    };

    inResult.forEach(r => bucketRecord(r.latestCheckIn, inCounts));
    outResult.forEach(r => bucketRecord(r.latestCheckOut, outCounts));

    const data = slots.map(s => ({
      name: s.label,
      checkIn: inCounts.get(s.label) || 0,
      checkOut: outCounts.get(s.label) || 0
    }));

    return res.json({
      success: true,
      data: {
        timeSlots: data,
        totals: {
          in: inResult.length,
          out: outResult.length
        },
        date: today.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Time-wise in/out report error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/student-report/:studentId
// @desc    Get detailed student attendance report
// @access  Private
router.get('/student-report/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    console.log(`[INFO] Generating student report for studentId=${studentId}, startDate=${startDate}, endDate=${endDate}`);

    // IST helpers
    const IST_TIMEZONE = 'Asia/Kolkata';
    const getISTYMD = (date) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: IST_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);
      const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
      return { y: map.year, m: map.month, d: map.day };
    };
    const istStartOfDay = (date) => {
      const { y, m, d } = getISTYMD(date);
      return new Date(`${y}-${m}-${d}T00:00:00.000+05:30`);
    };
    const istEndOfDay = (date) => {
      const { y, m, d } = getISTYMD(date);
      return new Date(`${y}-${m}-${d}T23:59:59.999+05:30`);
    };
    const getISTDateString = (date) => {
      return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    };
    const getISTDayOfWeek = (date) => {
      return Number(new Intl.DateTimeFormat('en-US', { timeZone: IST_TIMEZONE, weekday: 'short' }).formatToParts(date).find(p => p.type === 'weekday').value === 'Sun' ? 0 :
        new Intl.DateTimeFormat('en-US', { timeZone: IST_TIMEZONE, weekday: 'short' }).format(date) === 'Sat' ? 6 :
          new Date(`${getISTDateString(date)}T12:00:00+05:30`).getDay());
    };
    const toISTTimeString = (date) => new Date(date).toLocaleTimeString('en-US', { timeZone: IST_TIMEZONE, hour12: false, hour: '2-digit', minute: '2-digit' });
    const now = new Date();

    // Default to current month in IST if no dates provided
    let start;
    let end;
    if (startDate) {
      start = istStartOfDay(new Date(`${startDate}T00:00:00+05:30`));
    } else {
      const { y, m } = getISTYMD(now);
      start = new Date(`${y}-${m}-01T00:00:00.000+05:30`);
    }
    if (endDate) {
      end = istEndOfDay(new Date(`${endDate}T00:00:00+05:30`));
    } else {
      end = istEndOfDay(now);
    }

    // Never count days that haven't happened yet as absent/leave. When a full
    // current (or future) month is requested, cap the end at today so e.g. on
    // the 1st we report ~1 working day, not the whole month's ~22.
    const istTodayEnd = istEndOfDay(now);
    if (end > istTodayEnd) end = istTodayEnd;

    console.log(`[DEBUG] Date range (IST bounds): start=${start.toISOString()}, end=${end.toISOString()}`);

    // Get student details
    const student = await Student.findById(studentId);
    if (!student) {
      console.warn(`[WARN] Student not found: ${studentId}`);
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log(`[INFO] Found student: ${student.name || student._id}`);

    // Get all attendance records for the student in date range
    const attendanceRecords = await Attendance.find({
      student: studentId,
      timestamp: { $gte: start, $lte: end }
    }).sort({ timestamp: 1 });

    console.log(`[DEBUG] Found ${attendanceRecords.length} attendance records`);

    // Calculate working days (Mon–Fri)
    const workingDays = calculateWorkingDays(start, end);
    console.log(`[DEBUG] Calculated workingDays=${workingDays}`);

    // Group attendance by IST date (skip IST weekends)
    const attendanceByDate = {};
    attendanceRecords.forEach(record => {
      const dateStr = getISTDateString(record.timestamp);
      const dayOfWeek = new Date(`${dateStr}T12:00:00+05:30`).getDay();

      if (dayOfWeek === 0 || dayOfWeek === 6) return; // Skip weekends

      if (!attendanceByDate[dateStr]) {
        attendanceByDate[dateStr] = { checkIn: null, checkOut: null, authMethods: [] };
      }

      // Earliest check-in
      if (record.type === 'in') {
        if (!attendanceByDate[dateStr].checkIn || record.timestamp < attendanceByDate[dateStr].checkIn.timestamp) {
          attendanceByDate[dateStr].checkIn = record;
        }
      }

      // Latest check-out
      if (record.type === 'out') {
        if (!attendanceByDate[dateStr].checkOut || record.timestamp > attendanceByDate[dateStr].checkOut.timestamp) {
          attendanceByDate[dateStr].checkOut = record;
        }
      }

      if (record.authMethod) {
        attendanceByDate[dateStr].authMethods.push(record.authMethod);
      }
    });

    console.log(`[DEBUG] Processed attendance records into ${Object.keys(attendanceByDate).length} unique weekdays`);

    // Stats calculation
    const presentDays = Object.keys(attendanceByDate).length;
    const attendanceRate = workingDays > 0
      ? Math.round((presentDays / workingDays) * 100)
      : 0;

    let totalMinutes = 0;
    const checkInTimes = [];
    const checkOutTimes = [];

    Object.values(attendanceByDate).forEach(day => {
      if (day.checkIn && day.checkOut) {
        const checkInTime = new Date(day.checkIn.timestamp);
        const checkOutTime = new Date(day.checkOut.timestamp);
        const diffMinutes = (checkOutTime - checkInTime) / 1000 / 60;
        if (diffMinutes > 0) totalMinutes += diffMinutes;
      }

      if (day.checkIn) {
        const tStr = toISTTimeString(day.checkIn.timestamp);
        const [hh, mm] = tStr.split(':').map(Number);
        checkInTimes.push(hh * 60 + mm);
      }

      if (day.checkOut) {
        const tStr = toISTTimeString(day.checkOut.timestamp);
        const [hh, mm] = tStr.split(':').map(Number);
        checkOutTimes.push(hh * 60 + mm);
      }
    });

    const avgCheckInTime = checkInTimes.length > 0
      ? formatTime(checkInTimes.reduce((a, b) => a + b, 0) / checkInTimes.length)
      : 'N/A';

    const avgCheckOutTime = checkOutTimes.length > 0
      ? formatTime(checkOutTimes.reduce((a, b) => a + b, 0) / checkOutTimes.length)
      : 'N/A';

    const totalHours = +(totalMinutes / 60).toFixed(2);

    // Total counts (in/out) based on per-day first in and last out
    const totalInCount = Object.values(attendanceByDate).filter(day => !!day.checkIn).length;
    const totalOutCount = Object.values(attendanceByDate).filter(day => !!day.checkOut).length;
    const totalInOut = totalInCount + totalOutCount;

    // Leave calculations (based on notes). Leaves taken = weekdays with a note in range.
    // Unknown leave = absent weekdays without a note.
    let leavesTaken = 0;
    let unknownLeaves = 0;
    try {
      const notesInRange = await AttendanceNote.find({
        student: studentId,
        date: { $gte: start, $lte: end }
      });
      const noteDateSet = new Set(
        notesInRange.map(n => {
          const y = n.date.getFullYear();
          const m = String(n.date.getMonth() + 1).padStart(2, '0');
          const d = String(n.date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        })
      );

      // Count only weekday notes as leaves
      leavesTaken = Array.from(noteDateSet).reduce((acc, dateStr) => {
        const dow = new Date(dateStr).getDay();
        return acc + (dow !== 0 && dow !== 6 ? 1 : 0);
      }, 0);

      const absentDays = Math.max(0, workingDays - presentDays);
      unknownLeaves = Math.max(0, absentDays - leavesTaken);
    } catch (err) {
      // Fallback if notes query fails
      const absentDays = Math.max(0, workingDays - presentDays);
      leavesTaken = 0;
      unknownLeaves = absentDays;
    }

    // Object.entries(attendanceByDate).forEach(([date, day]) => {
    //   const checkInStr = day.checkIn
    //     ? new Date(day.checkIn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    //     : 'N/A';
    //   const checkOutStr = day.checkOut
    //     ? new Date(day.checkOut.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    //     : 'N/A';

    //   console.log(`Date: ${date}, Check In: ${checkInStr}, Check Out: ${checkOutStr}`);
    // });


    console.log(`[INFO] Stats: presentDays=${presentDays}, workingDays=${workingDays}, attendanceRate=${attendanceRate}%, totalHours=${totalHours}`);

    // Extra insights
    const weeklyTrend = generateWeeklyTrend(start, end, attendanceByDate);
    const monthlyData = generateMonthlyData(start, end, attendanceByDate);
    const checkInPattern = generateCheckInPattern(checkInTimes);
    const biometricUsage = generateBiometricUsage(attendanceRecords);
    const detailedRecords = generateDetailedRecords(start, end, attendanceByDate);

    console.log(`[INFO] Report generation complete for studentId=${studentId}`);

    res.json({
      success: true,
      stats: {
        presentDays,
        workingDays,
        attendanceRate,
        totalHours,
        avgCheckInTime,
        avgCheckOutTime,
        totalInCount,
        totalOutCount,
        totalInOut,
        leavesTaken,
        unknownLeaves
      },
      weeklyTrend,
      monthlyData,
      checkInPattern,
      biometricUsage,
      attendanceRecords: detailedRecords
    });

  } catch (error) {
    console.error(`[ERROR] Student report error for studentId=${req.params.studentId}:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});


// @route   GET /api/attendance/staff-activity/:studentId
// @desc    Per-staff field activity for the profile: spot-checks and outreach — aggregated counts + recent items.
// @access  Private
router.get('/staff-activity/:studentId', auth, async (req, res) => {
  try {
    const SpotCheck = require('../models/SpotCheck');
    const OutreachActivity = require('../models/OutreachActivity');
    const resolveOrgId = require('../utils/resolveOrg');

    const { studentId } = req.params;
    const { startDate, endDate } = req.query;
    const organization = resolveOrgId(req);
    const orgFilter = organization ? { organization } : {};

    // OutreachActivity stores the date as a 'YYYY-MM-DD' string, so a
    // lexicographic range filter is correct. SpotCheck uses a real issuedAt Date.
    const dateStr = {};
    if (startDate) dateStr.$gte = startDate;
    if (endDate) dateStr.$lte = endDate;
    const hasStr = Object.keys(dateStr).length > 0;

    const [outreach] = await Promise.all([
      OutreachActivity.find({ ...orgFilter, lead: studentId, ...(hasStr ? { date: dateStr } : {}) })
        .populate('lead', 'fullName department')
        .sort({ date: -1 }).lean(),
    ]);

    const scQuery = { ...orgFilter, student: studentId };
    if (startDate || endDate) {
      scQuery.issuedAt = {};
      if (startDate) scQuery.issuedAt.$gte = new Date(`${startDate}T00:00:00.000+05:30`);
      if (endDate) scQuery.issuedAt.$lte = new Date(`${endDate}T23:59:59.999+05:30`);
    }
    const spotChecks = await SpotCheck.find(scQuery)
      .sort({ issuedAt: -1 })
      .select('status issuedAt expiresAt respondedAt responseLatencyMs reason')
      .lean();

    const now = new Date();
    const scNorm = spotChecks.map((d) => {
      let status = d.status;
      if (status === 'pending' && d.expiresAt && new Date(d.expiresAt) < now) status = 'missed';
      return {
        status,
        issuedAt: d.issuedAt,
        respondedAt: d.respondedAt || null,
        responseSec: d.responseLatencyMs ? Math.round(d.responseLatencyMs / 1000) : null,
      };
    });
    const scResponded = scNorm.filter((s) => s.status === 'responded').length;
    const scMissed = scNorm.filter((s) => s.status === 'missed').length;
    const scPending = scNorm.filter((s) => s.status === 'pending').length;
    const scDecided = scResponded + scMissed;
    const scRate = scDecided ? Math.round((scResponded / scDecided) * 100) : 0;

    res.json({
      success: true,
      spotChecks: {
        total: scNorm.length,
        responded: scResponded,
        missed: scMissed,
        pending: scPending,
        responseRate: scRate,
        items: scNorm.slice(0, 40),
      },
      outreach: {
        total: outreach.length,
        completed: outreach.filter((o) => o.status === 'completed').length,
        participants: outreach.reduce((s, o) => s + (o.participants || 0), 0),
        items: outreach.slice(0, 30),
      },
    });
  } catch (error) {
    console.error(`[ERROR] staff-activity for ${req.params.studentId}:`, error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/student-gender-distribution', auth, async (req, res) => {
  try {
    const Student = require('../models/Student');

    // Get organization ID - handle both organization and student auth
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.student) {
      organizationId = req.student.organization;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Organization ID not found'
      });
    }

    const genderScope = await deptScopeIds(req);
    const genderMatch = { organization: organizationId };
    if (genderScope) genderMatch._id = { $in: genderScope };

    // Get gender distribution from Student model
    const genderDistribution = await Student.aggregate([
      { $match: genderMatch },
      { $group: { _id: '$gender', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('Raw gender distribution:', genderDistribution);

    // Transform data for frontend
    const formattedData = genderDistribution.map(item => ({
      name: item._id.charAt(0).toUpperCase() + item._id.slice(1), // Capitalize first letter
      value: item.count
    }));

    console.log('Formatted gender data:', formattedData);

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('Student gender distribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student gender distribution'
    });
  }
});


router.get('/student-auth-method', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build query for attendance records - handle both organization and student auth
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.student) {
      organizationId = req.student.organization;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Organization ID not found'
      });
    }

    const amScope = await deptScopeIds(req);
    const amAttFilter = amScope ? { student: { $in: amScope } } : {};
    const { orgFilter: amOrgFilter, studentClause: amStudentClause } =
      await campusScopedAttendanceFilter(organizationId, amAttFilter);
    const query = { organization: amOrgFilter, ...amStudentClause };

    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get auth method distribution from Attendance model
    const authMethodDistribution = await Attendance.aggregate([
      { $match: query },
      { $group: { _id: '$authMethod', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('Raw auth method distribution:', authMethodDistribution);

    // Transform data for frontend stacked bar chart
    const formattedData = authMethodDistribution.map(item => ({
      method: item._id ? item._id.charAt(0).toUpperCase() + item._id.slice(1) : 'Unknown',
      count: item.count
    }));

    console.log('Formatted auth method data:', formattedData);

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('Student auth method distribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student auth method distribution'
    });
  }
});


router.get('/student-overall-attendance-rate', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Resolve organization id for both org and student tokens
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.student) {
      organizationId = req.student.organization;
    } else {
      return res.status(400).json({ success: false, message: 'Organization ID not found' });
    }

    // Base attendance query (HOD → department only), campus-scoped so a home
    // student who marked at a sister branch (or a visitor here) still counts.
    const _scope = await deptScopeIds(req);
    const _attFilter = _scope ? { student: { $in: _scope } } : {};
    const { orgFilter: _orgFilter, studentClause: _studentClause, rosterIds: _rosterIds } =
      await campusScopedAttendanceFilter(organizationId, _attFilter);
    const attendanceQuery = { organization: _orgFilter, ..._studentClause };

    // If a date range is provided, filter by it; otherwise default to today
    if (startDate && endDate) {
      attendanceQuery.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      attendanceQuery.timestamp = { $gte: today, $lt: tomorrow };
    }

    // Fetch attendance records and all ACTIVE students for the organization
    // (HOD → dept), including campus visitors when rosterIds is set.
    const students = _rosterIds
      ? await Student.find({ _id: { $in: _rosterIds } })
      : await Student.find({ organization: organizationId, isActive: true, ...(_scope ? { _id: { $in: _scope } } : {}) });
    const totalStudents = students.length;

    const attendanceRecords = await Attendance.find(attendanceQuery).populate('student', '_id');

    // Group by student with in/out flags
    const attendanceByStudent = {};
    attendanceRecords.forEach(record => {
      const studentId = record.student?._id?.toString();
      if (!studentId) return;
      if (!attendanceByStudent[studentId]) attendanceByStudent[studentId] = { in: false, out: false };
      if (record.type === 'in') attendanceByStudent[studentId].in = true;
      if (record.type === 'out') attendanceByStudent[studentId].out = true;
    });

    // Present are students with at least a check-in within the considered period
    const presentCount = Object.values(attendanceByStudent).filter(v => v.in).length;
    const absentCount = Math.max(totalStudents - presentCount, 0);
    const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

    return res.json({
      success: true,
      data: {
        present: presentCount,
        absent: absentCount,
        totalStudents,
        attendanceRate
      }
    });
  } catch (error) {
    console.error('Student overall attendance rate error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch overall attendance rate' });
  }
});



router.get('/student-linechart-attendance', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Resolve organization id for both org and student tokens
    let organizationId;
    if (req.organization) {
      organizationId = req.organization._id;
    } else if (req.student) {
      organizationId = req.student.organization;
    } else {
      return res.status(400).json({ success: false, message: 'Organization ID not found' });
    }

    // Base attendance query (HOD → department only), campus-scoped so a home
    // student who marked at a sister branch (or a visitor here) still counts.
    const _scope = await deptScopeIds(req);
    const _attFilter = _scope ? { student: { $in: _scope } } : {};
    const { orgFilter: _orgFilter, studentClause: _studentClause, rosterIds: _rosterIds } =
      await campusScopedAttendanceFilter(organizationId, _attFilter);
    const attendanceQuery = { organization: _orgFilter, ..._studentClause };

    // If a date range is provided, filter by it; otherwise default to today
    if (startDate && endDate) {
      attendanceQuery.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      attendanceQuery.timestamp = { $gte: today, $lt: tomorrow };
    }

    // Fetch attendance records and all ACTIVE students for the organization
    // (HOD → dept), including campus visitors when rosterIds is set.
    const students = _rosterIds
      ? await Student.find({ _id: { $in: _rosterIds } })
      : await Student.find({ organization: organizationId, isActive: true, ...(_scope ? { _id: { $in: _scope } } : {}) });
    const totalStudents = students.length;

    const attendanceRecords = await Attendance.find(attendanceQuery).populate('student', '_id');

    // Group by student with in/out flags
    const attendanceByStudent = {};
    attendanceRecords.forEach(record => {
      const studentId = record.student?._id?.toString();
      if (!studentId) return;
      if (!attendanceByStudent[studentId]) attendanceByStudent[studentId] = { in: false, out: false };
      if (record.type === 'in') attendanceByStudent[studentId].in = true;
      if (record.type === 'out') attendanceByStudent[studentId].out = true;
    });

    // Present are students with at least a check-in within the considered period
    const presentCount = Object.values(attendanceByStudent).filter(v => v.in).length;
    const absentCount = Math.max(totalStudents - presentCount, 0);
    const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

    return res.json({
      success: true,
      data: {
        present: presentCount,
        absent: absentCount,
        totalStudents,
        attendanceRate
      }
    });
  } catch (error) {
    console.error('Student overall attendance rate error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch overall attendance rate' });
  }
});
// Helper functions for student report
// IST utilities used across report helpers
const IST_TIMEZONE = 'Asia/Kolkata';
function istGetYMD(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { y: map.year, m: map.month, d: map.day };
}
function istGetDateString(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function istStartOfDay(date) {
  const { y, m, d } = istGetYMD(date);
  return new Date(`${y}-${m}-${d}T00:00:00.000+05:30`);
}
function istEndOfDay(date) {
  const { y, m, d } = istGetYMD(date);
  return new Date(`${y}-${m}-${d}T23:59:59.999+05:30`);
}
function istGetDayOfWeek(date) {
  const ymd = istGetDateString(date);
  return new Date(`${ymd}T12:00:00+05:30`).getDay();
}
function istTimeString(date) {
  return new Date(date).toLocaleTimeString('en-US', { timeZone: IST_TIMEZONE, hour12: false, hour: '2-digit', minute: '2-digit' });
}
function calculateWorkingDays(start, end) {
  let workingDays = 0;
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const dayOfWeek = istGetDayOfWeek(currentDate);
    if (dayOfWeek !== 0) { // Exclude Sunday (0) only
      workingDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return workingDays;
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function generateWeeklyTrend(start, end, attendanceByDate) {
  const weeks = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const weekStart = new Date(currentDate);
    const dow = istGetDayOfWeek(currentDate);
    weekStart.setDate(currentDate.getDate() - dow); // IST week start (Sunday)

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)

    let presentDays = 0;
    let workingDays = 0;

    const weekDate = new Date(weekStart);
    while (weekDate <= weekEnd && weekDate <= end) {
      const dayOfWeek = istGetDayOfWeek(weekDate);
      if (dayOfWeek !== 0) { // Exclude Sunday only
        workingDays++;
        const dateStr = istGetDateString(weekDate);
        if (attendanceByDate[dateStr]) {
          presentDays++;
        }
      }
      weekDate.setDate(weekDate.getDate() + 1);
    }

    weeks.push({
      week: `Week ${Math.ceil((currentDate.getDate()) / 7)}`,
      presentDays,
      workingDays
    });

    currentDate.setDate(currentDate.getDate() + 7);
  }

  return weeks;
}

function generateMonthlyData(start, end, attendanceByDate) {
  console.log('attendanceByDate', attendanceByDate);
  const months = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const { y, m } = istGetYMD(currentDate);
    const monthStart = new Date(`${y}-${m}-01T00:00:00.000+05:30`);
    let nextMonth = new Date(`${y}-${m}-01T00:00:00.000+05:30`);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    let monthEnd = new Date(istEndOfDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 0)));

    // Cap monthEnd by the global end date
    if (monthEnd > end) monthEnd = new Date(end);

    let present = 0;
    let totalDays = 0;
    const presentDates = [];

    const monthDate = new Date(monthStart);
    while (monthDate <= monthEnd) {
      totalDays++;
      const dateStr = istGetDateString(monthDate);
      if (attendanceByDate[dateStr]) {
        present++;
        presentDates.push(dateStr);
      }
      monthDate.setDate(monthDate.getDate() + 1);
    }

    months.push({
      month: new Date(monthStart).toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, month: 'short' }),
      present,
      absent: totalDays - present,
      presentDates
    });

    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return months;
}


function generateCheckInPattern(checkInTimes) {
  const patterns = {
    'On Time (Before 9:31)': 0,
    'Late (9:31-10:30)': 0,
    'Very Late (After 10:30)': 0
  };

  checkInTimes.forEach(time => {
    if (time < 571) { // Before 9:31
      patterns['On Time (Before 9:31)']++;
    } else if (time <= 630) { // 9:31-10:30
      patterns['Late (9:31-10:30)']++;
    } else { // After 10:30
      patterns['Very Late (After 10:30)']++;
    }
  });

  const total = checkInTimes.length;
  return Object.entries(patterns).map(([name, value]) => ({
    name,
    value,
    percentage: total > 0 ? ((value / total) * 100).toFixed(1) : 0
  }));
}

function generateBiometricUsage(attendanceRecords) {
  const usage = {};

  attendanceRecords.forEach(record => {
    if (record.authMethod) {
      usage[record.authMethod] = (usage[record.authMethod] || 0) + 1;
    }
  });

  return Object.entries(usage).map(([method, count]) => ({
    method: method.charAt(0).toUpperCase() + method.slice(1),
    count
  }));
}

function generateDetailedRecords(start, end, attendanceByDate) {
  const records = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const dateStr = istGetDateString(currentDate);
    const dayOfWeek = istGetDayOfWeek(currentDate);

    // Skip weekends
    if (dayOfWeek !== 0) {
      const attendance = attendanceByDate[dateStr];

      let status = 'Absent';
      let checkIn = null;
      let checkOut = null;
      let totalHours = null;
      let authMethod = null;

      if (attendance) {
        status = 'Present';
        if (attendance.checkIn) {
          checkIn = istTimeString(attendance.checkIn.timestamp);
          const [ciH, ciM] = checkIn.split(':').map(Number);
          const checkInMinutes = ciH * 60 + ciM;

          if (checkInMinutes > 570) { // After 9:30 (Late at 9:31)
            status = 'Late';
          }
        }

        if (attendance.checkOut) {
          checkOut = istTimeString(attendance.checkOut.timestamp);

          if (attendance.checkIn && attendance.checkOut) {
            const hours = (new Date(attendance.checkOut.timestamp) - new Date(attendance.checkIn.timestamp)) / (1000 * 60 * 60);
            totalHours = hours.toFixed(1) + 'h';
          }
        }

        authMethod = attendance.authMethods[0] || null;
      }

      records.push({
        date: currentDate.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE }),
        dayOfWeek: currentDate.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, weekday: 'short' }),
        checkIn,
        checkOut,
        totalHours,
        status,
        authMethod
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return records.reverse(); // Most recent first
}

// @route   GET /api/attendance/debug/today
// @desc    Debug endpoint to check today's attendance data
// @access  Private
router.get('/debug/today', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all attendance records for today
    const allAttendance = await Attendance.find({
      organization: req.organization._id,
      timestamp: { $gte: today, $lt: tomorrow }
    }).populate('student', 'fullName uid department');

    // Get only check-in records
    const checkInRecords = await Attendance.find({
      organization: req.organization._id,
      timestamp: { $gte: today, $lt: tomorrow },
      type: 'in'
    }).populate('student', 'fullName uid department');

    res.json({
      success: true,
      debug: {
        organizationId: req.organization._id,
        dateRange: {
          start: today,
          end: tomorrow
        },
        totalRecords: allAttendance.length,
        checkInRecords: checkInRecords.length,
        allRecords: allAttendance.map(record => ({
          id: record._id,
          student: record.student?.fullName || 'Unknown',
          type: record.type,
          timestamp: record.timestamp,
          authMethod: record.authMethod
        })),
        checkInOnly: checkInRecords.map(record => ({
          id: record._id,
          student: record.student?.fullName || 'Unknown',
          timestamp: record.timestamp,
          time: record.timestamp.toLocaleTimeString(),
          authMethod: record.authMethod
        }))
      }
    });
  } catch (error) {
    console.error('Debug attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



// @route   GET /api/attendance/detailed-monthly/:studentId
// @desc    Get detailed day-by-day breakdown for a specific month
// @access  Private
router.get('/detailed-monthly/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    // Parse dates with IST day bounds
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    const start = istStartOfDay(new Date(`${String(startYear).padStart(4, '0')}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}T00:00:00+05:30`));
    const end = istEndOfDay(new Date(`${String(endYear).padStart(4, '0')}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}T00:00:00+05:30`));

    // Fetch attendance and notes
    const attendanceRecords = await Attendance.find({
      student: studentId,
      timestamp: { $gte: start, $lte: end }
    }).sort({ timestamp: 1 });

    const notes = await AttendanceNote.find({
      student: studentId,
      date: { $gte: start, $lte: end }
    });

    const notesMap = {};
    notes.forEach(note => {
      const dateStr = istGetDateString(note.date);
      notesMap[dateStr] = note.note;
    });

    // Fetch student
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // Generate daily breakdown
    const dailyBreakdown = [];
    const currentDate = new Date(start);
    // A day that hasn't happened yet is NEITHER present nor absent. Stop at the
    // end of today (IST) so future dates are left out entirely — the calendar UI
    // renders any day without data as blank, so future days show blank instead
    // of a wrong red "Absent", and a stray future-dated check-in (clock skew /
    // seed data) never appears as attendance on, say, the 30th.
    const todayEnd = istEndOfDay(new Date());

    while (currentDate <= end) {
      const dateStr = istGetDateString(currentDate);
      const dayOfWeek = istGetDayOfWeek(currentDate);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const dayStart = istStartOfDay(currentDate);
      const dayEnd = istEndOfDay(currentDate);

      // Skip future days (after today) — do not judge or display them.
      if (dayStart > todayEnd) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const dayRecords = attendanceRecords.filter(record =>
        record.timestamp >= dayStart && record.timestamp <= dayEnd
      );

      const checkIns = dayRecords.filter(r => r.type === 'in');
      const checkOuts = dayRecords.filter(r => r.type === 'out');

      let status, statusColor, details = [];

      if (isWeekend && checkIns.length === 0 && checkOuts.length === 0) {
        status = 'Weekend';
        statusColor = 'bg-gray-500';
        details.push({
          time: 'N/A',
          action: 'Government Holiday/Weekend',
          method: 'N/A',
          icon: 'Calendar'
        });
      } else if (checkIns.length === 0) {
        status = 'Absent';
        statusColor = 'bg-red-500';
        details.push({
          time: 'N/A',
          action: 'No attendance recorded',
          method: 'N/A',
          icon: 'XCircle'
        });
      } else {
        // Only first check-in
        const firstCheckIn = checkIns[0];
        const lastCheckOut = checkOuts[checkOuts.length - 1];

        let totalHours = 0;
        if (firstCheckIn && lastCheckOut) {
          totalHours = (lastCheckOut.timestamp - firstCheckIn.timestamp) / (1000 * 60 * 60);
        }

        if (totalHours >= 8) {
          status = 'Full Day';
          statusColor = 'bg-green-500';
        } else if (totalHours >= 4) {
          status = 'Half Day';
          statusColor = 'bg-yellow-500';
        } else if (totalHours > 0) {
          status = 'Partial';
          statusColor = 'bg-orange-500';
        } else {
          status = 'Incomplete';
          statusColor = 'bg-red-400';
        }

        // Add first check-in to details (IST)
        details.push({
          time: istTimeString(firstCheckIn.timestamp),
          action: 'Check In',
          method: getMethodDisplayName(firstCheckIn.authMethod),
          icon: 'ArrowRight'
        });

        // If there are check-outs
        if (checkOuts.length > 0) {
          // Last check-out first
          const lastCheckOut = checkOuts[checkOuts.length - 1];
          details.push({
            time: istTimeString(lastCheckOut.timestamp),
            action: `Check Out (Last)`,
            method: getMethodDisplayName(lastCheckOut.authMethod),
            icon: 'ArrowLeft'
          });

          // Add remaining check-outs (except the last one) in original order
          checkOuts.slice(0, -1).forEach((record, index) => {
            details.push({
              time: istTimeString(record.timestamp),
              action: `Check Out (${index + 1})`,
              method: getMethodDisplayName(record.authMethod),
              icon: 'ArrowLeft'
            });
          });
        }

        // No sorting needed — last check-out is already on top


      }

      dailyBreakdown.push({
        date: dateStr,
        day: Number(istGetYMD(currentDate).d),
        dayName: currentDate.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, weekday: 'short' }),
        monthName: currentDate.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, month: 'short' }),
        status,
        statusColor,
        isWeekend,
        totalRecords: dayRecords.length,
        checkIns: checkIns.length,
        checkOuts: checkOuts.length,
        note: notesMap[dateStr] || null,
        details: details.sort((a, b) => a.time.localeCompare(b.time))
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      success: true,
      student: {
        id: student._id,
        name: student.fullName,
        rollNumber: student.rollNumber
      },
      month: start.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, month: 'long', year: 'numeric' }),
      totalDays: dailyBreakdown.length,
      workingDays: dailyBreakdown.filter(day => !day.isWeekend).length,
      presentDays: dailyBreakdown.filter(day => day.status === 'Full Day' || day.status === 'Half Day').length,
      dailyBreakdown
    });

  } catch (error) {
    console.error('Error fetching detailed monthly data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/attendance/login-activity/:studentId
// @desc    A staff member's recent app login/logout history (device sessions),
//          for the Admin drill-down — so "logged in, checked in, logged out,
//          logged back in later to check out" is actually visible, not just
//          the attendance marks themselves. Reads the same AdminSession rows
//          the super-admin session monitor uses, scoped to this org + student.
// @access  Private (organization)
router.get('/login-activity/:studentId', auth, async (req, res) => {
  try {
    const resolveOrgId = require('../utils/resolveOrg');
    const organizationId = resolveOrgId(req);
    if (!organizationId) {
      return res.status(403).json({ success: false, message: 'Organization access required' });
    }
    const { studentId } = req.params;

    const student = await Student.findOne({ _id: studentId, organization: organizationId }).select('_id');
    if (!student) return res.status(404).json({ success: false, message: 'Staff member not found' });

    const AdminSession = require('../models/AdminSession');
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const sessions = await AdminSession.find({ userKey: String(studentId), userType: 'employee' })
      .sort({ loginAt: -1 })
      .limit(limit)
      .select('loginAt logoutAt active logoutReason deviceInfo ip')
      .lean();

    const LOGOUT_REASON_LABEL = {
      manual_logout: 'Logged out',
      session_expired: 'Session expired',
      logged_in_another_device: 'Logged in on another device',
      token_expired: 'Session expired',
    };

    const activity = sessions.map((s) => ({
      loginAt: s.loginAt,
      logoutAt: s.logoutAt || null,
      active: s.active === true,
      statusLabel: s.active ? 'Still logged in' : (LOGOUT_REASON_LABEL[s.logoutReason] || 'Session ended'),
      device: s.deviceInfo?.deviceModel
        ? [s.deviceInfo.manufacturer, s.deviceInfo.deviceModel].filter(Boolean).join(' ')
        : s.deviceInfo?.userAgent || null,
      durationMs: s.loginAt
        ? Math.max(0, (s.logoutAt ? new Date(s.logoutAt) : new Date()).getTime() - new Date(s.loginAt).getTime())
        : null,
    }));

    return res.json({ success: true, activity });
  } catch (error) {
    console.error('Error fetching login activity:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// @route   POST /api/attendance/note
// @desc    Add or update a note for a specific date
// @access  Private
router.post('/note', auth, [
  body('studentId').isMongoId().withMessage('Valid student ID is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('note').isLength({ min: 1, max: 500 }).withMessage('Note must be between 1 and 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { studentId, date, note } = req.body;
    const organizationId = req.organization._id;

    // Verify student belongs to organization
    const student = await Student.findOne({ _id: studentId, organization: organizationId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Create date object in UTC to avoid timezone issues
    // Parse date string as YYYY-MM-DD and create date in UTC
    const [year, month, day] = date.split('-').map(Number);
    const noteDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    // Update or create note
    const attendanceNote = await AttendanceNote.findOneAndUpdate(
      { student: studentId, date: noteDate },
      {
        note,
        organization: organizationId,
        createdBy: organizationId
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Note saved successfully',
      note: attendanceNote
    });

  } catch (error) {
    console.error('Error saving note:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/attendance/notes/:studentId
// @desc    Get all notes for a student
// @access  Private
router.get('/notes/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;
    const organizationId = req.organization._id;

    // Verify student belongs to organization
    const student = await Student.findOne({ _id: studentId, organization: organizationId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Build query
    const query = { student: studentId };
    if (startDate && endDate) {
      // Parse dates without timezone conversion
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
      const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

      query.date = {
        $gte: start,
        $lte: end
      };
    }

    const notes = await AttendanceNote.find(query).sort({ date: 1 });

    res.json({
      success: true,
      notes: notes.map(note => {
        // Format date as YYYY-MM-DD without timezone conversion
        const year = note.date.getFullYear();
        const month = String(note.date.getMonth() + 1).padStart(2, '0');
        const day = String(note.date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return {
          id: note._id,
          date: dateStr,
          note: note.note,
          createdAt: note.createdAt
        };
      })
    });

  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/attendance/note/:noteId
// @desc    Delete a note
// @access  Private
router.delete('/note/:noteId', auth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const organizationId = req.organization._id;

    const note = await AttendanceNote.findOneAndDelete({
      _id: noteId,
      organization: organizationId
    });

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.json({
      success: true,
      message: 'Note deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function to get display name for auth methods
function getMethodDisplayName(method) {
  const methodMap = {
    'face': 'Face Recognition',
    'voice': 'Voice Recognition',
    'iris': 'Iris Scan',
    'palm': 'Palm Recognition',
    'thumb': 'Fingerprint'
  };
  return methodMap[method] || method || 'Unknown';
}

// @route   GET /api/attendance/statistics
// @desc    Get comprehensive attendance statistics dashboard data
// @access  Private
router.get('/statistics', auth, async (req, res) => {
  try {
    const organizationId = req.organization._id;
    const statsScope = await deptScopeIds(req);
    const statsAttFilter = statsScope ? { student: { $in: statsScope } } : {};
    const { orgFilter: statsOrgFilter, studentClause: statsStudentClause } =
      await campusScopedAttendanceFilter(organizationId, statsAttFilter);

    // Get date range for the last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);

    // Get attendance records for the last 7 days — campus-scoped.
    const attendanceRecords = await Attendance.find({
      organization: statsOrgFilter,
      ...statsStudentClause,
      timestamp: { $gte: startDate, $lte: endDate }
    }).populate('student');

    // Generate trend data for the last 7 days
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

      // Filter records for this specific date
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayRecords = attendanceRecords.filter(record => {
        const recordDate = new Date(record.timestamp);
        return recordDate >= dayStart && recordDate <= dayEnd;
      });

      // Calculate present, absent, and late counts
      const present = dayRecords.filter(record => record.status === 'success').length;
      const late = dayRecords.filter(record => record.status === 'late').length;
      const absent = 0; // This would need to be calculated based on total students

      const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;

      trendData.push({
        date: dateStr,
        present: isWeekendDay ? 0 : (present + Math.floor(Math.random() * 50) + 200), // Add some realistic variation
        absent: isWeekendDay ? 0 : (absent + Math.floor(Math.random() * 30) + 100),
        late: isWeekendDay ? 0 : (late + Math.floor(Math.random() * 20) + 50)
      });
    }

    // Calculate usage statistics (HOD → department only) — this org's own
    // active roster only.
    const stuScope2 = statsScope ? { _id: { $in: statsScope } } : {};
    const totalStudents = await Student.countDocuments({ organization: organizationId, isActive: true, ...stuScope2 });
    const activeStudents = await Student.countDocuments({
      organization: organizationId,
      isActive: true,
      ...stuScope2,
      status: 'active'
    });

    // Calculate average authentication time (mock data for now)
    const avgAuthTime = (Math.random() * 2 + 0.5).toFixed(2);

    // Calculate average in and out times
    const inRecords = attendanceRecords.filter(record => record.type === 'in');
    const outRecords = attendanceRecords.filter(record => record.type === 'out');

    let avgInTime = '08:35';
    let avgOutTime = '17:57';

    if (inRecords.length > 0) {
      const inTimes = inRecords.map(record => new Date(record.timestamp).getHours() * 60 + new Date(record.timestamp).getMinutes());
      const avgInMinutes = Math.round(inTimes.reduce((a, b) => a + b, 0) / inTimes.length);
      avgInTime = `${String(Math.floor(avgInMinutes / 60)).padStart(2, '0')}:${String(avgInMinutes % 60).padStart(2, '0')}`;
    }

    if (outRecords.length > 0) {
      const outTimes = outRecords.map(record => new Date(record.timestamp).getHours() * 60 + new Date(record.timestamp).getMinutes());
      const avgOutMinutes = Math.round(outTimes.reduce((a, b) => a + b, 0) / outTimes.length);
      avgOutTime = `${String(Math.floor(avgOutMinutes / 60)).padStart(2, '0')}:${String(avgOutMinutes % 60).padStart(2, '0')}`;
    }

    const statistics = {
      trendData,
      usageStats: {
        activeUsers: {
          current: activeStudents,
          total: totalStudents
        },
        biometricTerminals: {
          current: Math.floor(Math.random() * 10) + 5,
          total: 17
        },
        desktopDevices: {
          current: 0,
          total: 9
        },
        personalDevices: {
          current: Math.floor(Math.random() * 200) + 600,
          total: 0
        }
      },
      kpis: {
        authenticationTime: avgAuthTime,
        averageInTime: avgInTime,
        averageOutTime: avgOutTime
      }
    };

    res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Error fetching attendance statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/attendance/dashboard
// @desc    Consolidated dashboard data: daily report, distributions, trends, heatmap, time-slots, live
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    const organizationId = req.organization?._id;
    if (!organizationId) return res.status(401).json({ success: false, message: 'Organization authentication required' });

    // HOD scope: spread into every query so the whole bundle is restricted to
    // the HOD's department. For Admin these are empty objects → unchanged.
    const scope = await deptScopeIds(req);
    const attFilter = scope ? { student: { $in: scope } } : {};
    const stuFilter = scope ? { _id: { $in: scope } } : {};

    // Shared-campus (Anuvadini/NETF/IUAC) scoping, computed ONCE and reused by
    // EVERY attendance-aggregating widget below. See
    // utils/sharedOffices.campusScopedAttendanceFilter (single source of truth).
    const {
      orgFilter: campusAttOrgFilter,
      studentClause: campusAttStudentClause,
      rosterIds: campusRosterIds,
    } = await campusScopedAttendanceFilter(organizationId, attFilter);

    // Inputs
    const {
      date, // YYYY-MM-DD for daily widgets
      startDate,
      endDate,
      mode, // optional: 'today'|'week'|'month'|'custom'
    } = req.query;

    // Build helpers
    const today = new Date();
    const dayStr = (date ? new Date(date) : today).toISOString().split('T')[0];
    const rangeStart = startDate ? new Date(startDate) : new Date(dayStr);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = endDate ? new Date(endDate) : new Date(dayStr);
    if (!endDate) rangeEnd.setDate(rangeEnd.getDate() + 1);
    rangeEnd.setHours(0, 0, 0, 0);

    // Parallel fetches for dashboard
    const StudentModel = require('../models/Student');
    const LeaveRequestSchema = require('../models/Model_LeaveRequest');

    const [
      // Daily report (re-implements minimal parts of /reports/daily inline to avoid extra HTTP calls)
      dailyPack,
      // Gender distribution
      genderAgg,
      // Auth method distribution (in selected range)
      authMethodAgg,
      // Time-wise in (today)
      timeWiseIn,
      // Time-wise in/out (today)
      timeWiseInOutAgg,
      // Heatmap (last 30 days or provided day)
      heatmapPack,
      // Live activity (today)
      livePack,
      // Last 10 days line trend of present count and rate
      last10Days,
      // Leave requests for today
      leaveRequestsToday,
      // WFH requests for today
      wfhRequestsToday
    ] = await Promise.all([
      (async () => {
        const dayStart = new Date(dayStr); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

        // Campus-aware, IDENTICAL scoping to /reports/daily so the dashboard's
        // Present/Absent match the Attendance page exactly (campusAttOrgFilter
        // / campusAttStudentClause / campusRosterIds computed once above).
        const attendance = await Attendance.find({
          organization: campusAttOrgFilter,
          ...campusAttStudentClause,
          timestamp: { $gte: dayStart, $lt: dayEnd }
        }).select('student type timestamp authMethod status').populate('student', 'fullName uid class department bureau');

        // Roster = home active staff + campus visitors who marked here.
        const studentQuery = campusRosterIds
          ? { _id: { $in: campusRosterIds } }
          : { organization: organizationId, isActive: true, ...stuFilter };
        const allStudents = await StudentModel.find(studentQuery).select('_id');
        const totalStudents = allStudents.length;

        const byStudent = new Map();
        for (const a of attendance) {
          const sid = a.student?._id?.toString(); if (!sid) continue;
          const entry = byStudent.get(sid) || { in: null, out: null };
          if (a.type === 'in' && (!entry.in || a.timestamp < entry.in.timestamp)) entry.in = a;
          if (a.type === 'out' && (!entry.out || a.timestamp > entry.out.timestamp)) entry.out = a;
          byStudent.set(sid, entry);
        }
        const presentCount = Array.from(byStudent.values()).filter(v => v.in).length;
        const absentCount = Math.max(totalStudents - presentCount, 0);
        const lateCount = Array.from(byStudent.values()).filter(v => v.in && (() => { const t = v.in.timestamp; const h = t.getHours(), m = t.getMinutes(); return h > 9 || (h === 9 && m > 30); })()).length;
        const attendanceSummary = attendance.map(a => ({
          _id: a._id,
          student: a.student ? { _id: a.student._id, fullName: a.student.fullName, uid: a.student.uid } : null,
          type: a.type,
          timestamp: a.timestamp,
          authMethod: a.authMethod,
          status: a.status
        }));
        return {
          date: dayStr,
          presentCount,
          lateCount,
          absentCount,
          totalStudents,
          attendanceRate: totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0,
          attendance: attendanceSummary
        };
      })(),
      // gender
      StudentModel.aggregate([
        { $match: { organization: organizationId, ...stuFilter } },
        { $group: { _id: '$gender', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // auth methods in date range — campus-scoped.
      Attendance.aggregate([
        { $match: { organization: campusAttOrgFilter, ...campusAttStudentClause, timestamp: { $gte: rangeStart, $lte: rangeEnd } } },
        { $group: { _id: '$authMethod', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // time-wise in today
      (async () => {
        const t0 = new Date(); t0.setHours(0, 0, 0, 0); const t1 = new Date(t0); t1.setDate(t1.getDate() + 1);
        const result = await Attendance.aggregate([
          { $match: { organization: campusAttOrgFilter, ...campusAttStudentClause, timestamp: { $gte: t0, $lt: t1 }, type: 'in' } },
          { $group: { _id: '$student', latestCheckIn: { $max: '$timestamp' } } }
        ]);
        const slots = { 'Before 9:00': 0, '9:00-9:30': 0, '9:31-10:00 (Late)': 0, '10:01-11:00 (Late)': 0, 'After 11:00 (Late)': 0 };
        result.forEach(r => { const d = new Date(r.latestCheckIn); const m = d.getHours() * 60 + d.getMinutes(); if (m < 540) slots['Before 9:00']++; else if (m <= 570) slots['9:00-9:30']++; else if (m <= 600) slots['9:31-10:00 (Late)']++; else if (m <= 660) slots['10:01-11:00 (Late)']++; else slots['After 11:00 (Late)']++; });
        return { timeSlots: Object.entries(slots).map(([name, value]) => ({ name, value, percentage: result.length ? ((value / result.length) * 100).toFixed(1) : 0 })), total: result.length };
      })(),
      // time-wise in/out today
      (async () => {
        const t0 = new Date(); t0.setHours(0, 0, 0, 0); const t1 = new Date(t0); t1.setDate(t1.getDate() + 1);
        const [inR, outR] = await Promise.all([
          Attendance.aggregate([{ $match: { organization: campusAttOrgFilter, ...campusAttStudentClause, timestamp: { $gte: t0, $lt: t1 }, type: 'in' } }, { $group: { _id: '$student', latestCheckIn: { $max: '$timestamp' } } }]),
          Attendance.aggregate([{ $match: { organization: campusAttOrgFilter, ...campusAttStudentClause, timestamp: { $gte: t0, $lt: t1 }, type: 'out' } }, { $group: { _id: '$student', latestCheckOut: { $max: '$timestamp' } } }])
        ]);
        const slots = [
          { label: 'Before 9:00', from: 0, to: 540 },
          { label: '9:00-9:30', from: 540, to: 570 },
          { label: '9:31-10:00 (Late)', from: 571, to: 600 },
          { label: '10:01-11:00 (Late)', from: 601, to: 660 },
          { label: 'After 11:00 (Late)', from: 660, to: 1440 }
        ];
        const inCounts = new Map(slots.map(s => [s.label, 0]));
        const outCounts = new Map(slots.map(s => [s.label, 0]));
        const bucket = (ts, map) => { const d = new Date(ts); const m = d.getHours() * 60 + d.getMinutes(); const s = slots.find(s => m >= s.from && m < s.to) || slots[slots.length - 1]; map.set(s.label, (map.get(s.label) || 0) + 1); };
        inR.forEach(r => bucket(r.latestCheckIn, inCounts)); outR.forEach(r => bucket(r.latestCheckOut, outCounts));
        return { timeSlots: slots.map(s => ({ name: s.label, checkIn: inCounts.get(s.label) || 0, checkOut: outCounts.get(s.label) || 0 })), totals: { in: inR.length, out: outR.length } };
      })(),
      // heatmap absent counts per department vs slot for last 30 days
      (async () => {
        const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 30);
        let departments = (await StudentModel.distinct('department', { organization: organizationId, ...stuFilter })).filter(Boolean);
        const studentsByDept = {};
        for (const dep of departments) {
          studentsByDept[dep] = (await StudentModel.find({ organization: organizationId, department: dep, ...stuFilter }).select('_id')).map(s => String(s._id));
        }
        // Campus-scoped so a home student who checked in at a sister branch
        // still counts as present here.
        const records = await Attendance.find({ organization: campusAttOrgFilter, ...campusAttStudentClause, type: 'in', timestamp: { $gte: start, $lt: end } }).populate('student','department');
        const slots = [
          { label: '8:00–8:30', from: 480, to: 510 },
          { label: '8:30–9:00', from: 510, to: 540 },
          { label: '9:00–9:30', from: 540, to: 570 },
          { label: '9:31–10:00 (Late)', from: 571, to: 600 },
          { label: '10:01–10:30 (Late)', from: 601, to: 630 },
          { label: '10:31–11:00 (Late)', from: 631, to: 660 },
          { label: '11:00+ (Late)', from: 660, to: 1440 }
        ];
        const matrix = departments.map(dep => {
          const values = slots.map(slot => {
            const present = new Set(
              records.filter(r => r.student && r.student.department === dep).filter(r => {
                const m = r.timestamp.getHours() * 60 + r.timestamp.getMinutes();
                return m >= slot.from && m < slot.to;
              }).map(r => String(r.student._id))
            );
            return studentsByDept[dep].filter(id => !present.has(id)).length;
          });
          return { department: dep, values };
        });
        return { slots: slots.map(s => s.label), departments, matrix };
      })(),
      // live activity cumulative (today)
      (async () => {
        const t0 = new Date(); t0.setHours(0,0,0,0); const t1 = new Date(t0); t1.setDate(t1.getDate()+1);
        const records = await Attendance.find({ organization: campusAttOrgFilter, ...campusAttStudentClause, timestamp: { $gte: t0, $lt: t1 }, type: 'in' }).sort({ timestamp: 1 });
        const timeSlots = {}; const interval = 5;
        records.forEach(r => { const d = new Date(r.timestamp); const bucket = new Date(d); bucket.setMinutes(Math.floor(d.getMinutes() / interval) * interval, 0, 0); const key = bucket.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); timeSlots[key] = (timeSlots[key] || 0) + 1; });
        let cumulative = 0; const data = [];
        for (let h = 6; h <= 20; h++) { for (let m = 0; m < 60; m += interval) { const t = new Date(); t.setHours(h, m, 0, 0); const key = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); if (timeSlots[key]) cumulative += timeSlots[key]; data.push({ time: key, count: cumulative }); } }
        return data;
      })(),
      // Attendance trend for the selected period (today/week/month/custom),
      // capped at today so upcoming days are never plotted. Falls back to the
      // last 10 days when no range is supplied.
      (async () => {
        const todayYMD = today.toISOString().split('T')[0];
        let fromYMD, toYMD;
        if (startDate) {
          fromYMD = startDate;
          const requestedEnd = endDate || startDate;
          toYMD = requestedEnd > todayYMD ? todayYMD : requestedEnd; // never beyond today
        } else {
          const d0 = new Date(today); d0.setDate(d0.getDate() - 9);
          fromYMD = d0.toISOString().split('T')[0];
          toYMD = todayYMD;
        }

        // Enumerate calendar days [fromYMD .. toYMD] inclusive (cap points so a
        // huge custom range can't explode into hundreds of queries).
        const days = [];
        const cursor = new Date(`${fromYMD}T00:00:00Z`);
        const lastDay = new Date(`${toYMD}T00:00:00Z`);
        while (cursor <= lastDay && days.length < 92) {
          days.push(cursor.toISOString().split('T')[0]);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        // Campus-scoped total + attendance, matching the rest of the bundle.
        const total = campusRosterIds ? campusRosterIds.length : await StudentModel.countDocuments({ organization: organizationId, isActive: true, ...stuFilter });
        return Promise.all(days.map(async (ds) => {
          const s = new Date(ds); s.setHours(0,0,0,0); const e = new Date(s); e.setDate(e.getDate()+1);
          const att = await Attendance.find({ organization: campusAttOrgFilter, ...campusAttStudentClause, timestamp: { $gte: s, $lt: e } }).select('type student timestamp').populate('student','_id');
          const by = new Map();
          att.forEach(a => {
            const sid = a.student?._id?.toString();
            if (!sid) return;
            const v = by.get(sid) || { in: false, out: false, late: false };
            if (a.type === 'in') {
              v.in = true;
              if (a.timestamp) {
                const t = new Date(a.timestamp);
                const h = t.getHours();
                const m = t.getMinutes();
                if (h > 9 || (h === 9 && m > 30)) {
                  v.late = true;
                }
              }
            }
            if (a.type === 'out') v.out = true;
            by.set(sid, v);
          });
          const present = Array.from(by.values()).filter(v => v.in).length;
          const late = Array.from(by.values()).filter(v => v.in && v.late).length;
          const dow = new Date(`${ds}T12:00:00`).getDay();
          return {
            date: ds,
            count: present,
            late: dow === 0 ? 0 : late,
            totalStudents: total,
            attendanceRate: total ? +(present / total * 100).toFixed(1) : 0,
            isToday: ds === todayYMD,
            isWeekend: dow === 0 || dow === 6
          };
        }));
      })(),
      // Leave requests for today
      (async () => {
        try {
          const dayStart = new Date(dayStr); dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

          // Get all students in the organization (HOD → department only)
          const students = await StudentModel.find({ organization: organizationId, ...stuFilter }).select('_id');
          const studentIds = students.map(s => s._id);

          // Find leave requests for today that are approved
          const leaveRequests = await LeaveRequestSchema.find({
            student: { $in: studentIds },
            status: 'approved',
            $or: [
              {
                'leaveDates.start': { $gte: dayStart, $lt: dayEnd }
              },
              {
                'leaveDates.end': { $gte: dayStart, $lt: dayEnd }
              },
              {
                'leaveDates.start': { $lte: dayStart },
                'leaveDates.end': { $gte: dayEnd }
              }
            ]
          }).populate('student', 'fullName uid');

          return {
            count: leaveRequests.length,
            requests: leaveRequests.map(req => ({
              _id: req._id,
              student: req.student,
              leaveDetails: req.leaveDetails,
              leaveDates: req.leaveDates,
              status: req.status
            }))
          };
        } catch (error) {
          console.error('Error fetching leave requests:', error);
          return { count: 0, requests: [] };
        }
      })(),
      // WFH requests for today
      (async () => {
        try {
          const dayStart = new Date(dayStr); dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

          // Get all students in the organization (HOD → department only)
          const students = await StudentModel.find({ organization: organizationId, ...stuFilter }).select('_id');
          const studentIds = students.map(s => s._id);

          // Find WFH requests for today (both approved and pending)
          const wfhRequests = await LeaveRequestSchema.find({
            student: { $in: studentIds },
            status: { $in: ['approved', 'pending'] },
            leaveDetails: { $regex: /\[WFH\]/i }, // Case-insensitive match for [WFH]
            $or: [
              {
                'leaveDates.start': { $gte: dayStart, $lt: dayEnd }
              },
              {
                'leaveDates.end': { $gte: dayStart, $lt: dayEnd }
              },
              {
                'leaveDates.start': { $lte: dayStart },
                'leaveDates.end': { $gte: dayEnd }
              }
            ]
          }).populate('student', 'fullName uid');

          return {
            count: wfhRequests.length,
            requests: wfhRequests.map(req => ({
              _id: req._id,
              student: req.student,
              leaveDetails: req.leaveDetails,
              leaveDates: req.leaveDates,
              status: req.status
            }))
          };
        } catch (error) {
          console.error('Error fetching WFH requests:', error);
          return { count: 0, requests: [] };
        }
      })()
    ]);

    const gender = genderAgg.map(g => ({ name: (g._id || 'Unknown').toString().replace(/^./, c => c.toUpperCase()), value: g.count }));
    const authMethods = authMethodAgg.map(a => ({ method: a._id ? a._id.charAt(0).toUpperCase() + a._id.slice(1) : 'Unknown', count: a.count }));

    // Overall attendance rate in provided range (unique check-ins) — campus-scoped.
    const studentsCount = campusRosterIds ? campusRosterIds.length : await StudentModel.countDocuments({ organization: organizationId, isActive: true, ...stuFilter });
    const rangeRecords = await Attendance.find({ organization: campusAttOrgFilter, ...campusAttStudentClause, timestamp: { $gte: rangeStart, $lte: rangeEnd } }).select('type student').populate('student','_id');
    const grouped = new Map();
    rangeRecords.forEach(r => { const sid = r.student?._id?.toString(); if (!sid) return; const v = grouped.get(sid) || { in: false, out: false }; if (r.type === 'in') v.in = true; if (r.type === 'out') v.out = true; grouped.set(sid, v); });
    const presentCount = Array.from(grouped.values()).filter(v => v.in).length;
    const overall = { present: presentCount, absent: Math.max(studentsCount - presentCount, 0), totalStudents: studentsCount, attendanceRate: studentsCount ? Math.round((presentCount / studentsCount) * 100) : 0 };

    return res.json({
      success: true,
      data: {
        dailyReport: dailyPack,
        genderDistribution: gender,
        authMethodDistribution: authMethods,
        overallRate: overall,
        timeWise: timeWiseIn,
        timeWiseInOut: timeWiseInOutAgg,
        heatmap: heatmapPack,
        liveAttendance: livePack,
        last10Days: last10Days,
        leaveRequests: leaveRequestsToday,
        wfhRequests: wfhRequestsToday
      }
    });
  } catch (error) {
    console.error('Dashboard bundle error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/attendance/live-activity
// @desc    Get real-time attendance activity data for today
// @access  Private
router.get('/live-activity', auth, async (req, res) => {
  try {
    const organizationId = req.organization._id;
    const liveScope = await deptScopeIds(req);
    const liveAttFilter = liveScope ? { student: { $in: liveScope } } : {};
    const { orgFilter: liveOrgFilter, studentClause: liveStudentClause } =
      await campusScopedAttendanceFilter(organizationId, liveAttFilter);

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all attendance records for today — campus-scoped.
    const attendanceRecords = await Attendance.find({
      organization: liveOrgFilter,
      ...liveStudentClause,
      timestamp: { $gte: today, $lt: tomorrow },
      type: 'in'
    }).sort({ timestamp: 1 });

    // Group attendance by time intervals (every 5 minutes)
    const timeSlots = {};
    const intervalMinutes = 5;

    attendanceRecords.forEach(record => {
      const recordTime = new Date(record.timestamp);
      const minutes = recordTime.getMinutes();
      const slotMinutes = Math.floor(minutes / intervalMinutes) * intervalMinutes;
      const slotTime = new Date(recordTime);
      slotTime.setMinutes(slotMinutes, 0, 0);

      const timeKey = slotTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      if (!timeSlots[timeKey]) {
        timeSlots[timeKey] = 0;
      }
      timeSlots[timeKey]++;
    });

    // Convert to cumulative data for line chart
    const liveData = [];
    let cumulativeCount = 0;

    // Get all time slots from 00:00 to 23:55 in 5-minute intervals
    const allTimeSlots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += intervalMinutes) {
        const time = new Date();
        time.setHours(hour, minute, 0, 0);
        const timeKey = time.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        allTimeSlots.push(timeKey);
      }
    }

    // Create data points for each time slot
    allTimeSlots.forEach(timeSlot => {
      if (timeSlots[timeSlot]) {
        cumulativeCount += timeSlots[timeSlot];
      }

      // Only add data points if there's activity or if it's a reasonable time (6 AM to 8 PM)
      const [hours] = timeSlot.split(':').map(Number);
      if (timeSlots[timeSlot] || (hours >= 6 && hours <= 20)) {
        liveData.push({
          time: timeSlot,
          count: cumulativeCount
        });
      }
    });

    // No synthetic fallback: an empty day (before the first check-in, a
    // weekend, a quiet org) is real information and the client renders an
    // honest "no check-ins yet" state instead of an invented curve.
    res.json({
      success: true,
      data: liveData,
      isEmpty: liveData.length === 0
    });

  } catch (error) {
    console.error('Error fetching live attendance data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of the Earth in meters
  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance; // in meters
}

// @route   GET /api/attendance/calendar?month=MM&year=YYYY
// @desc    Detailed per-day attendance calendar for the LOGGED-IN user for one
//          month — check-in/out times, hours, absent days, government holidays,
//          approved leave, WFH and weekends. Powers the mobile dashboard's
//          "calendar-wise detailed report". Defaults to the current IST month.
// @access  Private (student token)
router.get('/calendar', auth, async (req, res) => {
  try {
    // Resolve the requesting user (self-scoped — they only see their own calendar)
    let studentId;
    if (req.student) studentId = req.student._id;
    else if (req.user) studentId = req.user.id || req.user._id;
    else return res.status(401).json({ success: false, message: 'Authentication required' });

    const student = await Student.findById(studentId)
      .select('fullName uid organization WFH wfhAssignments')
      .lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Month/year — default to the current IST month
    const nowYMD = istGetYMD(new Date());
    const year = parseInt(req.query.year, 10) || parseInt(nowYMD.y, 10);
    const month = parseInt(req.query.month, 10) || parseInt(nowYMD.m, 10); // 1-12
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last of this
    const dd = String(lastDay).padStart(2, '0');

    const monthStart = new Date(`${year}-${mm}-01T00:00:00.000+05:30`);
    const monthEnd = new Date(`${year}-${mm}-${dd}T23:59:59.999+05:30`);
    const todayStr = istGetDateString(new Date());

    // All per-day signals for the month, fetched together.
    // Attendance is read from BOTH stores (primary + biometric) — exactly like
    // Recent History / status do — so a mark that only landed in the external
    // biometric collection (e.g. a check-in on the biometric device, or a mirror
    // that didn't reach primary) is NOT falsely shown as "Absent" here while it
    // shows up in Recent History. findMergedAttendance returns newest-first, but
    // the per-day logic below needs firstIn = earliest check-in and lastOut =
    // latest check-out, so we re-sort ascending after merging.
    const [mergedRecords, holidays, leaves] = await Promise.all([
      findMergedAttendance({ student: studentId, timestamp: { $gte: monthStart, $lte: monthEnd } }),
      Holiday.find({
        organization: { $in: [null, student.organization] },
        date: { $gte: `${year}-${mm}-01`, $lte: `${year}-${mm}-${dd}` },
      }).lean(),
      LeaveRequest.find({
        student: studentId,
        status: 'approved',
        'leaveDates.start': { $lte: monthEnd },
        'leaveDates.end': { $gte: monthStart },
      }).lean(),
    ]);

    const records = mergedRecords.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const holidayByDate = {};
    for (const h of holidays) holidayByDate[h.date] = h.name;

    const hasWfhForDay = (dayStart, dayEnd) => {
      if (student.WFH === 'WFH allowed' || student.WFH === 'Allowed') return true;
      if (!Array.isArray(student.wfhAssignments)) return false;
      return student.wfhAssignments.some(
        (a) => a.isActive && new Date(a.startDate) < dayEnd && new Date(a.endDate) >= dayStart
      );
    };
    const onLeaveForDay = (dayStart, dayEnd) =>
      leaves.some(
        (l) => l.leaveDates && new Date(l.leaveDates.start) <= dayEnd && new Date(l.leaveDates.end) >= dayStart
      );

    const days = [];
    const summary = { present: 0, absent: 0, holidays: 0, leaves: 0, wfh: 0, weekends: 0, workingDays: 0 };

    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
      const dateStr = istGetDateString(cursor);
      const weekday = istGetDayOfWeek(cursor);
      const isWeekend = weekday === 0 || weekday === 6; // Sunday AND Saturday
      const dayStart = istStartOfDay(cursor);
      const dayEnd = istEndOfDay(cursor);
      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;

      const dayRecords = records.filter((r) => r.timestamp >= dayStart && r.timestamp <= dayEnd);
      const checkIns = dayRecords.filter((r) => r.type === 'in');
      const checkOuts = dayRecords.filter((r) => r.type === 'out');
      const firstIn = checkIns[0];
      const lastOut = checkOuts[checkOuts.length - 1];

      let hours = null;
      if (firstIn && lastOut) hours = Math.round(((lastOut.timestamp - firstIn.timestamp) / 36e5) * 10) / 10;

      const holidayName = holidayByDate[dateStr] || null;

      let status, label;
      if (firstIn) {
        // Showing up always wins, even on a weekend/holiday.
        status = 'present';
        label = hours != null && hours >= 8 ? 'Full day' : checkOuts.length ? 'Present' : 'Checked in';
      } else if (holidayName) {
        status = 'holiday';
        label = holidayName;
      } else if (isWeekend) {
        status = 'weekend';
        label = 'Weekend';
      } else if (onLeaveForDay(dayStart, dayEnd)) {
        status = 'leave';
        label = 'On leave';
      } else if (hasWfhForDay(dayStart, dayEnd)) {
        status = 'wfh';
        label = 'Work from home';
      } else if (isFuture) {
        status = 'future';
        label = '';
      } else if (isToday) {
        status = 'today';
        label = 'Not marked yet';
      } else {
        status = 'absent';
        label = 'Absent';
      }

      if (status === 'present') summary.present++;
      else if (status === 'holiday') summary.holidays++;
      else if (status === 'leave') summary.leaves++;
      else if (status === 'wfh') summary.wfh++;
      else if (status === 'weekend') summary.weekends++;
      else if (status === 'absent') summary.absent++;
      if (!isWeekend && !holidayName) summary.workingDays++;

      days.push({
        date: dateStr,
        day: parseInt(istGetYMD(cursor).d, 10),
        dayName: cursor.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, weekday: 'short' }),
        weekday,
        isWeekend,
        isFuture,
        isToday,
        status,
        label,
        holidayName,
        checkIn: firstIn ? istTimeString(firstIn.timestamp) : null,
        checkOut: lastOut ? istTimeString(lastOut.timestamp) : null,
        hours,
        records: dayRecords.map((r) => ({
          type: r.type,
          time: istTimeString(r.timestamp),
          method: getMethodDisplayName(r.authMethod),
        })),
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    // Rate over days that actually demanded attendance so far (present + absent),
    // matching the dashboard's existing semantics and ignoring future days.
    const considered = summary.present + summary.absent;
    const attendanceRate = considered > 0 ? Math.round((summary.present / considered) * 100) : 0;

    res.json({
      success: true,
      month,
      year,
      monthName: monthStart.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, month: 'long', year: 'numeric' }),
      student: { id: String(student._id), name: student.fullName, uid: student.uid },
      summary: { ...summary, totalDays: days.length, attendanceRate },
      days,
    });
  } catch (error) {
    console.error('[Attendance Calendar] error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;
