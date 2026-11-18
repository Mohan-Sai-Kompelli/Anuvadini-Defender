const Timetable = require('../models/Timetable');
const ClassReminderLog = require('../models/ClassReminderLog');
const pushNotificationService = require('./pushNotificationService');

// Map en-GB short weekday → the timetable's day numbering (0 = Monday … 6 = Sunday).
const WEEKDAY_MON0 = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/**
 * Break a Date into IST calendar parts without pulling in a tz library.
 * @returns {{ dayMon0: number, hhmm: string, ymd: string }}
 */
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
  const p = fmt.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  // Some Node builds render midnight as '24' under hour12:false — normalise it.
  const hour = p.hour === '24' ? '00' : p.hour;
  return {
    dayMon0: WEEKDAY_MON0[p.weekday],
    hhmm: `${hour}:${p.minute}`,
    ymd: `${p.year}-${p.month}-${p.day}`,
  };
}

class ClassReminderService {
  /**
   * Find every timetable slot starting exactly `leadMinutes` from now (to the
   * minute, in IST) and push a reminder to the assigned faculty. Deduped per
   * (slot, date) so a slot is never reminded twice in a day.
   */
  async runDueReminders(leadMinutes = 10) {
    const target = new Date(Date.now() + leadMinutes * 60 * 1000);
    const { dayMon0, hhmm, ymd } = istParts(target);

    const slots = await Timetable.find({
      deletedAt: null,
      day: dayMon0,
      start: hhmm,
    })
      .populate('faculty', 'fullName fcmToken')
      .select('faculty subject start room type organization');

    if (!slots.length) return { matched: 0, sent: 0 };

    let sent = 0;
    for (const slot of slots) {
      if (!slot.faculty) continue;

      // Claim this (slot, date) — a duplicate-key error means we already sent it.
      try {
        await ClassReminderLog.create({ timetable: slot._id, date: ymd });
      } catch (e) {
        if (e && e.code === 11000) continue; // already reminded today
        console.warn('[ClassReminder] dedupe write failed:', e.message);
        continue;
      }

      const notification = {
        title: '📚 Class starting soon',
        body: `${slot.subject} starts at ${slot.start}${slot.room ? ` in ${slot.room}` : ''} (in ${leadMinutes} min).`,
      };
      const data = {
        type: 'class_reminder',
        timetableId: String(slot._id),
        subject: slot.subject || '',
        start: slot.start || '',
        room: slot.room || '',
        classType: slot.type || 'lecture',
      };

      try {
        await pushNotificationService.sendNotificationToStudent(slot.faculty._id, notification, data);
        sent += 1;
      } catch (e) {
        console.warn(`[ClassReminder] send failed for slot ${slot._id}:`, e.message);
      }
    }

    if (slots.length) {
      console.log(`[ClassReminder] ${ymd} ${hhmm} IST — matched ${slots.length}, sent ${sent}`);
    }
    return { matched: slots.length, sent };
  }
}

module.exports = new ClassReminderService();
