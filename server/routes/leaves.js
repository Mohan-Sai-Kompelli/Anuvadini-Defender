const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');

const auth = require('../middleware/auth');
const LeaveType = require('../models/LeaveType');
const LeaveRequest = require('../models/Model_LeaveRequest');
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const Holiday = require('../models/Holiday');
const Attendance = require('../models/Attendance');
const audit = require('../services/auditService');
const pushNotificationService = require('../services/pushNotificationService');
const resolveOrgId = require('../utils/resolveOrg');
const { deptScopeIds } = require('../utils/deptScope');
const { leaveDocsUpload } = require('../middleware/leaveUpload');

let BiometricAttendance = null;
try {
  ({ BiometricAttendance } = require('../config/biometricDb'));
} catch (_e) {
  BiometricAttendance = null;
}

const router = express.Router();

/* ─────────────────────────── IST date helpers ─────────────────────────── */
const IST = 'Asia/Kolkata';
const istYMD = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(d)
  ); // 'YYYY-MM-DD'
const istDow = (ymd) => new Date(`${ymd}T12:00:00+05:30`).getDay(); // 0=Sun..6=Sat
const istStartOfDay = (ymd) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEndOfDay = (ymd) => new Date(`${ymd}T23:59:59.999+05:30`);
const todayYMD = () => istYMD(new Date());

function enumerateYMD(startYMD, endYMD) {
  const out = [];
  const cur = new Date(`${startYMD}T12:00:00+05:30`);
  const end = new Date(`${endYMD}T12:00:00+05:30`);
  while (cur <= end) {
    out.push(istYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/* No-op: multer uses memoryStorage now, so a rejected request never wrote
   anything to disk to begin with (kept as a call site for the fail() helper
   below, in case a future storage mode reintroduces temp files). */
function cleanupFiles(_req) {}

/* Turn multer's in-memory file buffers into attachment sub-docs, stored as
   base64 directly on the document (shared DB) rather than a local disk path
   — this is what makes an attachment readable from any machine running the
   server against the same MongoDB. */
function collectAttachments(req) {
  const files = req.files || {};
  const atts = [];
  for (const f of files.medicalCertificate || []) {
    atts.push({
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      category: 'medical',
      data: f.buffer.toString('base64'),
    });
  }
  for (const f of files.supportingDocuments || []) {
    atts.push({
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      category: 'supporting',
      data: f.buffer.toString('base64'),
    });
  }
  return atts;
}

/* ═══════════════════════════ LEAVE TYPES ═══════════════════════════════ */

// @route GET /api/leave-types
// @desc  Active leave types visible to the caller: global defaults + this org's
//        own, with gender/role eligibility resolved for a staff caller.
router.get('/leave-types', auth, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const types = await LeaveType.find({
      isDeleted: { $ne: true },
      active: true,
      $or: [{ organization: null }, { organization: orgId }],
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    // An org-specific type with the same code overrides the global one.
    const byCode = new Map();
    for (const t of types) {
      const existing = byCode.get(t.code);
      if (!existing || (t.organization && !existing.organization)) byCode.set(t.code, t);
    }
    let list = [...byCode.values()];

    // For a staff caller, hide types they're not eligible for (gender / role).
    if (req.student) {
      const g = req.student.gender;
      const role = req.student.role || 'faculty';
      list = list.filter((t) => {
        if (t.genderEligibility && t.genderEligibility !== 'all' && g && t.genderEligibility !== g) return false;
        if (Array.isArray(t.employmentTypeEligibility) && t.employmentTypeEligibility.length > 0 && !t.employmentTypeEligibility.includes(role))
          return false;
        return true;
      });
    }

    list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error('[leave-types] list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load leave types' });
  }
});

// @route POST /api/leave-types  (institution admin / superadmin-view is read-only)
// @desc  Create an org-scoped leave type.
router.post('/leave-types', auth, async (req, res) => {
  try {
    if (req.isSuperAdminView) return res.status(403).json({ success: false, error: 'Read-only view' });
    if (!req.organization) return res.status(403).json({ success: false, error: 'Institution admin required' });
    const b = req.body || {};
    if (!b.code || !b.name) return res.status(400).json({ success: false, error: 'code and name are required' });
    const doc = await LeaveType.create({
      ...b,
      code: String(b.code).toUpperCase().trim(),
      organization: req.organization._id,
      createdBy: req.organization._id,
    });
    audit.log(audit.fromReq(req, { action: 'leave_type.create', outcome: 'success', targetType: 'leave_type', target: doc._id, metadata: { code: doc.code } }));
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, error: 'A leave type with this code already exists' });
    console.error('[leave-types] create error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create leave type' });
  }
});

