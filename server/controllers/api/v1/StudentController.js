const jwt = require("jsonwebtoken");
const Student = require("../../../models/Student");
const LeaveRequestSchema = require("../../../models/Model_LeaveRequest");
const passport = require("../../../config/passport");
const CheakoutRequestSchema = require("../../../models/Model_cheakoutRequest");
const pushNotificationService = require("../../../services/pushNotificationService");
const { checkedInDatesInRange } = require("../../../utils/leaveCheckinGuard");
require("dotenv").config();

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Resolve + validate the leave delegate ("colleague who covers my work while
 * I'm on leave"). Picking a delegate is MANDATORY whenever the applicant's
 * department actually has other active members to pick from; it is skipped
 * only when there is genuinely nobody to assign. The delegate must be another
 * ACTIVE member of the applicant's own organization + department — never a
 * stranger the client could name from anywhere else. Returns `{ error }` when
 * the delegate is missing-but-required or invalid.
 */
async function resolveDelegate(applicant, delegateId) {
  if (!delegateId) {
    if (applicant.department) {
      const hasColleagues = await Student.exists({
        _id: { $ne: applicant._id },
        organization: applicant.organization,
        department: applicant.department,
        isActive: true,
      });
      if (hasColleagues) {
        return { error: "Please select a colleague who will cover your work while you are on leave" };
      }
    }
    return { delegateId: null };
  }
  if (String(delegateId) === String(applicant._id)) {
    return { error: "You cannot assign yourself as the covering colleague" };
  }
  const delegate = await Student.findOne({
    _id: delegateId,
    organization: applicant.organization,
    department: applicant.department,
    isActive: true,
  }).select('_id fullName uid fcmToken');
  if (!delegate) {
    return { error: "Selected colleague was not found in your department" };
  }
  return { delegateId: delegate._id, delegate };
}

/** Fire-and-forget push notification to the delegate. Never blocks/breaks the leave submission. */
function notifyDelegate(delegate, applicant, leaveDates) {
  if (!delegate) return;
  pushNotificationService
    .sendNotificationToStudent(
      delegate._id,
      {
        title: 'You have been assigned to cover a colleague',
        body: `${applicant.fullName} is on leave from ${fmtDate(leaveDates.start)} to ${fmtDate(leaveDates.end)} and has asked you to cover their work.`,
      },
      {
        type: 'leave_delegate_assigned',
        action: 'leave_delegate_assigned',
        applicantId: String(applicant._id),
        applicantName: applicant.fullName,
        startDate: new Date(leaveDates.start).toISOString(),
        endDate: new Date(leaveDates.end).toISOString(),
      }
    )
    .catch((e) => console.error('[leave] delegate notification failed:', e.message));
}

const StudentLogin = (req, res, next) => {
  passport.authenticate("local", { session: false }, (err, student, info) => {
    console.log("req.body:", req.body);

    if (err || !student)
      return res.status(400).json({ error: info?.message || "Login failed" });

    const payload = { id: student._id, uid: student.uid };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });
    console.log(token, "token");

    res.json({ token: "Bearer " + token });
  })(req, res, next);
};

