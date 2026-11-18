/**
 * 5:30 PM overtime reminders for Work PCs.
 *
 * From 17:30 IST, every employee who is still checked in with a paired Work PC gets up to
 * three reminders, five minutes apart, to either extend the monitored timeline or check out.
 * Each reminder is a push notification to the phone and is also returned by the PC agent's
 * status poll (overtime.seq), which shows the same choice on the PC. If there is no response
 * for five minutes after the third reminder, the Work PC is disconnected automatically, which
 * also stops the agent.
 */
const DefenderPairing = require('../models/DefenderPairing');
const DefenderOvertime = require('../models/DefenderOvertime');
const CheckoutSchedule = require('../models/DefenderCheckoutSchedule');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const pushNotificationService = require('./pushNotificationService');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const REMIND_AT_MIN = 17 * 60 + 30;
const INTERVAL_MS = 5 * 60 * 1000;
const MAX_REMINDERS = 3;
const TICK_MS = 60 * 1000;

function istNow(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { day: ist.toISOString().slice(0, 10), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

async function isCheckedIn(studentId, day) {
  const startOfDay = new Date(`${day}T00:00:00+05:30`);
  const last = await Attendance.findOne(
    { student: studentId, type: { $in: ['in', 'out'] }, timestamp: { $gte: startOfDay } }
  ).sort({ timestamp: -1 }).lean();
  return !!last && last.type === 'in';
}

async function resolveOvertime(uid, reason, now = new Date(), day = istNow(now).day) {
  await DefenderOvertime.updateOne(
    { uid, day },
    { $set: { resolved: true, resolvedReason: reason } },
    { upsert: true }
  );
}

async function disconnectPCs(uid, now) {
  await DefenderPairing.updateMany(
    { 'employee.uid': uid, status: 'paired' },
    { $set: { status: 'disconnected', pausedAt: now, resumedAt: null } }
  );
}

async function notify(studentId, title, body, data) {
  try {
    await pushNotificationService.sendNotificationToStudent(studentId, { title, body }, data);
  } catch (e) {
    console.warn('[overtime] push failed:', e.message);
  }
}

async function processUid(uid, now, day) {
  const student = await Student.findOne({ uid }, { _id: 1 }).lean();
  if (!student) return;
  const row = await DefenderOvertime.findOne({ uid, day }).lean();
  if (row && row.resolved) return;

  if (!(await isCheckedIn(student._id, day))) {
    if (row) await resolveOvertime(uid, 'checked_out', now, day);
    return;
  }
  const sch = await CheckoutSchedule.findOne({ uid }).lean();
  if (sch && sch.day === day && new Date(sch.endsAt) > now) {
    await resolveOvertime(uid, 'extended', now, day);
    return;
  }

  const count = row ? row.count : 0;
  const lastMs = row && row.lastSentAt ? new Date(row.lastSentAt).getTime() : 0;

  if (count < MAX_REMINDERS) {
    if (count > 0 && now.getTime() - lastMs < INTERVAL_MS) return;
    let next;
    try {
      next = await DefenderOvertime.findOneAndUpdate(
        { uid, day, count, resolved: { $ne: true } },
        { $set: { lastSentAt: now }, $inc: { count: 1, seq: 1 } },
        { upsert: true, new: true }
      ).lean();
    } catch (e) {
      return; // another run already sent this reminder
    }
    if (!next) return;
    await notify(
      student._id,
      'Work PC: extend or check out',
      `Reminder ${next.count} of ${MAX_REMINDERS}. Your shift ended at 5:30 PM. Extend the monitored time or check out. The Work PC disconnects if there is no response.`,
      { type: 'defender_overtime', seq: String(next.seq), count: String(next.count) }
    );
    return;
  }

  // All reminders sent and no answer for five minutes: disconnect the Work PC.
  if (now.getTime() - lastMs >= INTERVAL_MS) {
    await disconnectPCs(uid, now);
    await DefenderOvertime.updateOne(
      { uid, day },
      { $set: { resolved: true, resolvedReason: 'auto_disconnected', disconnectedAt: now } }
    );
    await notify(
      student._id,
      'Work PC disconnected',
      'No response to the three reminders, so the Work PC was disconnected. Scan the Work PC QR code again to reconnect.',
      { type: 'defender_disconnected' }
    );
  }
}

async function tick(now = new Date()) {
  const { day, minutes } = istNow(now);
  if (minutes < REMIND_AT_MIN) return;
  const uids = await DefenderPairing.distinct('employee.uid', { status: 'paired' });
  for (const uid of uids) {
    if (!uid) continue;
    try {
      await processUid(String(uid), now, day);
    } catch (e) {
      console.warn('[overtime] employee check failed:', e.message);
    }
  }
}

async function overtimeStatus(uid, now = new Date()) {
  const { day } = istNow(now);
  const row = await DefenderOvertime.findOne(
    { uid, day },
    { count: 1, seq: 1, resolved: 1, resolvedReason: 1, lastSentAt: 1 }
  ).lean();
  const count = row ? row.count : 0;
  return {
    active: !!row && !row.resolved && count > 0,
    count,
    max: MAX_REMINDERS,
    seq: row ? row.seq : 0,
    lastSentAt: row ? row.lastSentAt : null,
    resolved: !!row && !!row.resolved,
    reason: row ? row.resolvedReason : '',
  };
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((e) => console.warn('[overtime] tick failed:', e.message));
  }, TICK_MS);
  console.log('[overtime] 5:30 PM reminder service started');
}

module.exports = { start, tick, overtimeStatus, resolveOvertime, istNow, MAX_REMINDERS, INTERVAL_MS, disconnectPCs };
