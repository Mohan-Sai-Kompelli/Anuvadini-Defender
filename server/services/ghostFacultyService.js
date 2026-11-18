const mongoose = require('mongoose');
const Student = require('../models/Student');
const FaceImage = require('../models/FaceImage');
const GhostFacultyCollision = require('../models/GhostFacultyCollision');

/**
 * GhostFacultyService
 * -------------------
 * "One face, two identities." The face engine (face-back/check.py) stores a
 * 512-d embedding per enrolled uid in the shared `embedings` collection. We read
 * those vectors directly, find pairs whose cosine similarity is high but whose
 * uids differ, cluster them, and enrich each member with the Student/Organization
 * record — surfacing the same person enrolled under multiple identities, often
 * across different colleges (ghost faculty).
 *
 * The comparison is O(N²) but vectorised over normalized dot products; fine for
 * the realistic enrolment counts here. A hard cap guards against runaway cost.
 */

const SCAN_CAP = 8000; // max embeddings compared in one scan (safety bound)

const dot = (a, b) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};
const normalize = (v) => {
  const mag = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / mag);
};

/** Read every enrolled embedding from the shared `embedings` collection. */
async function loadEmbeddings() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');
  const docs = await db
    .collection('embedings')
    .find({ embedding: { $type: 'array' } }, { projection: { name: 1, email: 1, embedding: 1 } })
    .limit(SCAN_CAP)
    .toArray();
  return docs.map((d) => ({
    uid: String(d._id),
    embeddingName: d.name || '',
    email: d.email || '',
    vec: normalize(d.embedding),
  }));
}

/**
 * Run a network-wide dedup scan.
 * @param {Object} opts { threshold = 0.7 } cosine similarity to call a match.
 * @returns {Object} { scannedFaces, matchedPairs, clusters }
 */
async function scan({ threshold = 0.7 } = {}) {
  const items = await loadEmbeddings();

  // 1. all high-similarity pairs (different uids).
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].uid === items[j].uid) continue;
      const sim = dot(items[i].vec, items[j].vec);
      if (sim >= threshold) pairs.push({ a: i, b: j, sim });
    }
  }

  // 2. union-find → clusters.
  const parent = items.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (x, y) => { parent[find(x)] = find(y); };
  pairs.forEach((p) => union(p.a, p.b));

  const groups = new Map();
  items.forEach((_, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });

  // 3. enrich each multi-member cluster with Student + Organization.
  const allUids = items.map((it) => it.uid);
  const students = await Student.find({ uid: { $in: allUids } })
    .populate('organization', 'name')
    .select('uid fullName email organization department designation role isActive')
    .lean();
  const byUid = new Map(students.map((s) => [s.uid, s]));

  const clusters = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;

    const members = idxs.map((i) => {
      const s = byUid.get(items[i].uid);
      return {
        uid: items[i].uid,
        name: s?.fullName || items[i].embeddingName || '—',
        email: s?.email || items[i].email || '',
        institute: s?.organization?.name || '— (not on roster)',
        instituteId: s?.organization?._id ? String(s.organization._id) : null,
        department: s?.department || '',
        designation: s?.designation || '',
        role: s?.role || '',
        active: s?.isActive !== false,
        onRoster: !!s,
      };
    });

    const idxSet = new Set(idxs);
    const simPairs = pairs
      .filter((p) => idxSet.has(p.a) && idxSet.has(p.b))
      .map((p) => ({ a: items[p.a].uid, b: items[p.b].uid, sim: Math.round(p.sim * 1000) / 1000 }));

    const instituteIds = new Set(members.map((m) => m.instituteId).filter(Boolean));
    const names = new Set(members.map((m) => m.name.trim().toLowerCase()).filter((n) => n && n !== '—'));
    const crossInstitute = instituteIds.size > 1;
    const differentNames = names.size > 1;
    const maxSim = simPairs.reduce((m, p) => Math.max(m, p.sim), 0);
    const severity = crossInstitute ? 'critical' : differentNames ? 'high' : 'review';
    const key = [...members.map((m) => m.uid)].sort().join('|');

    clusters.push({
      key,
      uids: members.map((m) => m.uid),
      memberCount: members.length,
      institutes: instituteIds.size,
      crossInstitute,
      differentNames,
      maxSim,
      severity,
      members,
      simPairs,
    });
  }

  const rank = { critical: 3, high: 2, review: 1 };
  clusters.sort((a, b) => rank[b.severity] - rank[a.severity] || b.maxSim - a.maxSim);

  // 4. persist — upsert by key so admin triage (status/note) survives re-scans.
  const now = new Date();
  for (const c of clusters) {
    await GhostFacultyCollision.updateOne(
      { key: c.key },
      {
        $set: {
          uids: c.uids,
          severity: c.severity,
          crossInstitute: c.crossInstitute,
          differentNames: c.differentNames,
          maxSim: c.maxSim,
          institutes: c.institutes,
          memberCount: c.memberCount,
          members: c.members,
          simPairs: c.simPairs,
          lastSeenAt: now,
        },
        $setOnInsert: { status: 'open' },
      },
      { upsert: true }
    );
  }

  const bySeverity = clusters.reduce((acc, c) => { acc[c.severity] = (acc[c.severity] || 0) + 1; return acc; }, {});
  return { scannedFaces: items.length, matchedPairs: pairs.length, clusters: clusters.length, bySeverity, threshold };
}

/** Latest registration FaceImage for a uid (for the collision report thumbnails). */
async function registrationImageFor(uid) {
  const fi = await FaceImage.findOne({ uid }).sort({ createdAt: -1 }).select('imageBase64').lean();
  return fi?.imageBase64 || null;
}

module.exports = { scan, registrationImageFor, SCAN_CAP };
