const express = require('express');
const auth = require('../middleware/authOrSuperAdmin');
const Organization = require('../models/Organization');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const SpotCheck = require('../models/SpotCheck');
const { deptScopeIds } = require('../utils/deptScope');

const router = express.Router();

// Optional member-id filters for the metric helpers (HOD department scoping).
const stuF = (ids) => (ids ? { student: { $in: ids } } : {});
const facF = (ids) => (ids ? { faculty: { $in: ids } } : {});
const docF = (ids) => (ids ? { doctor: { $in: ids } } : {});

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);
const clampPct = (v) => (v == null ? null : Math.max(0, Math.min(100, v)));

function getEndISO(date) {
  const d = new Date(date);
  if (d.getHours() > 0 || d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end: end > now ? now : end };
}

// Working days (Mon–Sat) elapsed between two dates
function workingDays(start, end) {
  let count = 0;
  const d = new Date(start);
  while (d < end) {
    if (d.getDay() !== 0) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 1);
}

function getRanges(timeframe, now = new Date()) {
  const ranges = [];
  if (timeframe === '1w') {
    for (let i = 6; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const capEnd = end > now ? now : end;
      ranges.push({
        label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        start,
        end: capEnd,
      });
    }
  } else if (timeframe === '1m') {
    for (let i = 29; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const capEnd = end > now ? now : end;
      ranges.push({
        label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        start,
        end: capEnd,
      });
    }
  } else if (timeframe === '4w') {
    for (let i = 3; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i + 1) * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const capEnd = end > now ? now : end;
      ranges.push({
        label: `Wk ${4 - i}`,
        start,
        end: capEnd,
      });
    }
  } else {
    const count = 6;
    for (let i = count - 1; i >= 0; i -= 1) {
      const { start, end } = monthRange(-i);
      ranges.push({
        label: start.toLocaleDateString('en-GB', { month: 'short' }),
        start,
        end,
      });
    }
  }
  return ranges;
}

// Count of each weekday index (Mon=0…Sat=5) elapsed in the range
function weekdayCounts(start, end) {
  const counts = [0, 0, 0, 0, 0, 0];
  const d = new Date(start);
  while (d < end) {
    const idx = (d.getDay() + 6) % 7;
    if (idx < 6) counts[idx] += 1;
    d.setDate(d.getDate() + 1);
  }
  return counts;
}

// Distinct present student-days for an org in a window
async function presentStudentDays(orgId, start, end, scopeIds) {
  const rows = await Attendance.aggregate([
    {
      $match: {
        organization: orgId,
        ...stuF(scopeIds),
        type: 'in',
        timestamp: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: {
          student: '$student',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        },
      },
    },
    { $count: 'n' },
  ]);
  return rows.length ? rows[0].n : 0;
}

async function attendancePct(orgId, start, end, staffCount, scopeIds) {
  if (!staffCount) return null;
  const present = await presentStudentDays(orgId, start, end, scopeIds);
  return clampPct(pct(present, staffCount * workingDays(start, end)));
}

async function teachingPct(orgId, start, end, scopeIds) {
  const [slotsByDay, conducted] = await Promise.all([
    Timetable.aggregate([
      { $match: { organization: orgId, ...facF(scopeIds), deletedAt: null } },
      { $group: { _id: '$day', n: { $sum: 1 } } },
    ]),
    ClassCheckin.countDocuments({
      organization: orgId,
      ...facF(scopeIds),
      status: { $in: ['conducted', 'deviation'] },
      createdAt: { $gte: start, $lt: end },
    }),
  ]);
  const dayCounts = weekdayCounts(start, end);
  const expected = slotsByDay.reduce(
    (sum, s) => sum + (dayCounts[s._id] || 0) * s.n,
    0
  );
  if (!expected) return null;
  return clampPct(pct(conducted, expected));
}

