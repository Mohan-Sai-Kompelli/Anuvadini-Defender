const mongoose = require('mongoose');

/**
 * SpotCheck
 * ----------
 * A single random attendance-verification prompt issued to one staff member
 * (the schema calls them "student" but in SAACMS these are faculty/doctors/staff).
 *
 * A "round" is a batch of spot-checks issued together (same `roundId`). The
 * non-response analytics in spotCheckService aggregates these records to find
 * who is regularly ignoring spot-checks, who missed a live check but still
 * marked normal attendance that day (proxy suspects), miss streaks, etc.
 */
const spotCheckSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },

    // Groups every spot-check issued in the same batch.
    roundId: { type: String, required: true },

    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    windowMinutes: { type: Number, default: 15 },

    // pending  -> issued, window still open, awaiting response
    // responded-> staff completed the live verification in time
    // missed   -> window closed with no valid response
    // skipped  -> not counted against the user (on approved leave / WFH / holiday)
    status: {
      type: String,
      enum: ['pending', 'responded', 'missed', 'skipped'],
      default: 'pending',
    },

    // --- response details (set when status -> responded) ---
    respondedAt: { type: Date },
    responseLatencyMs: { type: Number },
    responseLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    distance: { type: Number },
    faceVerified: { type: Boolean, default: false },
    verificationScore: { type: Number },
    livenessVerdict: { type: mongoose.Schema.Types.Mixed },
    attendanceRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' },
    // The live face captured when the staff member answered this spot-check
    // (base64 / data-URL, same convention as Attendance.faceImage). Kept so the
    // super-admin face-capture gallery can show the actual spot-check selfie.
    faceImage: { type: String, default: null },
    // Device/camera attestation + server-scored injection/deepfake risk.
    attestation: { type: mongoose.Schema.Types.Mixed },
    injectionRisk: { type: mongoose.Schema.Types.Mixed },

    // --- pattern flags (computed at evaluation time) ---
    // Did this person have a normal check-in on the spot-check day?
    hadAttendanceThatDay: { type: Boolean, default: false },
    // Missed the live spot-check yet still has a regular attendance mark that
    // day -> "marked attendance but dodged the live check" (proxy suspect).
    markedAfterMiss: { type: Boolean, default: false },

    // Why it ended up skipped (on_leave / wfh / holiday) or missed (no_response).
    reason: { type: String },

    // --- delivery bookkeeping ---
    notificationSent: { type: Boolean, default: false },
    notificationResult: { type: mongoose.Schema.Types.Mixed },

    // Who/what triggered the round.
    triggeredBy: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'auto',
    },
  },
  { timestamps: true }
);

// Hot paths: per-org reporting, per-user history, round lookups, expiry sweeps.
spotCheckSchema.index({ organization: 1, issuedAt: -1 });
spotCheckSchema.index({ student: 1, issuedAt: -1 });
spotCheckSchema.index({ roundId: 1 });
spotCheckSchema.index({ status: 1, expiresAt: 1 });

// Convenience: is the response window still open right now?
spotCheckSchema.methods.isOpen = function () {
  return this.status === 'pending' && new Date() <= new Date(this.expiresAt);
};

module.exports = mongoose.model('SpotCheck', spotCheckSchema);
