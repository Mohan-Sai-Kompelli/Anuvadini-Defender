const mongoose = require('mongoose');

// One row per login / check-in / check-out, recording the public IP the action
// came from — the super-admin "IP Tracking" report reads this collection.
// `previousIp`/`ipChanged` are computed at write time against the employee's
// last known IP (Student.lastKnownIp) so the report can flag address changes
// without re-deriving history. Informational only — nothing is ever blocked.
const ipActivityLogSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },

    // Denormalized so the report survives a deleted student record.
    uid: { type: String },
    studentName: { type: String },

    event: { type: String, enum: ['login', 'in', 'out'], required: true },
    // Set for 'in'/'out' events; null for logins.
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null },

    publicIp: { type: String, default: null },
    previousIp: { type: String, default: null },
    ipChanged: { type: Boolean, default: false },

    // Device + network telemetry (client-reported, validated in
    // utils/deviceTelemetry.js). deviceChanged flags a different physical
    // phone than the employee's previous one — the case a same-WiFi public IP
    // can't catch. Strictly informational; a change is audited, never blocked.
    localIp: { type: String, default: null },
    networkType: { type: String, default: null },
    deviceId: { type: String, default: null },
    deviceModel: { type: String, default: null },
    manufacturer: { type: String, default: null },
    androidVersion: { type: String, default: null },
    deviceChanged: { type: Boolean, default: false },
    previousDeviceId: { type: String, default: null },
    previousDeviceModel: { type: String, default: null },
    previousDeviceManufacturer: { type: String, default: null },

    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ipActivityLogSchema.index({ student: 1, timestamp: -1 });
ipActivityLogSchema.index({ organization: 1, timestamp: -1 });
ipActivityLogSchema.index({ ipChanged: 1, timestamp: -1 });
ipActivityLogSchema.index({ deviceChanged: 1, timestamp: -1 });
ipActivityLogSchema.index({ event: 1 });

module.exports = mongoose.model('IpActivityLog', ipActivityLogSchema);
