const express = require('express');
const auth = require('../middleware/auth');
const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const resolveOrgId = require('../utils/resolveOrg');
const { deptScopeIds } = require('../utils/deptScope');

const router = express.Router();

const _ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// @route   GET /api/timetables/analytics?academicYear=&faculty=
// @desc    Real teaching-delivery analytics from the Timetable + ClassCheckin
//          collections: per-date conducted/missed, class-type mix, faculty load,
//          and today's per-period delivery. Powers the Teaching Analytics panel.
router.get('/analytics', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) return res.status(400).json({ success: false, error: 'Organization not resolved' });

    const scope = await deptScopeIds(req);
    const ttQ = { organization, deletedAt: null };
    if (scope) ttQ.faculty = { $in: scope };
    if (req.query.academicYear) ttQ.academicYear = req.query.academicYear;
    if (req.query.faculty) ttQ.faculty = req.query.faculty;

    const slots = await Timetable.find(ttQ).populate('faculty', 'fullName').lean();
    const slotIds = slots.map((s) => s._id);

    // Class-type mix
    const typeCounts = {};
    slots.forEach((s) => {
      typeCounts[s.type || 'lecture'] = (typeCounts[s.type || 'lecture'] || 0) + 1;
    });
    const typeDist = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

    // Faculty teaching load (top 8)
    const facCounts = {};
    slots.forEach((s) => {
      const n = (s.faculty && s.faculty.fullName) || s.facultyLabel || 'Unknown';
      facCounts[n] = (facCounts[n] || 0) + 1;
    });
    const facultyLoad = Object.entries(facCounts)
      .map(([name, value]) => ({ name: name.replace(/^Dr\.?\s*/, ''), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Per-date conducted / missed from the real teaching log (last 180 days)
    const since = new Date();
    since.setDate(since.getDate() - 180);
    const checkins = slotIds.length
      ? await ClassCheckin.find({ organization, timetable: { $in: slotIds }, date: { $gte: _ymd(since) } })
          .select('date status timetable')
          .lean()
      : [];
    const byDateMap = {};
    checkins.forEach((c) => {
      const e = byDateMap[c.date] || { date: c.date, conducted: 0, missed: 0 };
      if (c.status === 'missed') e.missed += 1;
      else e.conducted += 1;
      byDateMap[c.date] = e;
    });
    const byDate = Object.values(byDateMap).sort((a, b) => a.date.localeCompare(b.date));

    // Today's per-period delivery
    const today = _ymd(new Date());
    const widx = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
    const ccTodayByTt = {};
    checkins.filter((c) => c.date === today).forEach((c) => {
      ccTodayByTt[String(c.timetable)] = c.status;
    });
    const PERIODS = [['9–10', 9], ['10–11', 10], ['11–12', 11], ['12–1', 12], ['2–3', 14], ['3–4', 15], ['4–5', 16]];
    const todayPeriods = PERIODS.map(([label, hr]) => {
      const ps = slots.filter((s) => s.day === widx && parseInt(s.start.slice(0, 2), 10) === hr);
      let conducted = 0;
      let missed = 0;
      ps.forEach((s) => {
        const st = ccTodayByTt[String(s._id)];
        if (st === 'missed') missed += 1;
        else if (st) conducted += 1;
      });
      return { label, planned: ps.length, conducted, missed };
    });

    const conductedTotal = checkins.filter((c) => c.status !== 'missed').length;
    const missedTotal = checkins.filter((c) => c.status === 'missed').length;

    return res.json({
      success: true,
      totalSlots: slots.length,
      typeDist,
      facultyLoad,
      byDate,
      todayPeriods,
      totals: { conducted: conductedTotal, missed: missedTotal },
    });
  } catch (err) {
    console.error('[Timetable] analytics error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/timetables/absent-faculty
// @desc    Get IDs of absent faculty for a given date
router.get('/absent-faculty', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }

    const dateParam = req.query.date;
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date parameter' });
    }

    // Set bounds for the target date (00:00:00 to 23:59:59 local time)
    const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // Resolve HOD department scope
    const scope = await deptScopeIds(req);
    const studentQuery = { organization, isActive: true, role: { $in: ['faculty', 'staff', 'hod'] } };
    if (scope) {
      studentQuery._id = { $in: scope };
    }

    const Student = require('../models/Student');
    const LeaveRequest = require('../models/Model_LeaveRequest');
    const Attendance = require('../models/Attendance');

    const faculty = await Student.find(studentQuery).select('_id').lean();
    const facultyIds = faculty.map((f) => f._id);

    // Who checked in today?
    const checkedIn = new Set(
      (
        await Attendance.distinct('student', {
          organization,
          type: 'in',
          timestamp: { $gte: start, $lt: end },
          student: { $in: facultyIds },
        })
      ).map(String)
    );

    // Who is on approved leave today?
    const onLeave = new Set(
      (
        await LeaveRequest.find({
          student: { $in: facultyIds },
          status: 'approved',
          'leaveDates.start': { $lt: end },
          'leaveDates.end': { $gte: start },
        }).distinct('student')
      ).map(String)
    );

    // Check if the target day is in the future
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const isFuture = start.getTime() > todayStart.getTime();

    // Determine absent faculty list
    const absentFacultyIds = [];
    faculty.forEach((f) => {
      const idStr = String(f._id);
      const hasCheckedIn = checkedIn.has(idStr);
      const isOnLeave = onLeave.has(idStr);

      if (isFuture) {
        // In the future, they are absent only if they have approved leave
        if (isOnLeave) {
          absentFacultyIds.push(idStr);
        }
      } else {
        // Today or past: absent if they did not check in, or they are on approved leave
        if (!hasCheckedIn || isOnLeave) {
          absentFacultyIds.push(idStr);
        }
      }
    });

    return res.json({ success: true, absentFacultyIds });
  } catch (err) {
    console.error('[Timetable] absent faculty query error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/timetables
// @desc    All timetable slots for the organization
router.get('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    // HOD: only classes assigned to their department's faculty.
    const scope = await deptScopeIds(req);
    const q = { organization, deletedAt: null };
    if (scope) q.faculty = { $in: scope };
    const entries = await Timetable.find(q)
      .populate('faculty', 'fullName department uid')
      .sort({ day: 1, start: 1 })
      .lean();
    return res.json({ success: true, entries });
  } catch (err) {
    console.error('[Timetable] list error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/timetables
// @desc    Assign a class to a faculty member
router.post('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    const { faculty, subject, type, day, start, end, room, academicYear, facultyLabel } = req.body;
    if (!faculty || !subject || day == null || !start || !end) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (end <= start) {
      return res.status(400).json({ success: false, error: 'End time must be after start time' });
    }
    const entry = await Timetable.create({
      organization,
      faculty,
      subject,
      type,
      day,
      start,
      end,
      room,
      academicYear: academicYear || '',
      facultyLabel: facultyLabel || '',
    });
    const populated = await entry.populate('faculty', 'fullName department uid');
    return res.status(201).json({ success: true, entry: populated });
  } catch (err) {
    console.error('[Timetable] create error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   PUT /api/timetables/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    const { faculty, subject, type, day, start, end, room, academicYear, facultyLabel } = req.body;
    if (end && start && end <= start) {
      return res.status(400).json({ success: false, error: 'End time must be after start time' });
    }
    const update = { faculty, subject, type, day, start, end, room };
    if (academicYear !== undefined) update.academicYear = academicYear;
    if (facultyLabel !== undefined) update.facultyLabel = facultyLabel;
    const entry = await Timetable.findOneAndUpdate(
      { _id: req.params.id, organization },
      update,
      { new: true }
    ).populate('faculty', 'fullName department uid');
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Timetable entry not found' });
    }
    return res.json({ success: true, entry });
  } catch (err) {
    console.error('[Timetable] update error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   DELETE /api/timetables/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    const entry = await Timetable.findOneAndUpdate(
      { _id: req.params.id, organization },
      { deletedAt: new Date() },
      { new: true }
    );
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Timetable entry not found' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[Timetable] delete error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
