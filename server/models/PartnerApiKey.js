const mongoose = require('mongoose');

/**
 * A key for another server in the same organisation (for example the friend's server that runs the
 * Work PC pairing screen). Only a hash of the key is stored; the key itself is shown once, when created.
 */
const partnerApiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true, unique: true, index: true },
    scopes: { type: [String], default: ['pairing', 'attendance_status'] },
    rateLimitPerMin: { type: Number, default: 300 },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.PartnerApiKey || mongoose.model('PartnerApiKey', partnerApiKeySchema);
