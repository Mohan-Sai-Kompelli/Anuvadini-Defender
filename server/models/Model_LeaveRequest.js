const mongoose = require('mongoose');

/**
 * One uploaded supporting file for a leave request. Stored as base64 `data`
 * directly in the document (same pattern as outreach/checkout evidence) so it
 * lives in the shared database, not on whichever machine's disk happened to
 * handle the upload — critical once more than one person runs the server
 * against the same MongoDB Atlas cluster from their own machine.
 * `path` is kept only to still serve attachments uploaded before this change
 * (disk-based, private uploads/leave-documents/…, never web-served statically).
 */
const leaveAttachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String },                   // legacy: stored (unique) name on disk
    originalName: { type: String },               // what the user named it
    mimeType: { type: String },
    size: { type: Number },
    // 'medical' = medical certificate, 'supporting' = other supporting doc.
    category: { type: String, enum: ['medical', 'supporting', 'other'], default: 'supporting' },
    data: { type: String },                        // base64 file contents (current)
    path: { type: String },                        // legacy: absolute/relative disk path (private)
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

/** One entry in the approval/status timeline (append-only history). */
const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId },  // actor id (student/org)
    byName: { type: String },
    byRole: { type: String },                       // 'employee'|'hod'|'institution'|'superadmin'|'system'
    comment: { type: String },
    at: { type: Date, default: Date.now },
    ip: { type: String },
  },
  { _id: false }
);

const leaveRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },

    // --- leave type (enterprise) ---
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', default: null },
    leaveTypeCode: { type: String, default: null },   // denormalised for display/history
    leaveTypeName: { type: String, default: null },

    // --- legacy free-text (kept for backward compatibility) ---
    leaveDetails: { type: String },
    // Field name intentionally matches the spelling used across the codebase
    reson: { type: String },
    reason: { type: String },
    details: { type: String },
    notes: { type: String },

    // --- enterprise application fields ---
    description: { type: String },                    // detailed description
    comments: { type: String },                       // additional comments
    dayPortion: { type: String, enum: ['full', 'half'], default: 'full' },
    halfDayType: { type: String, enum: ['first', 'second', null], default: null },
    isEmergency: { type: Boolean, default: false },
    contactNumber: { type: String },
    addressDuringLeave: { type: String },
    expectedReturnDate: { type: Date },
    totalDays: { type: Number, default: 0 },          // working days (half = 0.5)

    leaveDates: {
      start: { type: Date },
      end: { type: Date },
    },

    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'pending',
        'returned_for_correction',
        'approved',
        'rejected',
        'cancelled',
        'withdrawn',
        'expired',
        'completed',
      ],
      default: 'pending',
    },

    // Who this request is currently routed to for action ("request kisko gayi hai").
    assignedTo: {
      kind: { type: String, enum: ['hod', 'institution', 'superadmin', null], default: null },
      ref: { type: mongoose.Schema.Types.ObjectId, default: null }, // Student(hod) or Organization id
      name: { type: String, default: null },
      role: { type: String, default: null },   // designation/role label for display
    },

    // Colleague (same department) covering the work while on leave. `delegate`
    // kept for backward compatibility; `workHandoverTo` is the new canonical name
    // (both are set to the same id on create).
    delegate: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    workHandoverTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },

    // --- documents ---
    attachments: { type: [leaveAttachmentSchema], default: [] },

    // --- approval timeline / audit ---
    statusHistory: { type: [statusHistorySchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Request-time metadata captured on submit (for the audit trail / super admin).
    submitMeta: {
      ip: { type: String, default: null },
      userAgent: { type: String, default: null },
      device: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Custom static used by StudentController
leaveRequestSchema.statics.findByStudentId = function (studentId, options = {}) {
  let query = this.find({ student: studentId, isDeleted: { $ne: true } });
  if (options.sort) query = query.sort(options.sort);
  return query;
};

// Hot paths: my-requests, org/HOD queues, assignee lookups, calendar overlap.
leaveRequestSchema.index({ student: 1, createdAt: -1 });
leaveRequestSchema.index({ status: 1 });
leaveRequestSchema.index({ 'assignedTo.ref': 1, status: 1 });
leaveRequestSchema.index({ 'leaveDates.start': 1, 'leaveDates.end': 1 });

module.exports = mongoose.model('Model_LeaveRequest', leaveRequestSchema);
