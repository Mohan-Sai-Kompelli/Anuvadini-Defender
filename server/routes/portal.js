// Portal routes — role-based web dashboards for institution staff.
//
//  • Faculty & Staff portal  → an employee's OWN attendance/leave (read-only;
//    attendance is captured by the mobile app, never uploaded from the web).
//  • HOD portal              → department-scoped view of every faculty/staff
//    member in the HOD's department, plus their own data.
//
// Auth model: a single unified /login auto-detects email (Organization/Admin)
// vs UID (Student/employee) and returns the userType + role so the client can
// route to the correct dashboard ("check authenticity at login").
//
// All data here is computed live from the Attendance / Student / LeaveRequest
// collections — nothing is hard-coded.

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const Student = require('../models/Student');
const Organization = require('../models/Organization');
const LeaveRequest = require('../models/Model_LeaveRequest');
const FaceImage = require('../models/FaceImage');
const LiveLocation = require('../models/LiveLocation');
const LocationTrail = require('../models/LocationTrail');
const faceVerifyService = require('../services/faceVerifyService');
const faceStorageService = require('../services/faceStorageService');
const securityEventService = require('../services/securityEventService');
const auth = require('../middleware/auth');
const sessionService = require('../services/sessionService');
const { resolveClientIp } = require('../utils/clientIp');
const { findMergedAttendance } = require('../utils/mergedAttendance');
const flags = require('../config/featureFlags');

const router = express.Router();

/* ───────────────────────── helpers ───────────────────────── */

// Is `img` actually renderable by the client (data URI / http(s) URL / a real
// base64 blob), as opposed to a bare local disk path like
// "uploads/faceImages/xxx.jpg" (multer's upload dir — machine-local, doesn't
// survive a redeploy, and was never meant to be served directly to a client)?
function isDisplayableFaceImage(img) {
  if (typeof img !== 'string' || !img) return false;
  if (img.startsWith('data:')) return true;
  if (/^https?:\/\//i.test(img)) return true;
  // A real base64-encoded photo is at minimum a few KB → thousands of chars,
  // and only contains base64 alphabet characters. A relative disk path is
  // short and contains '/' or a file extension, which fails this test.
  return img.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(img);
}

// `extra` carries the single-active-session id (sid) for admin-type logins.
const signToken = (id, extra = {}) =>
  jwt.sign({ id, ...extra }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// Device snapshot stored on the AdminSession row (web logins → user agent;
// the mobile app's validated telemetry rides along when present).
const loginDeviceInfo = (req) => ({
  userAgent: String(req.headers['user-agent'] || '').slice(0, 256) || null,
  ...(typeof req.body?.deviceModel === 'string' ? { deviceModel: req.body.deviceModel.slice(0, 80) } : {}),
  ...(typeof req.body?.manufacturer === 'string' ? { manufacturer: req.body.manufacturer.slice(0, 80) } : {}),
});

const isEmail = (s) => /\S+@\S+\.\S+/.test(String(s || ''));

const startOfDay = (d) => {
  // Parse a bare 'YYYY-MM-DD' as a LOCAL calendar date (new Date('YYYY-MM-DD')
  // would parse as UTC and shift the day in non-UTC timezones).
  let x;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    x = new Date(y, m - 1, day);
  } else {
    x = new Date(d);
  }
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Month bounds for a "YYYY-MM" string (defaults to current month).
function monthBounds(monthStr) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [yy, mm] = monthStr.split('-').map(Number);
    y = yy;
    m = mm - 1;
  }
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 1, 0, 0, 0, 0);
  return { start, end, year: y, month: m };
}

// Count weekdays (Mon–Sat treated as working; Sunday off) between start and
// `upTo` (inclusive of days already elapsed). Saturdays are counted as working
// because Indian institutions commonly work 6 days; this only affects the
// "expected working days" denominator for the absent estimate.
function workingDaysBetween(start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    const dow = cur.getDay();
    if (dow !== 0) count++; // exclude Sunday only
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// IST 'YYYY-MM-DD' — server runs UTC so we shift by +5:30 before extracting date parts.
const toLocalYMD = (d) => {
  const ist = new Date(new Date(d).getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
};

const fmtTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;

const minutesOf = (ts) => {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
};

const minutesToHHMM = (mins) => {
  if (!mins && mins !== 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Reduce a flat list of attendance records into per-day {firstIn,lastOut,...}.
function groupByDay(records) {
  const byDay = new Map();
  for (const r of records) {
    const key = startOfDay(r.timestamp).toISOString().slice(0, 10);
    const entry =
      byDay.get(key) ||
      { date: key, firstIn: null, lastOut: null, method: null, faceVerified: false, isWFH: false, isLeave: false };
    if (r.type === 'leave') {
      entry.isLeave = true;
    } else if (r.type === 'in') {
      if (!entry.firstIn || new Date(r.timestamp) < new Date(entry.firstIn)) {
        entry.firstIn = r.timestamp;
        entry.method = r.authMethod || entry.method;
        entry.faceVerified = !!r.faceVerified;
        entry.isWFH = !!r.isWFH;
      }
    } else if (r.type === 'out') {
      if (!entry.lastOut || new Date(r.timestamp) > new Date(entry.lastOut)) {
        entry.lastOut = r.timestamp;
      }
    }
    byDay.set(key, entry);
  }
  return byDay;
}

// Build a per-employee attendance summary for one month from their records.
function summarizeMonth(records, { start, end }) {
  const byDay = groupByDay(records);
  const days = Array.from(byDay.values());

  const presentDays = days.filter((d) => d.firstIn).length;
  const leaveDays = days.filter((d) => d.isLeave && !d.firstIn).length;

  // Only count working days that have already elapsed for the absent estimate.
  const today = startOfDay(new Date());
  const effectiveEnd = end > addDays(today, 1) ? addDays(today, 1) : end;
  const workingDays = workingDaysBetween(start, effectiveEnd);
  const absentDays = Math.max(0, workingDays - presentDays - leaveDays);
  const attendanceRate = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;

  // Average in / out minutes across days that have them.
  const inMins = days.filter((d) => d.firstIn).map((d) => minutesOf(d.firstIn));
  const outMins = days.filter((d) => d.lastOut).map((d) => minutesOf(d.lastOut));
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return {
    presentDays,
    absentDays,
    leaveDays,
    workingDays,
    attendanceRate,
    avgInTime: minutesToHHMM(avg(inMins)),
    avgOutTime: minutesToHHMM(avg(outMins)),
  };
}

// Guard: require a Student (employee) token, not an Organization token.
function requireEmployee(req, res) {
  if (!req.student) {
    res.status(403).json({ success: false, error: 'Employee login required' });
    return null;
  }
  return req.student;
}

/* ───────────────────────── unified login ───────────────────────── */

// POST /api/portal/login  { identifier, password }
// Auto-detects Admin (email) vs employee (UID) and returns the role so the
// frontend can show the right dashboard.
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'identifier and password are required' });
    }

    // ── Super Admin login ── (Anuvadini network-wide, all organizations)
    // Username "superadmin" + the SUPER_ADMIN_KEY from the environment.
    const SUPER_KEY = process.env.SUPER_ADMIN_KEY;
    if (String(identifier).trim().toLowerCase() === 'superadmin') {
      if (!SUPER_KEY || password !== SUPER_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid super admin credentials' });
      }
      // Single active session: opening this one terminates any previous
      // super-admin session (the old device gets a 401 + security message).
      const sid = await sessionService.createSession({
        userKey: 'superadmin',
        userType: 'superadmin',
        role: 'superadmin',
        userLabel: 'Anuvadini Super Admin',
        ip: resolveClientIp(req),
        deviceInfo: loginDeviceInfo(req),
      });
      const token = jwt.sign({ sa: true, role: 'superadmin', sid }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d',
      });
      return res.json({
        success: true,
        token,
        userType: 'superadmin',
        role: 'superadmin',
        profile: { id: 'superadmin', name: 'Anuvadini Super Admin', email: 'superadmin' },
      });
    }

    // ── Admin / Organization login (email) ──
    if (isEmail(identifier)) {
      const org = await Organization.findOne({ email: String(identifier).toLowerCase().trim() });
      if (!org) return res.status(401).json({ success: false, error: 'Invalid credentials' });
      // Password enforcement — mirrors server/routes/auth.js's /login (same
      // flags.orgPasswordRequired / allowPasswordlessOrgLogin policy). This
      // route did NOT check the password at all (not even a computed-but-
      // ignored isMatch like auth.js had) — any correct email logged in
      // regardless of password. Found 2026-08-03 via a real login attempt
      // with a wrong password that succeeded. Both routes now genuinely
      // enforce this together.
      if (flags.orgPasswordRequired) {
        const hasPassword = !!org.password;
        if (!hasPassword) {
          if (!flags.allowPasswordlessOrgLogin) {
            return res.status(401).json({
              success: false,
              error: 'Password not set for this account. Contact the administrator to set a password.',
            });
          }
        } else {
          const isMatch = await org.comparePassword(password);
          if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
          }
        }
      }
      org.lastLogin = new Date();
      await org.save();
      // Admin is an admin role → single active session per account.
      const sid = await sessionService.createSession({
        userKey: String(org._id),
        userType: 'organization',
        role: 'hoi',
        userLabel: org.name || org.email,
        organization: org._id,
        ip: resolveClientIp(req),
        deviceInfo: loginDeviceInfo(req),
      });
      return res.json({
        success: true,
        token: signToken(org._id, { sid }),
        userType: 'hoi',
        role: 'hoi',
        profile: { id: org._id, name: org.name, email: org.email, organizationType: org.organizationType },
      });
    }

    // ── Employee login (UID) ──
    const student = await Student.findOne({ uid: String(identifier).trim() }).populate(
      'organization',
      'name organizationType'
    );
    if (!student) return res.status(401).json({ success: false, error: 'Invalid UID or password' });
    if (!student.isActive) return res.status(403).json({ success: false, error: 'Account is deactivated' });

    // Password check: hashed compare if hashed, plain compare otherwise.
    // First-time login (no password set) uses the UID as the password and then
    // persists it — mirrors the existing mobile student-login behaviour.
    if (student.password) {
      const stored = student.password;
      const matches = /^\$2[aby]\$/.test(stored)
        ? await bcrypt.compare(password, stored)
        : password === stored;
      if (!matches) return res.status(401).json({ success: false, error: 'Invalid UID or password' });
    } else {
      if (password !== student.uid) return res.status(401).json({ success: false, error: 'Invalid UID or password' });
      student.password = student.uid;
      await student.save();
    }

    const role = student.role || 'faculty';
    // Administrative roles (HOD today; nodal officers etc. tomorrow) get a
    // single-active web session. Faculty/staff tokens are issued EXACTLY as
    // before — no sid, no session row, nothing to invalidate — and the mobile
    // student login (routes/auth.js) is untouched entirely.
    let sessionClaims = {};
    if (sessionService.isAdminRole(role)) {
      const sid = await sessionService.createSession({
        userKey: String(student._id),
        userType: 'employee',
        role,
        userLabel: student.fullName || student.uid,
        organization: student.organization?._id || student.organization || null,
        ip: resolveClientIp(req),
        deviceInfo: loginDeviceInfo(req),
      });
      sessionClaims = { sid };
    }
    return res.json({
      success: true,
      token: signToken(student._id, sessionClaims),
      userType: 'employee',
      role, // 'faculty' | 'staff' | 'hod'
      profile: {
        id: student._id,
        name: student.fullName,
        uid: student.uid,
        email: student.email,
        role,
        designation: student.designation || '',
        department: student.department || '',
        organization: student.organization ? { id: student.organization._id, name: student.organization.name } : null,
      },
    });
  } catch (err) {
    console.error('[portal/login] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/portal/logout — close the caller's single-active session (if any)
// so the history records a clean 'manual_logout'. Best-effort and idempotent:
// faculty/student tokens have no sid and simply no-op; an already-terminated
// or expired token is not an error (the client is logging out either way).
router.post('/logout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
        if (decoded && decoded.sid) await sessionService.endSession(decoded.sid, 'manual_logout');
        if (decoded && decoded.id) {
          // A logged-out phone must not leave its Work PC connected.
          const Student = require('../models/Student');
          const st = await Student.findById(decoded.id, { uid: 1 }).lean().catch(() => null);
          if (st && st.uid) await require('../services/defenderOvertimeService').disconnectPCs(st.uid, new Date());
        }
      } catch (_e) {
        /* invalid token — nothing to close */
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[portal/logout] error:', err);
    return res.json({ success: true }); // logout must never fail client-side
  }
});

