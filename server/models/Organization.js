const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const coordinatesSchema = new mongoose.Schema(
  {
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
  },
  { _id: false }
);

const locationSubSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  address: { type: mongoose.Schema.Types.Mixed },
  coordinates: { type: coordinatesSchema, default: () => ({}) },
  geofenceRadius: { type: Number, default: 100 },
  workingHours: { type: mongoose.Schema.Types.Mixed },
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
});

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String },
    phone: { type: String, default: '' },
    address: { type: mongoose.Schema.Types.Mixed },
    description: { type: String },

    organizationType: {
      type: String,
      enum: ['school', 'institute', 'private_company', 'government_office'],
      default: 'private_company',
    },
    organizationSize: {
      type: String,
      enum: ['small', 'medium', 'large', 'enterprise'],
    },

    // Legacy single location
    location: {
      latitude: { type: Number, default: 0 },
      longitude: { type: Number, default: 0 },
      address: { type: String },
    },

    // Multi-location support
    locations: [locationSubSchema],
    primaryLocation: { type: mongoose.Schema.Types.ObjectId },

    // Organizational structure
    departments: [{ type: String }],
    bureaus: [{ type: String }],
    bureau: [{ type: String }],
    classes: [{ type: String }],

    selectedBiometrics: {
      face: { type: Boolean, default: true },
      fingerprint: { type: Boolean, default: true },
      iris: { type: Boolean, default: true },
      palm: { type: Boolean, default: true },
      voice: { type: Boolean, default: true },
    },

    settings: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Geofence / WFH related
    Area_radius: { type: Number, default: 100 },
    WFH: { type: String },

    // Nodal Officer Feature
    nodalOfficer: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    nodalOfficerOtp: {
      code: { type: String }, // Hashed OTP
      expiresAt: { type: Date },
      attempts: { type: Number, default: 0 },
      lastSentAt: { type: Date },
      pendingNodalOfficer: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    },

    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// Hash password before saving (only when modified and not already hashed)
organizationSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    if (/^\$2[aby]\$/.test(this.password)) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

organizationSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  if (/^\$2[aby]\$/.test(this.password)) {
    return bcrypt.compare(candidate, this.password);
  }
  return candidate === this.password;
};

organizationSchema.methods.addLocation = function (locationData) {
  this.locations.push(locationData);
  return this.locations[this.locations.length - 1];
};

module.exports = mongoose.model('Organization', organizationSchema);
