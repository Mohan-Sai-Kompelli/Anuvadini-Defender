const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('[faceStorageService] sharp module not available, using raw image buffer fallback');
  sharp = null;
}

// Every check-in AND check-out (every employee, every day, indefinitely) writes
// a face capture — at raw phone-camera resolution (often 1-5MB per JPEG) that
// adds up fast with zero evidentiary benefit (a reviewer needs to clearly see
// a face, not read fine print at native resolution). Cap the LONGEST side and
// re-encode at a lower JPEG quality before every write below. Tunable via env
// in case a deployment wants sharper archival copies.
const MAX_STORED_SIDE = parseInt(process.env.FACE_STORAGE_MAX_SIDE || '1280', 10);
const STORED_JPEG_QUALITY = parseInt(process.env.FACE_STORAGE_JPEG_QUALITY || '75', 10);

/** Resize (longest side, never upscale) + re-encode as JPEG. Never throws —
 * a compression hiccup falls back to storing the original buffer untouched,
 * since a bigger-than-ideal capture is still infinitely better than losing
 * the evidence image outright. */
async function compressBuffer(buf) {
  if (!sharp) return buf;
  try {
    return await sharp(buf)
      .rotate() // bake in EXIF orientation BEFORE resizing — sharp strips EXIF on re-encode
      .resize({
        width: MAX_STORED_SIDE,
        height: MAX_STORED_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: STORED_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error('[faceStorage] compression failed, storing original size:', err.message);
    return buf;
  }
}

/**
 * faceStorageService
 * ------------------
 * Persists face images to a STRUCTURED FOLDER TREE on disk (not MongoDB):
 *
 *   <FACE_STORAGE_DIR>/<Name>_<uid>/
 *     ├── registered/
 *     │   └── 2026-06-14_171815_ab12.jpg
 *     └── 2026-06-14/                     (date the capture happened)
 *         ├── checkin/   171453_pass_0.75_ab12.jpg
 *         ├── checkout/  181002_pass_0.81_cd34.jpg
 *         ├── spotcheck/ 143210_fail_ef56.jpg
 *         └── class/     093000_gh78.jpg
 *
 * Every write is best-effort — it must NEVER break the request it hooks into.
 */

const ROOT = process.env.FACE_STORAGE_DIR || path.join(__dirname, '..', 'face_storage');
const CAPTURE_TYPES = ['checkin', 'checkout', 'spotcheck', 'class'];

function sanitize(name) {
  return (
    String(name || 'unknown')
      .trim()
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown'
  );
}

function userDir(student) {
  const uid = student?.uid || 'nouid';
  return path.join(ROOT, `${sanitize(student?.fullName || student?.name)}_${uid}`);
}

// Accept a Buffer, a base64 string, or a data-URL ("data:image/jpeg;base64,...").
function toBuffer(image) {
  if (!image) return null;
  if (Buffer.isBuffer(image)) return image.length ? image : null;
  if (typeof image !== 'string') return null;
  const comma = image.indexOf(',');
  const b64 = image.startsWith('data:') && comma !== -1 ? image.slice(comma + 1) : image;
  try {
    const buf = Buffer.from(b64, 'base64');
    return buf.length ? buf : null;
  } catch (_e) {
    return null;
  }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`,
  };
}

function rand() {
  return Math.random().toString(36).slice(2, 6);
}

/** Save an enrollment / registration image under <user>/registered/.
 * Async now (compression) — existing fire-and-forget callers are unaffected
 * (they never awaited the old sync version either); callers that need the
 * path should await it. */
async function saveRegistered(student, image) {
  try {
    const buf = toBuffer(image);
    if (!buf) return null;
    const compressed = await compressBuffer(buf);
    const dir = path.join(userDir(student), 'registered');
    fs.mkdirSync(dir, { recursive: true });
    const { date, time } = stamp();
    const file = path.join(dir, `${date}_${time}_${rand()}.jpg`);
    fs.writeFileSync(file, compressed);
    return file;
  } catch (err) {
    console.error('[faceStorage] saveRegistered failed:', err.message);
    return null;
  }
}

/**
 * Save a dated, typed capture under <user>/<date>/<type>/.
 * @param {Object} a { student, type, image, match?, similarity?, spoof? }
 *   spoof = the auto-computed anti-spoof verdict { available, label, score }.
 *   It's encoded into the filename as `_spoof-<label>-<score>` so the Face
 *   Report shows the FAKE/unsure/real badge AUTOMATICALLY (no manual re-scan).
 */
async function saveCapture({ student, type, image, match, similarity, spoof } = {}) {
  try {
    const buf = toBuffer(image);
    if (!buf) return null;
    const compressed = await compressBuffer(buf);
    const t = CAPTURE_TYPES.includes(type) ? type : 'other';
    const { date, time } = stamp();
    const dir = path.join(userDir(student), date, t);
    fs.mkdirSync(dir, { recursive: true });
    const tag = match === true ? '_pass' : match === false ? '_fail' : '';
    const sim = typeof similarity === 'number' ? `_${similarity.toFixed(2)}` : '';
    // Anti-spoof verdict token (label = fake|real|uncertain). Hyphen-joined so it
    // stays ONE underscore-part and never collides with the pass/fail or the bare
    // similarity-decimal tokens the report parser looks for.
    let spoofTok = '';
    if (spoof && spoof.available && spoof.label) {
      const sc = typeof spoof.score === 'number' ? spoof.score.toFixed(2) : 'na';
      spoofTok = `_spoof-${spoof.label}-${sc}`;
    }
    const file = path.join(dir, `${time}${tag}${sim}${spoofTok}_${rand()}.jpg`);
    fs.writeFileSync(file, compressed);
    return file;
  } catch (err) {
    console.error('[faceStorage] saveCapture failed:', err.message);
    return null;
  }
}

/** Resize + re-encode an image and return it as a base64 data-URL — for
 * callers that store the image INLINE (e.g. SpoofAttempt.faceImage in
 * MongoDB, not on disk). Inline storage makes uncompressed bloat worse than
 * the disk case above (it bloats the DATABASE, not just disk), so this is
 * the same compression, just returning a data-URL instead of writing a file.
 * Never throws — falls back to the ORIGINAL (uncompressed) data-URL so a
 * compression hiccup never loses the evidence image. */
async function compressToBase64DataUrl(image) {
  const buf = toBuffer(image);
  if (!buf) return null;
  const compressed = await compressBuffer(buf);
  return `data:image/jpeg;base64,${compressed.toString('base64')}`;
}

module.exports = { saveRegistered, saveCapture, compressToBase64DataUrl, userDir, ROOT, CAPTURE_TYPES };
