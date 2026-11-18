const mongoose = require('mongoose');

const wfhAssignmentSchema = new mongoose.Schema({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  assignedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'WFHRequest' },
});

const locationChangeRequestSchema = new mongoose.Schema({
  requestedLocation: { type: mongoose.Schema.Types.ObjectId },
  reason: { type: String },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  requestedAt: { type: Date, default: Date.now },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  approvedAt: { type: Date },
  rejectionReason: { type: String },
});

const studentSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    password: { type: String, default: null },

    // Forgot-password flow: OTP is stored hashed (never plaintext) with an
    // expiry + attempt counter so a leaked DB snapshot can't be used to
    // replay a still-valid code, and repeated guesses get locked out.
    resetOtpHash: { type: String, default: null },
    resetOtpExpires: { type: Date, default: null },
    resetOtpAttempts: { type: Number, default: 0 },

    age: { type: Number, min: 1, max: 120 },
    gender: { type: String, enum: ['male', 'female', 'other'] },

    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    class: { type: String },
    department: { type: String },
    bureau: { type: String },

    // Role within the institution — drives which web portal/dashboard the
    // person sees after login. 'faculty'/'staff' → Faculty & Staff portal,
    // 'hod' → Head-of-Department portal (department-scoped view).
    role: {
      type: String,
      enum: ['faculty', 'staff', 'hod'],
      default: 'faculty',
    },
    // Free-text job title shown on the dashboards (e.g. "Associate Professor",
    // "Lab Technician", "Professor & HOD").
    designation: { type: String, default: '' },

    selectedBiometrics: {
      face: { type: Boolean, default: true },
      fingerprint: { type: Boolean, default: true },
      iris: { type: Boolean, default: true },
      palm: { type: Boolean, default: true },
      voice: { type: Boolean, default: true },
    },

    faceImages: [{ type: String }],
    voiceSample: { type: String },
    fingerprintImage: { type: String },
    irisImage: { type: String },
    palmImage: { type: String },

    fcmToken: { type: String, default: null },
    fcmTokenUpdatedAt: { type: Date },

    // Cumulative fraud/security risk score (SecurityEvent-driven). Never shown
    // to the employee — surfaced only on the super-admin dashboard. Decays are
    // not automatic; an admin resolving events is expected to reset/adjust it.
    riskScore: { type: Number, default: 0, min: 0 },
    lastSecurityEventAt: { type: Date, default: null },

    // Public-IP tracking (super-admin report). lastKnownIp is the address seen
    // on the most recent login OR attendance mark — the baseline the next
    // event's "IP changed" warning is computed against. Optional fields:
    // existing student documents stay valid.
    lastKnownIp: { type: String, default: null },
    lastLoginIp: { type: String, default: null },
    lastLoginAt: { type: Date },

    // Device tracking (super-admin report). The device seen on the most recent
    // login OR mark — the baseline for the "device changed" warning, which
    // catches a login from a different phone even when the public IP is the
    // same (e.g. two phones on the same college WiFi). Model/manufacturer are
    // kept so the report can name the PREVIOUS device, not just its id.
    lastKnownDeviceId: { type: String, default: null },
    lastKnownDeviceModel: { type: String, default: null },
    lastKnownDeviceManufacturer: { type: String, default: null },

    location: { type: mongoose.Schema.Types.Mixed },
    address: { type: mongoose.Schema.Types.Mixed },
    currentLocation: { type: mongoose.Schema.Types.ObjectId },
    Area_radius: { type: Number, default: 100 },

    // Legacy WFH flag
    WFH: { type: String, default: 'NO' },
    // New WFH assignment system
    wfhAssignments: [wfhAssignmentSchema],

    locationChangeRequests: [locationChangeRequestSchema],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

studentSchema.index({ uid: 1 });
studentSchema.index({ organization: 1 });

// Returns the currently active WFH assignment (within date range) or null
studentSchema.methods.getCurrentWFHAssignment = function () {
  const now = new Date();
  if (Array.isArray(this.wfhAssignments)) {
    const active = this.wfhAssignments.find(
      (a) =>
        a.isActive &&
        new Date(a.startDate) <= now &&
        new Date(a.endDate) >= now
    );
    if (active) return active;
  }
  return null;
};

studentSchema.methods.hasActiveWFH = function () {
  if (this.getCurrentWFHAssignment()) return true;
  return this.WFH === 'WFH allowed' || this.WFH === 'Allowed';
};

studentSchema.methods.getCurrentLocation = function () {
  return this.currentLocation || null;
};

studentSchema.methods.requestLocationChange = function (locationId, reason) {
  const request = {
    requestedLocation: locationId,
    reason,
    status: 'pending',
    requestedAt: new Date(),
  };
  this.locationChangeRequests.push(request);
  return this.locationChangeRequests[this.locationChangeRequests.length - 1];
};

module.exports = mongoose.model('Student', studentSchema);
