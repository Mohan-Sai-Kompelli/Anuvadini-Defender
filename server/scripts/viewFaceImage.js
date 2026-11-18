/**
 * viewFaceImage.js — attendance records mai stored base64 face images ko
 * asli JPG files mai nikal kar (Windows pe) photo viewer mai khol deta hai.
 * Giant base64 strings ko copy-paste karke dekhne ki zaroorat nahi.
 *
 * Usage (repo root ya server/ se):
 *   node server/scripts/viewFaceImage.js <uid> [count]
 *   node server/scripts/viewFaceImage.js 9716272321        // latest capture
 *   node server/scripts/viewFaceImage.js 9716272321 5      // latest 5
 *
 * Output: server/face_previews/<uid>/ mai JPG files + console mai record detail.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://127.0.0.1:27017';
const DB = 'test';

const uid = process.argv[2];
const count = parseInt(process.argv[3] || '1', 10);
if (!uid) {
  console.error('Usage: node server/scripts/viewFaceImage.js <uid> [count]');
  process.exit(1);
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB);

  const student = await db.collection('students').findOne({ uid });
  if (!student) {
    console.error(`Student not found for uid ${uid}`);
    process.exit(1);
  }
  console.log(`Student: ${student.fullName} (${uid})\n`);

  const records = await db
    .collection('attendances')
    .find({ student: student._id, faceImage: { $nin: [null, ''] } })
    .sort({ timestamp: -1 })
    .limit(count)
    .toArray();

  if (!records.length) {
    console.log('Is student ka koi record nahi mila jisme face image ho.');
    process.exit(0);
  }

  const outDir = path.join(__dirname, '..', 'face_previews', uid);
  fs.mkdirSync(outDir, { recursive: true });

  let firstFile = null;
  for (const r of records) {
    const img = String(r.faceImage);
    const ts = new Date(r.timestamp).toISOString().replace(/[:.]/g, '-');
    let file;
    if (img.startsWith('face_storage/')) {
      // New format: the capture already lives on disk — just point at it.
      file = path.join(__dirname, '..', img);
      if (!fs.existsSync(file)) {
        console.log(`(missing on disk: ${img})`);
        continue;
      }
    } else if (img.startsWith('data:image')) {
      // Legacy format: inlined base64 — extract it to a preview file.
      file = path.join(outDir, `${r.type}_${ts}.jpg`);
      const b64 = img.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    } else {
      console.log(`(not viewable — old file:// path record: ${img.slice(0, 60)})`);
      continue;
    }
    if (!firstFile) firstFile = file;
    console.log(
      `${r.type.toUpperCase().padEnd(4)} ${new Date(r.timestamp).toLocaleString()} | ` +
        `faceVerified: ${r.faceVerified} | score: ${r.verificationScore ?? '-'} | ` +
        `liveness: ${r.livenessVerdict ? (r.livenessVerdict.passed ? 'PASS' : r.livenessVerdict.reasons.join(',')) : '-'}`
    );
    console.log(`     → ${file}`);
  }
  await client.close();

  // Windows: latest image photo viewer mai khol do.
  if (process.platform === 'win32' && firstFile) {
    execFile('cmd', ['/c', 'start', '', firstFile]);
    console.log('\nLatest image photo viewer mai khul rahi hai…');
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
