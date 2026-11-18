const mongoose = require('mongoose');

/**
 * SecurityEvent
 * -------------
 * Unified fraud/security telemetry record for the biometric pipeline —
 * enrollment-time image screening, repeated-attempt lockouts, spoof/liveness
 * rejections, and camera/device-integrity failures all write here, so the
 * super-admin has ONE place to review "what did the fraud pipeline catch"
 * instead of piecing it together from SpoofAttempt + AuditLog + FaceReport.
 *
 * This is strictly an ADMIN-FACING record. Nothing in this schema, and no
 * field of it, is ever returned to the mobile client — see
 * services/securityEventService.js, which is the only writer, and the
 * attendance/enrollment routes, which never echo its contents back to the
 * requester (the employee-facing response stays a generic
 * "verification could not be completed" regardless of category/severity).
 */
const securityEventSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    // Denormalized so the event still renders if the student is later removed.
    uid: { type: String },
    studentName: { type: String },

    category: {
      type: String,
      enum: [
        'enrollment_spoof_suspected', // enrollment image(s) PAD-flagged fake
        'enrollment_quality_rejected', // enrollment image(s) unusable (dark/blurry/no-face) — NOT a fraud signal
        'verification_spoof', // confirmed PAD fake at attendance time
        'verification_uncertain', // borderline PAD verdict at attendance time
        'verification_attempt_lockout', // 10-attempt cap reached for a check-in/check-out session
        'liveness_failed', // liveness challenge adjudication failed
        'camera_integrity', // injection-risk / device-attestation gate
        'face_mismatch_pattern', // repeated non-spoof mismatches (possible impostor probing)
      ],
      required: true,
      index: true,
    },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },

    // The policy action actually APPLIED by securityEventService, after the
    // configurable fraudMonitoring mode was taken into account (see
    // config/featureFlags.js). 'block' means the underlying request was
    // rejected; 'monitor'/'warn'/'escalate' all mean the request was allowed
    // to proceed (or was already being rejected for an unrelated reason) and
    // this event exists purely for visibility.
    action: { type: String, enum: ['monitor', 'warn', 'escalate', 'block'], default: 'monitor' },

    // Which attendance action this relates to, when applicable.
    sessionType: { type: String, enum: ['in', 'out', null], default: null },
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null },

    detection: {
      faceMatchConfidence: { type: Number, default: null },
      spoofConfidence: { type: Number, default: null },
      spoofLabel: { type: String, default: null },
      livenessPassed: { type: Boolean, default: null },
      riskScore: { type: Number, default: null }, // fused 0-100 score at decision time
      signals: [{ type: String }], // machine-readable tokens, e.g. ['pad_fake','attempt_cap_reached']
    },

    device: {
      deviceId: { type: String, default: null },
      deviceModel: { type: String, default: null },
      manufacturer: { type: String, default: null },
      publicIp: { type: String, default: null },
    },

    // Evidence image, base64 data-URL — same convention as SpoofAttempt/Attendance.
    evidenceImage: { type: String, default: null },

    sessionId: { type: String, default: null },

    resolved: { type: Boolean, default: false },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    adminNotes: { type: String, default: null },
  },
  { timestamps: true }
);

securityEventSchema.index({ organization: 1, createdAt: -1 });
securityEventSchema.index({ student: 1, createdAt: -1 });
securityEventSchema.index({ category: 1, createdAt: -1 });
securityEventSchema.index({ resolved: 1, severity: 1 });

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
