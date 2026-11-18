const mongoose = require('mongoose');

/**
 * SpoofAttempt
 * ------------
 * A blocked attendance attempt the on-server anti-spoof (PAD) model judged to be
 * a FAKE — a face replayed on a phone/tablet screen or a printed photo, rather
 * than a live face. Recorded at face-verify time (the attempt is blocked, so no
 * Attendance row is created), purely so a super-admin can review who is trying
 * to mark fake attendance and from where.
 *
 * The captured frame is kept inline as base64 (same convention as
 * Attendance.faceImage) so the review gallery can show the evidence image.
 */
const spoofAttemptSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    // Denormalized so the report renders even if the student/org is later removed.
    uid: { type: String },
    studentName: { type: String },

    // What the user was trying to do: 'in' | 'out' | 'spotcheck' | 'class'.
    type: { type: String, default: 'in' },

    // Evidence image (base64 / data-URL), served by the super-admin image route.
    faceImage: { type: String, default: null },

    // PAD verdict details.
    score: { type: Number }, // fused "real" probability (lower = more fake)
    label: { type: String, default: 'fake' },
    model: { type: String, default: 'minifasnet' },

    // Did the replayed face ALSO match the enrolled identity? (true = someone
    // replaying the genuine person's face — the most serious case.)
    matched: { type: Boolean, default: false },
    similarity: { type: Number },

    latitude: { type: Number },
    longitude: { type: Number },

    // WHICH physical device this capture came from — the model's fake/real
    // texture judgement is sensitive to each phone's camera post-processing
    // (sharpening, HDR, denoising vary a lot by manufacturer/model), so a
    // pattern of false positives on one specific device model is otherwise
    // invisible. Best-effort: omitted when the client couldn't read it.
    deviceId: { type: String },
    deviceModel: { type: String },
    manufacturer: { type: String },
  },
  { timestamps: true }
);

spoofAttemptSchema.index({ deviceModel: 1, createdAt: -1 });

spoofAttemptSchema.index({ organization: 1, createdAt: -1 });
spoofAttemptSchema.index({ student: 1, createdAt: -1 });
spoofAttemptSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SpoofAttempt', spoofAttemptSchema);
