const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },

    // 'leave' = auto-generated "On Approved Leave" day (not a physical in/out).
    type: { type: String, enum: ['in', 'out', 'leave'], required: true },
    timestamp: { type: Date, default: Date.now },

    latitude: { type: Number },
    longitude: { type: Number },
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    distance: { type: Number },

    // Which campus premises this mark was made at (Anuvadini / NETF / IUAC share
    // offices — a member of any may mark at any of the three). Resolved to the
    // nearest campus office at mark time so history can show "checked in from
    // IUAC" etc. `name` is the canonical campus label; `officeName` is the raw
    // location name. Absent on non-campus marks and on records written before
    // this feature (backward compatible).
    markedOffice: {
      name: { type: String, default: null },       // 'Anuvadini' | 'NETF' | 'IUAC'
      officeName: { type: String, default: null }, // raw office/location name
      orgId: { type: mongoose.Schema.Types.ObjectId },
      distance: { type: Number },                  // metres to that office
      withinRange: { type: Boolean },
    },

    faceVerified: { type: Boolean, default: false },
    faceImage: { type: String, default: null },
    palmImagePath: { type: String },
    verificationScore: { type: Number },
    // "Mark now, verify async": when the face engine was unreachable/overloaded
    // at mark time, the attendance is still recorded (never lost) but the
    // identity match is DEFERRED — a background job (services/faceReverifyService.js)
    // re-verifies the stored capture once the engine is healthy and updates
    // faceVerified (+ raises an alert on a real mismatch). `pending` is true only
    // while that re-verification is still owed; `reason` records why it deferred.
    faceVerifyPending: { type: Boolean, default: false },
    faceVerifyDeferredReason: { type: String, default: null },
    faceVerifyReverifiedAt: { type: Date, default: null },
    // Server-side liveness adjudication verdict (anti-replay, SAACMS §6).
    livenessVerdict: { type: mongoose.Schema.Types.Mixed },

    // Device + camera attestation bundle from the mobile app (raw) and the
    // server-scored injection/deepfake risk { score, level, reasons } — flags
    // virtual-camera / video-injection / emulator captures.
    attestation: { type: mongoose.Schema.Types.Mixed },
    injectionRisk: { type: mongoose.Schema.Types.Mixed },

    authMethod: {
      type: String,
      enum: ['face', 'voice', 'iris', 'palm', 'thumb', 'manual'],
      default: 'face',
    },
    status: { type: String, default: 'success' },

    // Public IP the mark came from (client-reported, falling back to the
    // connection address) + change detection vs the employee's previous IP.
    // Informational only — a changed IP never blocks a mark. Optional fields,
    // so records written before this feature stay valid (backward compatible).
    publicIp: { type: String, default: null },
    previousIp: { type: String, default: null },
    ipChanged: { type: Boolean, default: false },

    // Device + network telemetry the mark came from (client-reported,
    // validated in utils/deviceTelemetry.js) and change detection vs the
    // employee's previous device — catches a mark from a different phone even
    // when the public IP is identical (same WiFi). Informational + audited,
    // never blocks. Optional fields: pre-existing records stay valid.
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

    isWFH: { type: Boolean, default: false },
    wfhAssignmentId: { type: mongoose.Schema.Types.ObjectId },

    // For type:'leave' records — links back to the approved leave request.
    leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Model_LeaveRequest' },

    // Regularization tracking
    isRegularized: { type: Boolean, default: false },
    regularizationReason: { type: String, default: null },
    regularizationRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegularizationRequest' },

    userId: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

attendanceSchema.index({ student: 1, timestamp: -1 });
attendanceSchema.index({ organization: 1, timestamp: -1 });
attendanceSchema.index({ type: 1 });
attendanceSchema.index({ authMethod: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
