const mongoose = require('mongoose');

// Proof photo captured at request time (same base64 data-URL pattern as
// FieldRequest evidence — no separate file store needed).
const evidencePhotoSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    image: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const cheakoutRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    date: { type: Date, required: true },
    details: { type: String },
    evidence: { type: mongoose.Schema.Types.Mixed, default: [] },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    // Field name intentionally matches the spelling used across the codebase
    reson: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Model_cheakoutRequest', cheakoutRequestSchema);
