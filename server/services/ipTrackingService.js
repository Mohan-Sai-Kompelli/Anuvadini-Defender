// Records which public IP AND which physical device a login / check-in /
// check-out came from, and detects when either differs from the employee's
// previous one. The device check is the one a same-WiFi public IP can't do:
// an employee logging in from a friend's phone on the same college network
// keeps the same public IP but presents a different deviceId. Purely
// informational (super-admin report) — a change is heavily audited via the
// tamper-evident audit trail, never blocked — and every function here is
// best-effort and must NEVER throw into the login/attendance flow it
// piggybacks on.

const Student = require('../models/Student');
const IpActivityLog = require('../models/IpActivityLog');
const audit = require('./auditService');

/**
 * Compare `currentIp` against the student's last known IP.
 * Returns { previousIp, ipChanged } — ipChanged is only true when there WAS a
 * previous IP and it differs (a first-ever sighting is not a "change").
 */
function detectChange(student, currentIp) {
  const previousIp = student?.lastKnownIp || null;
  const ipChanged = !!(previousIp && currentIp && previousIp !== currentIp);
  return { previousIp, ipChanged };
}

/**
 * Compare the reporting device against the student's last known device.
 * STRICT on identity, conservative on absence: deviceChanged is only true when
 * a previous deviceId exists AND the current request carries one AND they
 * differ — a first sighting, or a legacy client that sends no telemetry, is
 * never flagged. Previous model/manufacturer ride along so the report can
 * name the old phone, not just show an opaque id.
 * Returns { previousDeviceId, previousDeviceModel, previousDeviceManufacturer, deviceChanged }.
 */
function detectDeviceChange(student, currentDeviceId) {
  const previousDeviceId = student?.lastKnownDeviceId || null;
  const deviceChanged = !!(previousDeviceId && currentDeviceId && previousDeviceId !== currentDeviceId);
  return {
    previousDeviceId,
    previousDeviceModel: student?.lastKnownDeviceModel || null,
    previousDeviceManufacturer: student?.lastKnownDeviceManufacturer || null,
    deviceChanged,
  };
}

/**
 * Write one IpActivityLog row and roll the student's lastKnown* pointers
 * forward. A detected device change is additionally written to the audit
 * trail (action 'tracking.device_changed') with the full before/after detail.
 * @param {object} opts
 * @param {object} opts.student    Student document (or lean object with _id/uid/fullName/organization/lastKnown*)
 * @param {'login'|'in'|'out'} opts.event
 * @param {string|null} opts.publicIp
 * @param {object} [opts.device]   sanitized telemetry from utils/deviceTelemetry.js
 *                                 { localIp, networkType, deviceId, deviceModel, manufacturer, androidVersion }
 * @param {object} [opts.attendanceId]  Attendance._id for in/out events
 * @param {Date} [opts.timestamp]
 * @returns {Promise<{previousIp, ipChanged, previousDeviceId, previousDeviceModel,
 *                    previousDeviceManufacturer, deviceChanged}>}
 */
async function recordActivity({ student, event, publicIp, device = {}, attendanceId = null, timestamp = new Date() }) {
  const { previousIp, ipChanged } = detectChange(student, publicIp);
  const deviceChange = detectDeviceChange(student, device.deviceId);
  try {
    await IpActivityLog.create({
      student: student._id,
      organization: student.organization || null,
      uid: student.uid || null,
      studentName: student.fullName || student.name || null,
      event,
      attendance: attendanceId,
      publicIp: publicIp || null,
      previousIp,
      ipChanged,
      localIp: device.localIp || null,
      networkType: device.networkType || null,
      deviceId: device.deviceId || null,
      deviceModel: device.deviceModel || null,
      manufacturer: device.manufacturer || null,
      androidVersion: device.androidVersion || null,
      deviceChanged: deviceChange.deviceChanged,
      previousDeviceId: deviceChange.previousDeviceId,
      previousDeviceModel: deviceChange.previousDeviceModel,
      previousDeviceManufacturer: deviceChange.previousDeviceManufacturer,
      timestamp,
    });

    // Heavy audit for a physical-device change: a permanent, queryable entry
    // in the same tamper-evident trail the super-admin already reviews.
    // Awaited so the entry is durably written before the request completes
    // (auditService.log never throws, so this cannot fail the flow).
    if (deviceChange.deviceChanged) {
      await audit.log({
        organization: student.organization || null,
        actorType: 'student',
        actor: student._id,
        actorLabel: student.fullName || student.uid || null,
        action: 'tracking.device_changed',
        outcome: 'flagged',
        targetType: 'attendance',
        target: attendanceId,
        ip: publicIp || null,
        metadata: {
          event,
          uid: student.uid || null,
          previousDeviceId: deviceChange.previousDeviceId,
          previousDeviceModel: deviceChange.previousDeviceModel,
          previousDeviceManufacturer: deviceChange.previousDeviceManufacturer,
          currentDeviceId: device.deviceId,
          currentDeviceModel: device.deviceModel || null,
          currentManufacturer: device.manufacturer || null,
          androidVersion: device.androidVersion || null,
          localIp: device.localIp || null,
          networkType: device.networkType || null,
          publicIp: publicIp || null,
          ipChanged,
        },
      });
    }

    // Roll the pointers forward only for values this request actually
    // resolved, so a request with unknown IP or no telemetry (legacy client)
    // doesn't erase the last known baseline.
    const update = {};
    if (publicIp) {
      update.lastKnownIp = publicIp;
      if (event === 'login') {
        update.lastLoginIp = publicIp;
        update.lastLoginAt = timestamp;
      }
    }
    if (device.deviceId) {
      update.lastKnownDeviceId = device.deviceId;
      update.lastKnownDeviceModel = device.deviceModel || null;
      update.lastKnownDeviceManufacturer = device.manufacturer || null;
    }
    if (Object.keys(update).length) {
      await Student.updateOne({ _id: student._id }, { $set: update });
    }
  } catch (err) {
    console.error(`[ipTracking] failed to record ${event} activity:`, err.message);
  }
  return { previousIp, ipChanged, ...deviceChange };
}

module.exports = { recordActivity, detectChange, detectDeviceChange };
