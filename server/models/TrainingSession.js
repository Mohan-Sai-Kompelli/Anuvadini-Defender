const mongoose = require('mongoose');

// Scheduled training session (Module 8 — Training & Support)
const trainingSessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    mode: { type: String, default: 'Online (Meet)' },
    seatsTotal: { type: Number, default: 30 },
    seatsTaken: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingSession', trainingSessionSchema);
