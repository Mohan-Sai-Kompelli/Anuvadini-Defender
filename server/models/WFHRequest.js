const mongoose = require('mongoose');

const wfhRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    reason: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    reviewedAt: { type: Date },
    // Kept as 'reson' to match existing field name used across the codebase
    reson: { type: String },
  },
  { timestamps: true }
);

// Inclusive day count between start and end dates
wfhRequestSchema.virtual('days').get(function () {
  if (!this.startDate || !this.endDate) return 0;
  return (
    Math.ceil(
      (new Date(this.endDate) - new Date(this.startDate)) /
        (1000 * 60 * 60 * 24)
    ) + 1
  );
});

wfhRequestSchema.set('toJSON', { virtuals: true });
wfhRequestSchema.set('toObject', { virtuals: true });

wfhRequestSchema.index({ student: 1, status: 1 });
wfhRequestSchema.index({ organization: 1, status: 1 });

module.exports = mongoose.model('WFHRequest', wfhRequestSchema);
