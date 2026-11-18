const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const SpotCheck = require('../models/SpotCheck');
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const SpoofAttempt = require('../models/SpoofAttempt');
const spotCheckService = require('../services/spotCheckService');
const faceStorageService = require('../services/faceStorageService');
const faceVerifyService = require('../services/faceVerifyService');
const livenessService = require('../services/livenessService');
const securityEventService = require('../services/securityEventService');
const emailService = require('../services/emailService');
const audit = require('../services/auditService');
const injectionRiskService = require('../services/injectionRiskService');
const { resolveClientIp } = require('../utils/clientIp');
const { deptScopeIds } = require('../utils/deptScope');

const router = express.Router();

function toBase64DataUrl(img) {
  if (!img) return null;
  if (Buffer.isBuffer(img)) return `data:image/jpeg;base64,${img.toString('base64')}`;
  if (typeof img === 'string') return img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
  return null;
}

/** Resolve the organization id from either an org token or a staff token. */
function resolveOrgId(req) {
  if (req.organization) return req.organization._id;
  if (req.student) return req.student.organization;
  if (req.user && req.user.role === 'organization') return req.user.id;
  return null;
}

// @route   POST /api/spot-checks/trigger
// @desc    Admin/org manually fires a spot-check round now
// @access  Private (organization)
router.post(
  '/trigger',
  auth,
  [
    body('sampleSize').optional().isInt({ min: 1 }),
    body('windowMinutes').optional().isInt({ min: 1, max: 240 }),
    body('studentIds').optional().isArray(),
    body('onlyCheckedIn').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      // Only an organization account may trigger a round.
      if (!req.organization && !(req.user && req.user.role === 'organization')) {
        return res
          .status(403)
          .json({ success: false, error: 'Only an organization can trigger spot checks' });
      }
      const organizationId = resolveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ success: false, error: 'Organization not resolved' });
      }

      // HOD: restrict the candidate pool (and therefore the notifications) to
      // their own department members.
      const scope = await deptScopeIds(req);
      let studentIds = req.body.studentIds || null;
      if (scope) {
        const scopeStr = scope.map(String);
        studentIds = studentIds
          ? studentIds.filter((id) => scopeStr.includes(String(id)))
          : scopeStr;
      }

      const result = await spotCheckService.issueRound(organizationId, {
        studentIds: studentIds,
        sampleSize: req.body.sampleSize || null,
        windowMinutes: req.body.windowMinutes || 15,
        onlyCheckedIn:
          req.body.onlyCheckedIn != null ? !!req.body.onlyCheckedIn : true,
        triggeredBy: 'manual',
      });

      return res.json(result);
    } catch (err) {
      console.error('[SpotCheck] trigger error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// @route   GET /api/spot-checks/pending
// @desc    Staff fetches their currently-open spot checks (to answer)
// @access  Private (student/staff)
router.get('/pending', auth, async (req, res) => {
  try {
    if (!req.student) {
      return res.status(403).json({ success: false, error: 'Staff token required' });
    }
    const pending = await SpotCheck.find({
      student: req.student._id,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .sort({ issuedAt: -1 })
      .select('_id roundId issuedAt expiresAt windowMinutes');

    // The client uses this to compute its own clock's drift from the server's
    // (see SpotCheckResponder.tsx) — a device with a wrong/drifted system
    // clock (common on real phones) would otherwise compare `sc.expiresAt`
    // against its OWN wrong `Date.now()`, misjudging a check that genuinely
    // expired as still-open and wrongly blaming "handled on another device"
    // when it drops off this list.
    return res.json({ success: true, count: pending.length, spotChecks: pending, serverNow: new Date().toISOString() });
  } catch (err) {
    console.error('[SpotCheck] pending error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/spot-checks/:id/respond
// @desc    Staff responds to a spot check. SERVER-AUTHORITATIVE: this used to
//          trust whatever `faceVerified`/`livenessVerdict` the client claimed
//          (a modified client could mark itself "verified" and get a real
//          Attendance record with NO image, NO identity check, and NO PAD —
//          the exact bypass /attendance/mark was hardened against earlier).
//          Now re-runs the SAME identity + anti-spoof + liveness gates here,
//          against the real captured faceImage/nonce/events, before anything
//          is trusted.
// @access  Private (student/staff)
router.post('/:id/respond', auth, async (req, res) => {
  try {
    if (!req.student) {
      return res.status(403).json({ success: false, error: 'Staff token required' });
    }
    const student = req.student;
    const { faceImage, faceImages, livenessNonce, livenessEvents, attestation } = req.body;

    // Camera/device-integrity gate — same as /attendance/mark. A spot-check is
    // exactly where an emulator/virtual-camera cheat would be attempted.
    const injRisk = injectionRiskService.score(attestation);
    if (attestation && (injRisk.level === 'high' || injRisk.level === 'critical')) {
      console.log(`[SpotCheck] REJECTED uid=${student.uid}: camera/device integrity (${injRisk.level}, score=${injRisk.score}, reasons=${(injRisk.reasons || []).join('|')})`);
      await securityEventService.record({
        category: 'camera_integrity',
        severity: injRisk.level === 'critical' ? 'critical' : 'high',
        desiredAction: 'block',
        student,
        detection: { riskScore: injRisk.score, signals: injRisk.reasons || [] },
        device: { publicIp: resolveClientIp(req) },
        summaryForAdmin: `Spot-check camera/device integrity check failed (${injRisk.level}, score ${injRisk.score}).`,
      });
      audit.log(audit.fromReq(req, {
        action: 'spot_check.injection_blocked',
        outcome: 'failure',
        targetType: 'spot_check',
        target: req.params.id,
        metadata: { level: injRisk.level, score: injRisk.score },
      }));
      return res.status(401).json({ success: false, code: 'spot_check_verification_failed', error: 'Verification could not be completed. Please try again or contact your administrator.' });
    }

    // Prefer the multi-frame burst the app sends (frames spread across a live
    // playing replay expose the screen far better than one frame); fall back to
    // the single faceImage for older clients. A spot-check with no captured face
    // is not a verification at all.
    const frameList = (Array.isArray(faceImages) && faceImages.length ? faceImages : [faceImage])
      .filter(Boolean);
    if (!frameList.length) {
      console.log(`[SpotCheck] REJECTED uid=${student.uid}: no faceImage in request`);
      return res.status(400).json({ success: false, error: 'A live camera capture is required to respond to a spot check.' });
    }

    // Liveness — re-adjudicate the SAME nonce/events /attendance/mark would.
    // Runs BEFORE the face-engine round trip for the same reason attendance.js
    // adjudicates first: adjudicate() is pure in-memory CPU, while verify()
    // below is a real network call (up to FACE_API_TIMEOUT_MS, plus a retry).
    // The nonce TTL ticks on wall clock from the moment the challenge was
    // issued — when verification ran first, its latency was charged against
    // that same clock, so a genuine user could complete every action correctly
    // and still be rejected with 'nonce_expired', which reads identically to
    // every other rejection here ("Verification could not be completed…").
    const livenessVerdict = livenessService.adjudicate({
      nonce: livenessNonce,
      studentId: student._id,
      events: livenessEvents,
    });
    console.log(`[SpotCheck] liveness uid=${student.uid} passed=${livenessVerdict.passed}${livenessVerdict.passed ? '' : ` reasons=${(livenessVerdict.reasons || []).join('|')}`}`);
    audit.log(audit.fromReq(req, {
      action: 'spot_check.liveness',
      outcome: livenessVerdict.passed ? 'success' : 'failure',
      targetType: 'spot_check',
      target: req.params.id,
      metadata: { passed: livenessVerdict.passed, reasons: livenessVerdict.reasons },
    }));
    if (!livenessVerdict.passed) {
      const evt = await securityEventService.record({
        category: 'liveness_failed',
        severity: 'high',
        desiredAction: 'block',
        student,
        detection: { livenessPassed: false, signals: livenessVerdict.reasons || [] },
        device: { publicIp: resolveClientIp(req) },
        summaryForAdmin: `Spot-check liveness challenge failed: ${(livenessVerdict.reasons || []).join(', ')}`,
      });
      // Same fraudMonitoring ceiling attendance.js applies to this exact
      // failure — the org-wide mode can cap the consequence below 'block';
      // the event itself is always recorded either way.
      if (evt.effectiveAction === 'block') {
        console.log(`[SpotCheck] REJECTED uid=${student.uid}: liveness adjudication failed`);
        return res.status(401).json({ success: false, code: 'spot_check_verification_failed', error: 'Verification could not be completed. Please try again or contact your administrator.' });
      }
      console.log(`[SpotCheck] liveness failed but NOT blocked for uid=${student.uid} — fraudMonitoring.mode capped the action below 'block'`);
    }

    // Multi-frame PAD when a burst is present (any confident-fake frame across
    // the burst fails the whole attempt — the frame-filling-replay defence);
    // verifyMulti auto-falls back to single-frame verify() for a lone frame, so
    // the result shape and enforcement below are identical either way.
    const result = await faceVerifyService.verifyMulti({ uid: student.uid, faceImages: frameList });
    const spoof = result.spoof || { available: false, isFake: false };
    // WHOLE-FRAME SCREEN REPLAY catch. A frame-filling video replay shows a
    // clean face, so the face-crop PAD scores it 'real' and misses it — but the
    // whole frame still carries the screen's moiré/bezel signature
    // (spoof.screenSuspected, itself now majority-voted across the burst —
    // see antispoof_service.py predict_multi — so a single noisy frame can't
    // trip it, only a signal sustained across most of the burst can).
    //
    // OFF BY DEFAULT — flipped back 2026-07-25. This was briefly turned ON by
    // default for spot-check on the theory that a false reject here only
    // costs a cheap retry. In production it did the opposite: antispoof_
    // service.py's OWN top-of-file measurements already found this signal
    // "device-dependent and NOT separable" (genuine front cameras measuring
    // moiré 0.43-0.48, the SAME band as an actual laptop-screen replay) —
    // which is exactly why it defaults OFF server-side for check-in/out. The
    // super-admin "Fake Attendance Attempts" gallery then filled with 150+
    // flagged captures that were visibly real employees on real phones (many
    // of the SAME person/device flagged repeatedly), confirming the device-
    // dependence this file's own comments predicted rather than catching
    // actual replay attacks. Matches check-in/out's default now: compute +
    // log the signal for observability, never auto-flip a verdict, unless
    // ANTISPOOF_SCREEN_BLOCK_SPOTCHECK=1 is explicitly set AFTER
    // calibrate_screen_gate.py has tuned a threshold against THIS
    // deployment's own genuine-vs-replay captures.
    const SCREEN_BLOCK_SPOTCHECK = process.env.ANTISPOOF_SCREEN_BLOCK_SPOTCHECK === '1';
    const screenHit = spoof.screenSuspectedAny === true || spoof.screenSuspected === true;
    if (SCREEN_BLOCK_SPOTCHECK && spoof.available && screenHit && !spoof.isFake) {
      console.log(`[SpotCheck] SCREEN-REPLAY signature uid=${student.uid} (moire=${spoof.screenMoire} peak=${spoof.screenPeak}) — treating as spoof (enabled), face-crop label was '${spoof.label}'`);
      spoof.isFake = true;
      spoof.isUncertain = false;
      spoof.label = 'fake';
    }
    const identitySimilarity = typeof result.similarity === 'number' ? result.similarity
      : (typeof result.score === 'number' ? result.score : null);
    // A spot-check exists SPECIFICALLY to catch impersonation, so identity is
    // held to a higher bar here than routine check-in/out: the face engine's
    // own match threshold (FACE_MATCH_THRESHOLD in face-back/check.py, tuned
    // for check-in/out recall under poor lighting) is not automatically
    // trusted for this feature — a similarity that barely clears it is still
    // rejected. Configurable so it can be recalibrated from real observed
    // spot-check similarity scores without a code change. attendance.js
    // (check-in/out) is untouched and keeps using the base threshold.
    const SPOT_CHECK_MIN_SIMILARITY = parseFloat(process.env.SPOT_CHECK_MIN_SIMILARITY || '0.65');
    const identityConfident = result.match === true
      && (identitySimilarity == null || identitySimilarity >= SPOT_CHECK_MIN_SIMILARITY);
    console.log(`[SpotCheck] face verify uid=${student.uid} reachable=${result.reachable} match=${result.match} similarity=${identitySimilarity} minRequired=${SPOT_CHECK_MIN_SIMILARITY} confident=${identityConfident} spoofLabel=${spoof.label || 'n/a'} spoofAvailable=${spoof.available}`);

    // PAD unreachable — nothing was judged, fail closed with a generic retry.
    if (!result.reachable) {
      console.log(`[SpotCheck] REJECTED uid=${student.uid}: face-verify service unreachable (reason=${result.reason || 'unknown'}) — fail-closed`);
      return res.status(401).json({ success: false, code: 'spot_check_verification_failed', error: 'Verification could not be completed. Please try again or contact your administrator.' });
    }

    // Unusable capture (too dark/bright/blurry, or no face found): the engine
    // never got far enough to judge identity or PAD at all. This is NOT a
    // security failure — nothing is flagged or recorded — so it must not show
    // the same alarming generic message as a real rejection. Mirrors the
    // friendly recapture prompt attendance.js's /verify-face and /mark already
    // give. This route never had that branch before — it went unnoticed while
    // CameraStream's own client-side pre-check caught quality issues first;
    // now that spot-check skips that redundant pre-check (removed to fix the
    // liveness-nonce timing/concurrency issue), this route needs its own copy.
    if (spoof.needsRetry) {
      const retryMessages = {
        too_dark: 'The photo is too dark. Move to a brighter spot and try again.',
        too_bright: 'There is too much light behind you. Face the light and try again.',
        too_blurry: 'The photo is blurry. Hold the phone steady and try again.',
        no_face: 'We could not see your face clearly. Center your face in the frame and try again.',
      };
      console.log(`[SpotCheck] retry requested uid=${student.uid}: capture unusable (reason=${spoof.retryReason || 'no_face'})`);
      return res.status(400).json({
        success: false,
        code: 'spot_check_retry_capture',
        retry: true,
        retryReason: spoof.retryReason || 'no_face',
        error: retryMessages[spoof.retryReason] || retryMessages.no_face,
      });
    }

    if (spoof.isUncertain) {
      try {
        await SpoofAttempt.create({
          student: student._id, organization: student.organization || null, uid: student.uid,
          studentName: student.fullName || student.name || null, type: 'spotcheck',
          faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
          score: typeof spoof.score === 'number' ? spoof.score : null,
          label: spoof.label || 'uncertain', model: spoof.model || 'minifasnet',
          matched: result.match === true, similarity: result.similarity ?? result.score ?? null,
          latitude: req.body.latitude, longitude: req.body.longitude,
          deviceId: req.body.deviceId || undefined, deviceModel: req.body.deviceModel || undefined, manufacturer: req.body.manufacturer || undefined,
        });
      } catch (e) { console.error('[SpotCheck] failed to record uncertain SpoofAttempt:', e.message); }
    }

    let spoofBlocks = false;
    if (spoof.isFake) {
      console.log(`[SpotCheck] SPOOF DETECTED uid=${student.uid}: PAD label=fake score=${spoof.score} margin=${spoof.margin} model=${spoof.model || 'minifasnet'}`);
      try {
        await SpoofAttempt.create({
          student: student._id, organization: student.organization || null, uid: student.uid,
          studentName: student.fullName || student.name || null, type: 'spotcheck',
          faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
          // A screen-signal-forced 'fake' keeps the crop model's HIGH real-score
          // in spoof.score, which would show a contradictory near-0%
          // fake-confidence next to the FAKE badge on the dashboard.
          score: spoof.screenSuspected ? 0 : (typeof spoof.score === 'number' ? spoof.score : null),
          label: spoof.label || 'fake', model: spoof.model || 'minifasnet',
          matched: result.match === true, similarity: result.similarity ?? result.score ?? null,
          latitude: req.body.latitude, longitude: req.body.longitude,
          deviceId: req.body.deviceId || undefined, deviceModel: req.body.deviceModel || undefined, manufacturer: req.body.manufacturer || undefined,
        });
      } catch (e) { console.error('[SpotCheck] failed to record SpoofAttempt:', e.message); }

      const evt = await securityEventService.record({
        category: 'verification_spoof',
        severity: 'critical',
        desiredAction: 'block',
        student,
        detection: {
          spoofConfidence: typeof spoof.score === 'number' ? spoof.score : null,
          spoofLabel: spoof.label || null,
          faceMatchConfidence: result.similarity ?? result.score ?? null,
          signals: ['pad_fake'],
        },
        device: { publicIp: resolveClientIp(req) },
        evidenceImage: faceImage,
        skipAutoNotify: true,
      });
      spoofBlocks = evt.effectiveAction === 'block';
      audit.log(audit.fromReq(req, {
        action: 'spot_check.spoof_blocked',
        outcome: spoofBlocks ? 'failure' : 'flagged',
        targetType: 'spot_check',
        target: req.params.id,
        metadata: { label: spoof.label, score: spoof.score, effectiveAction: evt.effectiveAction },
      }));
      if (securityEventService.ACTION_RANK[evt.effectiveAction] >= securityEventService.ACTION_RANK.escalate) {
        (async () => {
          try {
            let organizationName = null;
            if (student.organization) {
              const org = await Organization.findById(student.organization).select('name').lean();
              organizationName = org?.name || null;
            }
            await emailService.sendSpoofAlert({
              student: { fullName: student.fullName || student.name, uid: student.uid, designation: student.designation, department: student.department, organizationName },
              type: 'spotcheck', label: spoof.label, score: spoof.score,
              similarity: result.similarity ?? result.score ?? null, image: faceImage,
              latitude: req.body.latitude, longitude: req.body.longitude,
              // Anti-spoof detail so the email explains WHY it was fake.
              detail: {
                margin: spoof.margin,
                margins: spoof.margins,
                screenSuspected: spoof.screenSuspected,
                screenMoire: spoof.screenMoire,
                screenPeak: spoof.screenPeak,
              },
            });
          } catch (e) { console.error('[SpotCheck] spoof alert email failed:', e.message); }
        })();
      }
      if (spoofBlocks) {
        console.log(`[SpotCheck] REJECTED uid=${student.uid}: confirmed spoof, blocked (fraudMonitoring.mode allowed block)`);
        return res.status(401).json({ success: false, code: 'spot_check_verification_failed', error: 'Verification could not be completed. Please try again or contact your administrator.' });
      }
      console.log(`[SpotCheck] spoof recorded but NOT blocked for uid=${student.uid} — fraudMonitoring.mode capped the action below 'block'`);
    }

    // Identity mismatch (genuine face, wrong person, below the face engine's own
    // threshold, OR a match too borderline to trust for an anti-impersonation
    // check — see SPOT_CHECK_MIN_SIMILARITY above).
    if (!identityConfident || spoof.isFake) {
      const borderline = result.match === true && !identityConfident;
      console.log(`[SpotCheck] REJECTED uid=${student.uid}: identity mismatch (match=${result.match}, similarity=${identitySimilarity}, minRequired=${SPOT_CHECK_MIN_SIMILARITY}, borderline=${borderline}, reason=${result.reason || 'below_threshold'})`);
      // A match the face engine itself accepted, but too close to the
      // spot-check bar to trust, is exactly the pattern a shared/borrowed
      // login would produce — worth a record even though it's not a confirmed
      // spoof, so a repeat pattern on one account is visible to the admin.
      if (borderline) {
        try {
          await SpoofAttempt.create({
            student: student._id, organization: student.organization || null, uid: student.uid,
            studentName: student.fullName || student.name || null, type: 'spotcheck',
            faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
            score: identitySimilarity, label: 'uncertain', model: spoof.model || 'minifasnet',
            matched: false, similarity: identitySimilarity,
            latitude: req.body.latitude, longitude: req.body.longitude,
            deviceId: req.body.deviceId || undefined, deviceModel: req.body.deviceModel || undefined, manufacturer: req.body.manufacturer || undefined,
          });
        } catch (e) { console.error('[SpotCheck] failed to record borderline-match SpoofAttempt:', e.message); }
      }
      audit.log(audit.fromReq(req, {
        action: 'spot_check.face_verify',
        outcome: 'failure',
        targetType: 'spot_check',
        target: req.params.id,
        metadata: { match: result.match, similarity: identitySimilarity, minRequired: SPOT_CHECK_MIN_SIMILARITY, borderline, reason: result.reason },
      }));
      return res.status(401).json({ success: false, code: 'spot_check_verification_failed', error: 'Verification could not be completed. Please try again or contact your administrator.' });
    }

    // Only server-computed values are trusted from here on — the client's own
    // faceVerified/verificationScore/livenessVerdict claims are never used.
    const result2 = await spotCheckService.recordResponse(req.params.id, {
      studentId: student._id,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      distance: req.body.distance,
      faceVerified: true,
      verificationScore: result.score,
      livenessVerdict,
      attendanceRef: req.body.attendanceRef,
      faceImage,
      attestation,
    });
    if (!result2.success) {
      console.log(`[SpotCheck] REJECTED uid=${student.uid}: verification passed but recordResponse failed — ${result2.error}`);
      return res.status(400).json(result2);
    }

    console.log(`[SpotCheck] VERIFIED uid=${student.uid} score=${result.score} — response recorded${result2.attendanceMarked ? ', attendance marked' : ''}`);

    // File the spot-check selfie under face_storage/<user>/<date>/spotcheck/.
    // `spoof` (declared above) was missing here too — same gap just fixed in
    // attendance.js's /mark: without it the filename never gets the
    // `_spoof-<label>-<score>` token, so Face Report's fake/uncertain filter
    // can't exclude a capture that PAD actually flagged.
    faceStorageService.saveCapture({
      student,
      type: 'spotcheck',
      image: faceImage,
      match: true,
      similarity: result.score,
      spoof,
    });
    res.json(result2);

    // ASYNC VLM RESCAN — fired AFTER the response above, deliberately never
    // awaited (same reasoning as attendance.js's /mark: the hosted-VLM call
    // measured 10-60s, so it never runs on the request path). The spot-check
    // response already stands; this only corrects the admin spoof-review
    // dashboard afterward for cases the fast local models (MiniFASNet,
    // DeePixBiS) left 'uncertain'.
    faceVerifyService.vlmRescan(faceImage)
      .then(async (vlm) => {
        if (!vlm.available || !vlm.isFake) return;
        console.log(`[SpotCheck] VLM RESCAN uid=${student.uid}: confirmed spoof (${vlm.raw})`);
        try {
          await SpoofAttempt.create({
            student: student._id, organization: student.organization || null, uid: student.uid,
            studentName: student.fullName || student.name || null, type: 'spotcheck',
            faceImage: await faceStorageService.compressToBase64DataUrl(faceImage),
            score: null, label: 'fake', model: 'vlm-rescan',
            matched: result.match === true, similarity: result.similarity ?? result.score ?? null,
            latitude: req.body.latitude, longitude: req.body.longitude,
            deviceId: req.body.deviceId || undefined, deviceModel: req.body.deviceModel || undefined, manufacturer: req.body.manufacturer || undefined,
          });
        } catch (e) { console.error('[SpotCheck] failed to record VLM-rescan SpoofAttempt:', e.message); }
        try {
          await securityEventService.record({
            category: 'verification_spoof',
            severity: 'critical',
            desiredAction: 'block',
            student,
            detection: { spoofLabel: 'fake', signals: ['vlm_rescan_fake'], vlmReason: vlm.raw },
            device: { publicIp: resolveClientIp(req) },
            evidenceImage: faceImage,
            skipAutoNotify: true,
          });
        } catch (e) { console.error('[SpotCheck] VLM-rescan security event failed:', e.message); }
      })
      .catch((e) => console.error('[SpotCheck] VLM rescan request failed:', e.message));
    return;
  } catch (err) {
    console.error('[SpotCheck] respond error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/spot-checks/round/:roundId
// @desc    Admin sees one round's roster + who answered / missed
// @access  Private (organization)
router.get('/round/:roundId', auth, async (req, res) => {
  try {
    // Org-only: a student must not read the whole organization's roster.
    if (!req.organization && !(req.user && req.user.role === 'organization')) {
      return res.status(403).json({ success: false, error: 'Organization access required' });
    }
    const organizationId = resolveOrgId(req);
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    const scope = await deptScopeIds(req);
    const q = { roundId: req.params.roundId, organization: organizationId };
    if (scope) q.student = { $in: scope };
    const checks = await SpotCheck.find(q)
      .populate('student', 'fullName uid department class')
      .sort({ status: 1 });

    const responded = checks.filter((c) => c.status === 'responded').length;
    const missed = checks.filter((c) => c.status === 'missed').length;
    const pending = checks.filter((c) => c.status === 'pending').length;

    return res.json({
      success: true,
      roundId: req.params.roundId,
      total: checks.length,
      responded,
      missed,
      pending,
      checks,
    });
  } catch (err) {
    console.error('[SpotCheck] round error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/spot-checks/report
// @desc    The detailed non-response analytics report (the Admin's view of who
//          keeps dodging spot checks, repeat offenders, and "missed the live
//          check but marked attendance anyway" proxy suspects)
// @access  Private (organization)
// @query   from, to (ISO dates), missRateThreshold, minIssued
router.get('/report', auth, async (req, res) => {
  try {
    // Org-only: the non-response report exposes every colleague's compliance.
    if (!req.organization && !(req.user && req.user.role === 'organization')) {
      return res.status(403).json({ success: false, error: 'Organization access required' });
    }
    const organizationId = resolveOrgId(req);
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    const scope = await deptScopeIds(req);
    const report = await spotCheckService.getAnalytics(organizationId, {
      from: req.query.from,
      to: req.query.to,
      missRateThreshold: req.query.missRateThreshold,
      minIssued: req.query.minIssued,
      studentIds: scope || undefined,
    });
    return res.json(report);
  } catch (err) {
    console.error('[SpotCheck] report error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/spot-checks/student/:studentId
// @desc    One staff member's full spot-check timeline + stats (Admin/HOD drill-down)
// @access  Private (organization)
// @query   from, to (ISO dates)
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    // Org-only: the drill-down exposes a colleague's full compliance history.
    if (!req.organization && !(req.user && req.user.role === 'organization')) {
      return res.status(403).json({ success: false, error: 'Organization access required' });
    }
    const organizationId = resolveOrgId(req);
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    // HOD: may only drill into members of their own department.
    const scope = await deptScopeIds(req);
    if (scope && !scope.map(String).includes(String(req.params.studentId))) {
      return res
        .status(403)
        .json({ success: false, error: 'Staff member is outside your department' });
    }
    const result = await spotCheckService.getStudentHistory(
      organizationId,
      req.params.studentId,
      { from: req.query.from, to: req.query.to }
    );
    if (!result.success) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    console.error('[SpotCheck] student history error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/spot-checks/evaluate
// @desc    Manually close expired windows + recompute miss flags (also runs on cron)
// @access  Private (organization)
router.post('/evaluate', auth, async (req, res) => {
  try {
    if (!req.organization && !(req.user && req.user.role === 'organization')) {
      return res.status(403).json({ success: false, error: 'Organization token required' });
    }
    const result = await spotCheckService.evaluateExpired();
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[SpotCheck] evaluate error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/spot-checks/my
// @desc    The signed-in staff member's own spot-check history + stats
// @access  Private (student/staff)
router.get('/my', auth, async (req, res) => {
  try {
    if (!req.student) {
      return res.status(403).json({ success: false, error: 'Staff token required' });
    }
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - 90);

    const docs = await SpotCheck.find({ student: req.student._id, issuedAt: { $gte: since } })
      .sort({ issuedAt: -1 })
      .select('status issuedAt expiresAt respondedAt responseLatencyMs markedAfterMiss windowMinutes')
      .lean();

    // A still-"pending" check whose window has elapsed reads as "missed" to the user.
    const recent = docs.map((d) => {
      let status = d.status;
      if (status === 'pending' && d.expiresAt && new Date(d.expiresAt) < now) status = 'missed';
      return {
        id: d._id,
        status, // 'pending' | 'responded' | 'missed' | 'skipped'
        issuedAt: d.issuedAt,
        expiresAt: d.expiresAt,
        respondedAt: d.respondedAt || null,
        responseSec: d.responseLatencyMs ? Math.round(d.responseLatencyMs / 1000) : null,
        markedAfterMiss: !!d.markedAfterMiss,
      };
    });

    const total = recent.length;
    const responded = recent.filter((r) => r.status === 'responded').length;
    const missed = recent.filter((r) => r.status === 'missed').length;
    const pending = recent.filter((r) => r.status === 'pending').length;
    const decided = responded + missed;
    const rate = decided > 0 ? Math.round((responded / decided) * 100) : 0;

    // Current streak of consecutive responded checks (most recent first; skip pending).
    let streak = 0;
    for (const r of recent) {
      if (r.status === 'pending') continue;
      if (r.status === 'responded') streak += 1;
      else break;
    }

    const latencies = recent.filter((r) => r.status === 'responded' && r.responseSec).map((r) => r.responseSec);
    const avgResponseSec = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

    res.json({
      success: true,
      stats: { total, responded, missed, pending, rate, streak, avgResponseSec },
      recent: recent.slice(0, 40),
    });
  } catch (err) {
    console.error('[SpotCheck] my error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
