const express = require('express');
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const LeaveRequest = require('../models/Model_LeaveRequest');
const resolveOrgId = require('../utils/resolveOrg');
const { deptScopeIds } = require('../utils/deptScope');

const router = express.Router();

// Annual quotas (move to org settings when policy is configurable)
const QUOTA_TOTAL = 24;
const QUOTA_MEDICAL = 10;

const MS_PER_DAY = 86400000;

function daysInYear(startDate, endDate, year) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const s = new Date(Math.max(new Date(startDate), yearStart));
  const e = new Date(Math.min(new Date(endDate), yearEnd - 1));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return Math.floor((e - s) / MS_PER_DAY) + 1;
}

// @route   GET /api/leave-balances
// @desc    Per-employee leave usage this year, computed from approved requests
router.get('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    const year = new Date().getFullYear();

    // HOD web sessions are promoted to an organization context but must only
    // ever see their own department's staff — mirrors every other org-scoped
    // report route (compliance, attendance, spot-checks, etc.).
    const scope = await deptScopeIds(req);
    const staffQuery = { organization, isActive: true };
    if (scope) staffQuery._id = { $in: scope };

    const [staff, approved] = await Promise.all([
      Student.find(staffQuery)
        .select('fullName department uid')
        .sort({ fullName: 1 })
        .limit(500)
        .lean(),
      LeaveRequest.find({ status: 'approved' })
        .populate('student', 'organization')
        .lean(),
    ]);

    const byStudent = new Map();
    for (const lr of approved) {
      const stu = lr.student;
      if (!stu || String(stu.organization) !== String(organization)) continue;
      if (!lr.leaveDates || !lr.leaveDates.start) continue;
      const used = daysInYear(lr.leaveDates.start, lr.leaveDates.end || lr.leaveDates.start, year);
      if (!used) continue;
      const id = String(stu._id);
      const cur = byStudent.get(id) || { used: 0, medical: 0, certs: 0, lastLeave: null };
      cur.used += used;
      const isMedical = /medical|sick|ill|hospital/i.test(lr.leaveDetails || '');
      if (isMedical) {
        cur.medical += used;
        cur.certs += 1;
      }
      const end = new Date(lr.leaveDates.end || lr.leaveDates.start);
      if (!cur.lastLeave || end > cur.lastLeave) cur.lastLeave = end;
      byStudent.set(id, cur);
    }

    const balances = staff.map((s) => {
      const b = byStudent.get(String(s._id)) || { used: 0, medical: 0, certs: 0, lastLeave: null };
      return {
        id: s._id,
        name: s.fullName,
        department: s.department || s.class || s.bureau || '—',
        uid: s.uid,
        used: b.used,
        quota: QUOTA_TOTAL,
        medicalUsed: b.medical,
        medicalQuota: QUOTA_MEDICAL,
        certs: b.certs,
        lastLeave: b.lastLeave,
      };
    });

    return res.json({ success: true, year, balances });
  } catch (err) {
    console.error('[LeaveBalances] error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
