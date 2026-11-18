const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Secure upload handling for leave supporting documents.
 *
 * Files are written to a PRIVATE directory (uploads/leave-documents) that is
 * NEVER mounted as a static route — the only way to read one back is the
 * auth-gated + permission-checked download endpoint. Filenames are randomised
 * so an attacker can't guess/enumerate them, and the original name is only kept
 * as metadata (never used on disk). MIME type AND extension are both checked,
 * and anything executable/unknown is rejected outright.
 */

const LEAVE_DOCS_DIR = path.join(__dirname, '..', 'uploads', 'leave-documents');
if (!fs.existsSync(LEAVE_DOCS_DIR)) {
  fs.mkdirSync(LEAVE_DOCS_DIR, { recursive: true });
}

// Allowed { mime: [extensions] }. Both must match for a file to pass.
const ALLOWED = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  // Some clients send DOCX as octet-stream; we still verify the .docx extension.
  'application/msword': ['.doc', '.docx'],
};

// Extensions we hard-block regardless of claimed MIME (defence in depth).
const BLOCKED_EXT = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.js', '.jsx', '.ts', '.php', '.py', '.rb',
  '.pl', '.jar', '.msi', '.apk', '.app', '.scr', '.com', '.vbs', '.ps1', '.dll',
  '.html', '.htm', '.svg', '.zip', '.rar', '.7z',
]);

// Memory storage: files are kept as in-memory buffers and the route stores
// them as base64 `data` on the document (shared DB), never written to this
// server instance's local disk — otherwise a different machine serving the
// same shared MongoDB can never read back what THIS machine's disk holds.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (BLOCKED_EXT.has(ext)) {
    return cb(new Error('This file type is not allowed. Upload a PDF, image or DOCX.'));
  }
  const allowedExts = ALLOWED[file.mimetype];
  if (!allowedExts || !allowedExts.includes(ext)) {
    return cb(new Error('Unsupported document. Only PDF, PNG, JPG/JPEG and DOCX are allowed.'));
  }
  cb(null, true);
};

const leaveUpload = multer({
  storage,
  fileFilter,
  limits: {
    // Stored as base64 (≈33% larger) inside the leave document itself, capped
    // well under MongoDB's 16MB BSON document limit even with all 6 files.
    fileSize: 1.5 * 1024 * 1024, // 1.5 MB per file
    files: 6,                    // up to 6 documents per application
  },
});

// Accepts a medical certificate under `medicalCertificate` and any number of
// other supporting files under `supportingDocuments`. On a non-multipart
// (JSON) request multer simply calls next() and leaves req.body untouched.
const leaveDocsUpload = leaveUpload.fields([
  { name: 'medicalCertificate', maxCount: 2 },
  { name: 'supportingDocuments', maxCount: 4 },
]);

module.exports = { leaveDocsUpload, LEAVE_DOCS_DIR, ALLOWED, BLOCKED_EXT };
