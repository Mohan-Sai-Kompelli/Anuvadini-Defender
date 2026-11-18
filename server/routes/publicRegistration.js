const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const Student = require('../models/Student');
const Organization = require('../models/Organization');
const IrisImage = require('../models/IrisImage');
const PalmImage = require('../models/PalmImage');
const securityEventService = require('../services/securityEventService');
const rateLimit = require('../middleware/rateLimit');
const {
  persistRegistrationFaces,
  imageToBase64,
  flaggedEvidenceImage,
  MIN_FACE_ENROLL_IMAGES,
  FACE_API_URL,
} = require('./students').helpers;

const router = express.Router();

// This entire router is PUBLIC (no `auth` middleware) — anyone with the URL
// can hit it. Two things keep that from being an open door:
//   1. The target organization is resolved by NAME below, never accepted from
//      the client and never hardcoded by _id. The same org's Mongo _id is
//      different in every environment (dev/staging/prod each have their own
//      DB), so a hardcoded id would silently break — or worse, point at the
//      wrong org — the moment this runs against a different database.
//   2. `role` is never read from the request body — every account created
//      here is forced to plain 'faculty'. Letting a public form pick 'hod' or
//      escalate would be a privilege-escalation hole.
//
// The /i flag already makes each pattern match REGARDLESS of case —
// "Anuvadini", "ANUVADINI", "anuvadini", "AnUvAdInI" all match, because a
// regex flag applies to the whole match, not the literal casing typed here.
// That part needs no extra handling.
//
// These three keys are the ONLY organizations selectable from the public
// form (same campus group as server/utils/sharedOffices.js's
// CAMPUS_ORG_PATTERNS) — the client sends one of these key strings, never a
// free-text name and never a Mongo _id, so there's no way to target an
// arbitrary organization from outside this whitelist.
const CAMPUS_ORGS = {
  Anuvadini: /anuvadini/i,
  NETF: /netf/i,
  IUAC: /iuac/i,
};

// `name` is only a `trim`-med free-text field on Organization
// (server/models/Organization.js), not unique or enum-constrained — nothing
// stops two different orgs both containing e.g. "anuvadini" in their name
// (a stale "Anuvadini (old)" left over from a rename, or a "Anuvadini
// Kendra" sub-entity). A plain `findOne()` on an ambiguous match returns
// whichever one the DB happens to return first — silently registering
// employees into the WRONG organization with no error at all.
// resolveOrganization() below fetches every candidate for the requested key
// and disambiguates deterministically instead of trusting findOne() to pick
// the right one by luck.
async function resolveOrganization(orgKey) {
  const pattern = CAMPUS_ORGS[orgKey];
  if (!pattern) return null;

  const candidates = await Organization.find({ name: pattern, isActive: { $ne: false } });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Ambiguous: more than one active org matches this key. Prefer an EXACT
  // (case/whitespace-insensitive) name match over a partial one — e.g. a
  // literal org named "Anuvadini" wins over "Anuvadini Kendra" or "Anuvadini (old)".
  const exactLower = orgKey.toLowerCase();
  const exact = candidates.filter((o) => o.name.trim().toLowerCase() === exactLower);
  console.warn(
    `[public-registration] AMBIGUOUS org name match for "${orgKey}": ${candidates.length} active orgs found ` +
    `(${candidates.map((o) => `"${o.name}"#${o._id}`).join(', ')}). ` +
    (exact.length === 1
      ? `Resolved to the exact-name match "${exact[0].name}"#${exact[0]._id}.`
      : `No single exact match either — falling back to the oldest matching org. Rename the duplicates so this stops being ambiguous.`)
  );

  if (exact.length === 1) return exact[0];
  // Still ambiguous (zero or 2+ exact matches) — fall back to the oldest
  // record (first created) as the most likely "real" one, deterministically,
  // rather than whatever order Mongo happens to return.
  return candidates.sort((a, b) => a._id.getTimestamp() - b._id.getTimestamp())[0];
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
  }),
  limits: {
    fileSize: 1000 * 1024 * 1024,
    fieldSize: 100 * 1024 * 1024,
  },
});

// @route   GET /api/public/registration/organizations
// @desc    Static whitelist of the campus organizations selectable from the
//          public form. No DB lookup, no org _id exposed — just the fixed
//          key strings the client is allowed to send back on /info and
//          /register.
// @access  Public
router.get('/organizations', (req, res) => {
  res.json({ success: true, organizations: Object.keys(CAMPUS_ORGS) });
});

