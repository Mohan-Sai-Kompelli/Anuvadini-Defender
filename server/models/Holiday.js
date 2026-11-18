const mongoose = require('mongoose');

// Government / gazetted holiday. Global (no organization) rows apply to all;
// an organization can also add its own.
const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    name: { type: String, required: true, trim: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },
  },
  { timestamps: true }
);

holidaySchema.index({ date: 1, organization: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', holidaySchema);
