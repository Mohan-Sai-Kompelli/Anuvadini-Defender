const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const Attendance = require('../models/Attendance');
const resolveOrgId = require('../utils/resolveOrg');
const faceStorageService = require('../services/faceStorageService');
const { deptScopeIds } = require('../utils/deptScope');
const { withinWindow } = require('../utils/timeWindow');

const LOG_BUFFER_MIN = parseInt(process.env.ACTIVITY_LOG_BUFFER_MIN || '30', 10);

const router = express.Router();

const todayISO = () => new Date().toISOString().slice(0, 10);

// Mon=0 … Sat=5 (matches Timetable.day)
const weekdayIndex = (isoDate) => (new Date(`${isoDate}T12:00:00`).getDay() + 6) % 7;

const minutesBetween = (start, end) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
};

function slotEnded(isoDate, end) {
  const d = new Date(`${isoDate}T${end}:00`);
  return d < new Date();
}

// @route   GET /api/class-checkins/log?date=YYYY-MM-DD
// @desc    Teaching log for a day: timetable slots joined with check-ins
router.get('/log', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    const date = req.query.date || todayISO();
    const day = weekdayIndex(date);

    // HOD: only their department faculty's classes.
    const scope = await deptScopeIds(req);
    const ttQuery = { organization, day, deletedAt: null };
    const ccQuery = { organization, date };
    if (scope) { ttQuery.faculty = { $in: scope }; ccQuery.faculty = { $in: scope }; }

    const [slots, checkins] = await Promise.all([
      Timetable.find(ttQuery)
        .populate('faculty', 'fullName department uid')
        .sort({ start: 1 })
        .lean(),
      ClassCheckin.find(ccQuery).lean(),
    ]);
    const byTimetable = new Map(checkins.map((c) => [String(c.timetable), c]));

    // Approved leave hides classes: any faculty marked on leave that day has
    // their (un-conducted) slots shown as 'leave' instead of 'missed', so the
    // timetable reflects the approved leave and they aren't flagged.
    const facultyIds = [...new Set(slots.map((s) => s.faculty && String(s.faculty._id)).filter(Boolean))];
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    const leaveMarks = facultyIds.length
      ? await Attendance.find({
          student: { $in: facultyIds },
          type: 'leave',
          timestamp: { $gte: dayStart, $lte: dayEnd },
        }).select('student').lean()
      : [];
    const onLeave = new Set(leaveMarks.map((l) => String(l.student)));

    const rows = slots.map((slot) => {
      const checkin = byTimetable.get(String(slot._id)) || null;
      const facId = slot.faculty ? String(slot.faculty._id) : null;
      const facultyOnLeave = facId ? onLeave.has(facId) : false;
      let status;
      if (checkin) {
        status = checkin.status;
        if (status === 'conducted' && checkin.actualStart && checkin.actualEnd) {
          const actual = minutesBetween(checkin.actualStart, checkin.actualEnd);
          const scheduled = minutesBetween(slot.start, slot.end);
          if (Math.abs(actual - scheduled) > 15) status = 'deviation';
        }
      } else if (facultyOnLeave) {
        status = 'leave';
      } else {
        status = slotEnded(date, slot.end) ? 'missed' : 'upcoming';
      }
      return {
        timetableId: slot._id,
        checkinId: checkin ? checkin._id : null,
        faculty: slot.faculty ? slot.faculty.fullName : 'Unknown',
        department: slot.faculty ? slot.faculty.department : '',
        subject: slot.subject,
        type: slot.type,
        room: slot.room,
        start: slot.start,
        end: slot.end,
        scheduledMin: minutesBetween(slot.start, slot.end),
        actualStart: checkin ? checkin.actualStart : null,
        actualEnd: checkin ? checkin.actualEnd : null,
        durationMin:
          checkin && checkin.actualStart && checkin.actualEnd
            ? minutesBetween(checkin.actualStart, checkin.actualEnd)
            : null,
        geoVerified: !!(checkin && checkin.geo && checkin.geo.verified),
        selfie: !!(checkin && checkin.photos && checkin.photos.length > 0),
        // Enriched so the timetable cards can render real status + geo + selfie
        // without a second request per card.
        geo: checkin && checkin.geo ? checkin.geo : null,
        selfieUrl: checkin && checkin.photos && checkin.photos.length ? checkin.photos[0].image : null,
        photoCount: checkin && checkin.photos ? checkin.photos.length : 0,
        note: checkin ? checkin.note || null : null,
        headcount: checkin && checkin.headcount != null ? checkin.headcount : null,
        faceVerified: !!(checkin && checkin.faceVerified),
        onLeave: facultyOnLeave,
        status,
      };
    });

    return res.json({ success: true, date, rows });
  } catch (err) {
    console.error('[ClassCheckin] log error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   GET /api/class-checkins/evidence/:timetableId?date=YYYY-MM-DD
// @desc    Uploaded evidence (photos, note, geo) for one class on one date
router.get('/evidence/:timetableId', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    const date = req.query.date || todayISO();
    const checkin = await ClassCheckin.findOne({
      organization,
      timetable: req.params.timetableId,
      date,
    })
      .populate('faculty', 'fullName department')
      .lean();
    if (!checkin) {
      return res.json({ success: true, evidence: null });
    }
    return res.json({ success: true, evidence: checkin });
  } catch (err) {
    console.error('[ClassCheckin] evidence error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/class-checkins
// @desc    Start / end a class (called by the faculty app)
//          body: { timetableId, date?, action: 'start'|'end', note, headcount,
//                  latitude, longitude, accuracy, photos: [{label,image}] }
router.post('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    const { timetableId, action = 'start', note, headcount, latitude, longitude, accuracy, photos } =
      req.body;
    const date = req.body.date || todayISO();
    const slot = await Timetable.findOne({ _id: timetableId, organization, deletedAt: null });
    if (!slot) {
      return res.status(404).json({ success: false, error: 'Timetable slot not found' });
    }
    const now = new Date();

    // Logging is only allowed during the scheduled class ± buffer (default 30m).
    const win = withinWindow(date, slot.start, slot.end, LOG_BUFFER_MIN, now);
    if (!win.ok) {
      return res.status(403).json({
        success: false,
        code: 'outside_window',
        error: `You can only log this class between ${slot.start} and ${slot.end} (±${LOG_BUFFER_MIN} min).`,
      });
    }

    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let checkin = await ClassCheckin.findOne({ organization, timetable: timetableId, date });
    if (!checkin) {
      checkin = new ClassCheckin({
        organization,
        timetable: timetableId,
        faculty: req.student ? req.student._id : slot.faculty,
        date,
      });
    }

    if (action === 'start') {
      checkin.actualStart = checkin.actualStart || hhmm;
      checkin.status = 'ongoing';
    } else {
      checkin.actualEnd = hhmm;
      checkin.status = 'conducted';
    }
    if (note != null) checkin.note = note;
    if (headcount != null) checkin.headcount = headcount;
    if (req.body.faceVerified != null) checkin.faceVerified = !!req.body.faceVerified;
    if (latitude != null && longitude != null) {
      checkin.geo = {
        latitude,
        longitude,
        accuracy: accuracy || null,
        verified: true,
        place: req.body.place || null,
      };
    }
    if (Array.isArray(photos) && photos.length) {
      checkin.photos = (checkin.photos || []).concat(photos);
      // File the class selfie(s) under face_storage/<faculty>/<date>/class/.
      if (req.student) {
        photos.forEach((ph) =>
          faceStorageService.saveCapture({
            student: req.student,
            type: 'class',
            image: ph && ph.image ? ph.image : ph,
            match: req.body.faceVerified === true || req.body.faceVerified === 'true',
          })
        );
      }
    }
    checkin.evidenceHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ t: String(timetableId), date, n: checkin.note, p: (checkin.photos || []).length }))
      .digest('hex');

    await checkin.save();
    return res.status(201).json({ success: true, checkin });
  } catch (err) {
    console.error('[ClassCheckin] create error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
