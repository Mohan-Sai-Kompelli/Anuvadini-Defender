const mongoose = require('mongoose');

// Weekly recurring academic timetable slot (Module 2 — Academic Activity Tracking)
const timetableSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    subject: { type: String, required: true, trim: true },
    // Academic batch / year this slot belongs to, e.g. '2025-2026'. Lets the
    // timetable page show the schedule per academic year.
    academicYear: { type: String, default: '', index: true },
    // Optional human label for the teaching faculty as printed on the official
    // timetable (e.g. 'Dr Gajanan C (Lecturer)') — shown alongside the mapped
    // staff member.
    facultyLabel: { type: String, default: '' },
    type: {
      type: String,
      enum: ['lecture', 'practical', 'clinical', 'activity'],
      default: 'lecture',
    },
    // 0 = Monday … 5 = Saturday
    day: { type: Number, min: 0, max: 6, required: true },
    start: { type: String, required: true }, // 'HH:MM'
    end: { type: String, required: true }, // 'HH:MM'
    room: { type: String, trim: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

timetableSchema.index({ organization: 1, day: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);
