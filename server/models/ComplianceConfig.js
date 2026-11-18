const mongoose = require('mongoose');

// Singleton configuration for the checkout-compliance rules, editable by the
// Anuvadini Super Admin from the Attendance Compliance → Settings tab.
// Defaults implement "5 missed checkouts in 30 days = High Risk".
const complianceConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },

    // Missed checkouts (within the window) at which each level triggers.
    warnMissedCount: { type: Number, default: 3, min: 1 },
    highMissedCount: { type: Number, default: 5, min: 1 },
    // Rolling analysis window in days (completed days only).
    windowDays: { type: Number, default: 30, min: 7, max: 365 },
    // When true, a NEW high-risk red flag auto-generates a memo (as 'pending'
    // for super-admin review); when false, memos are issued manually only.
    autoIssueMemo: { type: Boolean, default: false },

    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

complianceConfigSchema.statics.get = async function () {
  return (
    (await this.findOne({ key: 'default' })) ||
    (await this.create({ key: 'default' }))
  );
};

module.exports = mongoose.model('ComplianceConfig', complianceConfigSchema);
