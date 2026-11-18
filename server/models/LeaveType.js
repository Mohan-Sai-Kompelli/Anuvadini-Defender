const mongoose = require('mongoose');

/**
 * LeaveType
 * ---------
 * A configurable category of leave (Casual, Sick, Earned, Maternity, …). The 13
 * canonical types are seeded GLOBALLY (organization: null) by
 * scripts/seedLeaveTypes.js; an institution can also create/override its own
 * (organization set) and tune every rule below without a code change.
 *
 * Every rule here is ENFORCED server-side at apply time (see the leave apply
 * controller) — the client only uses these to render the form, never to decide
 * eligibility.
 */
const leaveTypeSchema = new mongoose.Schema(
  {
    // Short stable machine code, e.g. 'CL', 'SL', 'EL'. Unique per scope.
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // null = global default (applies to every institution); an ObjectId = an
    // institution-specific type/override.
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },

    // --- duration rules ---
    minDays: { type: Number, default: 0.5 },   // half-day = 0.5
    maxDays: { type: Number, default: 30 },    // per single application
    maxConsecutiveDays: { type: Number, default: 30 },
    yearlyQuota: { type: Number, default: 12 }, // days allowed per calendar year

    // --- pay + carry-forward ---
    paid: { type: Boolean, default: true },
    carryForward: { type: Boolean, default: false },
    carryForwardMax: { type: Number, default: 0 },

    // --- workflow rules ---
    requiresApproval: { type: Boolean, default: true },
    requiresDocument: { type: Boolean, default: false }, // e.g. Sick → medical cert
    minAdvanceNoticeDays: { type: Number, default: 0 },  // days before start date
    halfDayAllowed: { type: Boolean, default: true },

    // Emergency leave can bypass the advance-notice rule (still needs approval).
    allowEmergency: { type: Boolean, default: false },

    // --- eligibility ---
    // 'all' | 'male' | 'female' — a Maternity type is female-only, Paternity male-only.
    genderEligibility: {
      type: String,
      enum: ['all', 'male', 'female'],
      default: 'all',
    },
    // Which staff roles may use it. Empty array = everyone.
    employmentTypeEligibility: {
      type: [String], // subset of ['faculty','staff','hod']
      default: [],
    },

    // Can this be combined (adjacent/overlapping application) with other types?
    allowCombination: { type: Boolean, default: true },
    // If set, restricts combination to these type codes only.
    combinableWith: { type: [String], default: [] },

    // --- presentation (mobile + web) ---
    color: { type: String, default: '#6366F1' }, // hex for chips/badges
    icon: { type: String, default: 'CalendarDays' }, // lucide icon name
    sortOrder: { type: Number, default: 100 },

    active: { type: Boolean, default: true },

    // --- audit metadata ---
    createdBy: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedBy: { type: mongoose.Schema.Types.Mixed, default: null },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One code per scope (global, or per organization). Partial index so many orgs
// can each have their own 'CL' while a single global 'CL' also exists.
leaveTypeSchema.index({ organization: 1, code: 1 }, { unique: true });
leaveTypeSchema.index({ active: 1, isDeleted: 1 });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
