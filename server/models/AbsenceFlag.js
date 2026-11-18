const mongoose = require('mongoose');

/**
 * AbsenceFlag — a staff member who, at the end of the check-in window, has NO
 * check-in, NO approved leave, and NO active WFH for the day → "Absent" without
 * approval. Surfaced to the Admin (SAACMS Module 4: "Unapproved absence → marked
 * 'Absent' in real time; Admin alerted").
 *
 * Distinct from approved leave / WFH, which are excluded by the detector — this
 * is the "clear distinction from unapproved absence" the proposal calls for.
 */
const absenceFlagSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    // The calendar day (midnight, local) this absence is for.
    date: { type: Date, required: true },
    reason: { type: String, default: 'no_checkin_no_leave' },
    notifiedHOI: { type: Boolean, default: false },
    // 'auto' (cron) or 'manual' (Admin ran the check)
    source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  },
  { timestamps: true }
);

// One flag per person per day (idempotent across repeated cron runs),
// scoped by organization for clean multi-tenant isolation.
absenceFlagSchema.index({ organization: 1, student: 1, date: 1 }, { unique: true });
absenceFlagSchema.index({ organization: 1, date: -1 });

module.exports = mongoose.model('AbsenceFlag', absenceFlagSchema);
