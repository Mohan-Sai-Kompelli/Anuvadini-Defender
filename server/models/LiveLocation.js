const mongoose = require('mongoose');

// Latest known live position for a staff member (one document per student).
// Written by the mobile app during a tracking window (check-in → end of working
// hours) and read by the Admin/HOD live map. We keep only the LATEST point — this
// is a presence map, not a breadcrumb trail — so updates are an upsert.
const liveLocationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true,
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    // Denormalised from Student so the HOD map can filter by department without
    // a join on every poll.
    department: { type: String, default: '' },

    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    heading: { type: Number },
    speed: { type: Number },

    // Is the device currently expected to be streaming? Set true on check-in /
    // share start, false on checkout / explicit stop / logout.
    active: { type: Boolean, default: false, index: true },
    // Auto-stop time for the tracking window (end of working hours). The map
    // treats a point past this as stale even if `active` was never cleared
    // (e.g. the app was killed without logging out).
    trackUntil: { type: Date },
    startedAt: { type: Date },
    stoppedAt: { type: Date },
    // Last status reported by the client: 'tracking' | 'stopped' | 'logged_out'.
    lastStatus: { type: String, default: '' },
    // Timestamp of the last GPS fix received (distinct from updatedAt, which also
    // bumps on status-only writes).
    lastFixAt: { type: Date },

    // ── Geofence / premises state ──
    // Is the latest fix inside the premises geofence? null = unknown (no org coords).
    insidePremises: { type: Boolean, default: null },
    // Distance (metres) from the premises centre at the latest fix.
    distanceM: { type: Number },
    // When they last crossed OUT of the premises (open breach). null when inside.
    outsideSince: { type: Date, default: null },
    lastBreachAt: { type: Date },
    // Counts consecutive hard-refresh outside fixes during exit verification.
    // Reset to 0 on confirmed exit or on any inside fix.
    exitVerifyCount: { type: Number, default: 0 },

    // ── Per-day stats (reset when statsDate rolls over) ──
    statsDate: { type: String, default: '' }, // 'YYYY-MM-DD' the stats below belong to
    breachCountToday: { type: Number, default: 0 }, // times they left the premises today
    outsideSecondsToday: { type: Number, default: 0 }, // accumulated CLOSED outside intervals
    distanceTraveledM: { type: Number, default: 0 }, // path length walked today
  },
  { timestamps: true }
);

liveLocationSchema.index({ organization: 1, active: 1 });

module.exports = mongoose.model('LiveLocation', liveLocationSchema);
