const express = require('express');
const auth = require('../middleware/auth');
const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const OutreachActivity = require('../models/OutreachActivity');
const SpotCheck = require('../models/SpotCheck');
const LeaveRequest = require('../models/Model_LeaveRequest');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const resolveOrgId = require('../utils/resolveOrg');
const { markPastPendingOutreachNoResponse } = require('../utils/outreachNoResponse');

const router = express.Router();

const todayISO = () => new Date().toISOString().slice(0, 10);
const weekdayIndex = (isoDate) => (new Date(`${isoDate}T12:00:00`).getDay() + 6) % 7;

// @route   GET /api/saacms/summary
// @desc    Live counts for the dashboard module tiles
router.get('/summary', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    await markPastPendingOutreachNoResponse({ organization });
    const date = todayISO();
    const day = weekdayIndex(date);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dayStart = new Date(`${date}T00:00:00`);

    const [
      classesToday,
      checkinsToday,
      outreachAgg,
      spotAgg,
      spotMissedToday,
      pendingLeaves,
      onLeaveToday,
      staffCount,
      presentToday,
    ] = await Promise.all([
      Timetable.countDocuments({ organization, day, deletedAt: null }),
      ClassCheckin.find({ organization, date }).select('status').lean(),
      OutreachActivity.aggregate([
        { $match: { organization } },
        {
          $group: {
            _id: '$status',
            n: { $sum: 1 },
            participants: { $sum: '$participants' },
          },
        },
      ]),
      SpotCheck.aggregate([
        { $match: { organization, issuedAt: { $gte: monthStart } } },
        {
          $group: {
            _id: '$status',
            n: { $sum: 1 },
            proxy: { $sum: { $cond: ['$markedAfterMiss', 1, 0] } },
          },
        },
      ]),
      SpotCheck.countDocuments({
        organization,
        status: 'missed',
        $or: [{ issuedAt: { $gte: dayStart } }, { expiresAt: { $gte: dayStart } }],
      }),
      LeaveRequest.countDocuments({ status: 'pending' }),
      Attendance.countDocuments({ organization, type: 'leave', timestamp: { $gte: dayStart } }),
      Student.countDocuments({ organization, isActive: true }),
      Attendance.distinct('student', {
        organization,
        type: 'in',
        timestamp: { $gte: dayStart },
      }),
    ]);

    const checkinByStatus = checkinsToday.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});

    const outreach = Object.fromEntries(outreachAgg.map((o) => [o._id, o]));
    const spot = Object.fromEntries(spotAgg.map((s) => [s._id, s]));
    const spotResponded = spot.responded ? spot.responded.n : 0;
    const spotMissed = spot.missed ? spot.missed.n : 0;
    const spotDecided = spotResponded + spotMissed;
    const proxySuspects = spotAgg.reduce((s, r) => s + (r.proxy || 0), 0);

    const attendancePct =
      staffCount > 0 ? Math.round((presentToday.length / staffCount) * 100) : null;

    return res.json({
      success: true,
      summary: {
        academics: {
          scheduled: classesToday,
          conducted:
            (checkinByStatus.conducted || 0) + (checkinByStatus.deviation || 0),
          ongoing: checkinByStatus.ongoing || 0,
        },
        outreach: {
          pending: outreach.pending ? outreach.pending.n : 0,
          active: outreach.in_progress ? outreach.in_progress.n : 0,
          participants: outreachAgg.reduce((s, o) => s + (o.participants || 0), 0),
        },
        antifraud: {
          responseRate: spotDecided ? Math.round((spotResponded / spotDecided) * 100) : null,
          missedToday: spotMissedToday,
          proxySuspects,
        },
        leave: {
          pending: pendingLeaves,
          onLeaveToday,
        },
        compliance: {
          attendancePct,
        },
      },
    });
  } catch (err) {
    console.error('[SAACMS] summary error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
