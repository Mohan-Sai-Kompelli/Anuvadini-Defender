const mongoose = require('mongoose');

// A photo / document attached to the event-day report. Files are stored as
// base64 strings in Mongo, matching how the app already persists face images
// and class/duty evidence photos (no separate file store needed).
const reportPhotoSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    image: { type: String, required: true }, // data-URL / base64
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const reportDocumentSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    data: { type: String, required: true }, // data-URL / base64
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const fieldRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },

    // Name / title of the outreach / official duty the staff member attended
    // (e.g. a meeting or camp they went to ON BEHALF of the institution, so their
    // regular attendance couldn't be marked).
    eventTitle: { type: String, required: true, trim: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    reason: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },

    // Where the staff member went (venue / office / place).
    location: { type: String, trim: true },
    // The head / senior / person they went WITH (accountability for on-duty).
    accompaniedBy: { type: String, trim: true },
    // Proof captured AT REQUEST TIME (photos of the venue, invite, ID, etc.),
    // stored as base64 data-URLs like every other evidence image in the app.
    evidence: { type: [reportPhotoSchema], default: [] },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'no_response'],
      default: 'pending',
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    reviewedAt: { type: Date },
    // Kept as 'reson' to match the spelling used across the codebase
    reson: { type: String },

    noResponseAt: { type: Date },
    noResponseReason: { type: String, trim: true },
    noResponseReviewed: { type: Boolean, default: false },
    noResponseReviewedAt: { type: Date },
    noResponseReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },

    // Event-day report — uploaded once the event day arrives.
    report: {
      submittedAt: { type: Date },
      notes: { type: String, trim: true },
      photos: { type: [reportPhotoSchema], default: [] },
      documents: { type: [reportDocumentSchema], default: [] },
    },
  },
  { timestamps: true }
);

// Inclusive CALENDAR-DAY count between start and end — computed off the
// date parts only (ignoring time-of-day) so it's correct whether a request
// carries a full-day window (00:00–23:59:59), a half-day window, or a
// custom "out at X, back at Y" time — all of those still span exactly 1
// calendar day and must count as 1, not 2 (the old ms-diff/24h formula broke
// once requests started carrying an end-of-day time instead of midnight).
fieldRequestSchema.virtual('days').get(function () {
  if (!this.startDate || !this.endDate) return 0;
  const s = new Date(this.startDate);
  const e = new Date(this.endDate);
  const startDay = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
  const endDay = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  return Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
});

// Convenience flag: has any event report content been submitted?
fieldRequestSchema.virtual('hasReport').get(function () {
  const r = this.report;
  return !!(
    r &&
    (r.submittedAt ||
      (r.photos && r.photos.length) ||
      (r.documents && r.documents.length) ||
      (r.notes && r.notes.trim()))
  );
});

fieldRequestSchema.set('toJSON', { virtuals: true });
fieldRequestSchema.set('toObject', { virtuals: true });

fieldRequestSchema.index({ student: 1, status: 1 });
fieldRequestSchema.index({ organization: 1, status: 1 });

module.exports = mongoose.model('FieldRequest', fieldRequestSchema);