/* ───────────────────────── faculty / staff (self) ───────────────────────── */

// GET /api/portal/me — current employee profile + latest-activity context so
// the dashboards can default their month/date pickers to a period that has
// data (avoids a blank view when the current month has no records yet).
router.get('/me', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  const populated = await Student.findById(me._id).populate('organization', 'name organizationType location');
  const role = populated.role || 'faculty';

  // Latest attendance for THIS employee. findMergedAttendance already
  // returns newest-first (see utils/mergedAttendance.js), so [0] is the
  // latest — merged across both the primary and the other "biometric"
  // attendance app's DB, so this doesn't undercount someone who last marked
  // over there.
  const lastOwnRecords = await findMergedAttendance({ student: me._id });
  const lastOwn = lastOwnRecords[0] || null;

  // For an HOD, also the latest attendance anywhere in their department.
  let lastDept = null;
  if (role === 'hod' && populated.department) {
    const members = await Student.find({ organization: populated.organization, department: populated.department }).select('_id');
    const memberIds = members.map((m) => m._id);
    const lastDeptRecords = await findMergedAttendance({ student: { $in: memberIds } });
    lastDept = lastDeptRecords[0] || null;
  }

  const toMonth = (d) => (d ? new Date(d).toISOString().slice(0, 7) : null);
  const toDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

  // Collect face images for the profile. FaceImage docs (durable, inline
  // base64) FIRST — student.faceImages can hold raw multer disk paths
  // ("uploads/faceImages/xxx.jpg") from the legacy enrollment path, which are
  // machine-local and do NOT survive a redeploy; sending those to the app
  // produces a dead image link (this is exactly why the profile photo can
  // go blank after the server is redeployed). Only include a
  // student.faceImages entry if it's actually displayable (a data URI, an
  // http(s) URL, or a base64 blob) — never a bare local path.
  const faceImages = [];
  const faceDocs = await FaceImage.find({ student: populated._id }).select('imageBase64').lean();
  for (const doc of faceDocs) {
    if (doc.imageBase64) faceImages.push(doc.imageBase64);
  }
  if (Array.isArray(populated.faceImages)) {
    for (const img of populated.faceImages) {
      if (img && isDisplayableFaceImage(img)) faceImages.push(img);
    }
  }

  return res.json({
    success: true,
    profile: {
      id: populated._id,
      fullName: populated.fullName,
      uid: populated.uid,
      email: populated.email,
      gender: populated.gender,
      age: populated.age,
      faceImages,
      role,
      designation: populated.designation || '',
      department: populated.department || '',
      bureau: populated.bureau || '',
      isActive: populated.isActive,
      selectedBiometrics: populated.selectedBiometrics,
      organization: populated.organization
        ? { id: populated.organization._id, name: populated.organization.name, type: populated.organization.organizationType }
        : null,
    },
    context: {
      latestActivityMonth: toMonth(lastOwn?.timestamp),
      latestActivityDate: toDate(lastOwn?.timestamp),
      latestDeptActivityDate: toDate(lastDept?.timestamp),
      latestDeptActivityMonth: toMonth(lastDept?.timestamp),
    },
  });
});

