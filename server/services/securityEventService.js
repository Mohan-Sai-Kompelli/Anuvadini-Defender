const SecurityEvent = require('../models/SecurityEvent');
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const emailService = require('./emailService');
const audit = require('./auditService');
const flags = require('../config/featureFlags');
const faceStorageService = require('./faceStorageService');

/**
 * securityEventService — the ONE place that decides what happens when any
 * detector in the biometric pipeline (enrollment screening, PAD, liveness,
 * the attempt-limiter, injection-risk) flags something.
 *
 * Every detector keeps its own logic untouched; it only calls `record()` with
 * what it found and what it would NATURALLY like to happen (`desiredAction`).
 * This service:
 *   1. ALWAYS persists a SecurityEvent (the audit trail exists regardless of
 *      the configured mode — "monitor" still means "record everything").
 *   2. ALWAYS bumps the student's cumulative risk score for medium+ severity.
 *   3. Caps the desired action at the org-wide `fraudMonitoring.mode` ceiling
 *      (config/featureFlags.js) — e.g. if the mode is 'monitor', a confirmed
 *      spoof is still recorded at severity 'critical' but the effective
 *      action is downgraded to 'monitor', so the CALLER (attendance.js) must
 *      not block the request. In 'block' mode (the default) the detector's
 *      own desiredAction passes through unchanged.
 *   4. Notifies the super admin by email for 'escalate'/'block' actions.
 *
 * Nothing here is ever exposed to the mobile client. Callers must NOT forward
 * any field of the returned object to the employee-facing response — only
 * use `effectiveAction === 'block'` to decide whether to reject the request,
 * and always reject with a generic message (never this event's details).
 */

const ACTION_RANK = { monitor: 0, warn: 1, escalate: 2, block: 3 };

function capAction(desiredAction) {
  const ceiling = flags.fraudMonitoring.mode;
  const desired = ACTION_RANK[desiredAction] ?? ACTION_RANK.monitor;
  const cap = ACTION_RANK[ceiling] ?? ACTION_RANK.block;
  const effectiveRank = Math.min(desired, cap);
  return Object.keys(ACTION_RANK).find((k) => ACTION_RANK[k] === effectiveRank) || 'monitor';
}

// How much a single event of this severity bumps the student's cumulative
// risk score. Low-severity (pure quality issues) never move the score.
const RISK_INCREMENT = { low: 0, medium: 8, high: 20, critical: 40 };

/**
 * @param {Object} e
 *   category      SecurityEvent.category (required)
 *   severity      'low'|'medium'|'high'|'critical' (default 'medium')
 *   desiredAction what the detector itself would do absent any global cap
 *                 (default matches severity: low/medium->monitor, high->escalate, critical->block)
 *   student       Mongoose Student doc or plain {_id, uid, fullName, organization}
 *   sessionType   'in'|'out'|null
 *   attendanceId  ObjectId, optional
 *   detection     { faceMatchConfidence, spoofConfidence, spoofLabel, livenessPassed, riskScore, signals[] }
 *   device        { deviceId, deviceModel, manufacturer, publicIp }
 *   evidenceImage base64/data-URL/Buffer, optional
 *   sessionId     string, optional
 *   summaryForAdmin  short human sentence for the email alert (admin-only)
 * @returns {Promise<{effectiveAction, event}>}
 */
