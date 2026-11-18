const Attendance = require('../models/Attendance');

let BiometricAttendance = null;
try {
  ({ BiometricAttendance } = require('../config/biometricDb'));
} catch (_e) {
  BiometricAttendance = null;
}

const IST = 'Asia/Kolkata';
const istYMD = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));

/**
 * Which days in [start..end] the employee has ALREADY checked in on (primary +
 * biometric stores). Used to block "apply for a day I've already attended" — the
 * reported bug where a user could still file today's leave after checking in.
 * @returns {Promise<string[]>} sorted 'YYYY-MM-DD' list (empty = none)
 */
async function checkedInDatesInRange(studentId, start, end) {
  const startYMD = istYMD(start);
  const endYMD = istYMD(end);
  const filter = {
    student: studentId,
    type: 'in',
    timestamp: {
      $gte: new Date(`${startYMD}T00:00:00.000+05:30`),
      $lte: new Date(`${endYMD}T23:59:59.999+05:30`),
    },
  };
  const set = new Set();
  try {
    const ins = await Attendance.find(filter).select('timestamp').lean();
    for (const r of ins) set.add(istYMD(r.timestamp));
    if (BiometricAttendance) {
      const bio = await BiometricAttendance.find(filter).select('timestamp').lean();
      for (const r of bio) set.add(istYMD(r.timestamp));
    }
  } catch (e) {
    console.warn('[leaveCheckinGuard] check-in lookup failed:', e.message);
  }
  return [...set].sort();
}

module.exports = { checkedInDatesInRange };
