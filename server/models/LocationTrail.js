const mongoose = require('mongoose');

/**
 * LocationTrail — GPS breadcrumbs. One doc per background/live-location ping, so a
 * day's check-in→check-out movement can be replayed on a map (the Admin/HOD portal
 * renders them as a polyline). The portal queries it by student + time window (the
 * window is derived from that day's check-in / check-out Attendance timestamps) or
 * by organization + day. Auto-expires via TTL to keep the collection bounded.
 */
const locationTrailSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    date: { type: String, index: true }, // 'YYYY-MM-DD' (local) for fast day queries

    latitude: { type: Number, required: true },   // Kalman-smoothed
    longitude: { type: Number, required: true },  // Kalman-smoothed
    rawLatitude: { type: Number },                // original GPS (pre-filter)
    rawLongitude: { type: Number },               // original GPS (pre-filter)
    kalmanGain: { type: Number },                 // 0–1; low = GPS was distrusted
    accuracy: { type: Number },
    heading: { type: Number },
    speed: { type: Number },
    insidePremises: { type: Boolean },
    distanceM: { type: Number }, // distance from premises centre at this fix

    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Fast "this person's trail, newest first" + time-window queries.
locationTrailSchema.index({ student: 1, at: -1 });
// Per-organization day queries.
locationTrailSchema.index({ organization: 1, date: 1 });
// TTL: drop breadcrumbs older than 14 days.
locationTrailSchema.index({ at: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

module.exports = mongoose.model('LocationTrail', locationTrailSchema);
