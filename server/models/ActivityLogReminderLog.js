const mongoose = require('mongoose');

// Dedupe ledger for "you didn't log your class" reminders — at most one
// per (kind, ref=timetable, date). TTL-expires after 2 days.
const activityLogReminderLogSchema = new mongoose.Schema({
  kind: { type: String, enum: ['class'], required: true },
  ref: { type: mongoose.Schema.Types.ObjectId, required: true }, // Timetable id
  date: { type: String, required: true }, // 'YYYY-MM-DD' (IST)
  sentAt: { type: Date, default: Date.now },
});

activityLogReminderLogSchema.index({ kind: 1, ref: 1, date: 1 }, { unique: true });
activityLogReminderLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

module.exports = mongoose.model('ActivityLogReminderLog', activityLogReminderLogSchema);
