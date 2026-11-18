const mongoose = require('mongoose');

// A boundary-crossing event: a staff member left ('exit') or re-entered ('enter')
// the premises geofence. Powers the Admin/HOD alerts feed. TTL: 7 days.
const geofenceAlertSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  department: { type: String, default: '' },
  type: { type: String, enum: ['exit', 'enter'], required: true },
  latitude: { type: Number },
  longitude: { type: Number },
  distanceM: { type: Number }, // how far outside the premises centre
  at: { type: Date, default: Date.now },
});

geofenceAlertSchema.index({ organization: 1, at: -1 });
geofenceAlertSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

module.exports = mongoose.model('GeofenceAlert', geofenceAlertSchema);
