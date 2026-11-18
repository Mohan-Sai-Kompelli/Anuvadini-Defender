const express = require('express');
const { body, validationResult } = require('express-validator');
const Organization = require('../models/Organization');
const auth = require('../middleware/auth');
const { deptScopeIds } = require('../utils/deptScope');
const { campusScopedAttendanceFilter } = require('../utils/sharedOffices');
const bcrypt = require('bcryptjs');

const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const Student = require('../models/Student');
const { sendMail } = require('../services/emailService');

const router = express.Router();

// @route   GET /api/organization/profile
// @desc    Get organization profile
// @access  Private
router.get("/profile", auth, async (req, res) => {
  try {
    if (req.organization && typeof req.organization.populate === 'function') {
      await req.organization.populate('nodalOfficer', 'fullName email phone designation uid');
    }
    const org = req.organization.toObject ? req.organization.toObject() : req.organization;

    // If the org has no locations[] entries but has a legacy location field,
    // synthesize a virtual primary location so the UI always has something to show.
    if ((!org.locations || org.locations.length === 0) &&
        org.location && (org.location.latitude || org.location.longitude)) {
      org.locations = [{
        _id: 'legacy',
        name: 'Main Office',
        coordinates: {
          latitude: org.location.latitude || 0,
          longitude: org.location.longitude || 0,
        },
        geofenceRadius: org.Area_radius || 100,
        isActive: true,
        isPrimary: true,
      }];
    }

    res.json({
      success: true,
      organization: org,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   PUT /api/organization/profile
// @desc    Update organization profile
// @access  Private
router.put(
  "/profile",
  auth,
  [
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Organization name cannot be empty"),
    body("phone")
      .optional()
      .notEmpty()
      .withMessage("Phone number cannot be empty"),
    body("latitude")
      .optional()
      .isNumeric()
      .withMessage("Latitude must be a number"),
    body("longitude")
      .optional()
      .isNumeric()
      .withMessage("Longitude must be a number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, phone, address, latitude, longitude } = req.body;

      const updateData = {};

      if (name) updateData.name = name;
      if (phone) updateData.phone = phone;
      if (address) updateData.address = address;
      if (latitude && longitude) {
        // Write to both the legacy field AND the first location in locations[]
        updateData.location = { latitude, longitude };
        updateData['locations.0.coordinates'] = { latitude, longitude };
      }

      const organization = await Organization.findByIdAndUpdate(
        req.organization._id,
        updateData,
        { new: true, runValidators: true }
      ).select("-password");

      res.json({
        success: true,
        organization,
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   PUT /api/organization/departments
// @desc    Update organization departments
// @access  Private
router.put(
  "/departments",
  auth,
  [
    body("departments").isArray().withMessage("Departments must be an array"),
    body("departments.*")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Department names cannot be empty"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { departments } = req.body;

      // Clean and validate departments array
      const cleanDepartments = departments
        .map((dept) => dept.trim())
        .filter((dept) => dept.length > 0)
        .filter((dept, index, arr) => arr.indexOf(dept) === index); // Remove duplicates

      if (cleanDepartments.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one department is required" });
      }

      const organization = await Organization.findByIdAndUpdate(
        req.organization._id,
        { departments: cleanDepartments },
        { new: true, runValidators: true }
      ).select("-password");

      res.json({
        success: true,
        organization,
        message: "Departments updated successfully",
      });
    } catch (error) {
      console.error("Update departments error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   PUT /api/organization/bureaus
// @desc    Update organization bureaus (for government offices)
// @access  Private
router.put(
  "/bureaus",
  auth,
  [
    body("bureaus").isArray().withMessage("Bureaus must be an array"),
    body("bureaus.*")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Bureau names cannot be empty"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Check if organization is government type
      if (req.organization.organizationType !== "government_office") {
        return res.status(400).json({
          message: "Bureaus can only be set for government organizations",
        });
      }

      const { bureaus } = req.body;

      // Clean and validate bureaus array
      const cleanBureaus = bureaus
        .map((bureau) => bureau.trim())
        .filter((bureau) => bureau.length > 0)
        .filter((bureau, index, arr) => arr.indexOf(bureau) === index); // Remove duplicates

      if (cleanBureaus.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one bureau is required" });
      }

      const organization = await Organization.findByIdAndUpdate(
        req.organization._id,
        { bureaus: cleanBureaus },
        { new: true, runValidators: true }
      ).select("-password");

      res.json({
        success: true,
        organization,
        message: "Bureaus updated successfully",
      });
    } catch (error) {
      console.error("Update bureaus error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   PUT /api/organization/classes
// @desc    Update organization classes
// @access  Private
router.put(
  "/classes",
  auth,
  [
    body("classes").isArray().withMessage("Classes must be an array"),
    body("classes.*")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Class names cannot be empty"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { classes } = req.body;

      // Clean and validate classes array
      const cleanClasses = classes
        .map((cls) => cls.trim())
        .filter((cls) => cls.length > 0)
        .filter((cls, index, arr) => arr.indexOf(cls) === index); // Remove duplicates

      if (cleanClasses.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one class is required" });
      }

      const organization = await Organization.findByIdAndUpdate(
        req.organization._id,
        { classes: cleanClasses },
        { new: true, runValidators: true }
      ).select("-password");

      res.json({
        success: true,
        organization,
        message: "Classes updated successfully",
      });
    } catch (error) {
      console.error("Update classes error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   PUT /api/organization/password
// @desc    Update organization password
// @access  Private
router.put(
  "/password",
  auth,
  [
    body("currentPassword")
      .notEmpty()
      .withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;

      // Verify current password
      const isMatch = await req.organization.comparePassword(currentPassword);
      if (!isMatch) {
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update password
      await Organization.findByIdAndUpdate(req.organization._id, {
        password: hashedPassword,
      });

      res.json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   PUT /api/organization/location
// @desc    Update organization location
// @access  Private
router.put(
  "/location",
  auth,
  [
    body("latitude").isNumeric().withMessage("Latitude must be a number"),
    body("longitude").isNumeric().withMessage("Longitude must be a number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { latitude, longitude } = req.body;

      const organization = await Organization.findByIdAndUpdate(
        req.organization._id,
        { location: { latitude, longitude } },
        { new: true, runValidators: true }
      ).select("-password");

      res.json({
        success: true,
        organization,
      });
    } catch (error) {
      console.error("Update location error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   GET /api/organization/stats
// @desc    Get organization statistics
// @access  Private
router.get("/stats", auth, async (req, res) => {
  try {
    console.log('[Organization Stats] Fetching stats for org:', req.organization._id);
    const Student = require("../models/Student");
    const Attendance = require("../models/Attendance");

    // HOD scope: restrict every metric to the HOD's department.
    const scope = await deptScopeIds(req);
    const stuMatch = scope ? { _id: { $in: scope } } : {};
    const attScope = scope ? { student: { $in: scope } } : {};

    // Anuvadini/NETF/IUAC share a campus — Anuvadini's dashboard is a full
    // rollup of all three orgs' staff/attendance (NETF and IUAC stay
    // branch-scoped: their own staff + campus visitors). Every OTHER
    // dashboard/report endpoint in server/routes/attendance.js already goes
    // through this same helper; this stats endpoint (the one that feeds the
    // Dashboard's headline Present/Absent/Leave tiles) was the one place still
    // hardcoding `req.organization._id` directly, so Anuvadini's own headline
    // counts silently excluded NETF/IUAC staff while other widgets on the
    // SAME dashboard correctly included them. Skipped when HOD-scoped (a
    // department scope is already the authoritative roster, same rule the
    // helper itself documents).
    const { orgFilter, studentClause, rosterIds } = await campusScopedAttendanceFilter(
      req.organization._id,
      attScope
    );
    // Student queries: campus-scoped roster when available, else the plain
    // org+HOD match exactly as before. campusScopedAttendanceFilter returns
    // rosterIds as real ObjectId instances (see sharedOffices.js), which is
    // required for the Student.aggregate() calls below — aggregate pipelines
    // don't cast plain strings against the schema the way .find() does.
    const studentMatch = rosterIds
      ? { _id: { $in: rosterIds } }
      : { organization: req.organization._id, ...stuMatch };

    // Get basic stats
    const totalStudents = await Student.countDocuments(studentMatch);
    const activeStudents = await Student.countDocuments({
      ...studentMatch,
      isActive: true,
    });

    // Get today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    console.log(today, "today");
    console.log(tomorrow, "tomorrow");

    // Count unique students who checked in today (prevents double-counting outs/retries)
    // Use aggregation to get the latest check-in for each student
    const todayAttendanceResult = await Attendance.aggregate([
      {
        $match: {
          organization: orgFilter,
          ...studentClause,
          type: 'in',
          timestamp: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$student',
          latestCheckIn: { $max: '$timestamp' }
        }
      },
      {
        $count: 'uniqueStudents'
      }
    ]);
    const todayAttendance = todayAttendanceResult.length > 0 ? todayAttendanceResult[0].uniqueStudents : 0;

    // Get this month's attendance
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonthAttendance = await Attendance.countDocuments({
      organization: orgFilter,
      ...studentClause,
      timestamp: { $gte: startOfMonth },
    });

    // Get organization distribution based on organization type
    let groupStats = [];
    const orgType = req.organization.organizationType;

    if (orgType === "school" || orgType === "institute") {
      groupStats = await Student.aggregate([
        { $match: { ...studentMatch, class: { $ne: null, $ne: "" } } },
        { $group: { _id: "$class", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);
    } else if (orgType === "private_company") {
      groupStats = await Student.aggregate([
        { $match: { ...studentMatch, department: { $ne: null, $ne: "" } } },
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);
    } else if (orgType === "government_office") {
      groupStats = await Student.aggregate([
        { $match: { ...studentMatch, bureau: { $ne: null, $ne: "" } } },
        { $group: { _id: "$bureau", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);
    }

    // Get gender distribution
    const genderStats = await Student.aggregate([
      { $match: studentMatch },
      { $group: { _id: "$gender", count: { $sum: 1 } } },
    ]);

    // Get today's Work From Home and Leave counts
    const LeaveRequest = require("../models/Model_LeaveRequest");
    
    // Get current date for leave request comparison
    const currentDate = new Date();
    currentDate.setHours(23, 59, 59, 999); // End of today
    
    // Get approved leave requests for today
    const todayLeaveRequests = await LeaveRequest.aggregate([
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $match: {
          ...(rosterIds
            ? { "student._id": { $in: rosterIds } }
            : { "student.organization": req.organization._id }),
          ...(scope ? { "student.department": req.hodDepartment } : {}),
          status: "approved",
          $or: [
            {
              "leaveDates.start": { $lte: currentDate },
              "leaveDates.end": { $gte: today }
            }
          ]
        } 
      },
      {
        $addFields: {
          requestType: {
            $cond: {
              if: { $regexMatch: { input: "$leaveDetails", regex: /^\[WFH\]/i } },
              then: "WFH",
              else: "Leave"
            }
          }
        }
      }
    ]);

    const todayWorkFromHome = todayLeaveRequests.filter(req => req.requestType === "WFH").length;
    const todayLeave = todayLeaveRequests.filter(req => req.requestType === "Leave").length;
    
    console.log('[Organization Stats] Today date range:', { today, currentDate });
    console.log('[Organization Stats] Total leave requests found:', todayLeaveRequests.length);
    console.log('[Organization Stats] WFH requests:', todayWorkFromHome);
    console.log('[Organization Stats] Leave requests:', todayLeave);
    if (todayLeaveRequests.length > 0) {
      console.log('[Organization Stats] Sample request:', {
        leaveDetails: todayLeaveRequests[0].leaveDetails,
        requestType: todayLeaveRequests[0].requestType,
        start: todayLeaveRequests[0].leaveDates?.start,
        end: todayLeaveRequests[0].leaveDates?.end,
        status: todayLeaveRequests[0].status
      });
    }

    // Get unregistered users count (users who have no registered face image and no password/login)
    const FaceImage = require("../models/FaceImage");
    const allOrgStudents = await Student.find(studentMatch).select('_id faceImages password lastLoginAt').lean();
    const studentIds = allOrgStudents.map((s) => s._id);
    const registeredFaceSet = new Set(
      (await FaceImage.find({ student: { $in: studentIds } }).distinct('student')).map(String)
    );
    const unregisteredCount = allOrgStudents.filter((s) => {
      const hasFace = registeredFaceSet.has(String(s._id)) || (Array.isArray(s.faceImages) && s.faceImages.length > 0);
      const hasLogin = !!s.lastLoginAt || !!s.password;
      return !hasFace && !hasLogin;
    }).length;

    res.json({
      success: true,
      stats: {
        totalStudents,
        activeStudents,
        todayAttendance,
        thisMonthAttendance,
        attendanceRate:
          totalStudents > 0
            ? ((todayAttendance / totalStudents) * 100).toFixed(2)
            : 0,
        groupStats,
        genderStats,
        todayWorkFromHome,
        todayLeave,
        unregisteredCount,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   POST /api/organization/change-nodal-officer/request-otp
// @desc    Request OTP to change Nodal Officer
// @access  Private
router.post('/change-nodal-officer/request-otp', auth, async (req, res) => {
  try {
    const { newNodalOfficerId } = req.body;
    
    if (!newNodalOfficerId) {
      return res.status(400).json({ message: 'New Nodal Officer ID is required.' });
    }

    const org = await Organization.findById(req.organization._id);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found.' });
    }

    // Validate the new nodal officer belongs to the organization
    const newOfficer = await Student.findOne({ _id: newNodalOfficerId, organization: org._id });
    if (!newOfficer) {
      return res.status(400).json({ message: 'Selected officer not found in your organization.' });
    }

    // Cooldown check (60s)
    if (org.nodalOfficerOtp?.lastSentAt) {
      const diffSecs = (Date.now() - org.nodalOfficerOtp.lastSentAt.getTime()) / 1000;
      if (diffSecs < 60) {
        return res.status(429).json({ message: `Please wait ${Math.ceil(60 - diffSecs)}s before requesting a new OTP.` });
      }
    }

    // Generate numeric 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    org.nodalOfficerOtp = {
      code: hashedOtp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
      lastSentAt: new Date(),
      pendingNodalOfficer: newOfficer._id
    };

    await org.save();

    // Log the action
    await AuditLog.create({
      organization: org._id,
      actorType: 'organization',
      actor: org._id,
      actorLabel: org.name,
      action: 'request_nodal_officer_otp',
      outcome: 'success',
      targetType: 'auth',
      ip: req.ip || req.connection.remoteAddress,
      metadata: { newOfficerId: newOfficer._id.toString() }
    });

    // Send email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
        <h2 style="color: #2c3e50; text-align: center;">Nodal Officer Change Verification</h2>
        <p style="font-size: 16px; color: #333;">Dear Admin,</p>
        <p style="font-size: 16px; color: #333;">You have requested to change the assigned Nodal Officer for your institution to <strong>${newOfficer.fullName}</strong>.</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #007bff; padding: 15px 20px; background: #f4f6f9; border-radius: 8px; display: inline-block;">${otp}</span>
        </div>
        <p style="font-size: 16px; color: #333;">This OTP is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
        <hr style="border-top: 1px solid #eaeaea; margin: 30px 0;" />
        <p style="font-size: 12px; color: #888; text-align: center;">
          ⚠️ <strong>Security Warning:</strong> If you did not request this change, please ignore this email or contact your administrator immediately.
        </p>
      </div>
    `;

    try {
      await sendMail({
        to: org.email,
        subject: 'Nodal Officer Change Verification - OTP',
        html: emailHtml
      });
    } catch (mailError) {
      console.error('Failed to send OTP email:', mailError);
      // We still return success to frontend so it doesn't break flow if email service is down in dev, 
      // but in production we might want to return an error.
    }

    res.json({ success: true, message: 'OTP sent to registered email address.' });
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({ message: 'Server error while requesting OTP.' });
  }
});

// @route   POST /api/organization/change-nodal-officer/verify-otp
// @desc    Verify OTP and change Nodal Officer
// @access  Private
router.post('/change-nodal-officer/verify-otp', auth, async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ message: 'OTP is required.' });
    }

    const org = await Organization.findById(req.organization._id);
    if (!org || !org.nodalOfficerOtp || !org.nodalOfficerOtp.code) {
      return res.status(400).json({ message: 'No pending Nodal Officer change request found.' });
    }

    const { code, expiresAt, attempts, pendingNodalOfficer } = org.nodalOfficerOtp;

    // Expiration check
    if (new Date() > expiresAt) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Attempts check
    if (attempts >= 5) {
      org.nodalOfficerOtp = undefined;
      await org.save();
      return res.status(400).json({ message: 'Too many failed attempts. OTP invalidated. Please request a new one.' });
    }

    // Verify code
    const hashedInputOtp = crypto.createHash('sha256').update(otp).digest('hex');
    
    if (hashedInputOtp !== code) {
      org.nodalOfficerOtp.attempts += 1;
      await org.save();
      
      // Audit log for failed attempt
      await AuditLog.create({
        organization: org._id,
        actorType: 'organization',
        actor: org._id,
        actorLabel: org.name,
        action: 'change_nodal_officer_failed',
        outcome: 'failure',
        targetType: 'auth',
        ip: req.ip || req.connection.remoteAddress,
        metadata: { reason: 'invalid_otp', attempts: org.nodalOfficerOtp.attempts }
      });

      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    // Success! Update the Nodal Officer
    const previousNodalOfficer = org.nodalOfficer;
    org.nodalOfficer = pendingNodalOfficer;
    org.nodalOfficerOtp = undefined; // clear OTP state
    
    await org.save();

    await AuditLog.create({
      organization: org._id,
      actorType: 'organization',
      actor: org._id,
      actorLabel: org.name,
      action: 'change_nodal_officer_success',
      outcome: 'success',
      targetType: 'auth',
      ip: req.ip || req.connection.remoteAddress,
      metadata: { 
        previousOfficerId: previousNodalOfficer ? previousNodalOfficer.toString() : null,
        newOfficerId: pendingNodalOfficer.toString() 
      }
    });

    res.json({ success: true, message: 'Nodal Officer successfully changed.' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Server error while verifying OTP.' });
  }
});

module.exports = router; 