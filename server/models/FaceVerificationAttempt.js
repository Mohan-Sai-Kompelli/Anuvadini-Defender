const mongoose = require('mongoose');

const faceVerificationAttemptSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    success: { type: Boolean, required: true },
    reason: { type: String, default: null },
    similarity: { type: Number, default: null },
    padLabel: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
    // Which attendance session this attempt counts against — check-in and
    // check-out each get their own independent 10-attempt cap for the day
    // (see services/attemptLimiter.js). Older rows predate this field and are
    // simply excluded from the per-type count (attemptLimiter only counts
    // rows that have `type` set), so nothing breaks for historical data.
    type: { type: String, enum: ['in', 'out'], default: null },
  },
  { timestamps: true }
);

faceVerificationAttemptSchema.index({ student: 1, createdAt: -1 });
faceVerificationAttemptSchema.index({ student: 1, type: 1, createdAt: -1 });
faceVerificationAttemptSchema.index({ lockedUntil: 1 });

module.exports = mongoose.model('FaceVerificationAttempt', faceVerificationAttemptSchema);
