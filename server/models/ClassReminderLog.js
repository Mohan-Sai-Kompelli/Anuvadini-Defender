const mongoose = require('mongoose');

// Dedupe ledger for automatic pre-class reminders. One row per (timetable slot,
// calendar date) guarantees a slot's faculty is reminded at most once per day,
// even if the minute-cron fires twice or the server restarts. Rows self-expire
// after 2 days via a TTL index so this never grows unbounded.
const classReminderLogSchema = new mongoose.Schema({
  timetable: { type: mongoose.Schema.Types.ObjectId, ref: 'Timetable', required: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD' in IST
  sentAt: { type: Date, default: Date.now },
});

classReminderLogSchema.index({ timetable: 1, date: 1 }, { unique: true });
classReminderLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

module.exports = mongoose.model('ClassReminderLog', classReminderLogSchema);