async function spotCheckPct(orgId, start, end, scopeIds) {
  const rows = await SpotCheck.aggregate([
    { $match: { organization: orgId, ...stuF(scopeIds), issuedAt: { $gte: start, $lt: end } } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  const responded = byStatus.responded || 0;
  const decided = responded + (byStatus.missed || 0);
  if (!decided) return null;
  return clampPct(pct(responded, decided));
}

function rating(score) {
  if (score == null) return '—';
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  return 'C';
}

// @route   GET /api/compliance/colleges
// @desc    Compliance view — per-college compliance metrics for the current month
router.get('/colleges', auth, async (req, res) => {
  try {
    const { start, end } = monthRange(0);
    const prev = monthRange(-1);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = getEndISO(end);

    // HOD: a single "college" card = their own department's compliance.
    const scope = await deptScopeIds(req);
    if (scope) {
      const org = await Organization.findById(req.organization._id).select('name address state').lean();
      const staff = scope.length;
      const [attendance, teaching, spot, prevAttendance] = await Promise.all([
        attendancePct(req.organization._id, start, end, staff, scope),
        teachingPct(req.organization._id, start, end, scope),
        spotCheckPct(req.organization._id, start, end, scope),
        attendancePct(req.organization._id, prev.start, prev.end, staff, scope),
      ]);
      const parts = [attendance, teaching, spot].filter((v) => v != null);
      const composite = parts.length ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : null;
      return res.json({
        success: true,
        colleges: [
          {
            id: org._id,
            name: `${org.name} — ${req.hodDepartment} Dept`,
            state: org.state || org.address?.state || '—',
            staff,
            attendance,
            teaching,
            spotCheck: spot,
            rating: rating(composite),
            trend: attendance != null && prevAttendance != null ? Math.round((attendance - prevAttendance) * 10) / 10 : null,
          },
        ],
      });
    }

    const orgs = await Organization.find({ isActive: { $ne: false } })
      .select('name address state')
      .lean();

    const colleges = await Promise.all(
      orgs.map(async (org) => {
        const staff = await Student.countDocuments({ organization: org._id, isActive: true });
        const [attendance, teaching, spot, prevAttendance] = await Promise.all([
          attendancePct(org._id, start, end, staff),
          teachingPct(org._id, start, end),
          spotCheckPct(org._id, start, end),
          attendancePct(org._id, prev.start, prev.end, staff),
        ]);
        const parts = [attendance, teaching, spot].filter((v) => v != null);
        const composite = parts.length
          ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length)
          : null;
        return {
          id: org._id,
          name: org.name,
          state: org.state || org.address?.state || '—',
          staff,
          attendance,
          teaching,
          spotCheck: spot,
          rating: rating(composite),
          trend:
            attendance != null && prevAttendance != null
              ? Math.round((attendance - prevAttendance) * 10) / 10
              : null,
        };
      })
    );

    return res.json({ success: true, colleges });
  } catch (err) {
    console.error('[Compliance] colleges error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/compliance/trend
// @desc    Network-wide monthly attendance/teaching for last 6 months
router.get('/trend', auth, async (req, res) => {
  try {
    // HOD: restrict the whole trend to their org + department members.
    const scope = await deptScopeIds(req);
    let orgIds;
    let totalStaff;
    if (scope) {
      orgIds = [req.organization._id];
      totalStaff = scope.length;
    } else if (req.organization) {
      orgIds = [req.organization._id];
      totalStaff = await Student.countDocuments({ organization: req.organization._id, isActive: true });
    } else {
      const orgs = await Organization.find({ isActive: { $ne: false } }).select('_id').lean();
      orgIds = orgs.map((o) => o._id);
      totalStaff = await Student.countDocuments({ organization: { $in: orgIds }, isActive: true });
    }

    const timeframe = req.query.timeframe || '6m';
    const { startDate, endDate } = req.query;
    const byDepartment = req.query.byDepartment === 'true';
    const byCollege = req.query.byCollege === 'true';
    
    let ranges = [];
    if (startDate && endDate) {
      const [sYr, sMn, sDy] = startDate.split('-').map(Number);
      const [eYr, eMn, eDy] = endDate.split('-').map(Number);
      const startD = new Date(sYr, sMn - 1, sDy, 0, 0, 0, 0);
      const endD = new Date(eYr, eMn - 1, eDy, 23, 59, 59, 999);
      
      const diffMs = endD - startD;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 31) {
        // Daily intervals
        for (let i = 0; i < diffDays; i++) {
          const dStart = new Date(startD);
          dStart.setDate(startD.getDate() + i);
          dStart.setHours(0, 0, 0, 0);
          
          const dEnd = new Date(dStart);
          dEnd.setDate(dStart.getDate() + 1);
          dEnd.setHours(0, 0, 0, 0);
          
          ranges.push({
            label: dStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            start: dStart,
            end: dEnd > endD ? endD : dEnd
          });
        }
      } else {
        // Monthly chunks
        let current = new Date(startD);
        while (current <= endD) {
          const mStart = new Date(current.getFullYear(), current.getMonth(), current.getDate());
          mStart.setHours(0, 0, 0, 0);
          
          // Move to next month first day
          const mEnd = new Date(current.getFullYear(), current.getMonth() + 1, 1);
          mEnd.setHours(0, 0, 0, 0);
          
          const actualEnd = mEnd > endD ? endD : mEnd;
          
          ranges.push({
            label: mStart.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
            start: mStart,
            end: actualEnd
          });
          
          current = mEnd;
        }
      }
    } else {
      ranges = getRanges(timeframe);
    }

    if (byCollege && !req.organization) {
      const orgs = await Organization.find({ isActive: { $ne: false } }).select('name').lean();
      
      const allStudents = await Student.find({ isActive: true }).select('_id organization');
      const studentsByOrg = {};
      const staffCountByOrg = {};
      for (const org of orgs) {
        studentsByOrg[org._id.toString()] = [];
        staffCountByOrg[org._id.toString()] = 0;
      }
      for (const s of allStudents) {
        const orgId = s.organization?.toString();
        if (orgId && studentsByOrg[orgId] !== undefined) {
          studentsByOrg[orgId].push(s._id);
          staffCountByOrg[orgId] += 1;
        }
      }

      const months = [];
      for (const r of ranges) {
        const { start, end, label } = r;
        if (start >= end) continue;
        const startISO = start.toISOString().slice(0, 10);
        const endISO = getEndISO(end);

        const [presentRows, teachRows, spotRows] = await Promise.all([
          Attendance.aggregate([
            { $match: { type: 'in', timestamp: { $gte: start, $lt: end } } },
            {
              $group: {
                _id: {
                  student: '$student',
                  organization: '$organization',
                  day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                },
              },
            },
          ]),
          ClassCheckin.aggregate([
            { $match: { createdAt: { $gte: start, $lt: end } } },
            {
              $group: {
                _id: {
                  organization: '$organization',
                  status: '$status'
                },
                n: { $sum: 1 }
              }
            }
          ]),
          SpotCheck.aggregate([
            { $match: { issuedAt: { $gte: start, $lt: end } } },
            {
              $group: {
                _id: {
                  organization: '$organization',
                  status: '$status'
                },
                n: { $sum: 1 }
              }
            }
          ]),
        ]);

        const presentByOrg = {};
        const teachConductedByOrg = {};
        const teachTotalByOrg = {};
        const spotRespondedByOrg = {};
        const spotDecidedByOrg = {};

        for (const org of orgs) {
          const orgIdStr = org._id.toString();
          presentByOrg[orgIdStr] = 0;
          teachConductedByOrg[orgIdStr] = 0;
          teachTotalByOrg[orgIdStr] = 0;
          spotRespondedByOrg[orgIdStr] = 0;
          spotDecidedByOrg[orgIdStr] = 0;
        }

        // Attendance
        for (const row of presentRows) {
          if (!row._id.organization) continue;
          const oId = row._id.organization.toString();
          if (presentByOrg[oId] !== undefined) {
            presentByOrg[oId] += 1;
          }
        }

        // Teaching
        for (const row of teachRows) {
          if (!row._id.organization) continue;
          const oId = row._id.organization.toString();
          if (teachConductedByOrg[oId] !== undefined) {
            const status = row._id.status;
            if (status === 'conducted' || status === 'deviation') {
              teachConductedByOrg[oId] += row.n;
            }
            teachTotalByOrg[oId] += row.n;
          }
        }
        // Spot-check
        for (const row of spotRows) {
          if (!row._id.organization) continue;
          const oId = row._id.organization.toString();
          if (spotRespondedByOrg[oId] !== undefined) {
            const status = row._id.status;
            if (status === 'responded') {
              spotRespondedByOrg[oId] += row.n;
            }
            if (status === 'responded' || status === 'missed') {
              spotDecidedByOrg[oId] += row.n;
            }
          }
        }

        const dataPoint = { month: label };
        for (const org of orgs) {
          const orgIdStr = org._id.toString();
          const staffCount = staffCountByOrg[orgIdStr] || 0;
          const attVal = staffCount ? clampPct(pct(presentByOrg[orgIdStr], staffCount * workingDays(start, end))) : null;
          const teachVal = teachTotalByOrg[orgIdStr] ? clampPct(pct(teachConductedByOrg[orgIdStr], teachTotalByOrg[orgIdStr])) : null;
          const spotVal = spotDecidedByOrg[orgIdStr] ? clampPct(pct(spotRespondedByOrg[orgIdStr], spotDecidedByOrg[orgIdStr])) : null;

          const parts = [attVal, teachVal, spotVal].filter(v => v !== null);
          const composite = parts.length ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : null;

          dataPoint[org.name] = composite !== null ? composite : 0;
        }

        months.push(dataPoint);
      }

      return res.json({ success: true, trend: months, colleges: orgs.map(o => o.name) });
    }

    if (byDepartment && req.organization) {
      const org = await Organization.findById(req.organization._id).select('departments').lean();
      let depts = org.departments || ['Administration', 'Engineering', 'Operations'];
      if (req.isHod && req.hodDepartment) {
        depts = depts.filter((d) => d === req.hodDepartment);
        if (depts.length === 0) depts = [req.hodDepartment];
      }

      // Fetch all active students/staff/doctors of the organization
      const allMembers = await Student.find({
        organization: req.organization._id,
        isActive: true
      }).select('_id role department');

      const studentToDept = {};
      const staffCountByDept = {};
      for (const d of depts) {
        staffCountByDept[d] = 0;
      }
      for (const m of allMembers) {
        if (m.department && depts.includes(m.department)) {
          studentToDept[m._id.toString()] = m.department;
          staffCountByDept[m.department] += 1;
        }
      }

      // Pre-compute timetable expected check-ins
      const timetableRows = await Timetable.aggregate([
        { $match: { organization: req.organization._id, deletedAt: null } },
        {
          $group: {
            _id: {
              faculty: '$faculty',
              day: '$day'
            },
            n: { $sum: 1 }
          }
        }
      ]);

      const deptsTimetable = {};
      for (const d of depts) {
        deptsTimetable[d] = [0, 0, 0, 0, 0, 0, 0];
      }
      for (const row of timetableRows) {
        if (!row._id.faculty) continue;
        const fId = row._id.faculty.toString();
        const dept = studentToDept[fId];
        if (dept && deptsTimetable[dept] !== undefined) {
          const day = row._id.day; // 0=Mon...5=Sat
          deptsTimetable[dept][day] += row.n;
        }
      }

      const months = [];
      for (const r of ranges) {
        const { start, end, label } = r;
        if (start >= end) continue;
        const startISO = start.toISOString().slice(0, 10);
        const endISO = getEndISO(end);

        const [presentRows, teachRows, spotRows] = await Promise.all([
          Attendance.aggregate([
            { $match: { organization: req.organization._id, type: 'in', timestamp: { $gte: start, $lt: end } } },
            {
              $group: {
                _id: {
                  student: '$student',
                  day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                },
              },
            },
          ]),
          ClassCheckin.aggregate([
            { $match: { organization: req.organization._id, createdAt: { $gte: start, $lt: end } } },
            {
              $group: {
                _id: {
                  faculty: '$faculty',
                  status: '$status'
                },
                n: { $sum: 1 }
              }
            }
          ]),
          SpotCheck.aggregate([
            { $match: { organization: req.organization._id, issuedAt: { $gte: start, $lt: end } } },
            {
              $group: {
                _id: {
                  student: '$student',
                  status: '$status'
                },
                n: { $sum: 1 }
              }
            }
          ]),
        ]);

        const presentByDept = {};
        const teachConductedByDept = {};
        const teachTotalByDept = {};
        const spotRespondedByDept = {};
        const spotDecidedByDept = {};

        for (const d of depts) {
          presentByDept[d] = 0;
          teachConductedByDept[d] = 0;
          teachTotalByDept[d] = 0;
          spotRespondedByDept[d] = 0;
          spotDecidedByDept[d] = 0;
        }

        // Attendance
        for (const row of presentRows) {
          if (!row._id.student) continue;
          const sId = row._id.student.toString();
          const dept = studentToDept[sId];
          if (dept && presentByDept[dept] !== undefined) {
            presentByDept[dept] += 1;
          }
        }

        // Teaching
        for (const row of teachRows) {
          if (!row._id.faculty) continue;
          const fId = row._id.faculty.toString();
          const dept = studentToDept[fId];
          if (dept && teachConductedByDept[dept] !== undefined) {
            const status = row._id.status;
            if (status === 'conducted' || status === 'deviation') {
              teachConductedByDept[dept] += row.n;
            }
            teachTotalByDept[dept] += row.n;
          }
        }
        // Spot-check
        for (const row of spotRows) {
          if (!row._id.student) continue;
          const sId = row._id.student.toString();
          const dept = studentToDept[sId];
          if (dept && spotRespondedByDept[dept] !== undefined) {
            const status = row._id.status;
            if (status === 'responded') {
              spotRespondedByDept[dept] += row.n;
            }
            if (status === 'responded' || status === 'missed') {
              spotDecidedByDept[dept] += row.n;
            }
          }
        }

        const dayCounts = weekdayCounts(start, end);

        const dataPoint = { month: label };
        for (const d of depts) {
          const staffCount = staffCountByDept[d] || 0;
          const attVal = staffCount ? clampPct(pct(presentByDept[d], staffCount * workingDays(start, end))) : null;

          const expected = deptsTimetable[d].reduce(
            (sum, count, dayIdx) => sum + (dayCounts[dayIdx] || 0) * count,
            0
          );
          const teachVal = expected ? clampPct(pct(teachConductedByDept[d], expected)) : null;

          const spotVal = spotDecidedByDept[d] ? clampPct(pct(spotRespondedByDept[d], spotDecidedByDept[d])) : null;

          const parts = [attVal, teachVal, spotVal].filter(v => v !== null);
          const composite = parts.length ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : null;

          dataPoint[d] = composite !== null ? composite : 0;
        }

        months.push(dataPoint);
      }

      return res.json({ success: true, trend: months, departments: depts });
    }

    const months = [];
    for (const r of ranges) {
      const { start, end, label } = r;
      if (start >= end) continue;
      const startISO = start.toISOString().slice(0, 10);
      const endISO = getEndISO(end);

      const [presentRows, teachRows] = await Promise.all([
        Attendance.aggregate([
          { $match: { organization: { $in: orgIds }, ...stuF(scope), type: 'in', timestamp: { $gte: start, $lt: end } } },
          {
            $group: {
              _id: {
                student: '$student',
                day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              },
            },
          },
          { $count: 'n' },
        ]),
        ClassCheckin.aggregate([
          { $match: { organization: { $in: orgIds }, ...facF(scope), createdAt: { $gte: start, $lt: end } } },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
      ]);

      const present = presentRows.length ? presentRows[0].n : 0;
      const attendance = clampPct(pct(present, totalStaff * workingDays(start, end)));

      const teach = Object.fromEntries(teachRows.map((r) => [r._id, r.n]));
      const teachTotal = teachRows.reduce((s, r) => s + r.n, 0);
      const teaching = teachTotal
        ? clampPct(pct((teach.conducted || 0) + (teach.deviation || 0), teachTotal))
        : null;

      months.push({
        month: label,
        attendance,
        teaching,
      });
    }

    return res.json({ success: true, trend: months });
  } catch (err) {
    console.error('[Compliance] trend error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/compliance/departments
// @desc    Admin view — per-department compliance metrics for the logged-in institute
router.get('/departments', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }
    const { start, end } = monthRange(0);
    const prev = monthRange(-1);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = getEndISO(end);

    const org = await Organization.findById(req.organization._id).select('departments name').lean();
    let depts = org.departments || ['Administration', 'Engineering', 'Operations'];

    // HOD: department-scoped view — only ever see their own department, never the
    // full institute-wide list (which is the admin view).
    if (req.isHod && req.hodDepartment) {
      depts = depts.filter((d) => d === req.hodDepartment);
      if (depts.length === 0) depts = [req.hodDepartment];
    }

    const departments = await Promise.all(
      depts.map(async (deptName) => {
        const members = await Student.find({
          organization: req.organization._id,
          department: deptName,
          isActive: true
        }).select('_id role');

        const scope = members.map((m) => m._id);
        const staff = scope.length;

        const [attendance, teaching, spot, prevAttendance] = await Promise.all([
          attendancePct(req.organization._id, start, end, staff, scope),
          teachingPct(req.organization._id, start, end, scope),
          spotCheckPct(req.organization._id, start, end, scope),
          attendancePct(req.organization._id, prev.start, prev.end, staff, scope),
        ]);

        const parts = [attendance, teaching, spot].filter((v) => v != null);
        const composite = parts.length ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : null;

        const hod = await Student.findOne({
          organization: req.organization._id,
          department: deptName,
          role: 'hod',
          isActive: true
        }).select('fullName uid');

        const teachingStaff = members.filter(m => m.role === 'faculty' || m.role === 'hod').length;
        const activeStaff = members.length;

        return {
          id: deptName.toLowerCase().replace(/\s+/g, '-'),
          name: deptName,
          code: deptName.slice(0, 3).toUpperCase() + '-' + staff,
          hod: hod ? hod.fullName : 'Vacant',
          staff,
          teachingStaff,
          activeStaff,
          attendance: attendance || 0,
          teaching: teaching || 0,
          spotCheck: spot || 0,
          rating: rating(composite),
          trend: attendance != null && prevAttendance != null ? Math.round((attendance - prevAttendance) * 10) / 10 : 0,
        };
      })
    );

    return res.json({ success: true, departments });
  } catch (err) {
    console.error('[Compliance] departments error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/compliance/departments/:deptId
// @desc    Admin view — detailed compliance metrics for a specific department
router.get('/departments/:deptId', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }
    const { deptId } = req.params;
    const { start, end } = monthRange(0);
    const prev = monthRange(-1);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = getEndISO(end);

    const org = await Organization.findById(req.organization._id).select('departments').lean();
    const depts = org.departments || ['Administration', 'Engineering', 'Operations'];
    
    const deptName = depts.find(d => d.toLowerCase().replace(/\s+/g, '-') === deptId);
    if (!deptName) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }

    // HOD: may only drill into their own department's detail.
    if (req.isHod && req.hodDepartment && deptName !== req.hodDepartment) {
      return res.status(403).json({ success: false, error: 'Department outside your scope' });
    }

    const members = await Student.find({
      organization: req.organization._id,
      department: deptName,
      isActive: true
    }).select('_id role fullName uid designation');

    const scope = members.map((m) => m._id);
    const staff = scope.length;

    const [attendance, teaching, spot, prevAttendance] = await Promise.all([
      attendancePct(req.organization._id, start, end, staff, scope),
      teachingPct(req.organization._id, start, end, scope),
      spotCheckPct(req.organization._id, start, end, scope),
      attendancePct(req.organization._id, prev.start, prev.end, staff, scope),
    ]);

    const parts = [attendance, teaching, spot].filter((v) => v != null);
    const composite = parts.length ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : null;

    const hod = await Student.findOne({
      organization: req.organization._id,
      department: deptName,
      role: 'hod',
      isActive: true
    }).select('fullName uid');

    const teachingStaff = members.filter(m => m.role === 'faculty' || m.role === 'hod').length;
    const activeStaff = members.length;

    const timeframe = req.query.timeframe || '6m';
    const ranges = getRanges(timeframe);
    const months = [];
    for (const r of ranges) {
      const { start: mStart, end: mEnd, label } = r;
      if (mStart >= mEnd) continue;
      const mStartISO = mStart.toISOString().slice(0, 10);
      const mEndISO = getEndISO(mEnd);

      const [presentRows, teachRows, spotRows] = await Promise.all([
        Attendance.aggregate([
          { $match: { organization: req.organization._id, ...stuF(scope), type: 'in', timestamp: { $gte: mStart, $lt: mEnd } } },
          {
            $group: {
              _id: {
                student: '$student',
                day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              },
            },
          },
          { $count: 'n' },
        ]),
        ClassCheckin.aggregate([
          { $match: { organization: req.organization._id, ...facF(scope), createdAt: { $gte: mStart, $lt: mEnd } } },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        SpotCheck.aggregate([
          { $match: { organization: req.organization._id, ...stuF(scope), issuedAt: { $gte: mStart, $lt: mEnd } } },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
      ]);

      const present = presentRows.length ? presentRows[0].n : 0;
      const attVal = clampPct(pct(present, staff * workingDays(mStart, mEnd)));

      const teach = Object.fromEntries(teachRows.map((r) => [r._id, r.n]));
      const teachTotal = teachRows.reduce((s, r) => s + r.n, 0);
      const teachVal = teachTotal ? clampPct(pct((teach.conducted || 0) + (teach.deviation || 0), teachTotal)) : null;

      const spotD = Object.fromEntries(spotRows.map((r) => [r._id, r.n]));
      const spotTotal = (spotD.responded || 0) + (spotD.missed || 0);
      const spotVal = spotTotal ? clampPct(pct(spotD.responded || 0, spotTotal)) : null;

      const compVal = [attVal, teachVal, spotVal].filter(v => v != null);
      const overallVal = compVal.length ? Math.round(compVal.reduce((s, v) => s + v, 0) / compVal.length) : null;

      months.push({
        month: label,
        attendance: attVal || 0,
        teaching: teachVal || 0,
        spotCheck: spotVal || 0,
        overall: overallVal || 0,
      });
    }

    const staffList = await Promise.all(
      members.map(async (m) => {
        const [att, teach] = await Promise.all([
          attendancePct(req.organization._id, start, end, 1, [m._id]),
          m.role === 'faculty' || m.role === 'hod' ? teachingPct(req.organization._id, start, end, [m._id]) : Promise.resolve(null),
        ]);
        const scores = [att, teach].filter(v => v != null);
        const overall = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
        return {
          id: m._id,
          name: m.fullName,
          uid: m.uid,
          designation: m.designation || 'Staff',
          role: m.role,
          attendance: att || 0,
          compliance: overall,
          status: overall >= 85 ? 'Excellent' : overall >= 70 ? 'Satisfactory' : 'Needing Attention'
        };
      })
    );

    const spotChecks = await SpotCheck.find({
      organization: req.organization._id,
      ...stuF(scope),
      issuedAt: { $gte: start, $lt: end }
    }).select('status student issuedAt').populate('student', 'fullName').lean();

    const pendingIssues = spotChecks.filter(s => s.status === 'pending').map(s => ({
      id: s._id,
      type: 'Spot-Check Pending',
      detail: `Awaiting response from ${s.student?.fullName || 'Staff'}`,
      status: 'Open'
    }));

    // ── Real, computed scorecard KPIs (face-only product) ──
    // These replace the previous hard-coded placeholders so the scorecard reflects
    // genuine attendance data for the department this month.
    const inRecords = await Attendance.find({
      organization: req.organization._id,
      ...stuF(scope),
      type: 'in',
      timestamp: { $gte: start, $lt: end },
    }).select('student timestamp faceVerified').lean();

    // Staff participation — share of department members who checked in at least once.
    const activeStudents = new Set(inRecords.map((r) => String(r.student)));
    const participation = staff ? clampPct(pct(activeStudents.size, staff)) : null;

    // Punctuality — first check-in per member-day arriving on time (≤ 09:15).
    const firstByKey = new Map();
    for (const r of inRecords) {
      const t = new Date(r.timestamp);
      const key = String(r.student) + '|' + t.toISOString().slice(0, 10);
      if (!firstByKey.has(key) || t < firstByKey.get(key)) firstByKey.set(key, t);
    }
    let onTime = 0;
    const activeDays = new Set();
    for (const [key, t] of firstByKey.entries()) {
      activeDays.add(key.split('|')[1]);
      if (t.getHours() * 60 + t.getMinutes() <= 9 * 60 + 15) onTime += 1;
    }
    const punctuality = firstByKey.size ? clampPct(pct(onTime, firstByKey.size)) : null;

    // Attendance consistency — working days on which the department had activity.
    const consistency = clampPct(pct(activeDays.size, workingDays(start, end)));

    // Full-day completion — of the days staff actually attended, the share where
    // they stayed a full shift (last check-out ≥ 6h after first check-in). This
    // separates genuine full days from "mark attendance and leave early", which
    // plain attendance % can't see.
    const outRecords = await Attendance.find({
      organization: req.organization._id,
      ...stuF(scope),
      type: 'out',
      timestamp: { $gte: start, $lt: end },
    }).select('student timestamp').lean();
    const lastOutByKey = new Map();
    for (const r of outRecords) {
      const t = new Date(r.timestamp);
      const key = String(r.student) + '|' + t.toISOString().slice(0, 10);
      if (!lastOutByKey.has(key) || t > lastOutByKey.get(key)) lastOutByKey.set(key, t);
    }
    let fullDays = 0;
    for (const [key, inT] of firstByKey.entries()) {
      const outT = lastOutByKey.get(key);
      if (outT && outT - inT >= 6 * 60 * 60 * 1000) fullDays += 1;
    }
    const fullDay = firstByKey.size ? clampPct(pct(fullDays, firstByKey.size)) : null;

    return res.json({
      success: true,
      department: {
        name: deptName,
        code: deptName.slice(0, 3).toUpperCase() + '-' + staff,
        hod: hod ? hod.fullName : 'Vacant',
        staff,
        teachingStaff,
        activeStaff,
        attendance: attendance || 0,
        teaching: teaching || 0,
        spotCheck: spot || 0,
        overall: composite || 0,
        punctuality: punctuality || 0,
        participation: participation || 0,
        consistency: consistency || 0,
        fullDay: fullDay || 0,
        rating: rating(composite),
        trend: attendance != null && prevAttendance != null ? Math.round((attendance - prevAttendance) * 10) / 10 : 0,
        score: composite || 0,
        trends: months,
        staffList,
        pendingIssues
      }
    });
  } catch (err) {
    console.error('[Compliance] department detail error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
