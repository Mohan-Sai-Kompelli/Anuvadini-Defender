const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const Attendance = require('../models/Attendance');
const ActivityLogReminderLog = require('../models/ActivityLogReminderLog');
const pushNotificationService = require('./pushNotificationService');
const { parseShiftTimes, toMinutes } = require('../utils/timeWindow');

const WEEKDAY_MON0 = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function istParts(date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p = fmt.formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const hour = p.hour === '24' ? '00' : p.hour;
  return { dayMon0: WEEKDAY_MON0[p.weekday], hhmm: `${hour}:${p.minute}`, ymd: `${p.year}-${p.month}-${p.day}` };
}

class ActivityLogReminderService {
  // Claim a (kind, ref, date) slot. Returns true if we should send (first time).
  async _claim(kind, ref, date) {
    try {
      await ActivityLogReminderLog.create({ kind, ref, date });
      return true;
    } catch (e) {
      if (e && e.code === 11000) return false; // already reminded
      console.warn('[ActivityLogReminder] claim failed:', e.message);
      return false;
    }
  }

  async _onLeaveSet(ids, ymd) {
    if (!ids.length) return new Set();
    const dayStart = new Date(`${ymd}T00:00:00`);
    const dayEnd = new Date(`${ymd}T23:59:59.999`);
    const marks = await Attendance.find({
      student: { $in: ids },
      type: 'leave',
      timestamp: { $gte: dayStart, $lte: dayEnd },
    })
      .select('student')
      .lean();
    return new Set(marks.map((m) => String(m.student)));
  }

  /**
   * Remind faculty/doctors who finished a class > bufferMin ago but never
   * logged it (no evidence photos). Skips anyone on approved leave. Deduped so a
   * person is nudged at most once per activity per day.
   */
  async runMissingLogReminders(bufferMin = 30) {
    const now = new Date();
    const { dayMon0, hhmm, ymd } = istParts(now);
    const nowMin = toMinutes(hhmm);
    let sent = 0;

    // ── Classes ──
    const slots = await Timetable.find({ deletedAt: null, day: dayMon0 })
      .populate('faculty', 'fullName fcmToken')
      .select('faculty subject start end room organization')
      .lean();
    const dueClasses = slots.filter((s) => s.end && nowMin >= toMinutes(s.end) + bufferMin);

    if (dueClasses.length) {
      const tIds = dueClasses.map((s) => s._id);
      const checkins = await ClassCheckin.find({ timetable: { $in: tIds }, date: ymd })
        .select('timetable photos')
        .lean();
      const logged = new Set(
        checkins.filter((c) => Array.isArray(c.photos) && c.photos.length > 0).map((c) => String(c.timetable))
      );
      const facIds = [...new Set(dueClasses.map((s) => s.faculty && String(s.faculty._id)).filter(Boolean))];
      const onLeave = await this._onLeaveSet(facIds, ymd);

      for (const s of dueClasses) {
        if (!s.faculty) continue;
        if (logged.has(String(s._id))) continue;
        if (onLeave.has(String(s.faculty._id))) continue;
        if (!(await this._claim('class', s._id, ymd))) continue;
        try {
          await pushNotificationService.sendNotificationToStudent(
            s.faculty._id,
            {
              title: '📸 Log your class',
              body: `You haven't logged ${s.subject}${s.room ? ` (${s.room})` : ''}. Open the app to add your face check + class photos.`,
            },
            { type: 'class_log_missing', timetableId: String(s._id), subject: s.subject || '' }
          );
          sent += 1;
        } catch (e) {
          console.warn('[ActivityLogReminder] class send failed:', e.message);
        }
      }
    }

    if (sent) console.log(`[ActivityLogReminder] ${ymd} ${hhmm} IST — sent ${sent} missing-log reminders`);
    return { sent };
  }
}

module.exports = new ActivityLogReminderService();
