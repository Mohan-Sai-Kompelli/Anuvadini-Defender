const mongoose = require('mongoose');

// After office hours the employee can choose when their PC stops monitoring:
// "extend 30 minutes" or "until 6:00 PM". When endsAt passes, the PC pauses (screen, activity, webcam).
const defenderCheckoutScheduleSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    day: { type: String, required: true }, // YYYY-MM-DD in IST
    option: { type: String, enum: ['extend30', 'until1800', 'extend', 'until'], required: true },
    endsAt: { type: Date, required: true },
    setAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model('DefenderCheckoutSchedule', defenderCheckoutScheduleSchema);
