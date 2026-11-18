const mongoose = require('mongoose');

// Scoped partner API key for Anuvadini integrations (Module 6)
const apiKeySchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true },
    scope: { type: String, default: 'aggregate:read' },
    rateLimit: { type: String, default: '300 req/h' },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiKey', apiKeySchema);