// @route PUT /api/leave-types/:id
router.put('/leave-types/:id', auth, async (req, res) => {
  try {
    if (req.isSuperAdminView) return res.status(403).json({ success: false, error: 'Read-only view' });
    if (!req.organization) return res.status(403).json({ success: false, error: 'Institution admin required' });
    const t = await LeaveType.findById(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: 'Leave type not found' });
    // An org may only edit its OWN types, never the global defaults.
    if (!t.organization || String(t.organization) !== String(req.organization._id)) {
      return res.status(403).json({ success: false, error: 'You can only edit your institution’s own leave types' });
    }
    const editable = [
      'name', 'description', 'minDays', 'maxDays', 'maxConsecutiveDays', 'yearlyQuota', 'paid',
      'carryForward', 'carryForwardMax', 'requiresApproval', 'requiresDocument', 'minAdvanceNoticeDays',
      'halfDayAllowed', 'allowEmergency', 'genderEligibility', 'employmentTypeEligibility',
      'allowCombination', 'combinableWith', 'color', 'icon', 'sortOrder', 'active',
    ];
    for (const k of editable) if (k in req.body) t[k] = req.body[k];
    t.updatedBy = req.organization._id;
    await t.save();
    audit.log(audit.fromReq(req, { action: 'leave_type.update', outcome: 'success', targetType: 'leave_type', target: t._id, metadata: { code: t.code } }));
    return res.json({ success: true, data: t });
  } catch (err) {
    console.error('[leave-types] update error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update leave type' });
  }
});

// @route DELETE /api/leave-types/:id  (soft delete, org-owned only)
router.delete('/leave-types/:id', auth, async (req, res) => {
  try {
    if (req.isSuperAdminView) return res.status(403).json({ success: false, error: 'Read-only view' });
    if (!req.organization) return res.status(403).json({ success: false, error: 'Institution admin required' });
    const t = await LeaveType.findById(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: 'Leave type not found' });
    if (!t.organization || String(t.organization) !== String(req.organization._id)) {
      return res.status(403).json({ success: false, error: 'You can only remove your institution’s own leave types' });
    }
    t.isDeleted = true;
    t.active = false;
    await t.save();
    audit.log(audit.fromReq(req, { action: 'leave_type.delete', outcome: 'success', targetType: 'leave_type', target: t._id, metadata: { code: t.code } }));
    return res.json({ success: true });
  } catch (err) {
    console.error('[leave-types] delete error:', err);
    return res.status(500).json({ success: false, error: 'Failed to remove leave type' });
  }
});

/* ═════════════════════ APPLY (enterprise, multipart) ═══════════════════ */

