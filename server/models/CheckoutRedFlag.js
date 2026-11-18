const mongoose = require('mongoose');

// A compliance red flag: raised automatically when an employee's missed
// checkouts cross the configured thresholds. Permanent history — rows are
// never deleted; the analysis updates the student's ACTIVE flag in place
// (counts/dates/risk) and resolution closes it, so one flag row documents one
// continuous episode of non-compliance from detection to resolution.
const remarkSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    by: { type: String, default: 'Anuvadini Super Admin' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const checkoutRedFlagSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },

    // Snapshots so the flag reads complete even if the student changes/leaves.
    studentName: { type: String, default: null },
    uid: { type: String, default: null },
    department: { type: String, default: null },
    designation: { type: String, default: null },
    organizationName: { type: String, default: null },

    // The violation picture at last analysis.
    windowDays: { type: Number, default: 30 },
    totalCheckIns: { type: Number, default: 0 },
    missedCount: { type: Number, default: 0 },
    missedPct: { type: Number, default: 0 },
    frequencyPerWeek: { type: Number, default: 0 }, // missedCount / (windowDays/7)
    violationDates: [{ type: String }],             // 'YYYY-MM-DD'
    lastIncidentDate: { type: String, default: null },

    riskLevel: { type: String, enum: ['warning', 'high'], required: true },
    // 0–100 composite: how many misses + how big a share of workdays they are.
    riskScore: { type: Number, default: 0 },
    reason: { type: String, default: 'Repeated Missing Checkout Attendance' },

    status: { type: String, enum: ['active', 'memo_issued', 'resolved'], default: 'active' },
    remarks: [remarkSchema],
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
    resolutionNote: { type: String, default: null },
  },
  { timestamps: true }
);

checkoutRedFlagSchema.index({ student: 1, status: 1 });
checkoutRedFlagSchema.index({ status: 1, riskLevel: 1, updatedAt: -1 });
checkoutRedFlagSchema.index({ organization: 1, status: 1 });

module.exports = mongoose.model('CheckoutRedFlag', checkoutRedFlagSchema);
