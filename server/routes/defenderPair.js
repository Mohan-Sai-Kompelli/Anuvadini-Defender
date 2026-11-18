const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const jwt = require('jsonwebtoken');

const auth = require('../middleware/auth');

const DefenderPairing = require('../models/DefenderPairing');
const { SecondaryPairing } = require('../config/secondaryDb');
const { overtimeStatus, resolveOvertime, disconnectPCs } = require('../services/defenderOvertimeService');
const http = require('http');

// Read the Defender engine's live fleet (same server, port 8055) and return this
// employee's workstation row, or null. Short timeout; never throws.
function engineFleetRow(employeeId, hostname) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const r = http.get({ host: '127.0.0.1', port: 8055, path: '/api/fleet', timeout: 1500 }, (resp) => {
      let body = '';
      resp.setEncoding('utf8');
      resp.on('data', (c) => { body += c; });
      resp.on('end', () => {
        try {
          const rows = JSON.parse(body);
          // Match by employee only: the PC's pairing name and the engine's PC name can differ.
          // Use the most recent heartbeat among this employee's workstations.
          const mine = (Array.isArray(rows) ? rows : []).filter((w) => String(w.employee_id) === String(employeeId));
          mine.sort((a, b) => String(b.last_heartbeat || '').localeCompare(String(a.last_heartbeat || '')));
          finish(mine[0] || null);
        } catch (e) { finish(null); }
      });
    });
    r.on('timeout', () => { r.destroy(); finish(null); });
    r.on('error', () => finish(null));
  });
}



/**

 * Defender desktop pairing (WhatsApp-Web style). See models/DefenderPairing.js

 * for the full flow. `create` and the status poll are public (the desktop has

 * no login yet); `claim` requires the employee's own attendance-app token.

 */

const router = express.Router();



const PAIR_TTL_MS = 10 * 60 * 1000; // a pending QR is good for 10 minutes

const clean = (v, max = 120) => String(v || '').trim().slice(0, max);

function mirror(op) {
  if (!SecondaryPairing) return;
  Promise.resolve(op).catch(e =>
    console.error('[defender-pair] secondary DB mirror failed:', e.message)
  );
}



// The desktop app opens a pairing session and gets a pairId to show as a QR.

router.post('/create', async (req, res) => {

  try {

    const pairId = crypto.randomBytes(24).toString('hex');

    const device = {
      hostname: clean(req.body?.hostname || req.body?.device?.hostname),
      ip: clean(req.body?.ip || req.body?.device?.ip, 64),
      os: clean(req.body?.os || req.body?.device?.os, 80),
      deviceName: clean(req.body?.deviceName || req.body?.device?.deviceName || req.body?.device?.username),
      agentVersion: clean(req.body?.agentVersion || req.body?.device?.agentVersion, 32),
    };

    const payload = {
      pairId,
      status: 'pending',
      device,
      expiresAt: new Date(Date.now() + PAIR_TTL_MS),
    };
    const doc = await DefenderPairing.create(payload);
    mirror(SecondaryPairing?.create({ ...payload }));

    res.json({

      success: true,

      pairId,

      qr: JSON.stringify({ v: 1, t: 'anuvadini-defender-pair', pairId }),

      pairing_payload: { v: 1, t: 'anuvadini-defender-pair', pairId },

      qr_data: { v: 1, t: 'anuvadini-defender-pair', pairId },

      expires_in: Math.floor(PAIR_TTL_MS / 1000),

      expiresAt: doc.expiresAt,

      pollMs: 2000,

    });

  } catch (e) {

    res.status(500).json({ success: false, message: 'Could not start pairing.' });

  }

});



// The agent asks whether this host is currently paused by an employee checkout.

// Auth is the long-lived agent token minted at claim time.


// ---- Checkout schedule (after office hours): employee picks when monitoring stops (IST) ----
// Accepted bodies:
//   { option: 'extend', minutes: 15..240 }   -> stop N minutes from now (multiples of 15)
//   { option: 'until', time: 'HH:00' | 'HH:30' } -> stop at that clock time today, IST (not past 23:30)
// Legacy bodies 'extend30' and 'until1800' still work.
const CheckoutSchedule = require('../models/DefenderCheckoutSchedule');
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDay = (d = new Date()) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const MAX_EXTEND_MIN = 240;
const LAST_STOP_IST = '23:30';

// Returns the stop time, or null when the choice is invalid or already in the past.
function untilEnd(time, now) {
  if (!/^([01]\d|2[0-3]):(00|30)$/.test(time) || time > LAST_STOP_IST) return null;
  const end = new Date(`${istDay(now)}T${time}:00+05:30`);
  return end > now ? end : null;
}

