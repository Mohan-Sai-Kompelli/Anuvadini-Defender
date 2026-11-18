const mongoose = require('mongoose');

/**
 * GhostFacultyCollision
 * ---------------------
 * A cluster of enrolled faces whose embeddings are near-identical but belong to
 * DIFFERENT uids — i.e. the same person enrolled under more than one identity
 * (the classic "ghost faculty" padding headcounts across colleges to clear Anuvadini
 * inspections). Produced by ghostFacultyService.scan() and upserted by `key`
 * (the sorted set of uids) so an admin's status/notes survive re-scans.
 */
const ghostFacultyCollisionSchema = new mongoose.Schema(
  {
    // Stable identity of the cluster: the sorted uids joined with '|'.
    key: { type: String, required: true, unique: true, index: true },
    uids: [{ type: String }],

    // critical = same face across ≥2 institutes; high = same face, different
    // names (same institute); review = same face, same name (likely a true
    // duplicate enrollment, not necessarily fraud).
    severity: { type: String, enum: ['critical', 'high', 'review'], default: 'review' },
    crossInstitute: { type: Boolean, default: false },
    differentNames: { type: Boolean, default: false },
    maxSim: { type: Number, default: 0 },
    institutes: { type: Number, default: 0 },
    memberCount: { type: Number, default: 0 },

    // Snapshot of each member (name, institute, department…) + the within-cluster
    // similarity pairs — stored so the report renders without re-joining.
    members: { type: mongoose.Schema.Types.Mixed, default: [] },
    simPairs: { type: mongoose.Schema.Types.Mixed, default: [] },

    // Admin triage. open → needs review; confirmed → duplicate identity confirmed;
    // same_person → legitimately the same person on record at >1 place; dismissed.
    status: {
      type: String,
      enum: ['open', 'confirmed', 'same_person', 'dismissed'],
      default: 'open',
    },
    note: { type: String, default: '' },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },

    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ghostFacultyCollisionSchema.index({ status: 1, severity: 1, maxSim: -1 });

module.exports = mongoose.model('GhostFacultyCollision', ghostFacultyCollisionSchema);