// @route   GET /api/public/registration/info?org=Anuvadini
// @desc    Public, read-only info needed to render the self-registration form
//          for ONE of the three whitelisted campus organizations (no org
//          _id exposed).
// @access  Public
router.get('/info', rateLimit({ windowMs: 60 * 1000, max: 600 }), async (req, res) => {
  try {
    const orgKey = req.query.org;
    if (!CAMPUS_ORGS[orgKey]) {
      return res.status(400).json({ success: false, message: 'Invalid organization' });
    }
    const org = await resolveOrganization(orgKey);
    if (!org) {
      return res.status(503).json({
        success: false,
        message: 'Registration is temporarily unavailable for this organization. Please contact your administrator.',
      });
    }
    res.json({
      success: true,
      organizationKey: orgKey,
      organizationName: org.name,
      organizationType: org.organizationType,
      classes: org.classes || [],
      departments: org.departments || [],
      bureaus: org.bureaus || org.bureau || [],
      selectedBiometrics: org.selectedBiometrics,
      minFaceImages: MIN_FACE_ENROLL_IMAGES,
    });
  } catch (error) {
    console.error('[public-registration] info error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/public/registration/register
// @desc    Public self-registration — creates a faculty account under
//          whichever of the 3 whitelisted campus organizations the client
//          picked, same enrollment flow as the admin "add employee" screen
//          (server/routes/students.js), minus any ability to self-assign an
//          elevated role.
// @access  Public
router.post(
  '/register',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }),
  upload.fields([
    // Hard cap at the multer layer too — a request carrying more than the
    // required count is rejected before it even reaches the exact-count
    // check below, not silently truncated to the first N.
    { name: 'faceImages', maxCount: MIN_FACE_ENROLL_IMAGES },
    { name: 'voiceSample', maxCount: 1 },
    { name: 'fingerprintImage', maxCount: 1 },
    { name: 'irisImage', maxCount: 1 },
    { name: 'palmImage', maxCount: 1 },
  ]),
  [
    body('organization').isIn(Object.keys(CAMPUS_ORGS)).withMessage('Invalid organization'),
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('age').isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
    body('gender').isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
    body('uid').notEmpty().withMessage('UID (mobile number) is required'),
    body('email').notEmpty().withMessage('Email is required').bail().isEmail().withMessage('Invalid email format'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const org = await resolveOrganization(req.body.organization);
      if (!org) {
        return res.status(503).json({
          success: false,
          message: 'Registration is temporarily unavailable for this organization. Please contact your administrator.',
        });
      }

      const {
        fullName, age, gender, uid, address, class: className, email,
      } = req.body;

      // Never trust the client for role — public self-registration always
      // lands as plain faculty. Elevation (staff/hod) is an admin-only edit.
      const role = 'faculty';
      // Department/bureau/designation are deliberately NOT collected on the
      // public form (per user request) — an admin fills those in later via
      // the normal edit-student screen.

      const existingStudent = await Student.findOne({ uid });
      if (existingStudent) {
        return res.status(400).json({ success: false, message: 'An account with this mobile number already exists' });
      }

      const orgType = org.organizationType;
      if ((orgType === 'school' || orgType === 'institute') && !className) {
        return res.status(400).json({ success: false, message: 'Class is required' });
      }

      // Public form enforces EXACTLY MIN_FACE_ENROLL_IMAGES on the client (the
      // capture button disables itself at the cap) — this is the server-side
      // backstop against a direct API call bypassing that UI limit. Fewer
      // means a weak embedding; more was never intended to be accepted here
      // (unlike the admin flow, which allows extra images for a richer set).
      const faceImagesUploaded = req.files && req.files.faceImages ? req.files.faceImages.length : 0;
      if (faceImagesUploaded !== MIN_FACE_ENROLL_IMAGES) {
        return res.status(400).json({
          success: false,
          message: `Please capture exactly ${MIN_FACE_ENROLL_IMAGES} live face photos for reliable recognition (received ${faceImagesUploaded}).`,
        });
      }

      // Same order-of-operations as the admin flow: generate the embedding
      // BEFORE saving the student, so a face-back failure never leaves behind
      // an account that can't actually check in.
      let embeddingSecurity = null;
      try {
        const embeddingForm = new FormData();
        embeddingForm.append('user_id', uid);
        embeddingForm.append('name', fullName);
        embeddingForm.append('email', uid);
        req.files.faceImages.forEach((faceFile) => {
          embeddingForm.append('face_images', fs.createReadStream(faceFile.path));
        });
        const embeddingRes = await axios.post(
          `${FACE_API_URL}/create-embedding`,
          embeddingForm,
          { headers: embeddingForm.getHeaders() }
        );
        const embeddingData = embeddingRes.data;
        if (!embeddingData.status || embeddingData.status !== 'success') {
          return res.status(400).json({
            success: false,
            message: embeddingData.error || 'Failed to generate face embedding',
            security: embeddingData.security || null,
          });
        }
        embeddingSecurity = embeddingData.security;
      } catch (err) {
        // `security.perImage` (per-photo usable/quality_rejected/spoof_suspected
        // verdicts from face-back/check.py) MUST reach the client here — same
        // as the admin "add employee" flow (students.js) — so the form can
        // point at exactly which of the 5 captures needs a retake instead of
        // making the person guess and redo all 5.
        const embeddingError = err.response?.data?.error || err.message;
        const security = err.response?.data?.security || null;
        return res.status(err.response?.status === 400 ? 400 : 502).json({
          success: false,
          message: embeddingError || 'Face verification service unreachable',
          security,
        });
      }

      const filePaths = {};
      if (req.files) {
        Object.keys(req.files).forEach((fieldName) => {
          if (fieldName === 'faceImages') {
            filePaths.faceImages = req.files.faceImages.map((f) => f.path.replace(/\\/g, '/'));
          } else if (req.files[fieldName] && req.files[fieldName][0]) {
            filePaths[fieldName] = req.files[fieldName][0].path.replace(/\\/g, '/');
          }
        });
      }

      const student = new Student({
        organization: org._id,
        fullName,
        age: parseInt(age, 10),
        gender,
        uid,
        email: email || undefined,
        password: null, // first login sets it to the uid, same as admin-created accounts
        address: address || {},
        class: className,
        role,
        selectedBiometrics: org.selectedBiometrics,
        ...filePaths,
      });
      await student.save();

      if (req.files && req.files.faceImages && req.files.faceImages.length > 0) {
        await persistRegistrationFaces(student, req.files.faceImages);
      }

      if (req.files && req.files.irisImage) {
        try {
          const irisBase64 = imageToBase64(req.files.irisImage[0].path);
          if (irisBase64) {
            await new IrisImage({
              student: student._id,
              studentUid: student.uid,
              studentName: student.fullName,
              organization: org._id,
              imageBase64: irisBase64,
              originalFilename: req.files.irisImage[0].originalname,
            }).save();
          }
        } catch (error) {
          console.error('[public-registration] iris image error:', error);
        }
      }

      if (req.files && req.files.palmImage) {
        try {
          const palmBase64 = imageToBase64(req.files.palmImage[0].path);
          if (palmBase64) {
            await new PalmImage({
              student: student._id,
              studentUid: student.uid,
              studentName: student.fullName,
              organization: org._id,
              imageBase64: palmBase64,
              originalFilename: req.files.palmImage[0].originalname,
            }).save();
          }
        } catch (error) {
          console.error('[public-registration] palm image error:', error);
        }
      }

      if (embeddingSecurity) {
        try {
          await securityEventService.recordEnrollmentScreening({
            student: student._id,
            organization: org._id,
            uid: student.uid,
            studentName: student.fullName,
            security: embeddingSecurity,
            evidenceImage: flaggedEvidenceImage(embeddingSecurity, req.files && req.files.faceImages),
          });
        } catch (secErr) {
          console.error('[public-registration] enrollment security event failed:', secErr.message);
        }
      }

      console.log(`[public-registration] new self-registered account uid=${uid} org=${org.name}`);

      res.status(201).json({
        success: true,
        message: 'Registration successful. You can now log in with your mobile number as both username and password.',
        uid: student.uid,
      });
    } catch (error) {
      console.error('[public-registration] register error:', error);
      res.status(500).json({ success: false, message: 'Failed to register' });
    }
  }
);

module.exports = router;