// @route POST /api/leaves/apply-v3
// @desc  Full leave application with type rules, working-day calc, documents,
//        approver auto-assignment, and complete server-side validation.
router.post('/leaves/apply-v3', auth, leaveDocsUpload, async (req, res) => {
  const fail = (code, error) => {
    cleanupFiles(req);
    return res.status(code).json({ success: false, error });
  };
  try {
    const student = req.student || (req.user && req.user.role !== 'organization' ? req.user : null);
    if (!student || !student._id) return fail(403, 'Only an employee can apply for leave');
    if (student.isActive === false) return fail(403, 'Your account is inactive. Contact your administrator.');

    const b = req.body || {};
    const {
      leaveTypeId, startDate, endDate, dayPortion = 'full', halfDayType = null,
      reason, description, comments, isEmergency, contactNumber, addressDuringLeave,
      workHandoverTo, expectedReturnDate, delegateId,
    } = b;

    if (!leaveTypeId) return fail(400, 'Please select a leave type');
    if (!startDate || !endDate) return fail(400, 'Start and end dates are required');
    if (!reason || !String(reason).trim()) return fail(400, 'A reason is required');

    // Resolve the leave type (global or this org's) and confirm it's usable.
    // Mobile falls back to a hardcoded offline list (ids like "local-CL") when
    // GET /leave-types is unreachable — that's never a real ObjectId, so look
    // it up by its leave-type CODE instead of crashing with a Mongoose
    // CastError on a raw _id query.
    const orgId = student.organization;
    const isRealObjectId = mongoose.isValidObjectId(leaveTypeId) && !String(leaveTypeId).startsWith('local-');
    const leaveType = await LeaveType.findOne(
      isRealObjectId
        ? { _id: leaveTypeId, isDeleted: { $ne: true }, active: true, $or: [{ organization: null }, { organization: orgId }] }
        : { code: String(leaveTypeId).replace(/^local-/, '').toUpperCase(), isDeleted: { $ne: true }, active: true, $or: [{ organization: null }, { organization: orgId }] }
    ).lean();
    if (!leaveType) return fail(400, 'Selected leave type is not available');

    // Eligibility: gender + employment role.
    if (leaveType.genderEligibility && leaveType.genderEligibility !== 'all' && student.gender && leaveType.genderEligibility !== student.gender) {
      return fail(403, `${leaveType.name} is not applicable for your profile`);
    }
    if (Array.isArray(leaveType.employmentTypeEligibility) && leaveType.employmentTypeEligibility.length > 0 && !leaveType.employmentTypeEligibility.includes(student.role || 'faculty')) {
      return fail(403, `${leaveType.name} is not available for your role`);
    }

    // Normalise dates to IST calendar days ('YYYY-MM-DD').
    const startY = /^\d{4}-\d{2}-\d{2}/.test(String(startDate)) ? String(startDate).slice(0, 10) : istYMD(startDate);
    const endY = /^\d{4}-\d{2}-\d{2}/.test(String(endDate)) ? String(endDate).slice(0, 10) : istYMD(endDate);
    if (endY < startY) return fail(400, 'End date cannot be before start date');

    const isHalf = dayPortion === 'half';
    if (isHalf) {
      if (!leaveType.halfDayAllowed) return fail(400, `${leaveType.name} cannot be taken as a half day`);
      if (startY !== endY) return fail(400, 'A half-day leave must be a single day');
      if (!['first', 'second'].includes(halfDayType)) return fail(400, 'Choose the first or second half');
    }

    // Past-date rule.
    const today = todayYMD();
    if (startY < today) return fail(400, 'You cannot apply for leave in the past');

    // ── BUG FIX: block leave on a day the employee has ALREADY checked in ──
    // (e.g. "checked in this morning, then tried to take today off"). We check
    // both the primary and biometric attendance stores across the range.
    const rangeStart = istStartOfDay(startY);
    const rangeEnd = istEndOfDay(endY);
    const inFilter = { student: student._id, type: 'in', timestamp: { $gte: rangeStart, $lte: rangeEnd } };
    const checkedIn = new Set();
    try {
      const ins = await Attendance.find(inFilter).select('timestamp').lean();
      for (const r of ins) checkedIn.add(istYMD(r.timestamp));
      if (BiometricAttendance) {
        const bio = await BiometricAttendance.find(inFilter).select('timestamp').lean();
        for (const r of bio) checkedIn.add(istYMD(r.timestamp));
      }
    } catch (e) {
      console.warn('[leaves] check-in lookup failed:', e.message);
    }
    if (checkedIn.size > 0) {
      const dates = [...checkedIn].sort();
      return fail(409, `You have already checked in on ${dates.join(', ')}, so leave cannot be applied for ${dates.length > 1 ? 'these days' : 'this day'}.`);
    }

    // Holidays for the range (global + org).
    const holidayRows = await Holiday.find({
      organization: { $in: [null, orgId] },
      date: { $gte: startY, $lte: endY },
    }).select('date').lean();
    const holidaySet = new Set(holidayRows.map((h) => h.date));

    // Working-day calculation (Mon–Fri, minus holidays). Half day = 0.5.
    let totalDays = 0;
    const workingDates = [];
    for (const ymd of enumerateYMD(startY, endY)) {
      const dow = istDow(ymd);
      if (dow === 0 || dow === 6) continue;      // weekend
      if (holidaySet.has(ymd)) continue;         // holiday
      workingDates.push(ymd);
      totalDays += 1;
    }
    if (isHalf) totalDays = 0.5;
    if (totalDays <= 0) return fail(400, 'Your selection has no working days (only weekends/holidays).');

    // Duration rules from the type.
    if (leaveType.minDays && totalDays < leaveType.minDays) return fail(400, `${leaveType.name} needs at least ${leaveType.minDays} day(s)`);
    if (leaveType.maxDays && totalDays > leaveType.maxDays) return fail(400, `${leaveType.name} allows at most ${leaveType.maxDays} day(s) per application`);
    if (leaveType.maxConsecutiveDays && totalDays > leaveType.maxConsecutiveDays) return fail(400, `${leaveType.name} allows at most ${leaveType.maxConsecutiveDays} consecutive day(s)`);

    // Advance-notice rule (emergency bypasses it when the type allows).
    const emergency = isEmergency === true || isEmergency === 'true';
    if (!(emergency && leaveType.allowEmergency) && leaveType.minAdvanceNoticeDays > 0) {
      const diffDays = Math.round((istStartOfDay(startY).getTime() - istStartOfDay(today).getTime()) / 86400000);
      if (diffDays < leaveType.minAdvanceNoticeDays) {
        return fail(400, `${leaveType.name} must be applied at least ${leaveType.minAdvanceNoticeDays} day(s) in advance.`);
      }
    }

    // Documents.
    const attachments = collectAttachments(req);
    const hasMedical = attachments.some((a) => a.category === 'medical');
    if (leaveType.requiresDocument && attachments.length === 0) {
      return fail(400, `${leaveType.name} requires a supporting document${leaveType.code === 'SL' ? ' (medical certificate)' : ''}.`);
    }
    // Sick leave of 3+ days specifically needs a medical certificate.
    if (leaveType.code === 'SL' && totalDays >= 3 && !hasMedical) {
      return fail(400, 'Sick leave of 3 or more days needs a medical certificate.');
    }

    // Overlap with an existing ACTIVE request.
    const overlapping = await LeaveRequest.findOne({
      student: student._id,
      isDeleted: { $ne: true },
      status: { $in: ['pending', 'submitted', 'approved', 'returned_for_correction'] },
      'leaveDates.start': { $lte: rangeEnd },
      'leaveDates.end': { $gte: rangeStart },
    }).select('_id leaveDates status').lean();
    if (overlapping) return fail(409, 'You already have a leave request covering these dates.');

    // Yearly quota (reserve pending + approved of the SAME type this year).
    if (leaveType.yearlyQuota && leaveType.yearlyQuota > 0) {
      const yearStart = new Date(`${startY.slice(0, 4)}-01-01T00:00:00+05:30`);
      const yearEnd = new Date(`${startY.slice(0, 4)}-12-31T23:59:59+05:30`);
      const sameType = await LeaveRequest.find({
        student: student._id,
        isDeleted: { $ne: true },
        leaveTypeCode: leaveType.code,
        status: { $in: ['pending', 'submitted', 'approved', 'returned_for_correction'] },
        'leaveDates.start': { $gte: yearStart, $lte: yearEnd },
      }).select('totalDays').lean();
      const usedOrReserved = sameType.reduce((s, r) => s + (r.totalDays || 0), 0);
      if (usedOrReserved + totalDays > leaveType.yearlyQuota) {
        const left = Math.max(0, leaveType.yearlyQuota - usedOrReserved);
        return fail(400, `Not enough ${leaveType.name} balance: ${left} day(s) left this year, you requested ${totalDays}.`);
      }
    }

    // Resolve the work-handover colleague (optional).
    const handoverId = workHandoverTo || delegateId || null;
    let handover = null;
    if (handoverId && mongoose.isValidObjectId(handoverId)) {
      handover = await Student.findOne({ _id: handoverId, organization: orgId, isActive: true }).select('_id fullName uid').lean();
      if (!handover) return fail(400, 'Selected work-handover colleague is not valid');
    }

    // ── Auto-assign the approver ("request kisko gayi hai") ──
    // Route to the department's HOD when there is one; otherwise the institution.
    let assignedTo = { kind: 'institution', ref: null, name: null, role: 'Institution Admin' };
    let hodStudent = null;
    if (student.department) {
      hodStudent = await Student.findOne({
        organization: orgId, department: student.department, role: 'hod', isActive: true,
        _id: { $ne: student._id },
      }).select('_id fullName designation').lean();
    }
    if (hodStudent) {
      assignedTo = { kind: 'hod', ref: hodStudent._id, name: hodStudent.fullName, role: hodStudent.designation || 'Head of Department' };
    } else {
      const org = await Organization.findById(orgId).select('name').lean();
      assignedTo = { kind: 'institution', ref: orgId, name: org ? org.name : 'Institution Admin', role: 'Institution Admin' };
    }

    // Build + persist the request.
    const ip = req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || null;
    const nowStatus = 'pending';
    const doc = new LeaveRequest({
      student: student._id,
      leaveType: leaveType._id,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,
      leaveDetails: reason,
      reason,
      reson: reason,
      details: reason,
      description: description || '',
      comments: comments || '',
      notes: description || '',
      dayPortion: isHalf ? 'half' : 'full',
      halfDayType: isHalf ? halfDayType : null,
      isEmergency: emergency,
      contactNumber: contactNumber || '',
      addressDuringLeave: addressDuringLeave || '',
      expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : null,
      totalDays,
      leaveDates: { start: rangeStart, end: rangeEnd },
      status: nowStatus,
      assignedTo,
      delegate: handover ? handover._id : null,
      workHandoverTo: handover ? handover._id : null,
      attachments,
      createdBy: student._id,
      submitMeta: { ip, userAgent: req.headers['user-agent'] || null, device: b.device || null },
      statusHistory: [
        { status: 'submitted', by: student._id, byName: student.fullName, byRole: 'employee', comment: reason, at: new Date(), ip },
        { status: 'pending', by: student._id, byName: student.fullName, byRole: 'employee', comment: `Assigned to ${assignedTo.name}`, at: new Date(), ip },
      ],
    });
    await doc.save();

    // Audit.
    audit.log(audit.fromReq(req, {
      action: 'leave.apply',
      outcome: 'success',
      targetType: 'leave',
      target: doc._id,
      metadata: {
        leaveType: leaveType.code, totalDays, startY, endY, dayPortion: doc.dayPortion,
        emergency, attachments: attachments.length, assignedTo: assignedTo.kind,
      },
    }));

    // Notify the assigned HOD (if a person) + the handover colleague. Institution
    // approvers use the web dashboard queue, so no push there.
    if (assignedTo.kind === 'hod' && assignedTo.ref) {
      pushNotificationService.sendNotificationToStudent(assignedTo.ref, {
        title: 'New leave request to review',
        body: `${student.fullName} applied for ${leaveType.name} (${totalDays} day${totalDays === 1 ? '' : 's'}).`,
      }, { type: 'leave_review_pending', leaveId: String(doc._id) }).catch(() => {});
    }
    if (handover) {
      pushNotificationService.sendNotificationToStudent(handover._id, {
        title: 'Work handover assigned',
        body: `${student.fullName} named you to cover their work during their leave.`,
      }, { type: 'leave_delegate_assigned', leaveId: String(doc._id) }).catch(() => {});
    }

    return res.status(201).json({ success: true, data: sanitizeLeave(doc.toObject(), student._id) });
  } catch (err) {
    cleanupFiles(req);
    if (err && err.message && /Unsupported document|not allowed|Only PDF/.test(err.message)) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error('[leaves] apply-v3 error:', err);
    return res.status(500).json({ success: false, error: 'Could not submit your leave request' });
  }
});

