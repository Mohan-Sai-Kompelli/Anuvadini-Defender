const Attendance = require('../models/Attendance');
const { BiometricAttendance } = require('../config/biometricDb');

// ---------------------------------------------------------------------------
// Read attendance from BOTH stores: our own `attendances` collection
// (live-attendance-checking) AND the biometric DB's `attendances` collection
// (mongodb://127.0.0.1:27017/biometric) — where all the existing records live.
//
// Why: a user may check IN on the external biometric system and then come to THIS
// app to check OUT (or vice-versa). To show the correct status we must consider
// records from both places.
//
// Dedup: our marks are MIRRORED into the biometric DB with the SAME _id, so the
// same record can exist in both — we key by _id and keep the primary copy.
//
// Best-effort: a READ failure on the biometric DB must NOT break the screen, so
// we swallow its error and fall back to primary-only (writes stay strict; reads
// are tolerant).
// ---------------------------------------------------------------------------
async function findMergedAttendance(query, { withFaceImage = false } = {}) {
  // faceImage is a large base64 blob and history/status never needs it.
  const projection = withFaceImage ? {} : { faceImage: 0 };

  const [primary, biometric] = await Promise.all([
    Attendance.find(query, projection).lean(),
    BiometricAttendance.find(query, projection)
      .lean()
      .catch((err) => {
        console.error('[mergedAttendance] biometric read failed:', err.message);
        return [];
      }),
  ]);

  const byId = new Map();
  for (const doc of primary) byId.set(String(doc._id), doc);
  for (const doc of biometric) {
    const key = String(doc._id);
    if (!byId.has(key)) byId.set(key, doc); // external-only record → include it
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// Does a record matching `query` exist in EITHER store? Used for the
// duplicate-check-in guard so a check-in on the biometric system blocks a second
// check-in here. Best-effort on the biometric side.
async function existsInEitherStore(query) {
  const primary = await Attendance.findOne(query).select('_id').lean();
  if (primary) return true;
  try {
    const bio = await BiometricAttendance.findOne(query).select('_id').lean();
    return !!bio;
  } catch (err) {
    console.error('[mergedAttendance] biometric exists-check failed:', err.message);
    return false;
  }
}

module.exports = { findMergedAttendance, existsInEitherStore };
