const mongoose = require('mongoose');

// In-app notifications for the Anuvadini Super Admin from the checkout-compliance
// system: a red flag was raised/escalated, or a memo was issued. Permanent
// history — rows are marked read, never deleted.
const complianceNotificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['red_flag', 'red_flag_escalated', 'memo_pending', 'memo_issued'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    riskLevel: { type: String, enum: [null, 'warning', 'high'], default: null },
    actionRequired: { type: String, default: null },

    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    studentName: { type: String, default: null },
    uid: { type: String, default: null },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    organizationName: { type: String, default: null },
    redFlag: { type: mongoose.Schema.Types.ObjectId, ref: 'CheckoutRedFlag', default: null },
    memo: { type: mongoose.Schema.Types.ObjectId, ref: 'ComplianceMemo', default: null },

    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

complianceNotificationSchema.index({ read: 1, createdAt: -1 });

module.exports = mongoose.model('ComplianceNotification', complianceNotificationSchema);
