const mongoose = require('mongoose');

/**
 * One row per employee per IST day: the 5:30 PM "extend or check out" reminder cycle
 * for their Work PC. `seq` goes up with every reminder so the phone and the PC agent
 * can tell a new reminder from one they already showed.
 */
const defenderOvertimeSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, index: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    seq: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    resolved: { type: Boolean, default: false },
    // extended | checked_out | exe_checkout | auto_disconnected
    resolvedReason: { type: String, default: '' },
    disconnectedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

defenderOvertimeSchema.index({ uid: 1, day: 1 }, { unique: true });

module.exports = mongoose.models.DefenderOvertime || mongoose.model('DefenderOvertime', defenderOvertimeSchema);
