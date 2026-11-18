const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * AuditLog — append-only, tamper-evident record of sensitive actions.
 *
 * Required by the proposal ("tamper-proof, server-generated" reports + audit
 * trails) and DPDP Act 2023. Written for: face-verification attempts (pass/fail
 * + score), liveness verdicts, attendance marks, spot-check misses, org logins,
 * and approvals. There are intentionally NO update/delete paths (immutability).
 *
 * Tamper-evidence: each row carries an HMAC-SHA256 `hash` over its canonical
 * content, keyed by a server-side secret (AUDIT_HMAC_SECRET / JWT_SECRET). An
 * attacker who edits a row in the DB cannot forge a matching hash without the
 * secret, so silent edits are detectable. (A cross-row hash-chain for
 * delete/reorder detection is a documented follow-up — SAACMS_MASTER_PLAN.md §9.)
 */
const AUDIT_SECRET =
  process.env.AUDIT_HMAC_SECRET || process.env.JWT_SECRET || '';
const auditLogSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },

    // Who performed it.
    actorType: { type: String, enum: ['student', 'organization', 'system'], default: 'system' },
    actor: { type: mongoose.Schema.Types.ObjectId }, // student/org id (or null for system)
    actorLabel: { type: String }, // human label snapshot (name/uid/email)

    // What happened.
    action: { type: String, required: true }, // e.g. 'attendance.face_verify'
    outcome: { type: String, enum: ['success', 'failure', 'flagged', 'info'], default: 'info' },

    // What it was about.
    targetType: { type: String }, // 'attendance' | 'spot_check' | 'auth' | 'leave' ...
    target: { type: mongoose.Schema.Types.ObjectId },

    // Free-form, non-sensitive details (scores, reasons, distances — never raw biometrics).
    metadata: { type: mongoose.Schema.Types.Mixed },

    ip: { type: String },
    at: { type: Date, default: Date.now },

    // Integrity hash over the canonical content (set in pre-validate).
    hash: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ organization: 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ actor: 1, at: -1 });

/** Keyed (HMAC) content hash — not forgeable without the server secret. */
function computeHash(doc) {
  const canonical = JSON.stringify({
    organization: doc.organization ? String(doc.organization) : null,
    actorType: doc.actorType,
    actor: doc.actor ? String(doc.actor) : null,
    action: doc.action,
    outcome: doc.outcome,
    targetType: doc.targetType || null,
    target: doc.target ? String(doc.target) : null,
    metadata: doc.metadata || null,
    at: doc.at ? new Date(doc.at).toISOString() : null,
  });
  return crypto.createHmac('sha256', AUDIT_SECRET).update(canonical).digest('hex');
}

auditLogSchema.pre('validate', function (next) {
  if (!this.hash) this.hash = computeHash(this);
  next();
});

/** Verify a row has not been altered since it was written. */
auditLogSchema.methods.verifyIntegrity = function () {
  return this.hash === computeHash(this);
};

auditLogSchema.statics.computeHash = computeHash;

module.exports = mongoose.model('AuditLog', auditLogSchema);
