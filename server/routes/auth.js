const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const emailService = require('../services/emailService');
const Organization = require('../models/Organization');
const Student = require('../models/Student');
const FaceImage = require('../models/FaceImage');
const faceStorageService = require('../services/faceStorageService');
const faceVerifyService = require('../services/faceVerifyService');

const auth = require('../middleware/auth');
const flags = require('../config/featureFlags');
const audit = require('../services/auditService');
const { resolveClientIp } = require('../utils/clientIp');
const { sanitizeDeviceTelemetry } = require('../utils/deviceTelemetry');
const ipTracking = require('../services/ipTrackingService');
const sessionService = require('../services/sessionService');

const router = express.Router();

// Generate JWT Token. `extra` carries the single-active-session id (sid) for
// admin-type (organization) logins; student tokens never get one.
const generateToken = (id, extra = {}) => {
  return jwt.sign({ id, ...extra }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Open the single-active session for an organization (Admin/admin) login and
// return the sid to embed in its token. Terminates the previous session.
const openOrgSession = (req, organization) =>
  sessionService.createSession({
    userKey: String(organization._id),
    userType: 'organization',
    role: 'hoi',
    userLabel: organization.name || organization.email,
    organization: organization._id,
    ip: resolveClientIp(req),
    deviceInfo: { userAgent: String(req.headers['user-agent'] || '').slice(0, 256) || null },
  });

// @route   POST /api/auth/login
// @desc    Login organization
// @access  Public
router.post('/login', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find organization
    const organization = await Organization.findOne({ email });
    if (!organization) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password. A prior "re-enable" here only uncommented the surrounding
    // scaffolding but left the actual `if (!isMatch)` rejection commented out —
    // isMatch was computed and then silently ignored, so ANY password logged in
    // any organization admin as long as the email existed. Found 2026-08-03 via
    // a real login attempt with a wrong password that succeeded. Now genuinely
    // enforced. SAACMS_MASTER_PLAN.md §9.2.
    if (flags.orgPasswordRequired) {
      const hasPassword = !!organization.password;
      if (!hasPassword) {
        // Legacy account with no password set. Deny unless explicitly allowed.
        if (!flags.allowPasswordlessOrgLogin) {
          return res.status(401).json({
            message: 'Password not set for this account. Contact the administrator to set a password.',
          });
        }
      } else {
        const isMatch = await organization.comparePassword(password);
        if (!isMatch) {
          audit.log({
            organization: organization._id,
            actorType: 'organization',
            actor: organization._id,
            actorLabel: organization.email,
            action: 'auth.org_login',
            outcome: 'failure',
            targetType: 'auth',
            metadata: { reason: 'invalid_password' },
            ip: req.headers['x-forwarded-for'] || req.ip,
          });
          return res.status(401).json({ message: 'Invalid credentials' });
        }
      }
    }

    audit.log({
      organization: organization._id,
      actorType: 'organization',
      actor: organization._id,
      actorLabel: organization.email,
      action: 'auth.org_login',
      outcome: 'success',
      targetType: 'auth',
      ip: req.headers['x-forwarded-for'] || req.ip,
    });

    // Update last login
    organization.lastLogin = new Date();
    await organization.save();

    // Generate token (org = admin role → single active session; opening this
    // one terminates any previous session for this organization account)
    const sid = await openOrgSession(req, organization);
    const token = generateToken(organization._id, { sid });

    res.json({
      success: true,
      token,
      organization: {
        id: organization._id,
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        organizationSize: organization.organizationSize,
        organizationType: organization.organizationType,
        bureau: organization.bureau,
        departments: organization.departments,
        classes: organization.classes,
        selectedBiometrics: organization.selectedBiometrics,
        address: organization.address,
        location: organization.location
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/student/register
// @desc    Self-register a new employee/student account from mobile app
// @access  Public
router.post('/student/register', [
  body('fullName').notEmpty().withMessage('Full name is required'),
  body('uid').notEmpty().withMessage('UID is required'),
  body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { fullName, uid, password, email, department } = req.body;

    const existing = await Student.findOne({ uid: String(uid).trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with this UID/mobile already exists' });
    }

    // Default to active organization (Anuvadini / primary institute)
    let org = await Organization.findOne({ email: 'admin@example.org' });
    if (!org) {
      org = await Organization.findOne({ isActive: { $ne: false } });
    }
    if (!org) {
      org = await Organization.create({
        name: 'Anuvadini',
        email: 'admin@example.org',
        organizationType: 'institute',
        isActive: true
      });
    }

    const newStudent = new Student({
      fullName: String(fullName).trim(),
      uid: String(uid).trim(),
      password: String(password).trim(),
      email: email ? String(email).trim().toLowerCase() : undefined,
      department: department ? String(department).trim() : 'General',
      organization: org._id,
      role: 'faculty',
      isActive: true,
    });

    await newStudent.save();
    console.log(`[Mobile Register] Created new user: ${newStudent.fullName} (${newStudent.uid})`);

    return res.status(201).json({
      success: true,
      message: 'Registration successful! You can now log in.',
      student: {
        id: newStudent._id,
        fullName: newStudent.fullName,
        uid: newStudent.uid,
        email: newStudent.email,
        department: newStudent.department,
      }
    });
  } catch (error) {
    console.error('[Mobile Register Error]:', error);
    return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

// @route   POST /api/auth/student/lookup
// @desc    Look up student by UID
// @access  Public
router.post('/student/lookup', [
  body('uid').notEmpty().withMessage('UID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    console.log("lookup called")

    const { uid } = req.body;

    // Find student by UID
    const student = await Student.findOne({ uid }).populate('organization', 'name organizationType selectedBiometrics location address');
    
    if (!student) {
      return res.status(404).json({ message: 'Employee not found with this UID' });
    }

    if (!student.isActive) {
      return res.status(403).json({ message: 'Student account is deactivated' });
    }

    // Return student info without sensitive data
    res.json({
      success: true,
      student: {
        id: student._id,
        fullName: student.fullName,
        uid: student.uid,
        age: student.age,
        gender: student.gender,
        class: student.class,
        department: student?.department,
        bureau: student.bureau,
        selectedBiometrics: student.selectedBiometrics,
        organization: {
          id: student.organization._id,
          name: student.organization.name,
          organizationType: student.organization.organizationType,
          selectedBiometrics: student.organization.selectedBiometrics,
          location: student.organization.location,
          address: student.organization.address
        }
      }
    });
  } catch (error) {
    console.error('Student lookup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/student/login
// @desc    Student login with UID and password
// @access  Public
router.post('/student/login', [
  body('uid').notEmpty().withMessage('UID is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { uid, password } = req.body;

    // Find student by UID
    const student = await Student.findOne({ uid }).populate('organization', 'name organizationType selectedBiometrics location address WFH Area_radius');
    
    if (!student) {
      return res.status(401).json({ message: 'Invalid UID or password' });
    }

    if (!student.isActive) {
      return res.status(403).json({ message: 'Student account is deactivated' });
    }

    // Check if student has a password set
    if (student.password) {
      // If password is set, check if it matches
      if (password !== student.password) {
        return res.status(401).json({ message: 'Incorrect password. Please check your password and try again.' });
      }
    } else {
      // For first-time login, use UID as password
      if (password !== uid) {
        return res.status(401).json({ message: 'Incorrect password. Please check your password and try again.' });
      }
      // Set the password for future logins
      student.password = uid;
      await student.save();
    }

    // Record the public IP + device/network telemetry this login came from
    // (client-reported, validated; IP falls back to the connection address)
    // and flag an IP or physical-device change vs the previous one. A device
    // change is additionally written to the audit trail. Best-effort: never
    // blocks or fails the login.
    await ipTracking.recordActivity({
      student,
      event: 'login',
      publicIp: resolveClientIp(req),
      device: sanitizeDeviceTelemetry(req.body),
    });

    // Cap concurrent MOBILE sessions per student at MAX_ACTIVE_SESSIONS (2):
    // logging in on a 3rd device terminates the oldest device's session — its
    // NEXT request gets 'session_terminated' and the app auto-logs it out
    // (src/services/api.ts already handles this code; only the sid was ever
    // missing from student tokens).
    const sid = await sessionService.createSession({
      userKey: String(student._id),
      userType: 'employee',
      role: student.role || 'faculty',
      userLabel: student.fullName || student.uid,
      organization: student.organization?._id || null,
      ip: resolveClientIp(req),
      deviceInfo: sanitizeDeviceTelemetry(req.body),
    });

    // Generate token for student
    const token = generateToken(student._id, { sid });

    res.json({
      success: true,
      token,
      student: {
        id: student._id,
        fullName: student.fullName,
        uid: student.uid,
        age: student.age,
        gender: student.gender,
        class: student.class,
        Area_radius: student.Area_radius,
        WFH: student.WFH,
        department: student.department,
        bureau: student.bureau,
        selectedBiometrics: student.selectedBiometrics,
        organization: {
          id: student.organization._id,
          name: student.organization.name,
          organizationType: student.organization.organizationType,
          selectedBiometrics: student.organization.selectedBiometrics,
          location: student.organization.location,
          address: student.organization.address
        }
      }
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// OTP is never stored in plaintext — only its SHA-256 hash, so a DB read
// can't be replayed as a still-valid code.
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const RESET_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESET_OTP_MAX_ATTEMPTS = 5;

// "john.doe@gmail.com" -> "jo***e@gmail.com" (never echo the full address back).
const maskEmail = (email) => {
  const [user, domain] = String(email).split('@');
  if (!domain) return '***';
  const visible = user.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, user.length - visible.length))}@${domain}`;
};

// @route   POST /api/auth/student/forgot-password
// @desc    Send a 6-digit OTP to the student's registered email to start a password reset
// @access  Public
router.post('/student/forgot-password', [
  body('uid').notEmpty().withMessage('UID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { uid } = req.body;
    const student = await Student.findOne({ uid });

    if (!student) {
      return res.status(404).json({ message: 'No account found with this UID' });
    }
    if (!student.email) {
      return res.status(400).json({ message: 'No email is registered for this account. Please contact your admin.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    student.resetOtpHash = hashOtp(otp);
    student.resetOtpExpires = new Date(Date.now() + RESET_OTP_TTL_MS);
    student.resetOtpAttempts = 0;
    await student.save();

    emailService
      .sendPasswordResetOtp({ to: student.email, otp, name: student.fullName, minutes: RESET_OTP_TTL_MS / 60000 })
      .catch((err) => console.error('[auth] failed to send password reset OTP:', err.message));

    res.json({
      success: true,
      message: 'A verification code has been sent to your registered email.',
      maskedEmail: maskEmail(student.email),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/student/reset-password
// @desc    Verify the OTP and set a new password
// @access  Public
router.post('/student/reset-password', [
  body('uid').notEmpty().withMessage('UID is required'),
  body('otp').notEmpty().withMessage('Verification code is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { uid, otp, newPassword } = req.body;
    const student = await Student.findOne({ uid });

    if (!student) {
      return res.status(404).json({ message: 'No account found with this UID' });
    }
    if (!student.resetOtpHash || !student.resetOtpExpires || student.resetOtpExpires < new Date()) {
      return res.status(400).json({ message: 'Verification code expired or not requested. Please request a new one.' });
    }
    if (student.resetOtpAttempts >= RESET_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (hashOtp(otp) !== student.resetOtpHash) {
      student.resetOtpAttempts += 1;
      await student.save();
      return res.status(401).json({ message: 'Incorrect verification code' });
    }

    student.password = newPassword;
    student.resetOtpHash = null;
    student.resetOtpExpires = null;
    student.resetOtpAttempts = 0;
    await student.save();

    res.json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current authenticated entity (organization or student)
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    if (req.student) {
      const s = await Student.findById(req.student._id)
        .select('-password')
        .populate('organization', 'name organizationType selectedBiometrics location address Area_radius WFH');
      return res.json({
        success: true,
        id: s._id,
        fullName: s.fullName,
        uid: s.uid,
        role: s.role || 'student',
        organization: s.organization,
        hasActiveWFH: s.WFH === 'WFH allowed' || s.WFH === 'Allowed',
      });
    }
    res.json({
      success: true,
      organization: req.organization
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// @route   POST /api/auth/student/enroll-face-directions
// @desc    Enroll face images from 5 directions (Center, Left, Right, Up, Down)
// @access  Public / Student
router.post('/student/enroll-face-directions', async (req, res) => {
  try {
    const studentId = req.body?.studentId || req.body?.id;
    const uid = req.body?.uid;

    let student = null;
    if (studentId) {
      student = await Student.findById(studentId);
    }
    if (!student && uid) {
      student = await Student.findOne({ uid: String(uid).trim() });
    }
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student/Employee not found' });
    }

    const { images } = req.body;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide at least 1 face image' });
    }

    // Persist to Student model
    student.faceImages = images;
    student.selectedBiometrics = student.selectedBiometrics || {};
    student.selectedBiometrics.face = true;
    await student.save();

    // Create FaceImage records in MongoDB
    try {
      await FaceImage.deleteMany({ student: student._id });
      await FaceImage.insertMany(
        images.map((img, idx) => ({
          uid: student.uid,
          name: student.fullName,
          email: student.email || student.uid,
          student: student._id,
          organization: student.organization,
          imageBase64: img,
          originalFilename: 'direction-' + (idx + 1) + '-' + Date.now() + '.jpg',
        }))
      );
    } catch (dbErr) {
      console.warn('[Face Enroll DB Warning]:', dbErr.message);
    }

    // Save to disk storage
    try {
      images.forEach((img) => faceStorageService.saveRegistered(student, img));
    } catch (fsErr) {
      console.warn('[Face Enroll Storage Warning]:', fsErr.message);
    }

    // Re-enroll with face engine for embeddings
    try {
      await faceVerifyService.enroll({
        uid: student.uid,
        name: student.fullName,
        email: student.email || student.uid,
        faceImages: images,
      });
    } catch (enrollErr) {
      console.warn('[Face Enroll Service Warning]:', enrollErr.message);
    }

    console.log(`[Face Enroll] Enrolled ${images.length} face directions for ${student.fullName} (${student.uid})`);

    return res.status(200).json({
      success: true,
      message: `Successfully enrolled ${images.length} face directions!`,
      faceCount: images.length,
      student: {
        id: student._id,
        fullName: student.fullName,
        uid: student.uid,
        faceImages: student.faceImages,
      }
    });
  } catch (error) {
    console.error('[Face Directions Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to enroll face directions. ' + error.message });
  }
});

module.exports = router; 