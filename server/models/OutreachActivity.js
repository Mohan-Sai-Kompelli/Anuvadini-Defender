const mongoose = require('mongoose');

// Health camp / community outreach activity with Admin approval workflow
// (Module 5 — Outreach Activity Documentation)
const outreachActivitySchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    type: { type: String, default: 'Health Camp' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD' (requested/planned date)
    location: { type: String, required: true }, // venue

    // Faculty's request details shown to the approving Admin/HOD.
    purpose: { type: String, default: '' },
    description: { type: String, default: '' },

    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'rejected', 'no_response', 'no_response_reviewed'],
      default: 'pending',
    },
    rejectionReason: { type: String },
    noResponseAt: { type: Date },
    noResponseReason: { type: String },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId },

    gpsPoints: { type: Number, default: 0 },
    photoCount: { type: Number, default: 0 },
    participants: { type: Number, default: 0 },
    // Base64 data-URI evidence photos (same shape as ClassCheckin).
    photos: [{ label: String, image: String }],
    evidenceHash: { type: String },
  },
  { timestamps: true }
);

outreachActivitySchema.index({ organization: 1, status: 1 });

module.exports = mongoose.model('OutreachActivity', outreachActivitySchema);
