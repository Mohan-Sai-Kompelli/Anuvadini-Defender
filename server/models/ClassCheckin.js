const mongoose = require('mongoose');

// One conducted (or attempted) class against a timetable slot on a given date.
// Evidence: geo-tagged photos, faculty note, GPS fix — uploaded from the app.
const classCheckinSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    timetable: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Timetable',
      required: true,
      index: true,
    },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD'

    actualStart: { type: String }, // 'HH:MM'
    actualEnd: { type: String },
    status: {
      type: String,
      enum: ['ongoing', 'conducted', 'deviation', 'missed'],
      default: 'ongoing',
    },

    note: { type: String },
    headcount: { type: Number },

    geo: {
      latitude: { type: Number },
      longitude: { type: Number },
      accuracy: { type: Number },
      distanceM: { type: Number },
      verified: { type: Boolean, default: false },
      place: { type: String },
    },
    faceVerified: { type: Boolean, default: false },

    // [{ label, image }] — image is a data URI / S3 ref
    photos: [
      {
        label: { type: String },
        image: { type: String },
      },
    ],
    evidenceHash: { type: String },
  },
  { timestamps: true }
);

classCheckinSchema.index({ organization: 1, date: 1 });
classCheckinSchema.index({ timetable: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ClassCheckin', classCheckinSchema);