async function record(e) {
  const severity = e.severity || 'medium';
  const desiredAction =
    e.desiredAction ||
    (severity === 'critical' ? 'block' : severity === 'high' ? 'escalate' : severity === 'medium' ? 'warn' : 'monitor');
  const effectiveAction = capAction(desiredAction);

  let event = null;
  try {
    event = await SecurityEvent.create({
      organization: e.student?.organization || e.organization || null,
      student: e.student?._id || e.student || null,
      uid: e.student?.uid || e.uid || null,
      studentName: e.student?.fullName || e.student?.name || e.studentName || null,
      category: e.category,
      severity,
      action: effectiveAction,
      sessionType: e.sessionType || null,
      attendanceId: e.attendanceId || null,
      detection: e.detection || {},
      device: e.device || {},
      evidenceImage: await normalizeImage(e.evidenceImage),
      sessionId: e.sessionId || null,
    });
  } catch (err) {
    console.error('[securityEventService] failed to persist SecurityEvent:', err.message);
  }

  // Bump the student's cumulative risk score (best-effort, never blocks).
  const inc = RISK_INCREMENT[severity] || 0;
  if (inc > 0 && (e.student?._id || e.student)) {
    try {
      await Student.updateOne(
        { _id: e.student?._id || e.student },
        { $inc: { riskScore: inc }, $set: { lastSecurityEventAt: new Date() } }
      );
    } catch (err) {
      console.error('[securityEventService] failed to bump risk score:', err.message);
    }
  }

  // Audit trail entry too (searchable alongside every other audit action).
  audit.log({
    organization: e.student?.organization || e.organization || null,
    actorType: 'system',
    action: `security.${e.category}`,
    outcome: effectiveAction === 'block' ? 'failure' : 'flagged',
    targetType: 'student',
    target: e.student?._id || e.student || null,
    metadata: { severity, effectiveAction, desiredAction, signals: e.detection?.signals || [] },
  });

  // Notify the super admin for escalate/block — fire-and-forget, never blocks
  // the caller. Rank-based so 'block' also notifies (it's >= 'escalate').
  // Callers that already send their own richer alert for this category (e.g.
  // attendance.js reuses the nicer sendSpoofAlert template for confirmed
  // spoof) pass skipAutoNotify so the admin doesn't get two emails for one
  // event — they read `effectiveAction` themselves to decide whether to fire
  // their own notification.
  if (!e.skipAutoNotify && ACTION_RANK[effectiveAction] >= ACTION_RANK.escalate) {
    (async () => {
      try {
        let organizationName = null;
        const orgId = e.student?.organization || e.organization;
        if (orgId) {
          const org = await Organization.findById(orgId).select('name').lean();
          organizationName = org?.name || null;
        }
        await emailService.sendSecurityAlert({
          category: e.category,
          severity,
          student: {
            fullName: e.student?.fullName || e.student?.name || e.studentName,
            uid: e.student?.uid || e.uid,
            organizationName,
          },
          summary: e.summaryForAdmin || null,
          detection: e.detection || {},
          image: e.evidenceImage,
        });
      } catch (err) {
        console.error('[securityEventService] alert email failed:', err.message);
      }
    })();
  }

  return { effectiveAction, event };
}

// Stored INLINE in MongoDB (SecurityEvent.evidenceImage, a String field) —
// same bloat concern as SpoofAttempt.faceImage, so the same compression
// applies before it ever reaches the DB. Falls back to the uncompressed
// data-URL if compression fails for any reason (never lose the evidence).
async function normalizeImage(img) {
  if (!img) return null;
  const compressed = await faceStorageService.compressToBase64DataUrl(img);
  if (compressed) return compressed;
  if (Buffer.isBuffer(img)) return `data:image/jpeg;base64,${img.toString('base64')}`;
  if (typeof img === 'string') return img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
  return null;
}

/**
 * Convenience wrapper for the enrollment flow (students.js x2, portal.js):
 * given the `security` object face-back/check.py's /create-embedding now
 * returns (see faceVerifyService.enroll()), record a SecurityEvent when any
 * uploaded image was PAD-flagged as a suspected spoof. No-op (returns null)
 * when nothing was flagged, so callers can invoke this unconditionally after
 * every successful enrollment/re-enrollment without an extra `if`.
 *
 * Enrollment already excluded the flagged image(s) from the embedding by the
 * time this runs (the embedding was built only from usable images) — this
 * call is purely for admin visibility + risk scoring, it does not itself
 * undo an enrollment that already succeeded with the remaining good images.
 */
async function recordEnrollmentScreening({ student, organization, uid, studentName, security, evidenceImage }) {
  if (!security || !security.flagged) return null;
  const spoofCount = security.spoofCount || 0;
  const usableCount = security.usableCount || 0;
  const perImage = Array.isArray(security.perImage) ? security.perImage : [];
  const signals = perImage
    .filter((p) => p.status === 'spoof_suspected')
    .map((p) => `pad_fake_score_${typeof p.score === 'number' ? p.score.toFixed(3) : 'na'}`);

  return record({
    category: 'enrollment_spoof_suspected',
    severity: usableCount === 0 ? 'critical' : 'high',
    student,
    organization,
    uid,
    studentName,
    detection: { signals },
    evidenceImage: evidenceImage || null,
    summaryForAdmin: `${spoofCount} of ${perImage.length} enrollment image(s) were flagged by anti-spoof screening and excluded from the reference embedding; ${usableCount} usable image(s) were used.`,
  });
}

module.exports = { record, recordEnrollmentScreening, capAction, ACTION_RANK };
