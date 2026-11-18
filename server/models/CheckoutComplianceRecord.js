const mongoose = require('mongoose');

// Latest checkout-compliance snapshot per employee — one row per student,
// upserted by every analysis run (services/checkoutComplianceService.js).
// Feeds the super-admin "Attendance Compliance" table and overview cards.
// History is NOT kept here (this row is the current state); red flags, memos
// and notifications are the permanent, never-overwritten history trail.
const checkoutComplianceRecordSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },

    // Denormalized for fast table rendering + surviving deleted students.
    studentName: { type: String, default: null },
    uid: { type: String, default: null },
    department: { type: String, default: null },
    designation: { type: String, default: null },

    // Analysis window (completed days only — today is never counted since the
    // checkout may still be coming).
    windowDays: { type: Number, default: 30 },
    totalCheckIns: { type: Number, default: 0 },      // days with a check-in
    missedCheckouts: { type: Number, default: 0 },    // of those, days with NO checkout
    missedPct: { type: Number, default: 0 },          // missedCheckouts / totalCheckIns * 100
    missedDates: [{ type: String }],                  // 'YYYY-MM-DD' of each violation
    lastMissedDate: { type: String, default: null },

    riskLevel: { type: String, enum: ['normal', 'warning', 'high'], default: 'normal' },
    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

checkoutComplianceRecordSchema.index({ organization: 1, riskLevel: 1 });
checkoutComplianceRecordSchema.index({ riskLevel: 1, missedCheckouts: -1 });
checkoutComplianceRecordSchema.index({ studentName: 'text', uid: 'text' });

module.exports = mongoose.model('CheckoutComplianceRecord', checkoutComplianceRecordSchema);
