const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const RegularizationRequest = require('../models/RegularizationRequest');
const Attendance = require('../models/Attendance');
const audit = require('../services/auditService');
const auth = require('../middleware/auth');
const superAdminAuth = require('../middleware/superAdminAuth');

// Evidence upload: kept in memory and stored as base64 on the document itself
// (shared DB) rather than written to this server instance's local disk —
// otherwise a different machine serving the same shared MongoDB can never
// read back what THIS machine's disk holds. `uploadsDir` is kept only so
// pre-migration evidence already on disk can still be served (see below).
const uploadsDir = path.join(__dirname, '../uploads/regularization');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max (≈4MB once base64-encoded)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and PDF files are allowed.'), false);
  },
});

// Shared by the super-admin and Admin/HOD action endpoints so the
// approve/reject + attendance-creation logic can't drift between the two.
async function applyRegularizationAction(request, { action, adminRemarks, actorLabel }) {
  if (action === 'reject') {
    if (!adminRemarks) {
      const err = new Error('Remarks are required for rejection.');
      err.status = 400;
      throw err;
    }
    request.status = 'rejected';
    request.actionBy = actorLabel;
    request.actionDate = new Date();
    request.adminRemarks = adminRemarks;
    await request.save();

    audit.log({
      organization: request.organization,
      actorType: 'system',
      actorLabel,
      action: 'regularization.rejected',
      outcome: 'success',
      targetType: 'regularization',
      target: request._id,
      metadata: { adminRemarks },
    });

    return request;
  }

  if (action === 'approve') {
    request.status = 'approved';
    request.actionBy = actorLabel;
    request.actionDate = new Date();
    request.adminRemarks = adminRemarks;

    // Create discrete 'in' and/or 'out' records for the approved missing punches
    const newAttendanceIds = [];

    if ((request.type === 'missing_check_in' || request.type === 'both') && request.requestedCheckInTime) {
      const checkIn = new Attendance({
        student: request.student,
        organization: request.organization,
        type: 'in',
        timestamp: request.requestedCheckInTime,
        isRegularized: true,
        regularizationReason: request.reasonType,
        regularizationRequestId: request._id,
        status: 'success',
        authMethod: 'manual',
      });
      await checkIn.save();
      newAttendanceIds.push(checkIn._id);
    }

    if ((request.type === 'missing_check_out' || request.type === 'both') && request.requestedCheckOutTime) {
      const checkOut = new Attendance({
        student: request.student,
        organization: request.organization,
        type: 'out',
        timestamp: request.requestedCheckOutTime,
        isRegularized: true,
        regularizationReason: request.reasonType,
        regularizationRequestId: request._id,
        status: 'success',
        authMethod: 'manual',
      });
      await checkOut.save();
      newAttendanceIds.push(checkOut._id);
    }

    await request.save();

    audit.log({
      organization: request.organization,
      actorType: 'system',
      actorLabel,
      action: 'regularization.approved',
      outcome: 'success',
      targetType: 'regularization',
      target: request._id,
      metadata: { attendanceIds: newAttendanceIds },
    });

    return request;
  }

  const err = new Error('Invalid action.');
  err.status = 400;
  throw err;
}

/* =========================================================================
   EMPLOYEE ENDPOINTS (auth)
========================================================================= */

