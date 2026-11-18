const mongoose = require('mongoose');

const regularizationRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      enum: ['missing_check_in', 'missing_check_out', 'both'],
      required: true,
    },
    reasonType: {
      type: String,
      enum: [
        'Official Duty',
        'Field Visit',
        'No Internet',
        'Network Failure',
        'Device Issue',
        'Emergency',
        'Other',
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    requestedCheckInTime: {
      type: Date,
    },
    requestedCheckOutTime: {
      type: Date,
    },
    // Legacy: local-disk path (only readable from the machine that originally
    // saved it — broken once more than one person runs the server against
    // the same shared MongoDB from their own machine).
    evidenceUrl: {
      type: String,
    },
    // Current: full base64 data-URL stored on the document itself (shared DB),
    // same pattern as leave/outreach/checkout evidence — works from any machine.
    evidenceData: {
      type: mongoose.Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    actionBy: {
      type: String,
    },
    actionDate: {
      type: Date,
    },
    adminRemarks: {
      type: String,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RegularizationRequest', regularizationRequestSchema);
