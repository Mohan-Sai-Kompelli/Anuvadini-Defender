const express = require('express');
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');

/**
 * Partner routes (used with a partner key). Read-only: the employee's own check-in state today.
 */
const router = express.Router();
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDay = (d = new Date()) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

router.get('/attendance-status', auth, async (req, res) => {
  try {
    const student = req.student || req.user;
    if (!student?.uid) return res.status(403).json({ success: false });
    const studentDoc = await Student.findOne({ uid: student.uid }, { _id: 1 }).lean();
    if (!studentDoc) return res.status(404).json({ success: false, message: 'Employee not found.' });
    const day = istDay();
    const startOfDay = new Date(`${day}T00:00:00+05:30`);
    const last = await Attendance.findOne(
      { student: studentDoc._id, type: { $in: ['in', 'out'] }, timestamp: { $gte: startOfDay } }
    ).sort({ timestamp: -1 }).lean();
    res.json({
      success: true,
      day,
      checked_in: !!last && last.type === 'in',
      last_type: last ? last.type : null,
      last_at: last ? last.timestamp : null,
    });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