// GET /api/portal/my/summary?month=YYYY-MM — KPI tiles for the logged-in employee
router.get('/my/summary', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const { start, end } = monthBounds(req.query.month);
    // Merged read (primary + the other "biometric" attendance app's DB — see
    // utils/mergedAttendance.js): a mark made in EITHER system must count here,
    // same as the mobile app's own history/calendar screens already do.
    // Querying only the primary collection was showing "no check-in" for any
    // day the employee actually checked in through the other system and only
    // checked out here (reported: app showed the check-in, this dashboard didn't).
    const records = await findMergedAttendance({
      student: me._id,
      timestamp: { $gte: start, $lt: end },
    });

    const summary = summarizeMonth(records, { start, end });

    // Today's status
    const tStart = startOfDay(new Date());
    const tEnd = addDays(tStart, 1);
    const todayRecords = records.filter((r) => r.timestamp >= tStart && r.timestamp < tEnd);
    const todayByDay = groupByDay(todayRecords).get(tStart.toISOString().slice(0, 10));
    const today = {
      status: todayByDay?.firstIn ? 'present' : todayByDay?.isLeave ? 'leave' : 'absent',
      inTime: fmtTime(todayByDay?.firstIn),
      outTime: fmtTime(todayByDay?.lastOut),
      method: todayByDay?.method || null,
    };

    return res.json({ success: true, month: req.query.month || null, summary, today });
  } catch (err) {
    console.error('[portal/my/summary] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/my/attendance?month=YYYY-MM — per-day attendance rows
router.get('/my/attendance', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const { start, end } = monthBounds(req.query.month);
    // Merged read — see the identical comment on /my/summary above; this
    // route renders the exact per-day table the user reported as missing
    // check-ins for, so it needs the same dual-store read.
    const records = await findMergedAttendance({
      student: me._id,
      timestamp: { $gte: start, $lt: end },
    });

    const byDay = groupByDay(records);
    const rows = Array.from(byDay.values())
      .map((d) => {
        const hoursWorked =
          d.firstIn && d.lastOut
            ? Math.max(0, (new Date(d.lastOut) - new Date(d.firstIn)) / 3600000)
            : null;
        return {
          date: d.date,
          firstIn: fmtTime(d.firstIn),
          lastOut: fmtTime(d.lastOut),
          hoursWorked: hoursWorked != null ? Math.round(hoursWorked * 100) / 100 : null,
          method: d.method,
          faceVerified: d.faceVerified,
          isWFH: d.isWFH,
          status: d.firstIn ? 'present' : d.isLeave ? 'leave' : 'absent',
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return res.json({ success: true, rows });
  } catch (err) {
    console.error('[portal/my/attendance] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/my/trend?months=6 — present-day count per month (self)
router.get('/my/trend', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const months = Math.min(12, Math.max(1, parseInt(req.query.months, 10) || 6));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Was a Mongo aggregate on the primary collection only — rewritten as a
    // merged-read + in-JS reduction (same de-duplicated-by-day-then-counted-
    // per-month shape the two-stage $group produced) so a check-in made in
    // the other "biometric" attendance app's DB still counts toward the
    // trend, same as everywhere else on this page.
    const records = await findMergedAttendance({
      student: me._id,
      type: 'in',
      timestamp: { $gte: start, $lt: end },
    });
    const seenDayKeys = new Set();
    const monthCounts = new Map();
    for (const r of records) {
      const ts = new Date(r.timestamp);
      const y = ts.getUTCFullYear();
      const m = ts.getUTCMonth() + 1;
      const dayKey = `${y}-${m}-${ts.getUTCDate()}`;
      if (seenDayKeys.has(dayKey)) continue;
      seenDayKeys.add(dayKey);
      const monthKey = `${y}-${m}`;
      monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const map = monthCounts;
    const series = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      series.push({
        month: monthNames[d.getMonth()],
        year: d.getFullYear(),
        presentDays: map.get(`${d.getFullYear()}-${d.getMonth() + 1}`) || 0,
      });
    }
    return res.json({ success: true, series });
  } catch (err) {
    console.error('[portal/my/trend] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/my/timetable — the logged-in faculty's own weekly schedule
router.get('/my/timetable', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const Timetable = require('../models/Timetable');
    const slots = await Timetable.find({ faculty: me._id, deletedAt: null }).sort({ day: 1, start: 1 }).lean();
    const rows = slots.map((s) => ({
      id: s._id, subject: s.subject, type: s.type, day: s.day, start: s.start, end: s.end,
      room: s.room, academicYear: s.academicYear || '',
    }));
    return res.json({ success: true, rows });
  } catch (err) {
    console.error('[portal/my/timetable] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/my/teaching-log?date=YYYY-MM-DD — the faculty's OWN classes
// for a day, joined with their real class check-ins (status + geo + selfie).
// Faculty-scoped mirror of GET /api/class-checkins/log (which is org-scoped).
router.get('/my/teaching-log', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const Timetable = require('../models/Timetable');
    const ClassCheckin = require('../models/ClassCheckin');
    const date = req.query.date || toLocalYMD(new Date());
    const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const [slots, checkins] = await Promise.all([
      Timetable.find({ faculty: me._id, day, deletedAt: null }).sort({ start: 1 }).lean(),
      ClassCheckin.find({ faculty: me._id, date }).lean(),
    ]);
    const byTt = new Map(checkins.map((c) => [String(c.timetable), c]));
    const now = new Date();
    const rows = slots.map((slot) => {
      const c = byTt.get(String(slot._id)) || null;
      let status;
      if (c) status = c.status;
      else status = new Date(`${date}T${slot.end}:00`) < now ? 'missed' : 'upcoming';
      return {
        timetableId: slot._id,
        subject: slot.subject,
        type: slot.type,
        room: slot.room,
        start: slot.start,
        end: slot.end,
        status,
        geo: c && c.geo ? c.geo : null,
        selfieUrl: c && c.photos && c.photos.length ? c.photos[0].image : null,
        photoCount: c && c.photos ? c.photos.length : 0,
        note: c ? c.note || null : null,
      };
    });
    return res.json({ success: true, date, rows });
  } catch (err) {
    console.error('[portal/my/teaching-log] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/my/class-evidence/:timetableId?date=YYYY-MM-DD — full uploaded
// evidence (photos, note, geo) for ONE of the faculty's own classes on a date.
router.get('/my/class-evidence/:timetableId', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const ClassCheckin = require('../models/ClassCheckin');
    const date = req.query.date || toLocalYMD(new Date());
    const checkin = await ClassCheckin.findOne({
      faculty: me._id,
      timetable: req.params.timetableId,
      date,
    }).lean();
    return res.json({ success: true, evidence: checkin || null });
  } catch (err) {
    console.error('[portal/my/class-evidence] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/my/outreach — the faculty's own outreach activities
router.get('/my/outreach', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const OutreachActivity = require('../models/OutreachActivity');
    const { markPastPendingOutreachNoResponse } = require('../utils/outreachNoResponse');
    await markPastPendingOutreachNoResponse({ organization: me.organization, leadScope: [me._id] });
    const docs = await OutreachActivity.find({ lead: me._id }).sort({ date: -1 }).lean();
    const data = docs.map((d) => ({
      id: d._id,
      title: d.title,
      type: d.type,
      location: d.location,
      date: d.date,
      status: d.status,
      participants: d.participants || 0,
      gpsPoints: d.gpsPoints || 0,
      photos: d.photoCount || 0,
      evidenceHash: d.evidenceHash || '',
      noResponseAt: d.noResponseAt || null,
      noResponseReason: d.noResponseReason || '',
      createdAt: d.createdAt || null,
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[portal/my/outreach] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/my/checkouts — own check-out requests
router.get('/my/checkouts', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const CheckoutRequest = require('../models/Model_cheakoutRequest');
    const docs = await CheckoutRequest.find({ student: me._id }).sort({ createdAt: -1 }).lean();
    const data = docs.map((d) => ({
      id: d._id, date: d.date, details: d.details || d.reson || '', status: d.status || 'pending', appliedOn: d.createdAt,
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[portal/my/checkouts] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/my/leaves — own leave requests
router.get('/my/leaves', auth, async (req, res) => {
  const me = requireEmployee(req, res);
  if (!me) return;
  try {
    const leaves = await LeaveRequest.find({ student: me._id }).sort({ createdAt: -1 });
    const data = leaves.map((l) => ({
      id: l._id,
      from: l.leaveDates?.start || null,
      to: l.leaveDates?.end || null,
      reason: l.reason || l.leaveDetails || l.reson || '',
      description: l.description || '',
      comments: l.comments || '',
      leaveType: l.leaveTypeName || l.leaveTypeCode || null,
      isEmergency: !!l.isEmergency,
      dayPortion: l.dayPortion || 'full',
      halfDayType: l.halfDayType || null,
      contactNumber: l.contactNumber || '',
      addressDuringLeave: l.addressDuringLeave || '',
      expectedReturnDate: l.expectedReturnDate || null,
      status: l.status || 'pending',
      appliedOn: l.createdAt,
      attachments: (l.attachments || []).map((a) => ({
        id: String(a._id),
        originalName: a.originalName,
        mimeType: a.mimeType,
        category: a.category,
        url: `/api/leaves/${l._id}/attachments/${a._id}`,
      })),
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[portal/my/leaves] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ───────────────────────── HOD (department-scoped) ───────────────────────── */

// Guard: require an employee with role 'hod' and a department.
async function requireHod(req, res) {
  const me = requireEmployee(req, res);
  if (!me) return null;
  if ((me.role || 'faculty') !== 'hod') {
    res.status(403).json({ success: false, error: 'HOD access required' });
    return null;
  }
  if (!me.department) {
    res.status(400).json({ success: false, error: 'No department assigned to this HOD' });
    return null;
  }
  return me;
}

// Fetch all members of the HOD's department (including the HOD).
async function departmentMembers(orgId, department) {
  return Student.find({ organization: orgId, department, isActive: true }).select(
    '_id fullName uid email role designation gender'
  );
}

// GET /api/portal/hod/overview?date=YYYY-MM-DD — department KPI tiles
router.get('/hod/overview', auth, async (req, res) => {
  const hod = await requireHod(req, res);
  if (!hod) return;
  try {
    const orgId = hod.organization;
    const dept = hod.department;
    const members = await departmentMembers(orgId, dept);
    const memberIds = members.map((m) => m._id);

    const day = req.query.date ? startOfDay(req.query.date) : startOfDay(new Date());
    const dayEnd = addDays(day, 1);

    const todayRecords = await findMergedAttendance({
      student: { $in: memberIds },
      timestamp: { $gte: day, $lt: dayEnd },
    });

    const presentSet = new Set();
    const lateSet = new Set();
    const leaveSet = new Set();
    for (const r of todayRecords) {
      const sid = r.student.toString();
      if (r.type === 'in') {
        presentSet.add(sid);
        const mins = minutesOf(r.timestamp);
        if (mins > 9 * 60 + 30) lateSet.add(sid); // after 09:30 = late
      } else if (r.type === 'leave') {
        leaveSet.add(sid);
      }
    }

    // Month attendance rate for the department (avg present-day ratio).
    const { start, end } = monthBounds(req.query.month);
    const monthRecords = await findMergedAttendance({
      student: { $in: memberIds },
      type: 'in',
      timestamp: { $gte: start, $lt: end },
    });
    const presentDayKeys = new Set(
      monthRecords.map((r) => `${r.student.toString()}_${startOfDay(r.timestamp).toISOString().slice(0, 10)}`)
    );
    const today = startOfDay(new Date());
    const effEnd = end > addDays(today, 1) ? addDays(today, 1) : end;
    const workingDays = workingDaysBetween(start, effEnd);
    const possible = workingDays * members.length;
    const monthlyRate = possible > 0 ? Math.round((presentDayKeys.size / possible) * 100) : 0;

    const totalMembers = members.length;
    const presentToday = presentSet.size;
    const onLeaveToday = leaveSet.size;
    const absentToday = Math.max(0, totalMembers - presentToday - onLeaveToday);
    const todayRate = totalMembers > 0 ? Math.round((presentToday / totalMembers) * 100) : 0;

    return res.json({
      success: true,
      department: dept,
      overview: {
        totalMembers,
        faculty: members.filter((m) => (m.role || 'faculty') !== 'staff').length,
        staff: members.filter((m) => m.role === 'staff').length,
        presentToday,
        absentToday,
        onLeaveToday,
        lateToday: lateSet.size,
        todayRate,
        monthlyRate,
      },
    });
  } catch (err) {
    console.error('[portal/hod/overview] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/hod/members?date=YYYY-MM-DD — per-member status + month %
router.get('/hod/members', auth, async (req, res) => {
  const hod = await requireHod(req, res);
  if (!hod) return;
  try {
    const orgId = hod.organization;
    const dept = hod.department;
    const members = await departmentMembers(orgId, dept);
    const memberIds = members.map((m) => m._id);

    const day = req.query.date ? startOfDay(req.query.date) : startOfDay(new Date());
    const dayEnd = addDays(day, 1);
    const { start, end } = monthBounds(req.query.month);

    const [todayRecords, monthRecords] = await Promise.all([
      findMergedAttendance({ student: { $in: memberIds }, timestamp: { $gte: day, $lt: dayEnd } }),
      findMergedAttendance({ student: { $in: memberIds }, type: 'in', timestamp: { $gte: start, $lt: end } }),
    ]);

    // Today per member
    const todayMap = new Map();
    for (const r of todayRecords) {
      const sid = r.student.toString();
      const e = todayMap.get(sid) || { in: null, out: null, method: null };
      if (r.type === 'in' && (!e.in || new Date(r.timestamp) < new Date(e.in))) {
        e.in = r.timestamp;
        e.method = r.authMethod;
      }
      if (r.type === 'out' && (!e.out || new Date(r.timestamp) > new Date(e.out))) e.out = r.timestamp;
      todayMap.set(sid, e);
    }

    // Month present-days per member
    const presentDaysMap = new Map();
    for (const r of monthRecords) {
      const sid = r.student.toString();
      const set = presentDaysMap.get(sid) || new Set();
      set.add(startOfDay(r.timestamp).toISOString().slice(0, 10));
      presentDaysMap.set(sid, set);
    }
    const today = startOfDay(new Date());
    const effEnd = end > addDays(today, 1) ? addDays(today, 1) : end;
    const workingDays = workingDaysBetween(start, effEnd);

    const rows = members
      .map((m) => {
        const sid = m._id.toString();
        const t = todayMap.get(sid) || {};
        const presentDays = presentDaysMap.get(sid)?.size || 0;
        const rate = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;
        return {
          id: m._id,
          fullName: m.fullName,
          uid: m.uid,
          role: m.role || 'faculty',
          designation: m.designation || '',
          isHod: m._id.toString() === hod._id.toString(),
          today: {
            status: t.in ? 'present' : 'absent',
            inTime: fmtTime(t.in),
            outTime: fmtTime(t.out),
            method: t.method || null,
          },
          monthPresentDays: presentDays,
          monthRate: rate,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return res.json({ success: true, department: dept, workingDays, rows });
  } catch (err) {
    console.error('[portal/hod/members] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/hod/trend?days=10 — department present-count per day
router.get('/hod/trend', auth, async (req, res) => {
  const hod = await requireHod(req, res);
  if (!hod) return;
  try {
    const days = Math.min(31, Math.max(5, parseInt(req.query.days, 10) || 10));
    const members = await departmentMembers(hod.organization, hod.department);
    const memberIds = members.map((m) => m._id);

    // Anchor the window at `end` (default = today). Lets the dashboard show a
    // populated trend ending on the latest date that actually has data.
    const anchor = req.query.end ? startOfDay(req.query.end) : startOfDay(new Date());
    const today = anchor;
    const start = addDays(today, -(days - 1));
    const end = addDays(today, 1);

    const records = await findMergedAttendance({
      student: { $in: memberIds },
      type: 'in',
      timestamp: { $gte: start, $lt: end },
    });

    // unique student-days per calendar day
    const perDay = new Map();
    for (const r of records) {
      const key = startOfDay(r.timestamp).toISOString().slice(0, 10);
      const set = perDay.get(key) || new Set();
      set.add(r.student.toString());
      perDay.set(key, set);
    }

    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const key = d.toISOString().slice(0, 10);
      const present = perDay.get(key)?.size || 0;
      series.push({
        date: key,
        present,
        absent: Math.max(0, members.length - present),
        total: members.length,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
    }

    return res.json({ success: true, series });
  } catch (err) {
    console.error('[portal/hod/trend] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/hod/leaves?status=pending — leave requests from dept members
router.get('/hod/leaves', auth, async (req, res) => {
  const hod = await requireHod(req, res);
  if (!hod) return;
  try {
    const members = await departmentMembers(hod.organization, hod.department);
    const memberIds = members.map((m) => m._id);
    const nameById = new Map(members.map((m) => [m._id.toString(), m]));

    const q = { student: { $in: memberIds } };
    const status = (req.query.status || '').toLowerCase();
    if (['pending', 'approved', 'rejected'].includes(status)) q.status = status;

    const leaves = await LeaveRequest.find(q).sort({ createdAt: -1 }).limit(100);
    const data = leaves.map((l) => {
      const m = nameById.get(l.student?.toString());
      return {
        id: l._id,
        memberName: m?.fullName || 'Unknown',
        memberUid: m?.uid || '',
        designation: m?.designation || '',
        from: l.leaveDates?.start || null,
        to: l.leaveDates?.end || null,
        reason: l.reason || l.leaveDetails || l.reson || '',
        description: l.description || '',
        comments: l.comments || '',
        leaveType: l.leaveTypeName || l.leaveTypeCode || null,
        isEmergency: !!l.isEmergency,
        dayPortion: l.dayPortion || 'full',
        halfDayType: l.halfDayType || null,
        contactNumber: l.contactNumber || '',
        addressDuringLeave: l.addressDuringLeave || '',
        expectedReturnDate: l.expectedReturnDate || null,
        status: l.status || 'pending',
        appliedOn: l.createdAt,
        attachments: (l.attachments || []).map((a) => ({
          id: String(a._id),
          originalName: a.originalName,
          mimeType: a.mimeType,
          category: a.category,
          url: `/api/leaves/${l._id}/attachments/${a._id}`,
        })),
      };
    });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[portal/hod/leaves] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/hod/member/:id/attendance?month=YYYY-MM — drill into a member
router.get('/hod/member/:id/attendance', auth, async (req, res) => {
  const hod = await requireHod(req, res);
  if (!hod) return;
  try {
    // Ensure the target belongs to the HOD's department (authorization).
    const member = await Student.findOne({
      _id: req.params.id,
      organization: hod.organization,
      department: hod.department,
    }).select('_id fullName uid designation role');
    if (!member) return res.status(404).json({ success: false, error: 'Member not in your department' });

    const { start, end } = monthBounds(req.query.month);
    const records = await findMergedAttendance({
      student: member._id,
      timestamp: { $gte: start, $lt: end },
    });

    const summary = summarizeMonth(records, { start, end });
    const byDay = groupByDay(records);
    const rows = Array.from(byDay.values())
      .map((d) => ({
        date: d.date,
        firstIn: fmtTime(d.firstIn),
        lastOut: fmtTime(d.lastOut),
        method: d.method,
        faceVerified: d.faceVerified,
        status: d.firstIn ? 'present' : d.isLeave ? 'leave' : 'absent',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return res.json({
      success: true,
      member: { id: member._id, fullName: member.fullName, uid: member.uid, designation: member.designation, role: member.role },
      summary,
      rows,
    });
  } catch (err) {
    console.error('[portal/hod/member] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/hod/dashboard?date=YYYY-MM-DD&month=YYYY-MM
// One call that returns everything the Admin dashboard shows, but strictly scoped
// to the HOD's department. Fully computed from live attendance data.
router.get('/hod/dashboard', auth, async (req, res) => {
  const hod = await requireHod(req, res);
  if (!hod) return;
  try {
    const orgId = hod.organization;
    const dept = hod.department;
    const members = await Student.find({ organization: orgId, department: dept, isActive: true }).select(
      '_id fullName uid role designation gender'
    );
    const memberIds = members.map((m) => m._id);
    const memberById = new Map(members.map((m) => [m._id.toString(), m]));
    const totalMembers = members.length;

    const day = req.query.date ? startOfDay(req.query.date) : startOfDay(new Date());
    const dayEnd = addDays(day, 1);
    const { start: mStart, end: mEnd } = monthBounds(req.query.month);

    // Check-in time-slots (shared with the Admin dashboard definitions).
    const slots = [
      { label: 'Before 9:00', from: 0, to: 9 * 60 },
      { label: '9:00-9:30', from: 9 * 60, to: 9 * 60 + 31 },
      { label: '9:31-10:00 (Late)', from: 9 * 60 + 31, to: 10 * 60 + 1 },
      { label: '10:01-11:00 (Late)', from: 10 * 60 + 1, to: 11 * 60 + 1 },
      { label: 'After 11:00 (Late)', from: 11 * 60 + 1, to: 24 * 60 },
    ];
    const slotOf = (mins) => slots.find((s) => mins >= s.from && mins < s.to) || slots[slots.length - 1];

    // Pull the day's records + the month's records in parallel. All merged
    // (primary + the other "biometric" attendance app's DB — utils/mergedAttendance.js)
    // so a member who marked over there isn't invisible on this HOD dashboard.
    const [dayRecords, monthInRecords, last10Raw, twelveMonthRecords] = await Promise.all([
      findMergedAttendance({ student: { $in: memberIds }, timestamp: { $gte: day, $lt: dayEnd } }),
      findMergedAttendance({ student: { $in: memberIds }, type: 'in', timestamp: { $gte: mStart, $lt: mEnd } }),
      // last 10 days ending on `day`
      findMergedAttendance({
        student: { $in: memberIds },
        type: 'in',
        timestamp: { $gte: addDays(day, -9), $lt: dayEnd },
      }),
      // 12-month present student-days — was a Mongo aggregate on the primary
      // collection only; fetched as merged raw records below and reduced in
      // JS instead (same two-stage de-dup-by-day-then-count-per-month shape).
      findMergedAttendance({
        student: { $in: memberIds },
        type: 'in',
        timestamp: { $gte: new Date(mEnd.getFullYear(), mEnd.getMonth() - 12, 1), $lt: mEnd },
      }),
    ]);
    const monthlyTrendRaw = (() => {
      const seenStudentDayKeys = new Set();
      const counts = new Map();
      for (const r of twelveMonthRecords) {
        const ts = new Date(r.timestamp);
        const y = ts.getUTCFullYear();
        const m = ts.getUTCMonth() + 1;
        const key = `${r.student.toString()}_${y}-${m}-${ts.getUTCDate()}`;
        if (seenStudentDayKeys.has(key)) continue;
        seenStudentDayKeys.add(key);
        const monthKey = `${y}-${m}`;
        counts.set(monthKey, (counts.get(monthKey) || 0) + 1);
      }
      return Array.from(counts, ([monthKey, count]) => {
        const [y, m] = monthKey.split('-').map(Number);
        return { _id: { y, m }, count };
      });
    })();

    // ── Per-member today (first-in / last-out) ──
    const todayByMember = new Map();
    for (const r of dayRecords) {
      const sid = r.student.toString();
      const e = todayByMember.get(sid) || { in: null, out: null, method: null, faceVerified: false };
      if (r.type === 'in' && (!e.in || new Date(r.timestamp) < new Date(e.in))) {
        e.in = r.timestamp;
        e.method = r.authMethod;
        e.faceVerified = !!r.faceVerified;
      }
      if (r.type === 'out' && (!e.out || new Date(r.timestamp) > new Date(e.out))) e.out = r.timestamp;
      todayByMember.set(sid, e);
    }

    // ── Time-wise (check-in) + check-in vs check-out, latest per member ──
    const inSlotCounts = new Map(slots.map((s) => [s.label, 0]));
    const outSlotCounts = new Map(slots.map((s) => [s.label, 0]));
    const latestIn = new Map();
    const latestOut = new Map();
    for (const r of dayRecords) {
      const sid = r.student.toString();
      if (r.type === 'in' && (!latestIn.has(sid) || new Date(r.timestamp) > new Date(latestIn.get(sid)))) latestIn.set(sid, r.timestamp);
      if (r.type === 'out' && (!latestOut.has(sid) || new Date(r.timestamp) > new Date(latestOut.get(sid)))) latestOut.set(sid, r.timestamp);
    }
    latestIn.forEach((ts) => inSlotCounts.set(slotOf(minutesOf(ts)).label, inSlotCounts.get(slotOf(minutesOf(ts)).label) + 1));
    latestOut.forEach((ts) => outSlotCounts.set(slotOf(minutesOf(ts)).label, outSlotCounts.get(slotOf(minutesOf(ts)).label) + 1));
    const totalInDay = latestIn.size;
    const timeWise = slots.map((s) => ({
      name: s.label,
      value: inSlotCounts.get(s.label),
      percentage: totalInDay ? ((inSlotCounts.get(s.label) / totalInDay) * 100).toFixed(1) : 0,
    }));
    const timeWiseInOut = slots.map((s) => ({ name: s.label, checkIn: inSlotCounts.get(s.label), checkOut: outSlotCounts.get(s.label) }));

    // ── Today tiles ──
    const presentSet = new Set(latestIn.keys());
    const leaveSet = new Set(dayRecords.filter((r) => r.type === 'leave').map((r) => r.student.toString()));
    const lateSet = new Set([...latestIn.entries()].filter(([, ts]) => minutesOf(ts) > 9 * 60 + 30).map(([sid]) => sid));
    const presentToday = presentSet.size;
    const onLeaveToday = leaveSet.size;
    const absentToday = Math.max(0, totalMembers - presentToday - onLeaveToday);
    const todayRate = totalMembers ? Math.round((presentToday / totalMembers) * 100) : 0;

    // ── Monthly rate (present student-days / possible) ──
    const presentDayKeys = new Set(
      monthInRecords.map((r) => `${r.student.toString()}_${startOfDay(r.timestamp).toISOString().slice(0, 10)}`)
    );
    const today = startOfDay(new Date());
    const effEnd = mEnd > addDays(today, 1) ? addDays(today, 1) : mEnd;
    const workingDays = workingDaysBetween(mStart, effEnd);
    const monthlyRate = workingDays * totalMembers > 0 ? Math.round((presentDayKeys.size / (workingDays * totalMembers)) * 100) : 0;

    // ── Gender distribution (members) ──
    const genderMap = {};
    members.forEach((m) => {
      const g = (m.gender || 'unknown');
      genderMap[g] = (genderMap[g] || 0) + 1;
    });
    const genderDistribution = Object.entries(genderMap).map(([name, value]) => ({ name, value }));

    // ── Auth-method distribution (month check-ins) ──
    const authMap = {};
    monthInRecords.forEach((r) => {
      const a = r.authMethod || 'unknown';
      authMap[a] = (authMap[a] || 0) + 1;
    });
    const authMethodDistribution = Object.entries(authMap).map(([name, value]) => ({ name, value }));

    // ── Last 10 days trend ──
    const perDay = new Map();
    for (const r of last10Raw) {
      const key = startOfDay(r.timestamp).toISOString().slice(0, 10);
      const set = perDay.get(key) || new Set();
      set.add(r.student.toString());
      perDay.set(key, set);
    }
    const last10Days = [];
    for (let i = 9; i >= 0; i--) {
      const d = addDays(day, -i);
      const key = d.toISOString().slice(0, 10);
      const present = perDay.get(key)?.size || 0;
      last10Days.push({ date: key, present, absent: Math.max(0, totalMembers - present), total: totalMembers, isWeekend: d.getDay() === 0 || d.getDay() === 6 });
    }

    // ── Monthly trend (12 months) ──
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mtMap = new Map(monthlyTrendRaw.map((r) => [`${r._id.y}-${r._id.m}`, r.count]));
    const monthlyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(mEnd.getFullYear(), mEnd.getMonth() - 1 - i, 1);
      monthlyTrend.push({ month: monthNames[d.getMonth()], year: d.getFullYear(), present: mtMap.get(`${d.getFullYear()}-${d.getMonth() + 1}`) || 0 });
    }

    // ── Recent activity (today's events, newest first) ──
    const recentActivity = dayRecords
      .filter((r) => r.type === 'in' || r.type === 'out')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 25)
      .map((r) => {
        const m = memberById.get(r.student.toString());
        return {
          name: m?.fullName || 'Unknown',
          uid: m?.uid || '',
          designation: m?.designation || '',
          type: r.type,
          time: fmtTime(r.timestamp),
          method: r.authMethod || null,
          faceVerified: !!r.faceVerified,
        };
      });

    // ── Members table (today status + month %) ──
    const presentDaysByMember = new Map();
    for (const r of monthInRecords) {
      const sid = r.student.toString();
      const set = presentDaysByMember.get(sid) || new Set();
      set.add(startOfDay(r.timestamp).toISOString().slice(0, 10));
      presentDaysByMember.set(sid, set);
    }
    const memberRows = members
      .map((m) => {
        const sid = m._id.toString();
        const t = todayByMember.get(sid) || {};
        const pd = presentDaysByMember.get(sid)?.size || 0;
        return {
          id: m._id,
          fullName: m.fullName,
          uid: m.uid,
          role: m.role || 'faculty',
          designation: m.designation || '',
          isHod: sid === hod._id.toString(),
          today: { status: t.in ? 'present' : 'absent', inTime: fmtTime(t.in), outTime: fmtTime(t.out), method: t.method || null },
          monthPresentDays: pd,
          monthRate: workingDays ? Math.round((pd / workingDays) * 100) : 0,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    // ── Pending leaves ──
    const pendingLeaves = await LeaveRequest.find({ student: { $in: memberIds }, status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(50);
    const leaves = pendingLeaves.map((l) => {
      const m = memberById.get(l.student?.toString());
      return {
        id: l._id,
        memberName: m?.fullName || 'Unknown',
        reason: l.reason || l.leaveDetails || l.reson || '',
        from: l.leaveDates?.start || null,
        to: l.leaveDates?.end || null,
        status: l.status || 'pending',
      };
    });

    return res.json({
      success: true,
      department: dept,
      date: toLocalYMD(day),
      month: req.query.month || mStart.toISOString().slice(0, 7),
      overview: {
        totalMembers,
        faculty: members.filter((m) => (m.role || 'faculty') !== 'staff').length,
        staff: members.filter((m) => m.role === 'staff').length,
        presentToday,
        absentToday,
        onLeaveToday,
        lateToday: lateSet.size,
        todayRate,
        monthlyRate,
        workingDays,
      },
      timeWise,
      timeWiseInOut,
      genderDistribution,
      authMethodDistribution,
      last10Days,
      monthlyTrend,
      recentActivity,
      members: memberRows,
      leaves,
    });
  } catch (err) {
    console.error('[portal/hod/dashboard] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ══════════════ Registration face images (Admin / HOD manage) ══════════════
 * Admin/HOD view each faculty member's enrolled registration face, and upload one
 * if it's missing (or replace it) — which also RE-ENROLLS the person in the face
 * engine so future recognition matches the new image. Scope: Admin = whole org,
 * HOD = their department only. Faculty/staff have no org context → blocked. */

// Resolve the caller's management scope. Admin → whole org; HOD → their department.
function staffScope(req) {
  const orgId = req.organization?._id;
  if (!orgId) return null; // faculty/staff: no org context
  return { orgId, dept: req.isHod ? req.hodDepartment || null : null };
}
// Is `student` within the caller's scope?
function inScope(scope, student) {
  if (!student || String(student.organization) !== String(scope.orgId)) return false;
  if (scope.dept && student.department !== scope.dept) return false;
  return true;
}

// Overview list of staff with whether they have a registration image yet.
router.get('/staff/registration-overview', auth, async (req, res) => {
  try {
    const scope = staffScope(req);
    if (!scope) return res.status(403).json({ success: false, error: 'Organization or HOD access required' });

    const q = { organization: scope.orgId, role: { $in: ['faculty', 'staff', 'hod'] }, isActive: true };
    if (scope.dept) q.department = scope.dept;
    const staff = await Student.find(q)
      .select('fullName uid designation department faceImages')
      .sort({ fullName: 1 })
      .lean();

    const ids = staff.map((s) => s._id);
    const withImg = new Set(
      (await FaceImage.find({ student: { $in: ids } }).distinct('student')).map(String)
    );

    const rows = staff.map((s) => {
      const hasImage = withImg.has(String(s._id)) || (Array.isArray(s.faceImages) && s.faceImages.length > 0);
      return {
        id: s._id,
        fullName: s.fullName,
        uid: s.uid,
        designation: s.designation || '',
        department: s.department || '',
        hasImage,
        imageUrl: hasImage ? `/api/portal/staff/${s._id}/registration-image` : null,
      };
    });

    return res.json({
      success: true,
      department: scope.dept || null,
      total: rows.length,
      withImage: rows.filter((r) => r.hasImage).length,
      staff: rows,
    });
  } catch (err) {
    console.error('[portal/staff/registration-overview]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Serve a staff member's registration image bytes. <img> can't send headers, so
// the portal token may also arrive as ?token=…; the caller's scope is enforced.
async function registrationImageAuth(req, res, next) {
  try {
    const token = req.query.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (await sessionService.isLoggedOutEveryone(decoded)) return res.status(401).json({ success: false, code: 'logged_out_everyone', message: sessionService.LOGGED_OUT_EVERYONE_MESSAGE });
    const org = await Organization.findById(decoded.id).select('_id');
    if (org) {
      // Admin (Admin) session must still be the latest login.
      if (!(await sessionService.enforceOrReject(decoded, res))) return;
      req._scope = { orgId: org._id, dept: null };
      return next();
    }
    const stu = await Student.findById(decoded.id).select('role organization department');
    if (stu && stu.role === 'hod') {
      // HOD web tokens carry a sid → enforce; sid-less mobile tokens pass.
      if (decoded.sid && !(await sessionService.enforceOrReject(decoded, res))) return;
      req._scope = { orgId: stu.organization, dept: stu.department || null };
      return next();
    }
    return res.status(403).json({ success: false, error: 'Organization or HOD access required' });
  } catch (_e) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

router.get('/staff/:studentId/registration-image', registrationImageAuth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).select('organization department faceImages').lean();
    if (!student || !inScope(req._scope, student)) return res.status(404).end();

    const fi = await FaceImage.findOne({ student: student._id }).sort({ createdAt: -1 }).select('imageBase64').lean();
    const str = fi?.imageBase64 || (Array.isArray(student.faceImages) ? student.faceImages[0] : null);
    if (!str) return res.status(404).end();

    if (str.startsWith('data:')) {
      const comma = str.indexOf(',');
      const mime = (str.slice(5, comma).split(';')[0]) || 'image/jpeg';
      res.set('Content-Type', mime);
      res.set('Cache-Control', 'private, max-age=3600');
      return res.send(Buffer.from(str.slice(comma + 1), 'base64'));
    }
    if (!str.includes('/') && str.length > 100) {
      res.set('Content-Type', 'image/jpeg');
      return res.send(Buffer.from(str, 'base64'));
    }
    const clean = str.replace(/^\/+/, '');
    return res.redirect('/' + (clean.startsWith('uploads/') ? clean : `uploads/${clean}`));
  } catch (err) {
    console.error('[portal/staff/registration-image]', err);
    return res.status(500).end();
  }
});

// Upload (or replace) a staff member's registration image — stores it AND
// re-enrolls them in the face engine so future recognition matches it.
router.post('/staff/:studentId/registration-image', auth, async (req, res) => {
  try {
    const scope = staffScope(req);
    if (!scope) return res.status(403).json({ success: false, error: 'Organization or HOD access required' });

    const student = await Student.findById(req.params.studentId);
    if (!student || !inScope(scope, student)) {
      return res.status(404).json({ success: false, error: 'Staff member not found in your scope' });
    }

    // Accept one `image` or several `images` (base64 / data-URL strings).
    const images = (Array.isArray(req.body.images) ? req.body.images : [req.body.image]).filter(Boolean);
    if (!images.length) return res.status(400).json({ success: false, error: 'No image provided' });
    if (images.length > 20) return res.status(400).json({ success: false, error: 'Max 20 images' });

    // Persist each as a FaceImage doc (canonical store the gallery/view reads).
    const docs = await FaceImage.insertMany(
      images.map((img) => ({
        uid: student.uid,
        name: student.fullName,
        email: student.email || student.uid,
        student: student._id,
        organization: student.organization,
        imageBase64: img,
        originalFilename: `registration-${Date.now()}.jpg`,
      }))
    );

    // Also file the registered image(s) on disk under face_storage/<user>/registered/.
    images.forEach((img) => faceStorageService.saveRegistered(student, img));

    // Re-enroll in the face engine (best-effort — store still succeeds if down).
    const enrollResult = await faceVerifyService.enroll({
      uid: student.uid,
      name: student.fullName,
      email: student.email || student.uid,
      faceImages: images,
    });

    // Re-enrollment security screening — a one-click "Replace" here is the
    // highest-leverage insider-fraud vector in the whole pipeline (silently
    // retargeting someone's biometric reference), so it gets the same
    // anti-spoof scrutiny as first-time enrollment.
    if (enrollResult.ok) {
      try {
        // `security.perImage` comes back in the same order `images` was sent
        // in — pick the flagged one as the alert email's attachment. Without
        // this the alert email sends with no image attached.
        const perImage = Array.isArray(enrollResult.security?.perImage) ? enrollResult.security.perImage : [];
        const flaggedIdx = perImage.findIndex((p) => p?.status === 'spoof_suspected');
        const evidenceImage = flaggedIdx >= 0 ? images[flaggedIdx] : null;

        await securityEventService.recordEnrollmentScreening({
          student: student._id,
          organization: student.organization,
          uid: student.uid,
          studentName: student.fullName,
          security: enrollResult.security,
          evidenceImage,
        });
      } catch (secErr) {
        console.error('[portal] re-enrollment security event failed:', secErr.message);
      }
    }

    return res.json({
      success: true,
      saved: docs.length,
      reEnrolled: enrollResult.ok === true,
      enrollError: enrollResult.ok ? null : enrollResult.error || null,
      imageUrl: `/api/portal/staff/${student._id}/registration-image`,
    });
  } catch (err) {
    console.error('[portal/staff/registration-image upload]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// A staff member's location trail for one day — the 5-min breadcrumbs captured
// between their check-in and check-out (replayable on a map). Admin/HOD scoped.
router.get('/staff/:studentId/location-trail', auth, async (req, res) => {
  try {
    const scope = staffScope(req);
    if (!scope) return res.status(403).json({ success: false, error: 'Organization or HOD access required' });

    const student = await Student.findById(req.params.studentId).select('fullName uid organization department').lean();
    if (!student || !inScope(scope, student)) {
      return res.status(404).json({ success: false, error: 'Staff member not found in your scope' });
    }

    const day = req.query.date ? startOfDay(req.query.date) : startOfDay(new Date());
    const dayEnd = addDays(day, 1);

    // Window = that day's check-in → check-out (fallback to the whole day).
    // Merged read so a check-in made in the other "biometric" attendance
    // app's DB still anchors the trail window correctly.
    const dayAttendance = await findMergedAttendance({
      student: student._id,
      timestamp: { $gte: day, $lt: dayEnd },
    });
    const dayCheckIns = dayAttendance.filter((r) => r.type === 'in');
    const dayCheckOuts = dayAttendance.filter((r) => r.type === 'out');
    const checkIn = dayCheckIns.length
      ? dayCheckIns.reduce((a, b) => (new Date(a.timestamp) < new Date(b.timestamp) ? a : b))
      : null;
    const checkOut = dayCheckOuts.length
      ? dayCheckOuts.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b))
      : null;
    const winStart = checkIn?.timestamp || day;
    const winEnd = checkOut?.timestamp || dayEnd;

    const [points, live] = await Promise.all([
      LocationTrail.find({ student: student._id, at: { $gte: winStart, $lte: winEnd } })
        .sort({ at: 1 })
        .limit(2000)
        .select('latitude longitude accuracy speed heading at')
        .lean(),
      LiveLocation.findOne({ student: student._id }).lean(),
    ]);

    return res.json({
      success: true,
      student: { id: student._id, name: student.fullName, uid: student.uid, department: student.department || '' },
      date: toLocalYMD(day),
      checkIn: checkIn ? { at: checkIn.timestamp, latitude: checkIn.latitude, longitude: checkIn.longitude } : null,
      checkOut: checkOut ? { at: checkOut.timestamp, latitude: checkOut.latitude, longitude: checkOut.longitude } : null,
      live: live ? { active: !!live.active, latitude: live.latitude, longitude: live.longitude, lastFixAt: live.lastFixAt } : null,
      pointCount: points.length,
      points: points.map((p) => ({ lat: p.latitude, lng: p.longitude, at: p.at, accuracy: p.accuracy ?? null, speed: p.speed ?? null })),
    });
  } catch (err) {
    console.error('[portal/staff/location-trail]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ───────────────────────── live location map (Admin / HOD) ───────────────────────── */

// GET /api/portal/live-locations
// Latest live position of every on-duty staff member, for the Admin/HOD map.
// Admin sees the whole organization; an HOD sees only their department. Faculty/
// staff have no org context (req.organization unset) and are rejected.
router.get('/live-locations', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ success: false, error: 'Admin or HOD login required' });
    }
    const LiveLocation = require('../models/LiveLocation');
    const now = new Date();
    const STALE_MS = parseInt(process.env.LIVE_LOCATION_STALE_SECONDS || '180', 10) * 1000;

    const filter = {
      organization: req.organization._id,
      active: true,
    };
    // HOD: restrict to their department.
    if (req.isHod && req.hodDepartment) filter.department = req.hodDepartment;

    const docs = await LiveLocation.find(filter)
      .populate('student', 'fullName uid department designation role')
      .lean();

    // Org location used as fallback pin for staff who haven't sent a GPS ping yet.
    const orgLat = req.organization.location?.latitude ?? null;
    const orgLon = req.organization.location?.longitude ?? null;

    const today = toLocalYMD(now);
    const points = docs
      .filter((d) => d.student) // skip orphaned docs
      // Drop points whose tracking window has elapsed (end of working hours) even
      // if `active` was never cleared (e.g. app killed without logout).
      .filter((d) => !d.trackUntil || new Date(d.trackUntil) > now)
      // Must have coordinates OR the org has a known location to fall back to.
      .filter((d) => (d.latitude != null && d.longitude != null) || (orgLat != null && orgLon != null))
      .map((d) => {
        // Use real GPS coords if available; fall back to org location so the
        // pin still appears on the map while the phone hasn't sent a fix yet.
        const hasRealFix = d.latitude != null && d.longitude != null;
        const latitude = hasRealFix ? d.latitude : orgLat;
        const longitude = hasRealFix ? d.longitude : orgLon;
        const fixAt = d.lastFixAt || null;
        const ageMs = fixAt ? now - new Date(fixAt) : null;
        const stale = ageMs == null || ageMs > STALE_MS;
        const sharingForSeconds = d.startedAt ? Math.max(0, Math.round((now - new Date(d.startedAt)) / 1000)) : null;
        // Time outside today = closed intervals + any currently-open interval.
        const statsToday = d.statsDate === today;
        const openOutside = statsToday && d.outsideSince ? Math.round((now - new Date(d.outsideSince)) / 1000) : 0;
        const outsideSecondsToday = (statsToday ? d.outsideSecondsToday || 0 : 0) + openOutside;
        return {
          studentId: d.student._id,
          name: d.student.fullName,
          uid: d.student.uid,
          department: d.student.department || d.department || '',
          designation: d.student.designation || '',
          role: d.student.role || 'faculty',
          latitude,
          longitude,
          accuracy: d.accuracy ?? null,
          heading: d.heading ?? null,
          speed: d.speed ?? null,
          startedAt: d.startedAt || null,
          sharingForSeconds,
          trackUntil: d.trackUntil || null,
          lastFixAt: fixAt,
          ageSeconds: ageMs != null ? Math.round(ageMs / 1000) : null,
          stale,
          // ── geofence / premises ──
          insidePremises: d.insidePremises ?? null,
          outsidePremises: d.insidePremises === false,
          distanceM: d.distanceM != null ? Math.round(d.distanceM) : null,
          breachCountToday: statsToday ? d.breachCountToday || 0 : 0,
          outsideSecondsToday,
          distanceTraveledM: statsToday ? Math.round(d.distanceTraveledM || 0) : 0,
          status: stale ? 'stale' : d.insidePremises === false ? 'outside' : 'inside',
        };
      });

    // Premises geofence (for drawing the boundary circle on the map).
    const orgLoc = req.organization.location || {};
    const premises =
      orgLoc.latitude || orgLoc.longitude
        ? { latitude: orgLoc.latitude, longitude: orgLoc.longitude, radius: req.organization.Area_radius || 100 }
        : null;

    // Roll-up stats for the dashboard header.
    const live = points.filter((p) => !p.stale).length;
    const durations = points.map((p) => p.sharingForSeconds || 0);
    const totalSharingSeconds = durations.reduce((a, b) => a + b, 0);
    const summary = {
      total: points.length,
      live,
      stale: points.length - live,
      outsideNow: points.filter((p) => p.outsidePremises && !p.stale).length,
      breachesToday: points.reduce((a, p) => a + (p.breachCountToday || 0), 0),
      totalSharingSeconds,
      avgSharingSeconds: points.length ? Math.round(totalSharingSeconds / points.length) : 0,
      longestSharingSeconds: durations.length ? Math.max(...durations) : 0,
    };

    res.json({
      success: true,
      count: points.length,
      scope: req.isHod ? `department:${req.hodDepartment || ''}` : 'organization',
      serverTime: now.toISOString(),
      premises,
      summary,
      data: points,
    });
  } catch (err) {
    console.error('[portal/live-locations] error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/location-history?from=YYYY-MM-DD&to=YYYY-MM-DD
// Past locations for the whole org — one marker per staff member at their LATEST
// breadcrumb inside the range — so the Admin/HOD can review where people were on a
// past day / week / month (the live map only shows who is sharing right now).
// Backed by LocationTrail (kept ~14 days). HOD-scoped to their department.
router.get('/location-history', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ success: false, error: 'Admin or HOD login required' });
    }
    const today = toLocalYMD(new Date());
    const toYmd = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : today;
    const fromYmd = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : toYmd;

    const filter = { organization: req.organization._id, date: { $gte: fromYmd, $lte: toYmd } };
    // HOD: restrict to their department's staff (LocationTrail has no dept field).
    if (req.isHod && req.hodDepartment) {
      const ids = await Student.find({
        organization: req.organization._id,
        department: req.hodDepartment,
      }).distinct('_id');
      filter.student = { $in: ids };
    }

    const pings = await LocationTrail.find(filter)
      .sort({ at: 1 }) // ascending → the last ping seen per student is their newest
      .populate('student', 'fullName uid department designation role')
      .lean();

    // Keep each staff member's latest fix + how many fixes they had in the range.
    const latest = new Map();
    const counts = new Map();
    for (const p of pings) {
      if (!p.student) continue;
      const k = String(p.student._id);
      counts.set(k, (counts.get(k) || 0) + 1);
      latest.set(k, p);
    }

    const points = [...latest.values()].map((d) => ({
      studentId: d.student._id,
      name: d.student.fullName,
      uid: d.student.uid,
      department: d.student.department || '',
      designation: d.student.designation || '',
      role: d.student.role || 'faculty',
      latitude: d.latitude,
      longitude: d.longitude,
      insidePremises: d.insidePremises ?? null,
      outsidePremises: d.insidePremises === false,
      distanceM: d.distanceM != null ? Math.round(d.distanceM) : null,
      lastFixAt: d.at,
      fixes: counts.get(String(d.student._id)) || 1,
      historical: true,
    }));

    const orgLoc = req.organization.location || {};
    const premises =
      orgLoc.latitude || orgLoc.longitude
        ? { latitude: orgLoc.latitude, longitude: orgLoc.longitude, radius: req.organization.Area_radius || 100 }
        : null;

    res.json({
      success: true,
      mode: 'history',
      range: { from: fromYmd, to: toYmd },
      scope: req.isHod ? `department:${req.hodDepartment || ''}` : 'organization',
      premises,
      summary: {
        total: points.length,
        outside: points.filter((p) => p.outsidePremises).length,
        totalFixes: pings.length,
      },
      count: points.length,
      data: points,
    });
  } catch (err) {
    console.error('[portal/location-history] error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/live-locations/:studentId/trail?date=YYYY-MM-DD
// The full-day movement path (breadcrumbs) for one staff member, drawn as a
// polyline on the map. HOD-scoped: the target must be in their department.
router.get('/live-locations/:studentId/trail', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ success: false, error: 'Admin or HOD login required' });
    }
    const stuFilter = { _id: req.params.studentId, organization: req.organization._id };
    if (req.isHod && req.hodDepartment) stuFilter.department = req.hodDepartment;
    const student = await Student.findOne(stuFilter).select('_id fullName uid department designation');
    if (!student) return res.status(404).json({ success: false, error: 'Staff member not in your scope' });

    const LocationTrail = require('../models/LocationTrail');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : toLocalYMD(new Date());
    const pings = await LocationTrail.find({ student: student._id, date })
      .sort({ at: 1 })
      .select('latitude longitude rawLatitude rawLongitude kalmanGain accuracy insidePremises distanceM at')
      .lean();

    const path = pings.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      rawLatitude:  p.rawLatitude  ?? null,
      rawLongitude: p.rawLongitude ?? null,
      kalmanGain:   p.kalmanGain   ?? null,
      accuracy:     p.accuracy     ?? null,
      insidePremises: p.insidePremises ?? null,
      distanceM: p.distanceM != null ? Math.round(p.distanceM) : null,
      at: p.at,
    }));

    res.json({
      success: true,
      student: { id: student._id, name: student.fullName, uid: student.uid, department: student.department, designation: student.designation },
      date,
      count: path.length,
      path,
    });
  } catch (err) {
    console.error('[portal/live-locations trail] error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/staff/:studentId/location-report?date=YYYY-MM-DD
// Full accountability report for ONE staff member on ONE day: the sharing
// session, time spent outside the campus geofence (per excursion), the periods
// they were NOT sharing at all (gaps in the breadcrumb trail — i.e. app killed /
// GPS off), distance walked, breach count, and the raw path for the map. Built
// to catch "marked attendance then left": every gap and every excursion is
// surfaced with a duration. HOD-scoped like the trail endpoint.
router.get('/staff/:studentId/location-report', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ success: false, error: 'Admin or HOD login required' });
    }
    const stuFilter = { _id: req.params.studentId, organization: req.organization._id };
    if (req.isHod && req.hodDepartment) stuFilter.department = req.hodDepartment;
    const student = await Student.findOne(stuFilter).select('_id fullName uid department designation');
    if (!student) return res.status(404).json({ success: false, error: 'Staff member not in your scope' });

    const LiveLocation = require('../models/LiveLocation');
    const LocationTrail = require('../models/LocationTrail');
    const now = new Date();
    const today = toLocalYMD(now);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today;
    const isToday = date === today;
    // A gap larger than this between consecutive fixes counts as "not sharing"
    // (the background pinger runs every ~5 min, so ~7 min of silence = a miss).
    const GAP_SEC = parseInt(process.env.LIVE_LOCATION_GAP_SECONDS || '420', 10);

    // Great-circle metres between two fixes (for distance-walked; ignores jumps).
    const havM = (a, b) => {
      const R = 6371000;
      const toRad = (x) => (x * Math.PI) / 180;
      const dLat = toRad(b.latitude - a.latitude);
      const dLng = toRad(b.longitude - a.longitude);
      const lat1 = toRad(a.latitude);
      const lat2 = toRad(b.latitude);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    };

    const pings = await LocationTrail.find({ student: student._id, date })
      .sort({ at: 1 })
      .select('latitude longitude rawLatitude rawLongitude kalmanGain accuracy speed insidePremises distanceM at')
      .lean();
    const path = pings.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      rawLatitude:  p.rawLatitude  ?? null,
      rawLongitude: p.rawLongitude ?? null,
      kalmanGain:   p.kalmanGain   ?? null,
      accuracy:     p.accuracy     ?? null,
      speed:        p.speed        ?? null, // m/s from GPS chip; null = not reported
      insidePremises: p.insidePremises ?? null,
      distanceM: p.distanceM != null ? Math.round(p.distanceM) : null,
      at: p.at,
    }));

    // Current live doc — gives the canonical session window when it's today.
    const live = await LiveLocation.findOne({ student: student._id }).lean();
    const sessionStatsToday = live && live.statsDate === today;
    const startedAt =
      isToday && live && live.startedAt ? live.startedAt : path.length ? path[0].at : null;
    const trackUntil = isToday && live ? live.trackUntil || null : null;
    const active = Boolean(isToday && live && live.active);
    const lastFixAt = path.length ? path[path.length - 1].at : isToday && live ? live.lastFixAt : null;

    // ── Outside-campus excursions: contiguous runs of insidePremises === false ──
    const outsideSegments = [];
    let seg = null;
    for (const p of path) {
      if (p.insidePremises === false) {
        if (!seg) seg = { startAt: p.at, endAt: p.at, maxDistanceM: p.distanceM || 0 };
        else {
          seg.endAt = p.at;
          seg.maxDistanceM = Math.max(seg.maxDistanceM, p.distanceM || 0);
        }
      } else if (seg) {
        seg.durationSec = Math.round((new Date(seg.endAt) - new Date(seg.startAt)) / 1000);
        outsideSegments.push(seg);
        seg = null;
      }
    }
    if (seg) {
      // Still outside at the last fix — if live today, run it to "now".
      const endRef = active ? now : new Date(seg.endAt);
      seg.endAt = active ? now : seg.endAt;
      seg.durationSec = Math.round((endRef - new Date(seg.startAt)) / 1000);
      seg.ongoing = active;
      outsideSegments.push(seg);
    }

    // ── Not-sharing gaps: silence between consecutive fixes, plus leading
    //    (session-start → first fix) and trailing (last fix → now) gaps. ──
    const gaps = [];
    if (startedAt && path.length) {
      const lead = Math.round((new Date(path[0].at) - new Date(startedAt)) / 1000);
      if (lead > GAP_SEC) gaps.push({ startAt: startedAt, endAt: path[0].at, durationSec: lead, kind: 'start' });
    }
    for (let i = 1; i < path.length; i++) {
      const dt = Math.round((new Date(path[i].at) - new Date(path[i - 1].at)) / 1000);
      if (dt > GAP_SEC) gaps.push({ startAt: path[i - 1].at, endAt: path[i].at, durationSec: dt, kind: 'mid' });
    }
    let currentGapSeconds = null;
    if (active && lastFixAt) {
      const tail = Math.round((now - new Date(lastFixAt)) / 1000);
      if (tail > GAP_SEC) {
        gaps.push({ startAt: lastFixAt, endAt: now, durationSec: tail, kind: 'now', ongoing: true });
        currentGapSeconds = tail;
      }
    }

    // ── Derived stats (from the trail → work for any day in the 14-day window) ──
    let distanceTraveledM = 0;
    for (let i = 1; i < path.length; i++) {
      const d = havM(path[i - 1], path[i]);
      if (d <= 5000) distanceTraveledM += d; // skip GPS jumps, like the ingest service
    }
    const outsideSeconds = outsideSegments.reduce((a, s) => a + (s.durationSec || 0), 0);
    const notSharingSeconds = gaps.reduce((a, g) => a + (g.durationSec || 0), 0);
    const breachCount = outsideSegments.length; // each excursion outside = one breach
    const sharingForSeconds = startedAt
      ? Math.round(((active ? now : new Date(lastFixAt || startedAt)) - new Date(startedAt)) / 1000)
      : null;

    // ── Speed stats (GPS chip reports m/s; convert to km/h for display) ──
    const speedReadings = path.map((p) => p.speed).filter((s) => typeof s === 'number' && s >= 0);
    const maxSpeedMs  = speedReadings.length ? Math.max(...speedReadings) : null;
    const avgSpeedMs  = speedReadings.length ? speedReadings.reduce((a, b) => a + b, 0) / speedReadings.length : null;
    const maxSpeedKmh = maxSpeedMs  != null ? Math.round(maxSpeedMs  * 3.6 * 10) / 10 : null;
    const avgSpeedKmh = avgSpeedMs  != null ? Math.round(avgSpeedMs  * 3.6 * 10) / 10 : null;

    const orgLoc = req.organization.location || {};
    const premises =
      orgLoc.latitude || orgLoc.longitude
        ? { latitude: orgLoc.latitude, longitude: orgLoc.longitude, radius: req.organization.Area_radius || 100 }
        : null;

    res.json({
      success: true,
      student: { id: student._id, name: student.fullName, uid: student.uid, department: student.department, designation: student.designation },
      date,
      isToday,
      serverTime: now.toISOString(),
      premises,
      session: {
        startedAt,
        trackUntil,
        lastFixAt,
        active,
        currentlyInside: path.length ? path[path.length - 1].insidePremises : null,
        sharingForSeconds,
        currentGapSeconds, // >0 ⇒ on duty but silent right now (likely app killed)
      },
      stats: {
        pingCount: path.length,
        breachCount,
        outsideSeconds,
        notSharingSeconds,
        distanceTraveledM: Math.round(distanceTraveledM),
        // Canonical live counters when the report is for today.
        outsideSecondsToday: sessionStatsToday ? live.outsideSecondsToday || 0 : outsideSeconds,
        breachCountToday: sessionStatsToday ? live.breachCountToday || 0 : breachCount,
        // Speed (GPS chip m/s → km/h). null when phone never reported speed.
        maxSpeedKmh,
        avgSpeedKmh,
        speedReadingCount: speedReadings.length,
      },
      path,
      outsideSegments,
      gaps,
    });
  } catch (err) {
    console.error('[portal/location-report] error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/portal/geofence-alerts?limit=50
// Recent premises exit/enter events for the alerts feed (org or dept scoped).
router.get('/geofence-alerts', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ success: false, error: 'Admin or HOD login required' });
    }
    const GeofenceAlert = require('../models/GeofenceAlert');
    const filter = { organization: req.organization._id };
    if (req.isHod && req.hodDepartment) filter.department = req.hodDepartment;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

    const alerts = await GeofenceAlert.find(filter)
      .sort({ at: -1 })
      .limit(limit)
      .populate('student', 'fullName uid department')
      .lean();

    const data = alerts
      .filter((a) => a.student)
      .map((a) => ({
        id: a._id,
        type: a.type, // 'exit' | 'enter'
        studentId: a.student._id,
        name: a.student.fullName,
        uid: a.student.uid,
        department: a.student.department || a.department || '',
        distanceM: a.distanceM ?? null,
        at: a.at,
      }));

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('[portal/geofence-alerts] error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ───────────────────────── manual class notification (Admin / HOD) ───────────────────────── */

// POST /api/portal/class-notify
// Send a push to staff on demand. Target selection:
//   { timetableId }        → the faculty teaching that slot
//   { facultyIds: [...] }  → specific staff members
//   { department }         → all faculty/staff in a department
//   (none)                 → whole org (Admin) / HOD's department (HOD)
// Body also: { title?, body | message }  — the message text is required.
router.post('/class-notify', auth, async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(403).json({ success: false, error: 'Admin or HOD login required' });
    }
    const { timetableId, facultyIds, department, title, body, message } = req.body || {};
    const text = body || message;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'A message body is required' });
    }

    const orgId = req.organization._id;
    const Timetable = require('../models/Timetable');
    const pushNotificationService = require('../services/pushNotificationService');

    const studentFilter = { organization: orgId, isActive: true };
    let resolvedSubject = null;
    if (timetableId) {
      const slot = await Timetable.findOne({ _id: timetableId, organization: orgId }).select('faculty subject');
      if (!slot) return res.status(404).json({ success: false, error: 'Timetable slot not found' });
      studentFilter._id = slot.faculty;
      resolvedSubject = slot.subject;
    } else if (Array.isArray(facultyIds) && facultyIds.length) {
      studentFilter._id = { $in: facultyIds };
    } else if (department) {
      studentFilter.department = department;
    }

    // An HOD may only target their own department — enforce regardless of input.
    if (req.isHod && req.hodDepartment) {
      studentFilter.department = req.hodDepartment;
    }

    const recipients = await Student.find(studentFilter).select('_id');
    const ids = recipients.map((s) => s._id);
    if (!ids.length) {
      return res.json({ success: true, sent: 0, message: 'No matching staff to notify' });
    }

    const finalTitle = title || (resolvedSubject ? `📚 ${resolvedSubject}` : '📚 Class Notification');
    const result = await pushNotificationService.sendCustomNotification(ids, finalTitle, String(text), {
      type: 'class_notify',
      timetableId: timetableId ? String(timetableId) : '',
    });

    res.json({ success: true, sent: ids.length, result });
  } catch (err) {
    console.error('[portal/class-notify] error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
