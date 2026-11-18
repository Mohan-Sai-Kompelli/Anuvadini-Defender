/**
 * Backfill registration face images into the FaceImage collection.
 *
 * Registration used to store face images ONLY as file paths in
 * Student.faceImages (multer files under server/uploads/). The Admin/HOD
 * "Registration Images" page and the super-admin gallery read the durable
 * FaceImage collection first, so anyone registered before the fix shows a
 * broken or missing image. This script converts each student's on-disk
 * upload files to base64 FaceImage docs (and files a copy under
 * face_storage/<user>/registered/).
 *
 * Run it ON THE SERVER THAT HOLDS THE uploads/ FILES (e.g. the Azure VM):
 *   cd server && node scripts/backfillFaceImages.js          # dry run
 *   cd server && node scripts/backfillFaceImages.js --write  # actually insert
 *
 * Idempotent: students who already have FaceImage docs are skipped.
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Student = require('../models/Student');
const FaceImage = require('../models/FaceImage');
const faceStorageService = require('../services/faceStorageService');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  '';

const WRITE = process.argv.includes('--write');
const SERVER_ROOT = path.join(__dirname, '..');

function fileToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const mime = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Stored paths look like "uploads/1699...-face_1.jpg" (relative to the server
// dir) but may carry leading slashes or backslashes from older writes.
function resolveUploadPath(p) {
  const clean = String(p).replace(/\\/g, '/').replace(/^\/+/, '');
  const candidates = [
    path.join(SERVER_ROOT, clean),
    path.join(SERVER_ROOT, 'uploads', path.basename(clean)),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected. Mode:', WRITE ? 'WRITE' : 'DRY RUN (pass --write to insert)');

  const students = await Student.find({ faceImages: { $exists: true, $ne: [] } })
    .select('fullName uid email organization faceImages')
    .lean();
  console.log(`${students.length} student(s) have faceImages paths.`);

  let inserted = 0, skippedHasDocs = 0, missingFiles = 0;

  for (const s of students) {
    const existing = await FaceImage.countDocuments({ student: s._id });
    if (existing > 0) {
      skippedHasDocs++;
      continue;
    }

    const docs = [];
    for (const p of s.faceImages) {
      if (!p || typeof p !== 'string') continue;
      // Some very old records held base64 directly in faceImages — keep as-is.
      if (p.startsWith('data:') || (!p.includes('/') && p.length > 100)) {
        docs.push({ imageBase64: p.startsWith('data:') ? p : `data:image/jpeg;base64,${p}`, originalFilename: null });
        continue;
      }
      const abs = resolveUploadPath(p);
      if (!abs) {
        console.log(`  MISSING file for ${s.fullName} (${s.uid}): ${p}`);
        missingFiles++;
        continue;
      }
      docs.push({ imageBase64: fileToDataUrl(abs), originalFilename: path.basename(abs) });
    }

    if (!docs.length) continue;
    console.log(`  ${WRITE ? 'Inserting' : 'Would insert'} ${docs.length} image(s) for ${s.fullName} (${s.uid})`);
    if (WRITE) {
      await FaceImage.insertMany(
        docs.map((d) => ({
          uid: s.uid,
          name: s.fullName,
          email: s.email || s.uid,
          student: s._id,
          organization: s.organization,
          imageBase64: d.imageBase64,
          originalFilename: d.originalFilename,
        }))
      );
      // saveRegistered is async now (image compression) — this script exits
      // right after its main loop, so un-awaited writes could still be
      // in-flight (and silently lost) when the process ends.
      await Promise.all(docs.map((d) => faceStorageService.saveRegistered(s, d.imageBase64)));
    }
    inserted += docs.length;
  }

  console.log(
    `Done. ${WRITE ? 'Inserted' : 'Would insert'} ${inserted} image(s); ` +
      `${skippedHasDocs} student(s) already had FaceImage docs; ${missingFiles} path(s) had no file on disk.`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
