const mongoose = require('mongoose');

const attendanceNoteSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    date: { type: Date, required: true },
    note: { type: String, maxlength: 500 },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  },
  { timestamps: true }
);

attendanceNoteSchema.index({ student: 1, date: 1 });

module.exports = mongoose.model('AttendanceNote', attendanceNoteSchema);