function scheduleEnd(body, now = new Date()) {
  const b = body || {};
  if (b.option === 'extend30') return new Date(now.getTime() + 30 * 60 * 1000);
  if (b.option === 'until1800') return untilEnd('18:00', now);
  if (b.option === 'extend') {
    const minutes = Number(b.minutes);
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > MAX_EXTEND_MIN || minutes % 15 !== 0) return null;
    return new Date(now.getTime() + minutes * 60 * 1000);
  }
  if (b.option === 'until') return untilEnd(String(b.time || ''), now);
  return null;
}

router.post('/schedule', auth, async (req, res) => {
  try {
    const student = req.student || req.user;
    if (!student || !student.uid) return res.status(403).json({ success: false });
    const body = req.body || {};
    const now = new Date();
    const endsAt = scheduleEnd(body, now);
    if (!endsAt) {
      return res.status(400).json({
        success: false,
        message: 'Choose a time later than now: 15 to 240 minutes in 15-minute steps, or a clock time on the hour or half hour before 23:30.',
      });
    }
    const option = String(body.option || '');
    await CheckoutSchedule.updateOne(
      { uid: student.uid },
      { $set: { day: istDay(now), option, endsAt, setAt: now } },
      { upsert: true }
    );
    await resolveOvertime(student.uid, 'extended', now);
    res.json({ success: true, endsAt });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/schedule', auth, async (req, res) => {
  const student = req.student || req.user;
  if (!student || !student.uid) return res.status(403).json({ success: false });
  const row = await CheckoutSchedule.findOne({ uid: student.uid }).lean();
  res.json({ success: true, schedule: row || null });
});

router.get('/agent-status', async (req, res) => {

  try {

    const header = req.headers.authorization || '';

    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) return res.status(401).json({ success: false });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.kind !== 'defender-agent') {

      return res.status(403).json({ success: false });

    }

    const doc = await DefenderPairing.findOne({

      'employee.uid': decoded.uid,

      'device.hostname': decoded.host,

    }).sort({ claimedAt: -1 });

    // No record (for example an old pairing cleaned up by TTL) means "do not pause".

    // Pause when the employee is NOT checked in. The attendance record is the source of truth:
    // the last check-in/check-out event today decides it. The pairing status is a second signal
    // (set when the phone disconnects), so a missed phone-side disconnect cannot keep the PC live.
    const docPaused = !!doc && doc.status === 'disconnected';
    let checkedIn = false;
    try {
      const Student = require('../models/Student');
      const Attendance = require('../models/Attendance');
      const student = await Student.findOne({ uid: decoded.uid }, { _id: 1 }).lean();
      if (student) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const last = await Attendance.findOne(
          { student: student._id, type: { $in: ['in', 'out'] }, timestamp: { $gte: startOfDay } }
        ).sort({ timestamp: -1 }).lean();
        checkedIn = !!last && last.type === 'in';
      }
    } catch (e) {
      // If the attendance lookup fails, fall back to the pairing status only.
      checkedIn = !docPaused;
    }
    // Scheduled stop after office hours ("extend 30 min" / "until 6 PM") has passed -> pause.
    let scheduleStopped = false;
    try {
      const sch = await CheckoutSchedule.findOne({ uid: decoded.uid }).lean();
      if (sch && sch.day === istDay() && new Date(sch.endsAt) <= new Date()) scheduleStopped = true;
    } catch (e) { /* ignore: fall back to the attendance rules */ }
    const paused = docPaused || !checkedIn || scheduleStopped;

    return res.json({

      success: true,

      paired: !paused,

      monitoring_paused: paused,

      status: doc ? doc.status : 'unknown',

      // The watchdog uses these timestamps to wake an off-duty agent when the

      // employee checks in early (for example 09:20 instead of 09:30).

      paused_at: doc?.pausedAt || null,

      resumed_at: doc?.resumedAt || null,

      updated_at: doc?.updatedAt || null,
      // 5:30 PM extend-or-check-out reminders (seq changes with each new reminder).
      overtime: await overtimeStatus(decoded.uid).catch(() => null),

    });

  } catch (e) {

    return res.status(401).json({ success: false, monitoring_paused: false });

  }

});