// Create a new regularization request
router.post('/', auth, upload.any(), async (req, res) => {
  try {
    const { date, type, reasonType, description, requestedCheckInTime, requestedCheckOutTime } = req.body;

    // Check for duplicate pending requests for the same date
    const existing = await RegularizationRequest.findOne({
      student: req.user._id,
      date: new Date(date),
      status: 'pending',
    });
    if (existing) {
      return res.status(400).json({ error: 'A pending request already exists for this date.' });
    }

    const files = req.files || (req.file ? [req.file] : []);
    const evidenceList = files.map(f => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`);
    const evidenceData = evidenceList.length > 1 ? evidenceList : (evidenceList[0] || null);

    const request = new RegularizationRequest({
      student: req.user._id,
      organization: req.user.organization,
      date: new Date(date),
      type,
      reasonType,
      description,
      requestedCheckInTime: requestedCheckInTime ? new Date(requestedCheckInTime) : undefined,
      requestedCheckOutTime: requestedCheckOutTime ? new Date(requestedCheckOutTime) : undefined,
      evidenceData,
    });

    await request.save();

    res.status(201).json({ success: true, request });
  } catch (error) {
    console.error('Create Regularization Error:', error);
    res.status(500).json({ error: 'Failed to create regularization request.' });
  }
});

// Get employee's own requests
router.get('/my-requests', auth, async (req, res) => {
  try {
    const requests = await RegularizationRequest.find({ student: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (error) {
    console.error('Get My Requests Error:', error);
    res.status(500).json({ error: 'Failed to fetch requests.' });
  }
});

// Cancel an employee's own pending regularization request
router.delete('/:id', auth, async (req, res) => {
  try {
    const request = await RegularizationRequest.findOne({
      _id: req.params.id,
      student: req.user._id,
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled.' });
    }

    request.status = 'cancelled';
    request.actionDate = new Date();
    request.actionBy = 'Applicant';
    await request.save();

    res.json({ success: true, message: 'Regularization request cancelled.', request });
  } catch (error) {
    console.error('Cancel Regularization Error:', error);
    res.status(500).json({ error: 'Failed to cancel request.' });
  }
});

/* =========================================================================
   Admin / HOD ENDPOINTS (auth, organization-scoped)
   Institute admins (Admin) see every request for their organization; HODs
   (req.isHod / req.hodDepartment, set by the auth middleware) only see
   requests from students in their own department.
========================================================================= */

// List requests for the caller's organization (department-scoped for HODs)
router.get('/org', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const { status } = req.query;
    const query = { organization: req.organization._id, status: { $ne: 'cancelled' } };
    if (status && status !== 'all') query.status = status;

    let requests = await RegularizationRequest.find(query)
      .populate('student', 'fullName uid role department')
      .sort({ createdAt: -1 });

    if (req.isHod && req.hodDepartment) {
      requests = requests.filter((r) => r.student?.department === req.hodDepartment);
    }

    res.json({ success: true, requests });
  } catch (error) {
    console.error('Org Regularization List Error:', error);
    res.status(500).json({ error: 'Failed to fetch requests.' });
  }
});

// Approve or reject a request (Admin, or HOD within their own department)
router.post('/org/:id/action', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ error: 'Organization context required.' });
    }
    if (req.isSuperAdminView) {
      return res.status(403).json({ error: 'Super admin institute view is read-only.' });
    }

    const { action, adminRemarks } = req.body;
    const request = await RegularizationRequest.findById(req.params.id).populate('student', 'fullName uid department');
    if (!request) return res.status(404).json({ error: 'Request not found.' });

    if (String(request.organization) !== String(req.organization._id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (req.isHod && req.hodDepartment && request.student?.department !== req.hodDepartment) {
      return res.status(403).json({ error: 'Access denied. Student not in your department.' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}.` });
    }

    const actorLabel = req.isHod
      ? `HOD${req.hodDepartment ? ' - ' + req.hodDepartment : ''}`
      : (req.organization.name || 'Institute Admin');

    const updated = await applyRegularizationAction(request, { action, adminRemarks, actorLabel });
    res.json({ success: true, request: updated });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Org Regularization Action Error:', error);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

/* =========================================================================
   SUPER ADMIN ENDPOINTS (superAdminAuth)
========================================================================= */

// Get summary stats for the dashboard
router.get('/superadmin/stats', superAdminAuth, async (req, res) => {
  try {
    const total = await RegularizationRequest.countDocuments();
    const pending = await RegularizationRequest.countDocuments({ status: 'pending' });
    const approved = await RegularizationRequest.countDocuments({ status: 'approved' });
    const rejected = await RegularizationRequest.countDocuments({ status: 'rejected' });
    res.json({ success: true, stats: { total, pending, approved, rejected } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// List all requests with filters and pagination
router.get('/superadmin', superAdminAuth, async (req, res) => {
  try {
    const { page = 1, pageSize = 25, status, search } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;

    let studentIds = null;
    if (search) {
      const regex = new RegExp(search, 'i');
      const Student = mongoose.model('Student');
      const students = await Student.find({ fullName: regex }, '_id');
      studentIds = students.map((s) => s._id);
      query.student = { $in: studentIds };
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);

    const requests = await RegularizationRequest.find(query)
      .populate('student', 'fullName uid role')
      .populate('organization', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await RegularizationRequest.countDocuments(query);

    res.json({ success: true, requests, total });
  } catch (error) {
    console.error('Superadmin List Error:', error);
    res.status(500).json({ error: 'Failed to fetch requests.' });
  }
});

// Approve or reject a request
router.post('/superadmin/:id/action', superAdminAuth, async (req, res) => {
  try {
    const { action, adminRemarks } = req.body; // action: 'approve' or 'reject'
    const request = await RegularizationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (request.status !== 'pending') return res.status(400).json({ error: `Request is already ${request.status}.` });

    const updated = await applyRegularizationAction(request, {
      action,
      adminRemarks,
      actorLabel: 'Anuvadini Super Admin',
    });
    res.json({ success: true, request: updated });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Superadmin Action Error:', error);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

module.exports = router;
