const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// The `biometric` database — the OTHER attendance app (its web UI runs on
// :2707) shares the SAME local MongoDB as us (127.0.0.1:27017); it just uses a
// different database name (`biometric`) than ours (`live-attendance-checking`).
// All real attendance lives in biometric.attendances. We MIRROR every successful
// mark into that collection so both apps share one attendance store, and we read
// it back so a check-in done in either app is visible in the other. This is the
// ONLY thing that talks to the biometric DB — no other collection is touched.
//
// Students are identical across both DBs (same _id), so attendance docs match by
// `student` directly. Override the target with BIOMETRIC_MONGODB_URI if it moves.
// ---------------------------------------------------------------------------
const BIOMETRIC_MONGODB_URI =
  process.env.BIOMETRIC_MONGODB_URI || 'mongodb://127.0.0.1:27017/biometric';

// A DEDICATED connection (not mongoose's default Atlas connection), opened once at
// require-time so it's warm before the first attendance mark. serverSelection
// timeout is short-ish so that when the DB is unreachable a mirror write fails
// fast (we run in STRICT mode: a failed mirror fails the whole mark).
const biometricConnection = mongoose.createConnection(BIOMETRIC_MONGODB_URI, {
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 8000,
});

biometricConnection.on('connected', () =>
  console.log('[biometricDb] connected:', BIOMETRIC_MONGODB_URI)
);
biometricConnection.on('error', (err) =>
  console.error('[biometricDb] connection error:', err.message)
);

// Mirror model bound to THIS connection. strict:false stores the attendance
// record exactly as passed (same _id and fields as the primary), and we pin the
// collection name to `attendances` (the biometric app's collection — Mongoose's
// default pluralization, where all 39k+ existing records live).
const mirrorSchema = new mongoose.Schema({}, { strict: false, collection: 'attendances' });
const BiometricAttendance = biometricConnection.model('Attendance', mirrorSchema);

module.exports = { biometricConnection, BiometricAttendance, BIOMETRIC_MONGODB_URI };