// Employee checks whether their PC is currently paired/connected.
// Desktop EXE sends periodic heartbeat + screen thumbnail + active window
router.post('/heartbeat', async (req, res) => {
  try {
    const pairId = clean(req.body?.pairId, 64);
    const hostname = clean(req.body?.hostname, 100);
    const query = (pairId && hostname)
      ? { $or: [{ pairId }, { 'device.hostname': hostname }] }
      : (pairId ? { pairId } : (hostname ? { 'device.hostname': hostname } : null));
    if (!query) return res.status(400).json({ success: false });

    const update = {
      $set: {
        lastPingAt: new Date(),
        status: 'paired',
        currentApp: clean(req.body?.currentApp || req.body?.current_app, 150),
        windowTitle: clean(req.body?.windowTitle || req.body?.window_title, 250),
      }
    };
    if (req.body?.screenshot) {
      update.$set.latestScreenshot = String(req.body.screenshot);
    }
    let existing = await DefenderPairing.findOne(query).sort({ claimedAt: -1 });
    if (!existing) {
      if (hostname) {
        existing = await DefenderPairing.findOne({ 'device.hostname': hostname }).sort({ claimedAt: -1 });
      }
      if (!existing) {
        existing = await DefenderPairing.findOne({ status: 'paired' }).sort({ claimedAt: -1 });
      }
    }
    if (existing) {
      if (hostname && (!existing.device?.hostname || existing.device?.hostname === 'Work PC')) {
        update.$set['device.hostname'] = hostname;
      }
      await DefenderPairing.updateOne({ _id: existing._id }, update);
    } else {
      await DefenderPairing.updateOne(query, update);
    }

    // Bridge remote employee PC to Defender Engine (port 8055) so it appears in Admin Dashboard
    try {
      const frameB64 = req.body?.screenshot || req.body?.frame_b64;
      const devHost = hostname || existing?.device?.hostname || 'Remote-PC';
      const empName = existing?.employee?.name || req.body?.username || devHost;
      const empId = existing?.employee?.uid || req.body?.employee_id || '';
      const currApp = clean(req.body?.currentApp || req.body?.current_app, 150) || 'Active';
      const winTitle = clean(req.body?.windowTitle || req.body?.window_title, 250);
      const isViolation = !!(req.body?.violation || req.body?.status === 'Alert/Game');

      if (frameB64) {
        axios.post('http://127.0.0.1:8055/api/fleet/stream-frame', {
          hostname: devHost,
          employee_id: empId,
          username: empName,
          current_app: currApp,
          window_title: winTitle,
          status: isViolation ? 'GAMING_ALERT' : 'ONLINE',
          frame_b64: frameB64
        }, { timeout: 2000 }).catch(() => {});
      }

      axios.post('http://127.0.0.1:8055/api/fleet/heartbeat', {
        hostname: devHost,
        employee_id: empId,
        username: empName,
        department: existing?.employee?.department || 'Engineering',
        status: isViolation ? 'GAMING_ALERT' : 'ONLINE',
        current_app: currApp,
        window_title: winTitle,
        pid: parseInt(req.body?.pid || 0, 10),
        idle_seconds: parseFloat(req.body?.idle_seconds || 0),
        violation: req.body?.violation || null,
        screenshot_b64: frameB64 || null
      }, { timeout: 2000 }).catch(() => {});
    } catch (_) {}

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

// Employee checks whether their PC is currently paired/connected.
router.get('/my-status', auth, async (req, res) => {
  try {
    const student = req.student || req.user;
    if (!student?.uid) return res.status(403).json({ success: false, paired: false });
    const doc = await DefenderPairing.findOne({ 'employee.uid': student.uid, status: 'paired' }).sort({ claimedAt: -1 });
    if (!doc) return res.json({ success: true, paired: false });

    // Check if PC is alive: requires heartbeat within last 20 seconds
    const now = Date.now();
    const lastPing = doc.lastPingAt ? doc.lastPingAt.getTime() : (doc.claimedAt ? doc.claimedAt.getTime() : 0);
    let isAlive = (now - lastPing) < 20000;
    let lastSeen = lastPing;
    if (!isAlive) {
      // The PC's agent reports to the Defender engine (not to this route), so
      // fall back to the engine's live heartbeat for this employee's PC.
      const row = await engineFleetRow(student.uid, doc.device && doc.device.hostname);
      if (row && row.last_heartbeat) {
        const hbTs = new Date(String(row.last_heartbeat).replace(' ', 'T') + '+05:30').getTime();
        if (!isNaN(hbTs)) {
          lastSeen = Math.max(lastSeen, hbTs);
          if (now - hbTs < 20000) isAlive = true;
        }
      }
    }

    // A short gap (network blip, a busy PC) must not send the phone back to "scan the QR".
    // The pairing stays until it is disconnected or the PC has been silent for 10 minutes.
    const SILENT_LIMIT_MS = 10 * 60 * 1000;
    if (!isAlive && now - lastSeen >= SILENT_LIMIT_MS) {
      return res.json({
        success: true,
        paired: false,
        isOffline: true,
        message: 'Work PC is offline or application was closed.',
        device: { hostname: doc.device?.hostname, deviceName: doc.device?.deviceName, os: doc.device?.os }
      });
    }

    res.json({
      success: true,
      paired: true,
      online: isAlive,
      ...(isAlive ? {} : { message: 'Work PC is not reporting right now. It reconnects automatically.' }),
      device: { hostname: doc.device?.hostname, deviceName: doc.device?.deviceName, os: doc.device?.os },
      telemetry: {
        currentApp: doc.currentApp || '',
        windowTitle: doc.windowTitle || '',
        lastPingAt: doc.lastPingAt
      },
      overtime: await overtimeStatus(student.uid).catch(() => null),
    });
  } catch (e) {
    res.status(500).json({ success: false, paired: false });
  }
});

// Employee requests live desktop screen of their paired PC
router.get('/my-screen', auth, async (req, res) => {
  try {
    const student = req.student || req.user;
    if (!student?.uid) return res.status(403).json({ success: false });
    const doc = await DefenderPairing.findOne({ 'employee.uid': student.uid, status: 'paired' }).sort({ claimedAt: -1 });
    if (!doc || !doc.latestScreenshot) {
      return res.json({ success: false, message: 'No live screen frame available yet.' });
    }
    res.json({
      success: true,
      screenshot: doc.latestScreenshot,
      windowTitle: doc.windowTitle || 'Desktop',
      currentApp: doc.currentApp || 'Active',
      lastPingAt: doc.lastPingAt,
      hostname: doc.device?.hostname
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch screen.' });
  }
});



// The desktop polls this until the session is paired (then it gets the identity).

router.get('/:pairId', async (req, res) => {

  try {

    let doc = await DefenderPairing.findOne({ pairId: clean(req.params.pairId, 64) });
    if (!doc && SecondaryPairing) {
      doc = await SecondaryPairing.findOne({ pairId: clean(req.params.pairId, 64) });
    }

    if (!doc) return res.json({ success: true, status: 'pending' });

    if (doc.status === 'pending' && doc.expiresAt <= new Date()) {

      return res.json({ success: true, status: 'pending' });

    }

    if (doc.status !== 'paired') {

      return res.json({ success: true, status: doc.status });

    }

    return res.json({

      success: true,

      status: 'paired',

      employee: {

        uid: doc.employee.uid,

        name: doc.employee.name,

        department: doc.employee.department,

        organization: String(doc.employee.organization || ''),

        orgName: doc.employee.orgName,

      },

      agentToken: doc.agentToken,

    });

  } catch (e) {

    res.status(500).json({ success: false, message: 'Pairing lookup failed.' });

  }

});



// The phone (logged-in employee) scans the QR and claims the PC for themselves.

router.post('/claim', auth, async (req, res) => {

  try {

    const student = req.student || req.user;

    if (!student || !student.uid) {

      return res.status(403).json({ success: false, message: 'Sign in to the attendance app first.' });

    }

    const pairId = clean(req.body?.pairId, 64);

    if (!pairId) return res.status(400).json({ success: false, message: 'Invalid QR code.' });



    let doc = await DefenderPairing.findOne({ pairId });
    let fromSecondary = false;
    if (!doc && SecondaryPairing) {
      doc = await SecondaryPairing.findOne({ pairId });
      if (doc) fromSecondary = true;
    }

    if (!doc) {

      doc = await DefenderPairing.create({

        pairId,

        status: 'pending',

        device: {

          hostname: clean(req.body?.hostname || 'Work PC'),

          deviceName: clean(req.body?.deviceName || 'Work PC'),

          os: clean(req.body?.os || 'Windows 11'),

        },

        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),

      });

    }

    if (doc.status === 'paired') {

      if (doc.employee?.uid === student.uid) {

        return res.json({

          success: true,

          message: 'Work PC linked.',

          device: { hostname: doc.device?.hostname || 'Work PC', deviceName: doc.device?.deviceName || 'Work PC', os: doc.device?.os || 'Windows' },

          employee: { uid: doc.employee.uid, name: doc.employee.name },

        });

      }

      return res.status(409).json({ success: false, message: 'This PC is already paired.' });

    }



    const orgId = student.organization;

    const orgName = req.organization?.name || req.organization?.organizationName || '';

    const agentToken = jwt.sign(

      { kind: 'defender-agent', uid: student.uid, org: String(orgId || ''), host: doc.device.hostname },

      process.env.JWT_SECRET,

      { expiresIn: '365d' }

    );



    doc.status = 'paired';

    doc.employee = {

      id: student._id,

      uid: student.uid,

      name: student.fullName || student.name || student.uid,

      department: student.department || student.class || student.bureau || '',

      organization: orgId,

      orgName,

    };

    doc.agentToken = agentToken;

    doc.claimedAt = new Date();

    doc.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // keep the binding alive

    await doc.save();

    const claimUpdate = {
      status: 'paired',
      employee: doc.employee,
      agentToken: doc.agentToken,
      claimedAt: doc.claimedAt,
      expiresAt: doc.expiresAt,
    };
    if (fromSecondary) {
      mirror(DefenderPairing.updateOne({ pairId }, { $set: claimUpdate }, { upsert: true }));
    } else {
      mirror(SecondaryPairing?.updateOne({ pairId }, { $set: claimUpdate }, { upsert: true }));
    }



    res.json({

      success: true,

      message: 'Work PC linked.',

      device: { hostname: doc.device.hostname, deviceName: doc.device.deviceName, os: doc.device.os },

      employee: { uid: doc.employee.uid, name: doc.employee.name },

    });

  } catch (e) {

    res.status(500).json({ success: false, message: 'Could not link this PC.' });

  }

});



// Optional: the desktop cancels a session (e.g. window closed before scan).

router.post('/cancel', async (req, res) => {

  try {

    const cancelFilter = { pairId: clean(req.body?.pairId, 64), status: 'pending' };
    const cancelUpd = { $set: { status: 'cancelled' } };
    await DefenderPairing.updateOne(cancelFilter, cancelUpd);
    mirror(SecondaryPairing?.updateOne(cancelFilter, cancelUpd));

    res.json({ success: true });

  } catch (e) {

    res.status(500).json({ success: false });

  }

});



// Employee disconnects their paired PC (called on checkout).

router.post('/disconnect', auth, async (req, res) => {

  try {

    const student = req.student || req.user;

    if (!student?.uid) return res.status(403).json({ success: false });

    const discFilter = { 'employee.uid': student.uid, status: 'paired' };
    const discUpd = { $set: { status: 'disconnected', pausedAt: new Date(), resumedAt: null } };
    await DefenderPairing.updateMany(discFilter, discUpd);
    mirror(SecondaryPairing?.updateMany(discFilter, discUpd));

    res.json({ success: true });

  } catch (e) {

    res.status(500).json({ success: false });

  }

});



// Employee checks in again: resume monitoring on the paired PC.

router.post('/resume', auth, async (req, res) => {

  try {

    const student = req.student || req.user;

    if (!student?.uid) return res.status(403).json({ success: false });

    const resFilter = { 'employee.uid': student.uid, status: 'disconnected' };
    const resUpd = { $set: { status: 'paired', resumedAt: new Date(), pausedAt: null } };
    await DefenderPairing.updateMany(resFilter, resUpd);
    mirror(SecondaryPairing?.updateMany(resFilter, resUpd));

    res.json({ success: true });

  } catch (e) {

    res.status(500).json({ success: false });

  }

});



// The PC agent answers the 5:30 PM reminder: extend the monitored time, or check out.
// Check out ends monitoring of this PC; the attendance check-out itself is still recorded on the phone.
router.post('/agent/overtime-choice', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ success: false });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.kind !== 'defender-agent' || !decoded.uid) return res.status(403).json({ success: false });
    const body = req.body || {};
    const now = new Date();
    if (body.option === 'checkout') {
      await disconnectPCs(decoded.uid, now);
      await resolveOvertime(decoded.uid, 'exe_checkout', now);
      return res.json({ success: true, option: 'checkout' });
    }
    const endsAt = scheduleEnd(body, now);
    if (!endsAt) {
      return res.status(400).json({ success: false, message: 'Choose 15 to 240 minutes, or a clock time before 23:30.' });
    }
    await CheckoutSchedule.updateOne(
      { uid: decoded.uid },
      { $set: { day: istDay(now), option: String(body.option || ''), endsAt, setAt: now } },
      { upsert: true }
    );
    await resolveOvertime(decoded.uid, 'extended', now);
    return res.json({ success: true, option: String(body.option), endsAt });
  } catch (e) {
    const authErr = e && /Token|jwt/i.test(String(e.name || ''));
    return res.status(authErr ? 401 : 500).json({ success: false });
  }
});

module.exports = router;

