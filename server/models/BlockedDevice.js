const mongoose = require('mongoose');

/**
 * BlockedDevice
 * -------------
 * One record per time the mobile app's enterprise security gate (Feature 12)
 * BLOCKED access on a device — because a critical policy failed (Developer
 * Options / USB Debugging / ADB / root / emulator / integrity / hooking /
 * cloning). Surfaced in the Super-Admin dashboard under "Blocked Devices".
 *
 * The event may arrive BEFORE login (the gate runs at app start), so `student`
 * is optional; when the user had a valid session the token identifies them and
 * we denormalize the employee id/name for the report.
 */
const blockedDeviceSchema = new mongoose.Schema(
  {
    // Who — optional (block can happen pre-login).
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    employeeId: { type: String, default: '' },   // student.uid (denormalized)
    employeeName: { type: String, default: '' },

    // Device identity.
    deviceId: { type: String, index: true },      // Settings.Secure.ANDROID_ID
    deviceName: { type: String, default: '' },
    osVersion: { type: String, default: '' },
    platform: { type: String, default: 'android' },
    publicIp: { type: String, default: '' },      // resolved server-side from the request

    // Why.
    reasons: { type: [String], default: [] },        // machine keys, e.g. ['usbDebuggingEnabled']
    blockedBecause: { type: [String], default: [] }, // human labels for display
    riskScore: { type: Number, default: 0 },

    // Full raw signals object from the device (audit / forensics).
    signals: { type: mongoose.Schema.Types.Mixed, default: {} },

    // When the device reported the block (client clock) — createdAt is server time.
    reportedAt: { type: Date },
  },
  { timestamps: true }
);

blockedDeviceSchema.index({ createdAt: -1 });
blockedDeviceSchema.index({ organization: 1, createdAt: -1 });
blockedDeviceSchema.index({ deviceId: 1, createdAt: -1 });

module.exports = mongoose.model('BlockedDevice', blockedDeviceSchema);