const LeaveRequestController = async (req, res) => {
  try {
    if (!req.user) {
      return res
        .status(403)
        .json({ error: "Only students can create leave requests" });
    }
    const { leaveDetails, leaveDates, status, delegateId } = req.body;

    if (!leaveDetails || !leaveDates || !leaveDates.start || !leaveDates.end) {
      return res
        .status(400)
        .json({ error: "Leave details and dates are required" });
    }
    // Prevent duplicate/overlapping leave applications for the same student —
    // but ONLY against a still-ACTIVE request (pending/approved). A REJECTED (or
    // cancelled) leave must NOT block a fresh application for the same dates:
    // after an admin rejects and then asks the employee to re-apply, they were
    // otherwise stuck on "You already have a leave covering these dates". Matches
    // applyLeaveV2's overlap logic.
    try {
      const start = new Date(leaveDates.start);
      const end = new Date(leaveDates.end);
      const overlapping = await LeaveRequestSchema.findOne({
        student: req.user._id,
        status: { $in: ['pending', 'approved'] },
        'leaveDates.start': { $lte: end },
        'leaveDates.end': { $gte: start },
      }).select({ _id: 1, leaveDates: 1, status: 1 });
      if (overlapping) {
        return res
          .status(409)
          .json({ error: "You already have a leave covering these dates" });
      }
    } catch (e) {
      // fall through to creation if overlap check fails unexpectedly
    }

    // Block leave on any day the employee has ALREADY checked in (can't take a
    // day off you've already attended). Fixes: filing today's leave after
    // this-morning's check-in.
    try {
      const blocked = await checkedInDatesInRange(req.user._id, leaveDates.start, leaveDates.end);
      if (blocked.length) {
        return res.status(409).json({
          error: `You have already checked in on ${blocked.join(", ")}, so leave cannot be applied for ${blocked.length > 1 ? "these days" : "this day"}.`,
        });
      }
    } catch (e) { /* non-fatal — proceed if the lookup fails unexpectedly */ }

    // Mandatory (when colleagues exist): who covers the work during this leave.
    const { delegateId: resolvedDelegateId, delegate, error: delegateError } =
      await resolveDelegate(req.user, delegateId);
    if (delegateError) {
      return res.status(400).json({ error: delegateError });
    }

    const newLeaveRequest = new LeaveRequestSchema({
      student: req.user._id,
      leaveDetails,
      leaveDates,
      status,
      delegate: resolvedDelegateId,
    });

    await newLeaveRequest.save();
    notifyDelegate(delegate, req.user, leaveDates);
    res.status(201).json({ message: "Leave request created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const checkOutRequestController = async (req, res) => {
  const { date, details, evidence } = await req.body;

  if (!date || !details) {
    return res.status(400).json({ error: "Date and details are required" });
  }

  // Accept either an array of base64/data-URL strings OR { image, label }
  // objects — matches the same normalisation used for field/outreach evidence.
  const evidenceDocs = Array.isArray(evidence)
    ? evidence
        .map((e) => (typeof e === 'string' ? { image: e } : (e && e.image ? { label: e.label, image: e.image } : null)))
        .filter((e) => e && typeof e.image === 'string' && e.image.length > 0)
        .slice(0, 6)
    : [];

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const existingRequest = await CheakoutRequestSchema.findOne({
    student: req.user._id,
    status: "pending",
    date: { $gte: startOfDay, $lte: endOfDay },
  });

  if (existingRequest) {
    return res
      .status(400)
      .json({ error: "You already have a pending request for this date" });
  }

  const newRequest = new CheakoutRequestSchema({
    student: req.user._id,
    date,
    details,
    evidence: evidenceDocs,
    status: "pending",
  });

  await newRequest.save();

  return res
    .status(201)
    .json({ message: "Checkout request created successfully" });
};

module.exports = {
  StudentLogin,
  LeaveRequestController,
  checkOutRequestController,
  // Accepts { startDate, endDate, reason, notes }
  applyLeaveV2: async (req, res) => {
    try {
      const user = req.user || req.student;
      if (!user) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const { startDate, endDate, reason, notes, delegateId } = req.body || {};

      if (!startDate || !endDate || !reason) {
        return res
          .status(400)
          .json({ success: false, error: "startDate, endDate and reason are required" });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid startDate or endDate" });
      }
      if (end < start) {
        return res
          .status(400)
          .json({ success: false, error: "End date cannot be before start date" });
      }

      // Validate that startDate is not in the past relative to today in IST
      const now = new Date();
      const utcOffset = now.getTimezoneOffset() * 60000;
      const utcTime = now.getTime() + utcOffset;
      const istTime = new Date(utcTime + (3600000 * 5.5)); // IST is UTC+5:30
      const todayIST = new Date(istTime.getFullYear(), istTime.getMonth(), istTime.getDate());

      let sy, sm, sd;
      if (typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        [sy, sm, sd] = startDate.split('-').map(Number);
      } else {
        const dObj = new Date(startDate);
        const dUtc = dObj.getTime() + (dObj.getTimezoneOffset() * 60000);
        const dIst = new Date(dUtc + (3600000 * 5.5));
        sy = dIst.getFullYear();
        sm = dIst.getMonth() + 1;
        sd = dIst.getDate();
      }
      const startIST = new Date(sy, sm - 1, sd);

      if (startIST < todayIST) {
        return res
          .status(400)
          .json({ success: false, error: "Start date cannot be in the past" });
      }

      // Prevent duplicate/overlapping leave applications for the same student —
      // but only against a request that's still ACTIVE (pending/approved). A
      // rejected or cancelled request must not block re-applying for the same
      // dates (e.g. "the issue is resolved, please re-apply and I'll approve it").
      try {
        const overlapping = await LeaveRequestSchema.findOne({
          student: user._id,
          status: { $in: ['pending', 'approved'] },
          'leaveDates.start': { $lte: end },
          'leaveDates.end': { $gte: start },
        }).select({ _id: 1, leaveDates: 1, status: 1 });
        if (overlapping) {
          return res
            .status(409)
            .json({ success: false, error: "You already have a leave covering these dates" });
        }
      } catch (e) {
        // proceed if overlap check fails unexpectedly
      }

      // Block leave on any day the employee has ALREADY checked in — fixes
      // filing today's leave after this-morning's check-in.
      try {
        const blocked = await checkedInDatesInRange(user._id, start, end);
        if (blocked.length) {
          return res.status(409).json({
            success: false,
            error: `You have already checked in on ${blocked.join(", ")}, so leave cannot be applied for ${blocked.length > 1 ? "these days" : "this day"}.`,
          });
        }
      } catch (e) { /* non-fatal */ }

      // Mandatory (when colleagues exist): who covers the work during this leave.
      const { delegateId: resolvedDelegateId, delegate, error: delegateError } =
        await resolveDelegate(user, delegateId);
      if (delegateError) {
        return res.status(400).json({ success: false, error: delegateError });
      }

      const doc = new LeaveRequestSchema({
        student: user._id,
        leaveDetails: reason,
        details: reason,
        reason,
        reson: reason,
        notes,
        leaveDates: { start, end },
        status: "pending",
        delegate: resolvedDelegateId,
      });
      await doc.save();
      notifyDelegate(delegate, user, { start, end });
      return res.status(201).json({ success: true, data: doc });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  // Returns current student's leave requests, optionally filtered by status
  getMyLeaveRequests: async (req, res) => {
    try {
      const user = req.user || req.student;
      console.log('[getMyLeaveRequests] auth user present:', !!user, 'id:', user?._id);
      console.log('[getMyLeaveRequests] headers.authorization present:', !!req.headers?.authorization);
      console.log('[getMyLeaveRequests] query params:', req.query);
      if (!user) {
        console.warn('[getMyLeaveRequests] Unauthorized request - missing req.user/req.student');
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      // Build optional status filter
      const rawStatus = (req.query?.status || '').toString().trim().toLowerCase();
      const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'cancelled']);
      const statusFilter = allowedStatuses.has(rawStatus) ? rawStatus : undefined;

      console.log('[getMyLeaveRequests] querying by student id:', user._id, 'status:', statusFilter || 'any');
      let leaves = await LeaveRequestSchema.findByStudentId(user._id, { sort: { createdAt: -1 } })
        .populate('delegate', 'fullName uid designation')
        .populate('workHandoverTo', 'fullName uid designation')
        .lean();
      if (statusFilter) {
        leaves = leaves.filter((d) => (d?.status || 'pending').toLowerCase() === statusFilter);
      }

      // Never leak on-disk paths: expose each attachment as a guarded download
      // URL + safe metadata only.
      const shaped = leaves.map((l) => ({
        ...l,
        attachments: (l.attachments || []).map((a) => ({
          id: String(a._id),
          originalName: a.originalName,
          mimeType: a.mimeType,
          size: a.size,
          category: a.category,
          url: `/api/leaves/${l._id}/attachments/${a._id}`,
        })),
      }));

      console.log('[getMyLeaveRequests] result count:', shaped.length);
      return res.json({ success: true, data: shaped });
    } catch (error) {
      console.error('[getMyLeaveRequests] error:', error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  // Lets a student cancel their OWN leave request within a short window after
  // submitting it — for undoing a mistaken application before it's reviewed.
  // Only allowed while status is still 'pending' AND within 1 hour of createdAt.
  cancelMyLeaveRequest: async (req, res) => {
    try {
      const user = req.user || req.student;
      if (!user) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const { id } = req.params;
      const leave = await LeaveRequestSchema.findOne({ _id: id, student: user._id });
      if (!leave) {
        return res.status(404).json({ success: false, error: "Leave request not found" });
      }
      if (leave.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: "Only a pending leave request can be cancelled",
        });
      }
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const ageMs = Date.now() - new Date(leave.createdAt).getTime();
      if (ageMs > ONE_HOUR_MS) {
        return res.status(400).json({
          success: false,
          error: "This leave request can no longer be cancelled — the 1-hour window has passed",
        });
      }
      // Mark cancelled instead of deleting — the request must stay visible in
      // history (labelled "Cancelled"), not silently vanish from the list.
      leave.status = 'cancelled';
      await leave.save();
      return res.json({ success: true, message: "Leave request cancelled", data: leave });
    } catch (error) {
      console.error('[cancelMyLeaveRequest] error:', error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  // Same "undo a mistake" allowance as cancelMyLeaveRequest, for checkout
  // requests — the mobile Requests screen previously had no way to cancel a
  // pending checkout request at all (only leave/field requests could be
  // cancelled), so a pending one just sat there uncancellable.
  cancelMyCheckoutRequest: async (req, res) => {
    try {
      const user = req.user || req.student;
      if (!user) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const { id } = req.params;
      const checkoutRequest = await CheakoutRequestSchema.findOne({ _id: id, student: user._id });
      if (!checkoutRequest) {
        return res.status(404).json({ success: false, error: "Checkout request not found" });
      }
      if (checkoutRequest.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: "Only a pending checkout request can be cancelled",
        });
      }
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const ageMs = Date.now() - new Date(checkoutRequest.createdAt).getTime();
      if (ageMs > ONE_HOUR_MS) {
        return res.status(400).json({
          success: false,
          error: "This checkout request can no longer be cancelled — the 1-hour window has passed",
        });
      }
      checkoutRequest.status = 'cancelled';
      await checkoutRequest.save();
      return res.json({ success: true, message: "Checkout request cancelled", data: checkoutRequest });
    } catch (error) {
      console.error('[cancelMyCheckoutRequest] error:', error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  // Colleagues the logged-in faculty/staff member can pick as a leave delegate:
  // other ACTIVE members of their own organization + department.
  getDepartmentColleagues: async (req, res) => { console.log('getDepartmentColleagues called!', req.user?.uid, req.user?.department);
    try {
      const user = req.user || req.student;
      if (!user) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!user.department) {
        return res.json({ success: true, data: [] });
      }
      const colleagues = await Student.find({
        _id: { $ne: user._id },
        organization: user.organization,
        department: user.department,
        isActive: true,
      })
        .select('fullName uid designation role')
        .sort({ fullName: 1 });
      return res.json({ success: true, data: colleagues });
    } catch (error) {
      console.error('[getDepartmentColleagues] error:', error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
};