/* ═══════════════════════ SECURE DOCUMENT DOWNLOAD ══════════════════════ */

// @route GET /api/leaves/:id/attachments/:attId
// @desc  Stream a leave document to an AUTHORISED viewer only (the owner, the
//        student's institution/HOD, or a super-admin view). Never public.
router.get('/leaves/:id/attachments/:attId', auth, async (req, res) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id).populate('student', 'organization department fullName').lean();
    if (!leave || leave.isDeleted) return res.status(404).json({ success: false, error: 'Not found' });

    const att = (leave.attachments || []).find((a) => String(a._id) === String(req.params.attId));
    if (!att) return res.status(404).json({ success: false, error: 'Attachment not found' });

    // Permission: owner OR same-org admin/HOD OR super-admin view.
    let allowed = false;
    if (req.student && String(req.student._id) === String(leave.student?._id || leave.student)) allowed = true;
    if (!allowed && req.organization && leave.student && String(leave.student.organization) === String(req.organization._id)) {
      allowed = true;
      if (req.isHod && req.hodDepartment && leave.student.department !== req.hodDepartment) allowed = false;
    }
    if (!allowed) return res.status(403).json({ success: false, error: 'You are not allowed to view this document' });

    audit.log(audit.fromReq(req, {
      action: 'leave.document_download', outcome: 'info', targetType: 'leave', target: leave._id,
      metadata: { attachment: String(att._id), name: att.originalName },
    }));

    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(att.originalName || att.fileName || 'document').replace(/"/g, '')}"`);

    // Current attachments: base64 stored on the document itself (works from
    // any machine sharing the DB). Legacy attachments (pre-migration) only
    // have a local disk path — still served, but only from whichever machine
    // originally saved that file.
    if (att.data) {
      return res.end(Buffer.from(att.data, 'base64'));
    }
    if (att.path && fs.existsSync(att.path)) {
      return fs.createReadStream(att.path).pipe(res);
    }
    return res.status(404).json({ success: false, error: 'File is no longer available on this server' });
  } catch (err) {
    console.error('[leaves] download error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load document' });
  }
});

/* Shape a leave doc for the client: strip disk paths, expose download URLs. */
function sanitizeLeave(l, viewerId) {
  const atts = (l.attachments || []).map((a) => ({
    id: String(a._id),
    originalName: a.originalName,
    mimeType: a.mimeType,
    size: a.size,
    category: a.category,
    url: `/api/leaves/${l._id}/attachments/${a._id}`,
  }));
  return { ...l, attachments: atts };
}

module.exports = router;
module.exports.sanitizeLeave = sanitizeLeave;
