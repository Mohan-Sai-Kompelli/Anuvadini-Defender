// Super Admin routes — Anuvadini network-wide analytics across EVERY organization.
// Everything an institute (Admin) sees, but aggregated over all colleges plus
// per-organization drill-downs. All computed live from the collections.

const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const superAdminAuth = require('../middleware/superAdminAuth');
const faceStorageService = require('../services/faceStorageService');
const faceVerifyService = require('../services/faceVerifyService');
const Organization = require('../models/Organization');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const SpotCheck = require('../models/SpotCheck');
const FaceImage = require('../models/FaceImage');
const SpoofAttempt = require('../models/SpoofAttempt');
const SecurityEvent = require('../models/SecurityEvent');
const BlockedDevice = require('../models/BlockedDevice');
const AuditLog = require('../models/AuditLog');
const auditService = require('../services/auditService');
const GhostFacultyCollision = require('../models/GhostFacultyCollision');
const ghostFacultyService = require('../services/ghostFacultyService');
const LeaveRequest = require('../models/Model_LeaveRequest');
const Model_cheakoutRequest = require('../models/Model_cheakoutRequest');
const OutreachActivity = require('../models/OutreachActivity');
const AbsenceFlag = require('../models/AbsenceFlag');
const WFHRequest = require('../models/WFHRequest');
const FieldRequest = require('../models/FieldRequest');
const GeofenceAlert = require('../models/GeofenceAlert');
const IpActivityLog = require('../models/IpActivityLog');
const AdminSession = require('../models/AdminSession');
const sessionService = require('../services/sessionService');

const router = express.Router();

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toLocalYMD = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
function workingDays(start, end) {
  let c = 0; const d = new Date(start);
  while (d < end) { if (d.getDay() !== 0) c++; d.setDate(d.getDate() + 1); }
  return Math.max(c, 1);
}

function deficiencyWindow(windowKeyRaw) {
  const now = new Date();
  const key = ['7d', '30d', 'month'].includes(windowKeyRaw) ? windowKeyRaw : 'month';
  let start;
  if (key === '7d') start = addDays(startOfDay(now), -6);
  else if (key === '30d') start = addDays(startOfDay(now), -29);
  else start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    key,
    now,
    start,
    end: now,
    startISO: toLocalYMD(start),
    endISO: toLocalYMD(now),
    endExclusiveISO: toLocalYMD(addDays(now, 1)),
    workingDays: workingDays(start, now),
  };
}

// Distinct present student-days for a set of orgs in a window.
async function presentStudentDays(match) {
  const rows = await Attendance.aggregate([
    { $match: { ...match, type: 'in' } },
    { $group: { _id: { s: '$student', d: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } } } },
    { $count: 'n' },
  ]);
  return rows.length ? rows[0].n : 0;
}

/* ─────────── Network overview (KPI tiles + headline charts) ─────────── */
router.get('/overview', superAdminAuth, async (req, res) => {
  try {
    // Anchor the "day"/"month" stats to the network's latest data date (unless a
    // date is passed) so the KPI tiles & charts are populated even when the real
    // calendar day has no records yet.
    const lastAtt = await Attendance.findOne({}).sort({ timestamp: -1 }).select('timestamp').lean();
    const latestDate = lastAtt ? toLocalYMD(lastAtt.timestamp) : toLocalYMD(new Date());
    const day = startOfDay(req.query.date || latestDate);
    const dayEnd = addDays(day, 1);
    const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);

    const [totalOrgs, totalStaff, activeStaff, departments, typeAgg, genderAgg, authAgg, stateAgg] = await Promise.all([
      Organization.countDocuments({ isActive: { $ne: false } }),
      Student.countDocuments({}),
      Student.countDocuments({ isActive: true }),
      Student.distinct('department', { department: { $nin: [null, ''] } }),
      Organization.aggregate([
        { $match: { isActive: { $ne: false } } },
        { $group: { _id: '$organizationType', count: { $sum: 1 } } },
      ]),
      Student.aggregate([{ $group: { _id: '$gender', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Attendance.aggregate([
        { $match: { type: 'in', timestamp: { $gte: monthStart, $lt: dayEnd } } },
        { $group: { _id: '$authMethod', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Organization.aggregate([
        { $match: { isActive: { $ne: false } } },
        { $group: { _id: { $ifNull: ['$state', { $ifNull: ['$address.state', 'Unknown'] }] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Present on the anchor day across the network (unique student check-ins).
    const presentTodayRows = await Attendance.aggregate([
      { $match: { type: 'in', timestamp: { $gte: day, $lt: dayEnd } } },
      { $group: { _id: '$student' } },
      { $count: 'n' },
    ]);
    const presentToday = presentTodayRows.length ? presentTodayRows[0].n : 0;

    const monthCheckins = await Attendance.countDocuments({ type: 'in', timestamp: { $gte: monthStart, $lt: dayEnd } });

    // Network month attendance rate (present staff-days / possible).
    const monthPresent = await presentStudentDays({ timestamp: { $gte: monthStart, $lt: dayEnd } });
    const monthRate = pct(monthPresent, activeStaff * workingDays(monthStart, dayEnd));

    // Leave (approved) & Checkout requests on the anchor day (network-wide).
    // `checkoutToday` replaces the legacy WFH index on the overview card.
    const [leaveToday, checkoutToday] = await Promise.all([
      LeaveRequest.countDocuments({
        status: 'approved',
        'leaveDates.start': { $lte: dayEnd },
        'leaveDates.end': { $gte: day },
      }),
      Model_cheakoutRequest.countDocuments({
        status: { $in: ['approved', 'pending'] },
        date: { $gte: day, $lt: dayEnd },
      }),
    ]);

    // 10-day network present-trend ending on the anchor day.
    const start10 = addDays(day, -9);
    const trendRows = await Attendance.aggregate([
      { $match: { type: 'in', timestamp: { $gte: start10, $lt: dayEnd } } },
      { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, s: '$student' } } },
      { $group: { _id: '$_id.d', present: { $sum: 1 } } },
    ]);
    const tMap = new Map(trendRows.map((r) => [r._id, r.present]));
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(day, -i);
      const key = toLocalYMD(d);
      last7.push({ date: key, present: tMap.get(key) || 0 });
    }

    const last10 = [];
    for (let i = 9; i >= 0; i--) {
      const d = addDays(day, -i);
      const key = toLocalYMD(d);
      const p = tMap.get(key) || 0;
      const isWeekendDay = d.getDay() === 0 || d.getDay() === 6;
      const ab = isWeekendDay ? 0 : Math.max(0, activeStaff - p);
      const lt = isWeekendDay ? 0 : Math.round(p * 0.08);
      last10.push({ date: key, present: p, absent: ab, late: lt });
    }

    // Top & bottom 5 institutions by present-rate on the anchor day.
    const orgs = await Organization.find({ isActive: { $ne: false } }).select('name').lean();
    const orgRates = await Promise.all(
      orgs.map(async (org) => {
        const [staff, pRows] = await Promise.all([
          Student.countDocuments({ organization: org._id, isActive: true }),
          Attendance.aggregate([
            { $match: { organization: org._id, type: 'in', timestamp: { $gte: day, $lt: dayEnd } } },
            { $group: { _id: '$student' } },
            { $count: 'n' },
          ]),
        ]);
        const present = pRows.length ? pRows[0].n : 0;
        return { name: org.name, staff, present, rate: pct(present, staff) };
      })
    );
    const active = orgRates.filter((o) => o.staff > 0);
    const topOrgs = [...active].sort((a, b) => b.rate - a.rate).slice(0, 5);
    const bottomOrgs = [...active].sort((a, b) => a.rate - b.rate).slice(0, 5);

    return res.json({
      success: true,
      date: toLocalYMD(day),
      latestDate,
      overview: {
        totalOrgs,
        totalStaff,
        activeStaff,
        totalDepartments: departments.length,
        presentToday,
        todayRate: pct(presentToday, activeStaff),
        monthCheckins,
        monthRate,
        leaveToday,
        checkoutToday,
      },
      orgTypes: typeAgg.map((t) => ({ name: (t._id || 'unknown').replace('_', ' '), value: t.count })),
      genderDistribution: genderAgg.map((g) => ({ name: g._id || 'unknown', value: g.count })),
      authMethodDistribution: authAgg.map((a) => ({ name: a._id || 'unknown', value: a.count })),
      stateDistribution: stateAgg.map((s) => ({ name: s._id || 'Unknown', value: s.count })),
      last7,
      last10,
      topOrgs,
      bottomOrgs,
    });
  } catch (err) {
    console.error('[superadmin/overview]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

const { campusScopedAttendanceFilter } = require('../utils/sharedOffices');

/* ─────────── Per-organization table ─────────── */
router.get('/organizations', superAdminAuth, async (req, res) => {
  try {
    const day = req.query.date ? startOfDay(req.query.date) : startOfDay(new Date());
    const dayEnd = addDays(day, 1);
    const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);

    const orgs = await Organization.find({ isActive: { $ne: false } })
      .select('name organizationType address state createdAt')
      .lean();

    const rows = await Promise.all(
      orgs.map(async (org) => {
        const { orgFilter, studentClause, rosterIds } = await campusScopedAttendanceFilter(org._id);
        const [staffCount, presentTodayRows, lastAtt] = await Promise.all([
          rosterIds ? rosterIds.length : Student.countDocuments({ organization: org._id, isActive: true }),
          Attendance.aggregate([
            { $match: { organization: orgFilter, ...(studentClause || {}), type: 'in', timestamp: { $gte: day, $lt: dayEnd } } },
            { $group: { _id: '$student' } },
            { $count: 'n' },
          ]),
          Attendance.findOne({ organization: orgFilter, ...(studentClause || {}) }).sort({ timestamp: -1 }).select('timestamp').lean(),
        ]);
        const staff = staffCount;
        const presentToday = presentTodayRows.length ? presentTodayRows[0].n : 0;
        const present = await presentStudentDays({ organization: orgFilter, ...(studentClause || {}), timestamp: { $gte: monthStart, $lt: dayEnd } });
        const monthRate = pct(present, staff * workingDays(monthStart, dayEnd));
        return {
          id: org._id,
          name: org.name,
          type: org.organizationType || '—',
          state: org.state || org.address?.state || '—',
          staff,
          presentToday,
          todayRate: pct(presentToday, staff),
          monthRate,
          lastActivity: lastAtt ? toLocalYMD(lastAtt.timestamp) : '—',
        };
      })
    );

    rows.sort((a, b) => b.staff - a.staff);
    return res.json({ success: true, date: toLocalYMD(day), organizations: rows });
  } catch (err) {
    console.error('[superadmin/organizations]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ─────────── Organization health (login recency, activity recency, biometric adoption) ───────────
 * Uses Organization.lastLogin and isActive — real fields that existed but
 * were never surfaced anywhere — plus the same "last real attendance record"
 * signal /organizations already computes, to answer "which institutes have
 * gone quiet" rather than just "how many orgs exist." */
router.get('/org-health', superAdminAuth, async (req, res) => {
  try {
    const now = new Date();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const orgs = await Organization.find({})
      .select('name organizationType isActive lastLogin selectedBiometrics createdAt')
      .lean();

    const rows = await Promise.all(
      orgs.map(async (org) => {
        const lastAtt = await Attendance.findOne({ organization: org._id })
          .sort({ timestamp: -1 })
          .select('timestamp')
          .lean();

        const daysSinceLogin = org.lastLogin ? Math.floor((now - new Date(org.lastLogin)) / DAY_MS) : null;
        const daysSinceActivity = lastAtt ? Math.floor((now - new Date(lastAtt.timestamp)) / DAY_MS) : null;

        // Health status: dormant (deactivated), never-active (no login ever),
        // stale (no login/activity in 30+ days), healthy (everything else).
        let status = 'healthy';
        if (org.isActive === false) status = 'dormant';
        else if (org.lastLogin == null) status = 'never_logged_in';
        else if (daysSinceLogin != null && daysSinceLogin >= 30) status = 'stale';
        else if (daysSinceActivity != null && daysSinceActivity >= 30) status = 'stale';

        const biometrics = org.selectedBiometrics || {};
        const enabledBiometrics = Object.keys(biometrics).filter((k) => biometrics[k]);

        return {
          id: org._id,
          name: org.name,
          type: org.organizationType || '—',
          isActive: org.isActive !== false,
          lastLogin: org.lastLogin || null,
          daysSinceLogin,
          lastActivity: lastAtt ? lastAtt.timestamp : null,
          daysSinceActivity,
          enabledBiometrics,
          status,
          createdAt: org.createdAt,
        };
      })
    );

    // Worst-first: dormant/stale/never-logged-in surfaced before healthy orgs.
    const rank = { dormant: 0, never_logged_in: 1, stale: 2, healthy: 3 };
    rows.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.daysSinceLogin ?? 0) - (a.daysSinceLogin ?? 0));

    const summary = {
      total: rows.length,
      healthy: rows.filter((r) => r.status === 'healthy').length,
      stale: rows.filter((r) => r.status === 'stale').length,
      neverLoggedIn: rows.filter((r) => r.status === 'never_logged_in').length,
      dormant: rows.filter((r) => r.status === 'dormant').length,
    };

    return res.json({ success: true, summary, organizations: rows });
  } catch (err) {
    console.error('[superadmin/org-health]', err);
    return res.status(500).json({ success: false, error: 'Failed to load organization health' });
  }
});

/* ─────────── Deficiency report (per-org lagging factors) ─────────── */

// Count of each weekday index (Mon=0…Sat=5) elapsed in a range — mirrors the
// helper in compliance.js; needed to turn weekly Timetable slots into an
// expected-classes total for the window.
function weekdayCounts(start, end) {
  const counts = [0, 0, 0, 0, 0, 0];
  const d = new Date(start);
  while (d < end) {
    const idx = (d.getDay() + 6) % 7;
    if (idx < 6) counts[idx] += 1;
    d.setDate(d.getDate() + 1);
  }
  return counts;
}

// Every threshold that turns a raw metric into warning/critical lives here so
// the scoring stays explainable and easy to tune in one place.
const DEF_THRESHOLDS = {
  attendance: { warnBelow: 75, critBelow: 50 },  // % of expected staff-days present
  punctuality: { warnBelow: 70, critBelow: 40 }, // worst of on-time % and full-day %
  absences: { warnRate: 10, critRate: 20 },      // unapproved-absence % of staff-days
  spotChecks: { warnMissRate: 20, critMissRate: 40 },
  teaching: { warnBelow: 75, critBelow: 50 },    // % of scheduled classes conducted
  backlog: { warnTotal: 5, critTotal: 25, critSingleQueue: 15, staleDays: 7, critOldestDays: 30 },
  integrity: { critSpoof: 5, warnExits: 10 },
  enrollment: { warnBelow: 80, critBelow: 50 },  // % of active staff face-enrolled
  setup: { staleDays: 30 },
};

const SEVERITY_POINTS = { ok: 0, warning: 1, critical: 3 };

const COMPONENT_LABELS = {
  attendance: 'Attendance',
  punctuality: 'Punctuality',
  absences: 'Unapproved absences',
  spot_checks: 'Spot checks',
  teaching: 'Teaching',
  backlog: 'Approval backlog',
  integrity: 'Integrity',
  enrollment: 'Face enrollment',
  setup: 'Setup & activity',
};

const LATE_CUTOFF_MIN = 9 * 60 + 15;    // first check-in after 09:15 = late (same as compliance.js)
const FULL_DAY_MS = 6 * 60 * 60 * 1000; // last-out < 6h after first-in = left early

const byOrgMap = (rows) => new Map(rows.map((r) => [String(r._id), r]));
const personSummary = (p) => p ? ({
  id: p._id,
  uid: p.uid,
  name: p.fullName,
  department: p.department || '',
  role: p.role || '',
  designation: p.designation || '',
}) : null;
const ageInDays = (from, to = new Date()) => (
  from ? Math.max(0, Math.floor((to - new Date(from)) / (24 * 60 * 60 * 1000))) : null
);
const compactDoc = (doc) => (doc && doc.toObject ? doc.toObject() : doc);

// Windowed metric sources, one grouped-by-organization aggregation per
// collection (fixed query count regardless of org count). Called twice per
// request: for the selected window and for the window before it (trend delta).
async function collectWindowMetrics(start, end, startISO, endISOExclusive) {
  const perStaffDay = { org: '$organization', s: '$student', d: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } };
  const [inDayRows, outDayRows, absenceRows, spotRows, classRows, spoofRows, geofenceRows] = await Promise.all([
    Attendance.aggregate([
      { $match: { type: 'in', timestamp: { $gte: start, $lt: end } } },
      { $group: { _id: perStaffDay, firstIn: { $min: '$timestamp' } } },
    ]),
    Attendance.aggregate([
      { $match: { type: 'out', timestamp: { $gte: start, $lt: end } } },
      { $group: { _id: perStaffDay, lastOut: { $max: '$timestamp' } } },
    ]),
    AbsenceFlag.aggregate([
      { $match: { date: { $gte: start, $lt: end } } },
      { $group: { _id: '$organization', n: { $sum: 1 } } },
    ]),
    SpotCheck.aggregate([
      { $match: { issuedAt: { $gte: start, $lt: end } } },
      { $group: {
        _id: '$organization',
        issued: { $sum: 1 },
        responded: { $sum: { $cond: [{ $eq: ['$status', 'responded'] }, 1, 0] } },
        missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } },
        markedAfterMiss: { $sum: { $cond: ['$markedAfterMiss', 1, 0] } },
        avgLatencyMs: { $avg: '$responseLatencyMs' },
      } },
    ]),
    ClassCheckin.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: {
        _id: '$organization',
        conducted: { $sum: { $cond: [{ $in: ['$status', ['conducted', 'deviation']] }, 1, 0] } },
        missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } },
      } },
    ]),
    SpoofAttempt.aggregate([
      // Only CONFIRMED fake (blocked) attempts count here — 'uncertain' rows
      // are borderline genuine captures that were never blocked, and mixing
      // them in falsely inflated per-org "spoof attempts" / integrity counts.
      { $match: { createdAt: { $gte: start, $lt: end }, label: 'fake' } },
      { $group: { _id: '$organization', n: { $sum: 1 } } },
    ]),
    GeofenceAlert.aggregate([
      // Time field is `at`, not createdAt.
      { $match: { type: 'exit', at: { $gte: start, $lt: end } } },
      { $group: { _id: '$organization', n: { $sum: 1 } } },
    ]),
  ]);

  // Fold first-in/last-out per staff-day into per-org attendance + punctuality.
  const lastOutByKey = new Map(outDayRows.map((r) => [`${r._id.org}|${r._id.s}|${r._id.d}`, new Date(r.lastOut)]));
  const days = new Map(); // orgId → { presentDays, onTime, fullDays }
  for (const r of inDayRows) {
    const orgId = String(r._id.org);
    if (!days.has(orgId)) days.set(orgId, { presentDays: 0, onTime: 0, fullDays: 0 });
    const agg = days.get(orgId);
    agg.presentDays += 1;
    const firstIn = new Date(r.firstIn);
    if (firstIn.getHours() * 60 + firstIn.getMinutes() <= LATE_CUTOFF_MIN) agg.onTime += 1;
    const lastOut = lastOutByKey.get(`${r._id.org}|${r._id.s}|${r._id.d}`);
    if (lastOut && lastOut - firstIn >= FULL_DAY_MS) agg.fullDays += 1;
  }

  return {
    days,
    absences: byOrgMap(absenceRows),
    spot: byOrgMap(spotRows),
    classes: byOrgMap(classRows),
    spoof: byOrgMap(spoofRows),
    geofence: byOrgMap(geofenceRows),
  };
}

router.get('/deficiencies/:orgId/details', superAdminAuth, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.orgId)
      .select('name organizationType isActive lastLogin location locations createdAt')
      .lean();
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found' });

    const w = deficiencyWindow(req.query.window);
    const limit = Math.min(200, Math.max(25, parseInt(req.query.limit, 10) || 100));
    const orgMatch = { organization: org._id };
    const staffSelect = 'uid fullName department role designation isActive status createdAt';

    const [
      attendanceRows,
      absenceRows,
      spotRows,
      missedClassRows,
      scheduledClassRows,
      leaveRowsRaw,
      checkoutRowsRaw,
      wfhRows,
      fieldRows,
      outreachRows,
      missingFaceRows,
      spoofRows,
      geofenceRows,
      ghostRows,
      auditRows,
      activeStaff,
      totalStaff,
    ] = await Promise.all([
      Attendance.aggregate([
        { $match: { ...orgMatch, type: 'in', timestamp: { $gte: w.start, $lt: w.end } } },
        { $group: {
          _id: {
            student: '$student',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          },
          organization: { $first: '$organization' },
          firstIn: { $min: '$timestamp' },
        } },
        { $lookup: {
          from: 'attendances',
          let: { studentId: '$_id.student', orgId: '$organization', day: '$_id.day' },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ['$student', '$$studentId'] },
              { $eq: ['$organization', '$$orgId'] },
              { $eq: ['$type', 'out'] },
              { $eq: [{ $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, '$$day'] },
            ] } } },
            { $group: { _id: null, lastOut: { $max: '$timestamp' } } },
          ],
          as: 'outAgg',
        } },
        { $addFields: { lastOut: { $first: '$outAgg.lastOut' } } },
        { $group: {
          _id: '$_id.student',
          presentDays: { $sum: 1 },
          lateDays: { $sum: { $cond: [{ $gt: [{ $add: [{ $multiply: [{ $hour: '$firstIn' }, 60] }, { $minute: '$firstIn' }] }, LATE_CUTOFF_MIN] }, 1, 0] } },
          earlyLeaveDays: { $sum: { $cond: [{ $or: [{ $eq: ['$lastOut', null] }, { $lt: [{ $subtract: ['$lastOut', '$firstIn'] }, FULL_DAY_MS] }] }, 1, 0] } },
          firstSeen: { $min: '$firstIn' },
          lastSeen: { $max: '$lastOut' },
        } },
        { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'student' } },
        { $unwind: '$student' },
        { $sort: { lateDays: -1, earlyLeaveDays: -1, presentDays: 1 } },
        { $limit: limit },
      ]),
      AbsenceFlag.find({ ...orgMatch, date: { $gte: w.start, $lt: w.end } })
        .sort({ date: -1 })
        .limit(limit)
        .populate('student', staffSelect)
        .lean(),
      SpotCheck.find({ ...orgMatch, issuedAt: { $gte: w.start, $lt: w.end }, status: { $in: ['missed', 'pending'] } })
        .sort({ issuedAt: -1 })
        .limit(limit)
        .populate('student', staffSelect)
        .lean(),
      ClassCheckin.find({ ...orgMatch, createdAt: { $gte: w.start, $lt: w.end }, status: 'missed' })
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .populate('faculty', staffSelect)
        .populate('timetable', 'subject type day start end room facultyLabel')
        .lean(),
      Timetable.find({ ...orgMatch, deletedAt: null })
        .limit(limit)
        .populate('faculty', staffSelect)
        .lean(),
      LeaveRequest.find({ status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(limit * 2)
        .populate({ path: 'student', select: staffSelect, match: { organization: org._id } })
        .lean(),
      Model_cheakoutRequest.find({ status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(limit * 2)
        .populate({ path: 'student', select: staffSelect, match: { organization: org._id } })
        .lean(),
      WFHRequest.find({ ...orgMatch, status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(limit)
        .populate('student', staffSelect)
        .lean(),
      FieldRequest.find({ ...orgMatch, status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(limit)
        .populate('student', staffSelect)
        .lean(),
      OutreachActivity.find({ ...orgMatch, status: { $in: ['pending', 'no_response'] } })
        .sort({ createdAt: 1 })
        .limit(limit)
        .populate('lead', staffSelect)
        .lean(),
      Student.aggregate([
        { $match: { organization: org._id, isActive: true } },
        { $lookup: { from: 'faceimages', localField: '_id', foreignField: 'student', as: 'faces' } },
        { $match: { faces: { $size: 0 } } },
        { $project: { uid: 1, fullName: 1, department: 1, role: 1, designation: 1, createdAt: 1 } },
        { $sort: { fullName: 1 } },
        { $limit: limit },
      ]),
      // Only CONFIRMED fake (blocked) attempts — 'uncertain' rows are
      // borderline genuine captures that were never blocked.
      SpoofAttempt.find({ ...orgMatch, createdAt: { $gte: w.start, $lt: w.end }, label: 'fake' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('student', staffSelect)
        .lean(),
      GeofenceAlert.find({ ...orgMatch, type: 'exit', at: { $gte: w.start, $lt: w.end } })
        .sort({ at: -1 })
        .limit(limit)
        .populate('student', staffSelect)
        .lean(),
      GhostFacultyCollision.find({ status: 'open', 'members.instituteId': String(org._id) })
        .sort({ severity: 1, maxSim: -1 })
        .limit(limit)
        .lean(),
      AuditLog.find({ ...orgMatch, actorType: 'organization', at: { $gte: w.start, $lt: w.end } })
        .sort({ at: -1 })
        .limit(20)
        .lean(),
      Student.countDocuments({ organization: org._id, isActive: true }),
      Student.countDocuments({ organization: org._id }),
    ]);

    const leaveRows = leaveRowsRaw.filter((r) => r.student).slice(0, limit);
    const checkoutRows = checkoutRowsRaw.filter((r) => r.student).slice(0, limit);
    const hasLegacyGeo = org.location && (org.location.latitude || org.location.longitude);
    const hasMultiGeo = (org.locations || []).some((l) => l?.coordinates && (l.coordinates.latitude || l.coordinates.longitude));

    const sections = [
      {
        key: 'attendance',
        title: 'Attendance and punctuality detail',
        empty: 'No check-in rows found in this window.',
        columns: ['Staff', 'Department', 'Present days', 'Late', 'Left early', 'First seen', 'Last seen'],
        rows: attendanceRows.map((r) => ({
          cells: [
            r.student?.fullName || 'Unknown',
            r.student?.department || '-',
            r.presentDays,
            r.lateDays,
            r.earlyLeaveDays,
            r.firstSeen ? toLocalYMD(r.firstSeen) : '-',
            r.lastSeen ? toLocalYMD(r.lastSeen) : '-',
          ],
          meta: personSummary(r.student),
        })),
      },
      {
        key: 'absences',
        title: 'Unapproved absence days',
        empty: 'No unapproved absence flags in this window.',
        columns: ['Date', 'Staff', 'Department', 'Reason', 'Source', 'Admin notified'],
        rows: absenceRows.map((r) => ({
          cells: [toLocalYMD(r.date), r.student?.fullName || 'Unknown', r.student?.department || '-', r.reason || '-', r.source || '-', r.notifiedHOI ? 'Yes' : 'No'],
          meta: personSummary(r.student),
        })),
      },
      {
        key: 'spot_checks',
        title: 'Missed and pending spot checks',
        empty: 'No missed or pending spot checks in this window.',
        columns: ['Issued', 'Staff', 'Status', 'Round', 'Reason', 'Marked after miss'],
        rows: spotRows.map((r) => ({
          cells: [r.issuedAt ? toLocalYMD(r.issuedAt) : '-', r.student?.fullName || 'Unknown', r.status, r.roundId || '-', r.reason || '-', r.markedAfterMiss ? 'Yes' : 'No'],
          meta: personSummary(r.student),
        })),
      },
      {
        key: 'teaching',
        title: 'Teaching gaps',
        empty: scheduledClassRows.length ? 'No missed class check-ins recorded in this window.' : 'No timetable slots configured.',
        columns: ['Date', 'Faculty', 'Subject', 'Slot', 'Room', 'Status'],
        rows: missedClassRows.map((r) => ({
          cells: [
            r.date || toLocalYMD(r.createdAt),
            r.faculty?.fullName || r.timetable?.facultyLabel || 'Unknown',
            r.timetable?.subject || '-',
            r.timetable ? `${r.timetable.start || ''}-${r.timetable.end || ''}` : '-',
            r.timetable?.room || '-',
            r.status,
          ],
          meta: personSummary(r.faculty),
        })),
      },
      {
        key: 'backlog',
        title: 'Approval backlog',
        empty: 'No pending approval items.',
        columns: ['Queue', 'Created', 'Age', 'Staff / Lead', 'Details', 'Date range'],
        rows: [
          ...leaveRows.map((r) => ({ queue: 'Leave', doc: r, person: r.student, detail: r.leaveDetails || r.reason || r.reson || '-', range: `${r.leaveDates?.start ? toLocalYMD(r.leaveDates.start) : '-'} to ${r.leaveDates?.end ? toLocalYMD(r.leaveDates.end) : '-'}` })),
          ...checkoutRows.map((r) => ({ queue: 'Checkout', doc: r, person: r.student, detail: r.details || r.reson || '-', range: r.date ? toLocalYMD(r.date) : '-' })),
          ...wfhRows.map((r) => ({ queue: 'WFH', doc: r, person: r.student, detail: r.reason || r.notes || '-', range: `${toLocalYMD(r.startDate)} to ${toLocalYMD(r.endDate)}` })),
          ...fieldRows.map((r) => ({ queue: 'Field', doc: r, person: r.student, detail: r.eventTitle || r.reason || '-', range: `${toLocalYMD(r.startDate)} to ${toLocalYMD(r.endDate)}` })),
          ...outreachRows.map((r) => ({ queue: r.status === 'no_response' ? 'Outreach no-response' : 'Outreach pending', doc: r, person: r.lead, detail: r.title || r.purpose || '-', range: r.date || '-' })),
        ]
          .sort((a, b) => new Date(a.doc.createdAt) - new Date(b.doc.createdAt))
          .slice(0, limit)
          .map((r) => ({
            cells: [r.queue, toLocalYMD(r.doc.createdAt), `${ageInDays(r.doc.createdAt, w.now)}d`, r.person?.fullName || 'Unknown', r.detail, r.range],
            meta: personSummary(r.person),
          })),
      },
      {
        key: 'enrollment',
        title: 'Staff missing face enrollment',
        empty: 'Every active staff member has a face enrollment.',
        columns: ['Staff', 'UID', 'Department', 'Role', 'Designation', 'Created'],
        rows: missingFaceRows.map((r) => ({
          cells: [r.fullName || 'Unknown', r.uid || '-', r.department || '-', r.role || '-', r.designation || '-', r.createdAt ? toLocalYMD(r.createdAt) : '-'],
          meta: personSummary(r),
        })),
      },
      {
        key: 'integrity',
        title: 'Integrity flags',
        empty: 'No spoof, geofence-exit, or open ghost-faculty rows in this window.',
        columns: ['Type', 'Date', 'Staff / Case', 'Details', 'Score / distance', 'Status'],
        rows: [
          ...spoofRows.map((r) => ({
            cells: ['Spoof attempt', toLocalYMD(r.createdAt), r.student?.fullName || r.studentName || r.uid || 'Unknown', r.type || '-', r.score != null ? r.score : '-', r.label || 'fake'],
            meta: personSummary(r.student),
          })),
          ...geofenceRows.map((r) => ({
            cells: ['Geofence exit', toLocalYMD(r.at), r.student?.fullName || 'Unknown', r.department || r.student?.department || '-', r.distanceM != null ? `${Math.round(r.distanceM)}m` : '-', 'exit'],
            meta: personSummary(r.student),
          })),
          ...ghostRows.map((r) => ({
            cells: ['Ghost faculty', toLocalYMD(r.lastSeenAt || r.updatedAt), (r.members || []).map((m) => m.name || m.uid).filter(Boolean).join(', '), `${r.memberCount || (r.members || []).length} linked records`, r.maxSim != null ? Math.round(r.maxSim * 1000) / 1000 : '-', r.severity],
            meta: compactDoc(r),
          })),
        ].slice(0, limit),
      },
      {
        key: 'setup',
        title: 'Setup and activity context',
        empty: '',
        columns: ['Check', 'Value', 'Status', 'Details'],
        rows: [
          { cells: ['Organization active', org.isActive === false ? 'No' : 'Yes', org.isActive === false ? 'Critical' : 'OK', org.organizationType || '-'] },
          { cells: ['Last login', org.lastLogin ? toLocalYMD(org.lastLogin) : 'Never', !org.lastLogin ? 'Critical' : ageInDays(org.lastLogin, w.now) >= DEF_THRESHOLDS.setup.staleDays ? 'Warning' : 'OK', org.lastLogin ? `${ageInDays(org.lastLogin, w.now)}d ago` : 'No login recorded'] },
          { cells: ['Geofence configured', hasLegacyGeo || hasMultiGeo ? 'Yes' : 'No', hasLegacyGeo || hasMultiGeo ? 'OK' : 'Warning', hasMultiGeo ? `${org.locations.length} location(s)` : hasLegacyGeo ? 'Legacy location present' : 'Missing location radius'] },
          { cells: ['Staff count', `${activeStaff} active / ${totalStaff} total`, activeStaff ? 'OK' : 'Critical', 'Active staff are used for expected staff-days'] },
          { cells: ['Admin actions in window', auditRows.length, auditRows.length ? 'OK' : 'Warning', auditRows[0]?.action || 'No audit events found'] },
        ],
      },
    ];

    return res.json({
      success: true,
      organization: {
        id: org._id,
        name: org.name,
        type: org.organizationType || '-',
      },
      window: { key: w.key, start: w.startISO, end: w.endISO, workingDays: w.workingDays },
      sections: sections.map((s) => ({ ...s, count: s.rows.length })),
      limit,
    });
  } catch (err) {
    console.error('[superadmin/deficiencies/details]', err);
    return res.status(500).json({ success: false, error: 'Failed to load deficiency details' });
  }
});

router.get('/deficiencies', superAdminAuth, async (req, res) => {
  try {
    const w = deficiencyWindow(req.query.window);
    const now = w.now;
    const windowKey = w.key;
    const start = w.start;
    const end = w.end;
    const startISO = w.startISO;
    const endExclusiveISO = w.endExclusiveISO;
    const wd = w.workingDays;
    const dayCounts = weekdayCounts(start, end);
    const T = DEF_THRESHOLDS;

    // The window immediately before the selected one — used for trend deltas.
    const prevStart = windowKey === 'month'
      ? new Date(start.getFullYear(), start.getMonth() - 1, 1)
      : addDays(start, windowKey === '7d' ? -7 : -30);
    const prevEnd = start;
    const prevWd = workingDays(prevStart, prevEnd);
    const prevDayCounts = weekdayCounts(prevStart, prevEnd);

    const staleCutoff = addDays(now, -T.backlog.staleDays);

    // Live (unwindowed) backlog queues, with age tracking for stale items.
    // Leave/checkout requests carry no organization field — join via students.
    const pendingViaStudent = (Model) => Model.aggregate([
      { $match: { status: 'pending' } },
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'stu' } },
      { $unwind: '$stu' },
      { $group: {
        _id: '$stu.organization',
        n: { $sum: 1 },
        stale: { $sum: { $cond: [{ $lt: ['$createdAt', staleCutoff] }, 1, 0] } },
        oldest: { $min: '$createdAt' },
      } },
    ]);
    const pendingByOrg = (Model) => Model.aggregate([
      { $match: { status: 'pending' } },
      { $group: {
        _id: '$organization',
        n: { $sum: 1 },
        stale: { $sum: { $cond: [{ $lt: ['$createdAt', staleCutoff] }, 1, 0] } },
        oldest: { $min: '$createdAt' },
      } },
    ]);

    const [
      orgs, staffRows, slotRows,
      leaveRows, checkoutRows, wfhRows, fieldRows, outreachRows,
      ghostOpen, enrolledRows, auditRows,
      win, prevWin,
    ] = await Promise.all([
      // Include inactive orgs — dormancy is itself a deficiency.
      Organization.find({})
        .select('name organizationType isActive lastLogin location locations createdAt')
        .lean(),
      Student.aggregate([
        { $group: {
          _id: '$organization',
          active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          pendingReg: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          pendingRegStale: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'pending'] }, { $lt: ['$createdAt', staleCutoff] }] }, 1, 0] } },
        } },
      ]),
      Timetable.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: { org: '$organization', day: '$day' }, n: { $sum: 1 } } },
      ]),
      pendingViaStudent(LeaveRequest),
      pendingViaStudent(Model_cheakoutRequest),
      pendingByOrg(WFHRequest),
      pendingByOrg(FieldRequest),
      OutreachActivity.aggregate([
        { $match: { status: { $in: ['pending', 'no_response'] } } },
        { $group: {
          _id: '$organization',
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          noResponse: { $sum: { $cond: [{ $eq: ['$status', 'no_response'] }, 1, 0] } },
          stale: { $sum: { $cond: [{ $lt: ['$createdAt', staleCutoff] }, 1, 0] } },
          oldest: { $min: '$createdAt' },
        } },
      ]),
      GhostFacultyCollision.find({ status: 'open' }).select('members').limit(500).lean(),
      // Staff with at least one enrolled face image (face is the primary auth).
      FaceImage.aggregate([
        { $match: { student: { $ne: null } } },
        { $group: { _id: { org: '$organization', s: '$student' } } },
        { $group: { _id: '$_id.org', n: { $sum: 1 } } },
      ]),
      // Admin-console activity (Admin/HOD actions) in the window.
      AuditLog.aggregate([
        { $match: { actorType: 'organization', at: { $gte: start, $lt: end } } },
        { $group: { _id: '$organization', n: { $sum: 1 } } },
      ]),
      collectWindowMetrics(start, end, startISO, endExclusiveISO),
      collectWindowMetrics(prevStart, prevEnd, toLocalYMD(prevStart), toLocalYMD(prevEnd)),
    ]);

    const staffMap = byOrgMap(staffRows);
    const leaveMap = byOrgMap(leaveRows);
    const checkoutMap = byOrgMap(checkoutRows);
    const wfhMap = byOrgMap(wfhRows);
    const fieldMap = byOrgMap(fieldRows);
    const outreachMap = byOrgMap(outreachRows);
    const enrolledMap = byOrgMap(enrolledRows);
    const auditMap = byOrgMap(auditRows);

    // Timetable slots per org per weekday (Mon=0…Sat=5).
    const slotsMap = new Map();
    for (const r of slotRows) {
      const orgId = String(r._id.org);
      if (!slotsMap.has(orgId)) slotsMap.set(orgId, [0, 0, 0, 0, 0, 0]);
      if (r._id.day >= 0 && r._id.day < 6) slotsMap.get(orgId)[r._id.day] += r.n;
    }

    // GhostFacultyCollision has no organization field — attribute each open
    // collision once to every distinct institute among its members.
    const ghostMap = new Map();
    for (const c of ghostOpen) {
      const ids = new Set((c.members || []).map((m) => m && m.instituteId).filter(Boolean));
      for (const id of ids) ghostMap.set(id, (ghostMap.get(id) || 0) + 1);
    }

    const clamp100 = (v) => Math.min(100, v);
    const DAY_MS = 24 * 60 * 60 * 1000;
    const ageDays = (d) => (d == null ? null : Math.max(0, Math.floor((now - new Date(d)) / DAY_MS)));

    // Builds the 10-component breakdown for one org against one window's
    // metrics. Called twice per org: the selected window (full detail) and the
    // previous window (score only, for the trend delta). Live queues/setup are
    // identical in both runs, so they cancel out of the delta.
    const buildComponents = (org, w, wdX, dayCountsX) => {
      const orgId = String(org._id);
      const staffRow = staffMap.get(orgId) || {};
      const staff = staffRow.active || 0;
      const pendingReg = staffRow.pendingReg || 0;
      const components = [];
      const push = (key, severity, detail, metrics) =>
        components.push({ key, label: COMPONENT_LABELS[key], severity, detail, metrics });

      const daysAgg = w.days.get(orgId) || { presentDays: 0, onTime: 0, fullDays: 0 };

      // 1. Attendance rate vs expected working staff-days.
      {
        const present = daysAgg.presentDays;
        const possible = staff * wdX;
        if (!possible) {
          push('attendance', null, 'No active staff to measure', { rate: null, present, possible });
        } else {
          const rate = clamp100(pct(present, possible));
          const severity = rate < T.attendance.critBelow ? 'critical' : rate < T.attendance.warnBelow ? 'warning' : 'ok';
          push('attendance', severity, `${rate}% attendance (target ${T.attendance.warnBelow}%)`, { rate, present, possible });
        }
      }

      // 2. Punctuality: on-time arrivals (≤ 09:15) and full days (≥ 6h on site)
      //    as a share of the days staff actually attended.
      {
        if (!daysAgg.presentDays) {
          push('punctuality', null, 'No check-ins in window', {
            onTimePct: null, fullDayPct: null, lateDays: 0, earlyLeaveDays: 0, presentDays: 0,
          });
        } else {
          const onTimePct = clamp100(pct(daysAgg.onTime, daysAgg.presentDays));
          const fullDayPct = clamp100(pct(daysAgg.fullDays, daysAgg.presentDays));
          const worst = Math.min(onTimePct, fullDayPct);
          const severity = worst < T.punctuality.critBelow ? 'critical' : worst < T.punctuality.warnBelow ? 'warning' : 'ok';
          push('punctuality', severity,
            `${onTimePct}% on time by 09:15, ${fullDayPct}% stayed a full day (≥6h)`,
            {
              onTimePct, fullDayPct,
              lateDays: daysAgg.presentDays - daysAgg.onTime,
              earlyLeaveDays: daysAgg.presentDays - daysAgg.fullDays,
              presentDays: daysAgg.presentDays,
            });
        }
      }

      // 3. Unapproved absences (AbsenceFlag) as % of staff-days.
      {
        const count = (w.absences.get(orgId) || {}).n || 0;
        const possible = staff * wdX;
        if (!possible) {
          push('absences', null, 'No active staff to measure', { count, rate: null });
        } else {
          const rate = clamp100(pct(count, possible));
          const severity = rate >= T.absences.critRate ? 'critical' : rate >= T.absences.warnRate ? 'warning' : 'ok';
          push('absences', severity, `${count} unapproved absence day${count === 1 ? '' : 's'} (${rate}% of staff-days)`, { count, rate });
        }
      }

      // 4. Spot checks: miss rate, "marked after miss" proxies, response latency.
      {
        const s = w.spot.get(orgId) || { issued: 0, responded: 0, missed: 0, markedAfterMiss: 0, avgLatencyMs: null };
        const decided = s.responded + s.missed;
        const missRate = decided ? pct(s.missed, decided) : 0;
        const zeroRounds = s.issued === 0;
        const avgResponseMin = s.avgLatencyMs != null ? Math.round(s.avgLatencyMs / 60000 * 10) / 10 : null;
        let severity;
        let detail;
        if (zeroRounds) {
          severity = staff > 0 ? 'warning' : null;
          detail = 'No spot-check rounds issued in window';
        } else if (!decided) {
          severity = 'ok';
          detail = `${s.issued} issued, none decided yet`;
        } else {
          severity = missRate >= T.spotChecks.critMissRate ? 'critical'
            : missRate >= T.spotChecks.warnMissRate || s.markedAfterMiss > 0 ? 'warning' : 'ok';
          detail = `${s.missed} of ${decided} missed (${missRate}%)`
            + (s.markedAfterMiss > 0 ? `, ${s.markedAfterMiss} marked after miss` : '');
        }
        push('spot_checks', severity, detail, {
          issued: s.issued, responded: s.responded, missed: s.missed,
          missRate: decided ? missRate : null, markedAfterMiss: s.markedAfterMiss,
          avgResponseMin, zeroRounds,
        });
      }

      // 5. Teaching: conducted class check-ins vs timetable-expected slots.
      {
        const slots = slotsMap.get(orgId);
        const expected = slots ? slots.reduce((sum, n, day) => sum + n * dayCountsX[day], 0) : 0;
        const c = w.classes.get(orgId) || { conducted: 0, missed: 0 };
        if (!slots) {
          push('teaching', staff > 0 ? 'warning' : null, 'No timetable configured', {
            expected: 0, conducted: c.conducted, missed: c.missed, pct: null, noTimetable: true,
          });
        } else if (!expected) {
          push('teaching', null, 'No classes scheduled in window', {
            expected: 0, conducted: c.conducted, missed: c.missed, pct: null, noTimetable: false,
          });
        } else {
          const rate = clamp100(pct(c.conducted, expected));
          const severity = rate < T.teaching.critBelow ? 'critical' : rate < T.teaching.warnBelow ? 'warning' : 'ok';
          push('teaching', severity, `${c.conducted} of ${expected} scheduled classes conducted (${rate}%)`, {
            expected, conducted: c.conducted, missed: c.missed, pct: rate, noTimetable: false,
          });
        }
      }

      // 6. Approval backlog (live totals across every pending queue, age-aware).
      {
        const outreach = outreachMap.get(orgId) || { pending: 0, noResponse: 0, stale: 0, oldest: null };
        const rows = [leaveMap.get(orgId), checkoutMap.get(orgId), wfhMap.get(orgId), fieldMap.get(orgId)];
        const queues = {
          leave: (rows[0] || {}).n || 0,
          checkout: (rows[1] || {}).n || 0,
          wfh: (rows[2] || {}).n || 0,
          field: (rows[3] || {}).n || 0,
          outreachPending: outreach.pending,
          outreachNoResponse: outreach.noResponse,
          registrations: pendingReg,
        };
        const total = Object.values(queues).reduce((a, b) => a + b, 0);
        const maxQueue = Math.max(...Object.values(queues));
        const staleTotal = rows.reduce((sum, r) => sum + ((r || {}).stale || 0), 0)
          + (outreach.stale || 0) + (staffRow.pendingRegStale || 0);
        const oldestDates = [...rows.map((r) => (r || {}).oldest), outreach.oldest].filter(Boolean);
        const oldestDays = oldestDates.length ? ageDays(new Date(Math.min(...oldestDates.map((d) => new Date(d).getTime())))) : null;
        const severity =
          total >= T.backlog.critTotal || maxQueue >= T.backlog.critSingleQueue || (oldestDays != null && oldestDays >= T.backlog.critOldestDays)
            ? 'critical'
            : total >= T.backlog.warnTotal || staleTotal > 0 ? 'warning' : 'ok';
        let detail = total ? `${total} item${total === 1 ? '' : 's'} awaiting action` : 'No pending approvals';
        if (staleTotal > 0) detail += `, ${staleTotal} older than ${T.backlog.staleDays} days`;
        if (oldestDays != null && oldestDays > 0) detail += ` (oldest ${oldestDays}d)`;
        push('backlog', severity, detail, { ...queues, total, staleTotal, oldestDays });
      }

      // 7. Integrity: spoof attempts, open ghost-faculty collisions, geofence exits.
      {
        const spoof = (w.spoof.get(orgId) || {}).n || 0;
        const openGhost = ghostMap.get(orgId) || 0;
        const exits = (w.geofence.get(orgId) || {}).n || 0;
        const severity = spoof >= T.integrity.critSpoof || openGhost > 0 ? 'critical'
          : spoof > 0 || exits > T.integrity.warnExits ? 'warning' : 'ok';
        const parts = [];
        if (spoof) parts.push(`${spoof} spoof attempt${spoof === 1 ? '' : 's'}`);
        if (openGhost) parts.push(`${openGhost} open ghost-faculty case${openGhost === 1 ? '' : 's'}`);
        if (exits) parts.push(`${exits} geofence exit${exits === 1 ? '' : 's'}`);
        push('integrity', severity, parts.length ? parts.join(', ') : 'No integrity flags', {
          spoofAttempts: spoof, openGhostCollisions: openGhost, geofenceExits: exits,
        });
      }

      // 8. Face enrollment: staff who cannot be biometrically verified at all.
      {
        const enrolled = Math.min((enrolledMap.get(orgId) || {}).n || 0, staff);
        if (!staff) {
          push('enrollment', null, 'No active staff to measure', { enrolled, staff, pct: null, missing: 0 });
        } else {
          const rate = clamp100(pct(enrolled, staff));
          const severity = rate < T.enrollment.critBelow ? 'critical' : rate < T.enrollment.warnBelow ? 'warning' : 'ok';
          push('enrollment', severity, `${enrolled} of ${staff} staff face-enrolled (${rate}%)`, {
            enrolled, staff, pct: rate, missing: staff - enrolled,
          });
        }
      }

      // 10. Setup & activity: dormancy, login staleness, geofence config,
      //     staffing, admin-console silence.
      {
        const daysSinceLogin = org.lastLogin ? ageDays(org.lastLogin) : null;
        let healthStatus = 'healthy';
        if (org.isActive === false) healthStatus = 'dormant';
        else if (org.lastLogin == null) healthStatus = 'never_logged_in';
        else if (daysSinceLogin >= T.setup.staleDays) healthStatus = 'stale';
        const legacyGeo = org.location && (org.location.latitude || org.location.longitude);
        const multiGeo = (org.locations || []).some(
          (l) => l && l.coordinates && (l.coordinates.latitude || l.coordinates.longitude)
        );
        const noGeofence = !legacyGeo && !multiGeo;
        const zeroStaff = staff === 0;
        const auditEvents = (auditMap.get(orgId) || {}).n || 0;
        const auditSilent = auditEvents === 0 && staff > 0 && org.isActive !== false;
        const severity = healthStatus === 'dormant' || healthStatus === 'never_logged_in' || zeroStaff ? 'critical'
          : healthStatus === 'stale' || noGeofence || auditSilent ? 'warning' : 'ok';
        const parts = [];
        if (healthStatus === 'dormant') parts.push('Organization deactivated');
        if (healthStatus === 'never_logged_in') parts.push('Never logged in');
        if (healthStatus === 'stale') parts.push(`No login for ${daysSinceLogin} days`);
        if (zeroStaff) parts.push('No active staff');
        if (noGeofence) parts.push('No geofence configured');
        if (auditSilent) parts.push('No admin activity in window');
        push('setup', severity, parts.length ? parts.join(', ') : 'Configured and active', {
          healthStatus, daysSinceLogin, auditEvents, noGeofence, zeroStaff,
        });
      }

      return components;
    };

    const scoreOf = (list) => list.reduce((sum, c) => sum + (SEVERITY_POINTS[c.severity] || 0), 0);

    const organizations = orgs.map((org) => {
      const components = buildComponents(org, win, wd, dayCounts);
      const prevScore = scoreOf(buildComponents(org, prevWin, prevWd, prevDayCounts));
      const criticalCount = components.filter((c) => c.severity === 'critical').length;
      const warningCount = components.filter((c) => c.severity === 'warning').length;
      const score = scoreOf(components);
      const status = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'ok';

      return {
        id: org._id,
        name: org.name,
        type: org.organizationType || '—',
        isActive: org.isActive !== false,
        staff: (staffMap.get(String(org._id)) || {}).active || 0,
        score,
        prevScore,
        delta: score - prevScore, // positive = worsening vs previous window
        status,
        criticalCount,
        warningCount,
        components,
      };
    });

    organizations.sort((a, b) =>
      (b.score - a.score) || (b.criticalCount - a.criticalCount) || (b.staff - a.staff)
    );

    const affected = new Map();
    for (const o of organizations) {
      for (const c of o.components) {
        if (c.severity === 'warning' || c.severity === 'critical') {
          affected.set(c.key, (affected.get(c.key) || 0) + 1);
        }
      }
    }
    const topDeficiencies = [...affected.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key, orgsAffected]) => ({ key, label: COMPONENT_LABELS[key], orgsAffected }));

    return res.json({
      success: true,
      window: {
        key: windowKey, start: startISO, end: toLocalYMD(now), workingDays: wd,
        previous: { start: toLocalYMD(prevStart), end: toLocalYMD(addDays(prevEnd, -1)) },
      },
      summary: {
        totalOrgs: organizations.length,
        critical: organizations.filter((o) => o.status === 'critical').length,
        warning: organizations.filter((o) => o.status === 'warning').length,
        ok: organizations.filter((o) => o.status === 'ok').length,
        worsening: organizations.filter((o) => o.delta > 0).length,
        improving: organizations.filter((o) => o.delta < 0).length,
        topDeficiencies,
      },
      organizations,
    });
  } catch (err) {
    console.error('[superadmin/deficiencies]', err);
    return res.status(500).json({ success: false, error: 'Failed to load deficiency report' });
  }
});

/* ─────────── Network analytics (trends + comparisons) ─────────── */
router.get('/analytics', superAdminAuth, async (req, res) => {
  try {
    const end = req.query.end ? startOfDay(req.query.end) : startOfDay(new Date());
    const days = Math.min(31, Math.max(7, parseInt(req.query.days, 10) || 14));
    const start = addDays(end, -(days - 1));
    const endExclusive = addDays(end, 1);

    // Daily unique present student-days across the network.
    const dailyRows = await Attendance.aggregate([
      { $match: { type: 'in', timestamp: { $gte: start, $lt: endExclusive } } },
      {
        $group: {
          _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, s: '$student' },
        },
      },
      { $group: { _id: '$_id.d', present: { $sum: 1 } } },
    ]);
    const dayMap = new Map(dailyRows.map((r) => [r._id, r.present]));
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(end, -i);
      const key = toLocalYMD(d);
      trend.push({ date: key, present: dayMap.get(key) || 0, isWeekend: d.getDay() === 0 || d.getDay() === 6 });
    }

    // Per-org present-today comparison (top 12 by staff).
    const day = end;
    const dEnd = addDays(day, 1);
    const orgs = await Organization.find({ isActive: { $ne: false } }).select('name').lean();
    const comparison = await Promise.all(
      orgs.map(async (org) => {
        const [staff, presentRows] = await Promise.all([
          Student.countDocuments({ organization: org._id, isActive: true }),
          Attendance.aggregate([
            { $match: { organization: org._id, type: 'in', timestamp: { $gte: day, $lt: dEnd } } },
            { $group: { _id: '$student' } },
            { $count: 'n' },
          ]),
        ]);
        const present = presentRows.length ? presentRows[0].n : 0;
        return { name: org.name, staff, present, rate: pct(present, staff) };
      })
    );
    comparison.sort((a, b) => b.staff - a.staff);

    return res.json({ success: true, trend, comparison: comparison.slice(0, 12) });
  } catch (err) {
    console.error('[superadmin/analytics]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ─────────── Single organization drill-down ─────────── */
router.get('/org/:id', superAdminAuth, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id).select('name organizationType address state departments').lean();
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found' });

    const day = req.query.date ? startOfDay(req.query.date) : startOfDay(new Date());
    const dayEnd = addDays(day, 1);
    const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
    const orgId = org._id;

    const [staff, activeStaff, genderAgg, authAgg, deptAgg, todayRows, lastAtt] = await Promise.all([
      Student.countDocuments({ organization: orgId }),
      Student.countDocuments({ organization: orgId, isActive: true }),
      Student.aggregate([{ $match: { organization: orgId } }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
      Attendance.aggregate([
        { $match: { organization: orgId, type: 'in', timestamp: { $gte: monthStart, $lt: dayEnd } } },
        { $group: { _id: '$authMethod', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Student.aggregate([
        { $match: { organization: orgId, department: { $nin: [null, ''] } } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Attendance.aggregate([
        { $match: { organization: orgId, type: 'in', timestamp: { $gte: day, $lt: dayEnd } } },
        { $group: { _id: '$student' } },
        { $count: 'n' },
      ]),
      Attendance.findOne({ organization: orgId }).sort({ timestamp: -1 }).select('timestamp').lean(),
    ]);

    const presentToday = todayRows.length ? todayRows[0].n : 0;
    const present = await presentStudentDays({ organization: orgId, timestamp: { $gte: monthStart, $lt: dayEnd } });
    const monthRate = pct(present, activeStaff * workingDays(monthStart, dayEnd));

    // 10-day trend
    const start10 = addDays(day, -9);
    const dailyRows = await Attendance.aggregate([
      { $match: { organization: orgId, type: 'in', timestamp: { $gte: start10, $lt: dayEnd } } },
      { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, s: '$student' } } },
      { $group: { _id: '$_id.d', present: { $sum: 1 } } },
    ]);
    const dayMap = new Map(dailyRows.map((r) => [r._id, r.present]));
    const trend = [];
    for (let i = 9; i >= 0; i--) {
      const d = addDays(day, -i);
      const key = toLocalYMD(d);
      trend.push({ date: key, present: dayMap.get(key) || 0, absent: Math.max(0, activeStaff - (dayMap.get(key) || 0)) });
    }

    return res.json({
      success: true,
      organization: {
        id: org._id,
        name: org.name,
        type: org.organizationType,
        state: org.state || org.address?.state || '—',
      },
      stats: {
        staff,
        activeStaff,
        presentToday,
        absentToday: Math.max(0, activeStaff - presentToday),
        todayRate: pct(presentToday, activeStaff),
        monthRate,
        lastActivity: lastAtt ? toLocalYMD(lastAtt.timestamp) : '—',
      },
      genderDistribution: genderAgg.map((g) => ({ name: g._id || 'unknown', value: g.count })),
      authMethodDistribution: authAgg.map((a) => ({ name: a._id || 'unknown', value: a.count })),
      departmentDistribution: deptAgg.map((d) => ({ name: d._id, value: d.count })),
      trend,
    });
  } catch (err) {
    console.error('[superadmin/org]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ════════════════════ Face-capture gallery (super-admin) ════════════════════
 * Every face-recognition image across the whole network — check-in, check-out,
 * random + manual spot-checks, and registration images — with the person's
 * name/details, institute, time, location and capture type. Filterable by
 * month/year, institute, person and type. The list returns METADATA + an image
 * URL (not the heavy base64) so the grid stays light; the image bytes are served
 * lazily per item by GET .../image. */

const CAPTURE_TYPES = ['checkin', 'checkout', 'spot_random', 'spot_manual', 'registration'];
const GALLERY_CAP = 800; // max rows pulled per source before merge (bounded by filters)

// Time window from ?month=1-12 & ?year=YYYY. Either may be omitted.
function galleryWindow(req) {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (year && month >= 1 && month <= 12) {
    return { $gte: new Date(year, month - 1, 1), $lt: new Date(year, month, 1) };
  }
  if (year) return { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) };
  return null;
}

function requestedTypes(req) {
  const raw = String(req.query.type || '').trim();
  if (!raw || raw === 'all') return new Set(CAPTURE_TYPES);
  const set = new Set(raw.split(',').map((s) => s.trim()).filter((t) => CAPTURE_TYPES.includes(t)));
  return set.size ? set : new Set(CAPTURE_TYPES);
}

const imageUrl = (source, id) => `/api/superadmin/face-captures/${source}/${id}/image`;
const personOf = (s) =>
  s
    ? {
      studentId: s._id,
      personName: s.fullName || s.name || '—',
      uid: s.uid || '',
      designation: s.designation || '',
      department: s.department || '',
    }
    : { studentId: null, personName: '—', uid: '', designation: '', department: '' };

router.get('/face-captures', superAdminAuth, async (req, res) => {
  try {
    const types = requestedTypes(req);
    const win = galleryWindow(req);
    const orgId = req.query.instituteId || null;
    const personId = req.query.personId || null;
    const q = String(req.query.q || '').trim().toLowerCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(60, Math.max(6, parseInt(req.query.pageSize, 10) || 24));

    const baseMatch = {};
    if (orgId) baseMatch.organization = orgId;
    if (personId) baseMatch.student = personId;

    const items = [];
    let capped = false;

    // ── Attendance (check-in / check-out) ──
    const attTypes = [];
    if (types.has('checkin')) attTypes.push('in');
    if (types.has('checkout')) attTypes.push('out');
    if (attTypes.length) {
      const m = { ...baseMatch, type: { $in: attTypes }, faceImage: { $ne: null } };
      if (win) m.timestamp = win;
      const rows = await Attendance.find(m)
        .sort({ timestamp: -1 })
        .limit(GALLERY_CAP)
        .populate('student', 'fullName uid designation department')
        .populate('organization', 'name')
        .select('type timestamp latitude longitude faceVerified verificationScore authMethod injectionRisk student organization')
        .lean();
      if (rows.length === GALLERY_CAP) capped = true;
      rows.forEach((r) =>
        items.push({
          id: r._id,
          source: 'attendance',
          type: r.type === 'out' ? 'checkout' : 'checkin',
          ...personOf(r.student),
          instituteId: r.organization?._id || null,
          instituteName: r.organization?.name || '—',
          timestamp: r.timestamp,
          latitude: r.latitude ?? null,
          longitude: r.longitude ?? null,
          faceVerified: !!r.faceVerified,
          score: r.verificationScore ?? null,
          authMethod: r.authMethod || 'face',
          injectionRisk: r.injectionRisk || null,
          imageUrl: imageUrl('attendance', r._id),
        })
      );
    }

    // ── Spot-checks (random = auto, manual) ──
    const trig = [];
    if (types.has('spot_random')) trig.push('auto');
    if (types.has('spot_manual')) trig.push('manual');
    if (trig.length) {
      const m = { ...baseMatch, triggeredBy: { $in: trig }, faceImage: { $ne: null } };
      if (win) m.respondedAt = win;
      const rows = await SpotCheck.find(m)
        .sort({ respondedAt: -1, issuedAt: -1 })
        .limit(GALLERY_CAP)
        .populate('student', 'fullName uid designation department')
        .populate('organization', 'name')
        .select('triggeredBy respondedAt issuedAt responseLocation faceVerified verificationScore livenessVerdict injectionRisk student organization')
        .lean();
      if (rows.length === GALLERY_CAP) capped = true;
      rows.forEach((r) =>
        items.push({
          id: r._id,
          source: 'spotcheck',
          type: r.triggeredBy === 'manual' ? 'spot_manual' : 'spot_random',
          ...personOf(r.student),
          instituteId: r.organization?._id || null,
          instituteName: r.organization?.name || '—',
          timestamp: r.respondedAt || r.issuedAt,
          latitude: r.responseLocation?.latitude ?? null,
          longitude: r.responseLocation?.longitude ?? null,
          faceVerified: !!r.faceVerified,
          score: r.verificationScore ?? null,
          authMethod: 'face',
          injectionRisk: r.injectionRisk || null,
          imageUrl: imageUrl('spotcheck', r._id),
        })
      );
    }

    // ── Registration images ──
    if (types.has('registration')) {
      const m = { ...baseMatch, imageBase64: { $ne: null } };
      if (win) m.createdAt = win;
      const rows = await FaceImage.find(m)
        .sort({ createdAt: -1 })
        .limit(GALLERY_CAP)
        .populate('student', 'fullName uid designation department')
        .populate('organization', 'name')
        .select('uid name student organization createdAt')
        .lean();
      if (rows.length === GALLERY_CAP) capped = true;
      rows.forEach((r) => {
        const p = personOf(r.student);
        items.push({
          id: r._id,
          source: 'registration',
          type: 'registration',
          studentId: p.studentId,
          personName: r.student?.fullName || r.name || '—',
          uid: r.student?.uid || r.uid || '',
          designation: p.designation,
          department: p.department,
          instituteId: r.organization?._id || null,
          instituteName: r.organization?.name || '—',
          timestamp: r.createdAt,
          latitude: null,
          longitude: null,
          faceVerified: null,
          score: null,
          authMethod: 'registration',
          imageUrl: imageUrl('registration', r._id),
        });
      });
    }

    // Free-text search on name/uid (post-merge — populated fields aren't queryable).
    let merged = q
      ? items.filter(
        (it) =>
          it.personName.toLowerCase().includes(q) || (it.uid || '').toLowerCase().includes(q)
      )
      : items;

    // Injection-risk filter: only captures the deepfake/injection guard flagged.
    if (req.query.risk === 'flagged') {
      merged = merged.filter(
        (it) => it.injectionRisk && (it.injectionRisk.level === 'high' || it.injectionRisk.level === 'critical')
      );
    }

    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const total = merged.length;
    const start = (page - 1) * pageSize;
    const pageItems = merged.slice(start, start + pageSize);

    return res.json({
      success: true,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      capped, // true if any source hit GALLERY_CAP — tighten filters to see the rest
      items: pageItems,
    });
  } catch (err) {
    console.error('[superadmin/face-captures]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Serve one capture's image bytes. <img> can't send an Authorization header, so
// a super-admin token may also arrive as ?token=… (validated the same way).
async function galleryImageAuth(req, res, next) {
  try {
    const token = req.query.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (await sessionService.isLoggedOutEveryone(decoded)) return res.status(401).json({ success: false, code: 'logged_out_everyone', message: sessionService.LOGGED_OUT_EVERYONE_MESSAGE });
    if (!decoded || decoded.sa !== true) {
      return res.status(403).json({ success: false, error: 'Super admin access required' });
    }
    // Single active session — a terminated super-admin session must not keep
    // pulling evidence images with its old token.
    if (!(await sessionService.enforceOrReject(decoded, res))) return;
    return next();
  } catch (_e) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

// Decode a stored image string (data-URL | raw base64 | uploads path) and send it.
function sendImageString(res, str) {
  if (!str || typeof str !== 'string') return res.status(404).end();
  if (str.startsWith('http://') || str.startsWith('https://')) return res.redirect(str);
  if (str.startsWith('data:')) {
    const comma = str.indexOf(',');
    const meta = str.slice(5, comma); // e.g. image/jpeg;base64
    const mime = meta.split(';')[0] || 'image/jpeg';
    const buf = Buffer.from(str.slice(comma + 1), 'base64');
    res.set('Content-Type', mime);
    res.set('Cache-Control', 'private, max-age=86400');
    return res.send(buf);
  }
  // A bare base64 blob (no data-URL prefix) — heuristic: long, no path separators.
  if (!str.includes('/') && str.length > 100) {
    try {
      const buf = Buffer.from(str, 'base64');
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'private, max-age=86400');
      return res.send(buf);
    } catch (_e) {
      /* fall through */
    }
  }
  const clean = str.replace(/^\/+/, '');
  // Attendance captures live on disk under face_storage/ (the mark route stores
  // the file's relative path, not the inlined image) — stream it from disk.
  if (clean.startsWith('face_storage/')) {
    const abs = path.join(__dirname, '..', clean);
    if (fs.existsSync(abs)) {
      res.set('Cache-Control', 'private, max-age=86400');
      return res.sendFile(abs);
    }
    return res.status(404).end();
  }
  // Otherwise treat it as a stored path under /uploads.
  return res.redirect('/' + (clean.startsWith('uploads/') ? clean : `uploads/${clean}`));
}

router.get('/face-captures/:source/:id/image', galleryImageAuth, async (req, res) => {
  try {
    const { source, id } = req.params;
    if (source === 'attendance') {
      const a = await Attendance.findById(id).select('faceImage').lean();
      return sendImageString(res, a?.faceImage);
    }
    if (source === 'spotcheck') {
      const s = await SpotCheck.findById(id).select('faceImage attendanceRef').lean();
      if (s?.faceImage) return sendImageString(res, s.faceImage);
      // Fallback: pull the linked attendance image if the spot-check didn't store one.
      if (s?.attendanceRef) {
        const a = await Attendance.findById(s.attendanceRef).select('faceImage').lean();
        return sendImageString(res, a?.faceImage);
      }
      return res.status(404).end();
    }
    if (source === 'registration') {
      const f = await FaceImage.findById(id).select('imageBase64').lean();
      return sendImageString(res, f?.imageBase64);
    }
    return res.status(400).json({ success: false, error: 'Unknown source' });
  } catch (err) {
    console.error('[superadmin/face-captures/image]', err);
    return res.status(500).end();
  }
});

/* ════════════════════ Network integrity summary ════════════════════
 * Replaces the old hardcoded "Anuvadini System Telemetry" widgets on the Overview
 * page. Every number below is computed live from a real collection — no
 * device-registry / edge-sync data exists anywhere in the backend, so that
 * card was dropped entirely rather than being backed by invented numbers. */
router.get('/integrity-summary', superAdminAuth, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Spot checks: today's completion rate across the whole network.
    const [spotChecksToday, spotChecksResponded] = await Promise.all([
      SpotCheck.countDocuments({ issuedAt: { $gte: todayStart } }),
      SpotCheck.countDocuments({ issuedAt: { $gte: todayStart }, status: 'responded' }),
    ]);
    const spotCheckRate = spotChecksToday > 0
      ? Math.round((spotChecksResponded / spotChecksToday) * 1000) / 10
      : null;

    // Anti-spoof: fake-attendance attempts blocked this month, network-wide.
    // label:'fake' only — 'uncertain' rows are borderline genuine captures
    // that were recorded for review but never actually blocked.
    const spoofBlockedThisMonth = await SpoofAttempt.countDocuments({ createdAt: { $gte: monthStart }, label: 'fake' });
    const spoofMatchedIdentity = await SpoofAttempt.countDocuments({
      createdAt: { $gte: monthStart },
      label: 'fake',
      matched: true,
    });

    // Face verification: today's successful face-verified marks + their average score.
    const faceVerifyAgg = await Attendance.aggregate([
      { $match: { timestamp: { $gte: todayStart }, faceVerified: true, verificationScore: { $ne: null } } },
      { $group: { _id: null, count: { $sum: 1 }, avgScore: { $avg: '$verificationScore' } } },
    ]);
    const faceVerifyToday = faceVerifyAgg[0]?.count ?? 0;
    const faceVerifyAvgScore = faceVerifyAgg[0]?.avgScore ?? null;

    // Audit ledger: total rows + a sampled tamper-evidence check (verifying
    // every row's HMAC on every request would be too slow at scale, so we
    // sample the most recent N and extrapolate — flagged as a sample, not a
    // full-ledger guarantee).
    const totalAuditRecords = await AuditLog.countDocuments({});
    const sampleSize = 500;
    const recentAudits = await AuditLog.find({}).sort({ at: -1 }).limit(sampleSize);
    const violations = recentAudits.filter((r) => !r.verifyIntegrity()).length;

    return res.json({
      success: true,
      spotChecks: {
        issuedToday: spotChecksToday,
        respondedToday: spotChecksResponded,
        responseRate: spotCheckRate, // null when none issued yet today
      },
      antiSpoof: {
        blockedThisMonth: spoofBlockedThisMonth,
        matchedIdentityThisMonth: spoofMatchedIdentity,
      },
      faceVerify: {
        verifiedToday: faceVerifyToday,
        avgScoreToday: faceVerifyAvgScore != null ? Math.round(faceVerifyAvgScore * 1000) / 10 : null,
      },
      auditLedger: {
        totalRecords: totalAuditRecords,
        sampledRecords: recentAudits.length,
        sampledViolations: violations,
        isSampled: totalAuditRecords > sampleSize,
      },
    });
  } catch (err) {
    console.error('[superadmin/integrity-summary]', err);
    return res.status(500).json({ success: false, error: 'Failed to load integrity summary' });
  }
});

/* ════════════════════ Network-wide audit trail ════════════════════
 * Browsable version of the tamper-evident AuditLog, unscoped to any single
 * organization (unlike GET /api/audit, which is Admin-only for their own org).
 * Backs the SuperAdmin "Audit Trail" page — the real replacement for the old
 * hardcoded "Anti-Tamper Ledger" card on Overview. */
router.get('/audit', superAdminAuth, async (req, res) => {
  try {
    const result = await auditService.query({
      organization: req.query.instituteId || undefined,
      action: req.query.action,
      actorType: req.query.actorType,
      outcome: req.query.outcome,
      targetType: req.query.targetType,
      from: req.query.from,
      to: req.query.to,
      page: req.query.page,
      limit: req.query.limit,
    });
    // Populate organization name for display without a second round trip.
    const orgIds = [...new Set(result.entries.map((e) => e.organization).filter(Boolean).map(String))];
    const orgs = orgIds.length
      ? await Organization.find({ _id: { $in: orgIds } }).select('name').lean()
      : [];
    const orgMap = new Map(orgs.map((o) => [String(o._id), o.name]));
    const entries = result.entries.map((e) => ({
      ...e,
      organizationName: e.organization ? orgMap.get(String(e.organization)) || '—' : '—',
    }));
    return res.json({ ...result, entries });
  } catch (err) {
    console.error('[superadmin/audit] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load audit trail' });
  }
});

// Verify one audit row's HMAC integrity hash on demand (proves — or disproves
// — that the row hasn't been altered since it was written).
router.get('/audit/:id/verify', superAdminAuth, async (req, res) => {
  try {
    const doc = await AuditLog.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Entry not found' });
    return res.json({ success: true, id: doc._id, valid: doc.verifyIntegrity() });
  } catch (err) {
    console.error('[superadmin/audit/verify] error:', err);
    return res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

/* ════════════════════ Fake-attendance (anti-spoof) attempts ════════════════════
 * Every attendance attempt the on-server anti-spoof (PAD) model judged a FAKE —
 * a face replayed on a phone/tablet screen or a printed photo — PLUS every
 * IMPERSONATION case: a genuine, LIVE, non-spoofed face that clearly does NOT
 * match the account's enrolled identity (someone else's real face shown against
 * this student's account — e.g. a friend checking in on your behalf with their
 * own face). PAD screen/photo replays live in SpoofAttempt; impersonation cases
 * are recorded separately as SecurityEvent rows (category 'face_mismatch_pattern'
 * — see the IMPERSONATION ALERT block in routes/attendance.js and
 * spotChecks.js). Both were confirmed spoof-adjacent fraud signals, so both
 * belong on this page — merged here, newest first, filterable by month/year +
 * institute, added 2026-07-30 (previously face_mismatch_pattern events had NO
 * admin-facing page at all). */
router.get('/spoof-attempts', superAdminAuth, async (req, res) => {
  try {
    const win = galleryWindow(req); // reuses the same ?month=&year= window
    const orgId = req.query.instituteId || null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(60, Math.max(6, parseInt(req.query.pageSize, 10) || 24));

    // label:'fake' only — SpoofAttempt also stores 'uncertain' rows (borderline
    // captures that were NEVER blocked, recorded only for pattern review) and
    // those must not show up as accusations on this "fake attempts" page.
    const spoofMatch = { label: 'fake' };
    if (orgId) spoofMatch.organization = orgId;
    if (win) spoofMatch.createdAt = win;

    const impersonationMatch = { category: 'face_mismatch_pattern' };
    if (orgId) impersonationMatch.organization = orgId;
    if (win) impersonationMatch.createdAt = win;

    // Both queries fetch up to (page*pageSize) newest rows from EACH source,
    // then get merged/sorted/re-paginated below — a true cross-collection
    // paginated query isn't possible in Mongo without an aggregation
    // $unionWith, and at this data volume (fraud events, not routine
    // attendance) an in-memory merge of two bounded result sets is simpler
    // and plenty fast.
    const fetchLimit = page * pageSize;
    const [spoofTotal, impersonationTotal, spoofRows, impersonationRows] = await Promise.all([
      SpoofAttempt.countDocuments(spoofMatch),
      SecurityEvent.countDocuments(impersonationMatch),
      SpoofAttempt.find(spoofMatch)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .populate('student', 'fullName uid designation department')
        .populate('organization', 'name')
        .select('uid studentName type score label model matched similarity latitude longitude createdAt student organization deviceModel manufacturer deviceId')
        .lean(),
      SecurityEvent.find(impersonationMatch)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .populate('student', 'fullName uid designation department')
        .populate('organization', 'name')
        .select('uid studentName sessionType detection device createdAt student organization')
        .lean(),
    ]);

    const spoofItems = spoofRows.map((r) => ({
      id: r._id,
      source: 'spoofattempt',
      ...personOf(r.student),
      personName: r.student?.fullName || r.studentName || '—',
      uid: r.student?.uid || r.uid || '',
      institute: r.organization?.name || '—',
      instituteId: r.organization?._id || null,
      type: r.type || 'in',
      score: typeof r.score === 'number' ? r.score : null,
      label: r.label || 'fake',
      kind: 'screen_replay', // face-crop PAD confirmed a screen/photo replay
      matched: r.matched === true,
      similarity: typeof r.similarity === 'number' ? r.similarity : null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      time: r.createdAt,
      deviceModel: r.deviceModel || null,
      manufacturer: r.manufacturer || null,
      imageUrl: `/api/superadmin/spoof-attempts/${r._id}/image?source=spoofattempt`,
    }));

    const impersonationItems = impersonationRows.map((r) => ({
      id: r._id,
      source: 'securityevent',
      ...personOf(r.student),
      personName: r.student?.fullName || r.studentName || '—',
      uid: r.student?.uid || r.uid || '',
      institute: r.organization?.name || '—',
      instituteId: r.organization?._id || null,
      type: r.sessionType || 'in',
      score: typeof r.detection?.faceMatchConfidence === 'number' ? r.detection.faceMatchConfidence : null,
      label: 'fake', // kept 'fake' so existing frontend badge logic renders unchanged
      kind: 'impersonation', // a genuine LIVE face that just isn't the account owner's
      matched: false,
      similarity: typeof r.detection?.faceMatchConfidence === 'number' ? r.detection.faceMatchConfidence : null,
      latitude: null,
      longitude: null,
      time: r.createdAt,
      deviceModel: r.device?.deviceModel || null,
      manufacturer: r.device?.manufacturer || null,
      imageUrl: `/api/superadmin/spoof-attempts/${r._id}/image?source=securityevent`,
    }));

    const total = spoofTotal + impersonationTotal;
    const merged = [...spoofItems, ...impersonationItems]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice((page - 1) * pageSize, page * pageSize);

    return res.json({
      success: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: merged,
    });
  } catch (err) {
    console.error('[superadmin/spoof-attempts]', err);
    return res.status(500).json({ success: false, error: 'Failed to load spoof attempts' });
  }
});

// Serve one spoof attempt's / impersonation event's evidence image. <img> can't
// send an Authorization header, so the super-admin token may arrive as
// ?token=… (same as the gallery). ?source= (set by the imageUrl above) says
// which collection to look in — an id from one collection cannot be assumed
// to also exist (let alone mean the same thing) in the other.
router.get('/spoof-attempts/:id/image', galleryImageAuth, async (req, res) => {
  try {
    if (req.query.source === 'securityevent') {
      const r = await SecurityEvent.findById(req.params.id).select('evidenceImage').lean();
      return sendImageString(res, r?.evidenceImage);
    }
    const r = await SpoofAttempt.findById(req.params.id).select('faceImage').lean();
    return sendImageString(res, r?.faceImage);
  } catch (err) {
    console.error('[superadmin/spoof-attempts/image]', err);
    return res.status(500).end();
  }
});

/* ════════════════════ Blocked devices (security gate) ════════════════════
 * Every time the mobile enterprise security gate (Feature 12) BLOCKED access on
 * a device (Developer Options / USB Debugging / ADB / root / emulator / failed
 * integrity / hooking / cloning). Newest first, filterable by month/year +
 * institute, with a computed summary for the dashboard's RED indicator. */
router.get('/blocked-devices', superAdminAuth, async (req, res) => {
  try {
    const win = galleryWindow(req); // same ?month=&year= window helper
    const orgId = req.query.instituteId || null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(6, parseInt(req.query.pageSize, 10) || 25));

    const match = {};
    if (orgId) match.organization = orgId;
    if (win) match.createdAt = win;

    const total = await BlockedDevice.countDocuments(match);
    const rows = await BlockedDevice.find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate('organization', 'name')
      .lean();

    // Distinct devices blocked in this window (for the summary badge).
    const distinctDevices = await BlockedDevice.distinct('deviceId', match);

    const items = rows.map((r) => ({
      id: r._id,
      employeeId: r.employeeId || '—',
      employeeName: r.employeeName || '—',
      deviceId: r.deviceId || '—',
      deviceName: r.deviceName || '—',
      osVersion: r.osVersion || '',
      platform: r.platform || 'android',
      publicIp: r.publicIp || '—',
      institute: r.organization?.name || '—',
      instituteId: r.organization?._id || null,
      reasons: Array.isArray(r.reasons) ? r.reasons : [],
      blockedBecause: Array.isArray(r.blockedBecause) ? r.blockedBecause : [],
      riskScore: typeof r.riskScore === 'number' ? r.riskScore : 0,
      timestamp: r.reportedAt || r.createdAt,
    }));

    return res.json({
      success: true,
      total,
      distinctDeviceCount: distinctDevices.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    });
  } catch (err) {
    console.error('[superadmin/blocked-devices]', err);
    return res.status(500).json({ success: false, error: 'Failed to load blocked devices' });
  }
});

/* ════════════════════ Ghost-faculty network dedup ════════════════════
 * "One face, two identities." Cluster enrolled face embeddings across every
 * institute and flag the same face registered under different uids/names —
 * often across different colleges (ghost faculty padding inspection headcounts). */

// Run a fresh network scan (reads the shared embedding store, clusters, upserts).
router.post('/ghost-faculty/scan', superAdminAuth, async (req, res) => {
  try {
    const threshold = Math.min(0.95, Math.max(0.5, parseFloat(req.body?.threshold) || 0.7));
    const summary = await ghostFacultyService.scan({ threshold });
    return res.json({ success: true, ...summary });
  } catch (err) {
    console.error('[superadmin/ghost-faculty/scan]', err);
    return res.status(500).json({ success: false, error: err.message || 'Scan failed' });
  }
});

// List stored collisions (most severe first). Filter by ?status= & ?severity=.
router.get('/ghost-faculty', superAdminAuth, async (req, res) => {
  try {
    const q = {};
    if (req.query.status) q.status = req.query.status;
    if (req.query.severity) q.severity = req.query.severity;
    const collisions = await GhostFacultyCollision.find(q)
      .sort({ severity: 1, maxSim: -1, updatedAt: -1 })
      .limit(500)
      .lean();
    // severity sort is alphabetical above; re-rank explicitly (critical→high→review).
    const rank = { critical: 3, high: 2, review: 1 };
    collisions.sort((a, b) => (rank[b.severity] - rank[a.severity]) || (b.maxSim - a.maxSim));

    const counts = await GhostFacultyCollision.aggregate([
      { $group: { _id: { severity: '$severity', status: '$status' }, n: { $sum: 1 } } },
    ]);
    const lastScan = await GhostFacultyCollision.findOne({}).sort({ lastSeenAt: -1 }).select('lastSeenAt').lean();

    return res.json({
      success: true,
      collisions: collisions.map((c) => ({
        id: c._id,
        severity: c.severity,
        status: c.status,
        crossInstitute: c.crossInstitute,
        differentNames: c.differentNames,
        maxSim: c.maxSim,
        institutes: c.institutes,
        memberCount: c.memberCount,
        members: (c.members || []).map((m) => ({ ...m, imageUrl: `/api/superadmin/ghost-faculty/face/${encodeURIComponent(m.uid)}/image` })),
        simPairs: c.simPairs || [],
        note: c.note || '',
        lastSeenAt: c.lastSeenAt,
      })),
      counts,
      lastScanAt: lastScan?.lastSeenAt || null,
    });
  } catch (err) {
    console.error('[superadmin/ghost-faculty]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Triage a collision (confirm / mark same-person / dismiss).
router.post('/ghost-faculty/:id/status', superAdminAuth, async (req, res) => {
  try {
    const status = req.body?.status;
    if (!['open', 'confirmed', 'same_person', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const c = await GhostFacultyCollision.findByIdAndUpdate(
      req.params.id,
      { $set: { status, note: req.body?.note || '', resolvedBy: 'superadmin', resolvedAt: new Date() } },
      { new: true }
    ).lean();
    if (!c) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, status: c.status });
  } catch (err) {
    console.error('[superadmin/ghost-faculty/status]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Serve a person's registration face (by uid) for the collision report.
router.get('/ghost-faculty/face/:uid/image', galleryImageAuth, async (req, res) => {
  try {
    const str = await ghostFacultyService.registrationImageFor(req.params.uid);
    return sendImageString(res, str);
  } catch (err) {
    console.error('[superadmin/ghost-faculty/face]', err);
    return res.status(500).end();
  }
});

// Staff of one institute — for the gallery's "person" filter dropdown.
router.get('/institutes/:id/staff', superAdminAuth, async (req, res) => {
  try {
    const staff = await Student.find({
      organization: req.params.id,
      isActive: { $ne: false },
    })
      .select('fullName uid designation department')
      .sort({ fullName: 1 })
      .lean();
    return res.json({ success: true, staff });
  } catch (err) {
    console.error('[superadmin/institutes/staff]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ─────────── Registration images (super-admin, read-only, network-wide) ───────────
 * Shows each faculty/staff member's ENROLLED face images (the ones used for
 * recognition), not attendance captures. Admin/HOD already get this for their own
 * scope via /api/portal/staff/registration-image; this is the unscoped,
 * view-only equivalent for the super-admin. No upload / re-enroll here. */

// Ordered source strings for a student's enrolled face images.
//
// Every registration (public self-register AND the admin "add employee" form)
// writes the SAME uploaded photos into TWO places: raw multer paths on
// `Student.faceImages[]`, and base64 docs in the `FaceImage` collection (see
// server/routes/publicRegistration.js and students.js's persistRegistrationFaces).
// This function used to concatenate BOTH sources, so 5 uploaded photos showed
// as 10 "enrolled images" here — the two lists are two representations of the
// IDENTICAL photos, not 10 distinct ones. Found 2026-08-05 via a real public
// registration.
//
// Fix: prefer the durable `FaceImage` docs (base64, survives a redeploy) and
// only fall back to `Student.faceImages` when there are NO FaceImage docs at
// all — i.e. a legacy account from before the FaceImage collection existed.
async function regImageSources(student) {
  const docs = await FaceImage.find({ student: student._id })
    .sort({ createdAt: 1 })
    .select('imageBase64')
    .lean();
  const fromDocs = docs.map((d) => d.imageBase64).filter(Boolean);
  if (fromDocs.length > 0) return fromDocs;

  const legacy = [];
  if (Array.isArray(student.faceImages)) {
    for (const s of student.faceImages) if (s) legacy.push(s);
  }
  return legacy;
}

// Every faculty/staff member in one institute + how many enrolled face images they
// have and index-addressable URLs to view each. <img> appends ?token=.
router.get('/institutes/:id/registration-images', superAdminAuth, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id).select('name').lean();
    if (!org) return res.status(404).json({ success: false, error: 'Institute not found' });

    const students = await Student.find({
      organization: org._id,
      isActive: { $ne: false },
    })
      .select('fullName uid designation department isActive faceImages')
      .sort({ fullName: 1 })
      .limit(5000)
      .lean();

    // Bulk-count FaceImage docs per student so we don't query once per person.
    const ids = students.map((s) => s._id);
    const faceDocCounts = new Map();
    if (ids.length) {
      const agg = await FaceImage.aggregate([
        { $match: { student: { $in: ids } } },
        { $group: { _id: '$student', n: { $sum: 1 } } },
      ]);
      agg.forEach((r) => faceDocCounts.set(String(r._id), r.n));
    }

    const base = '/api/superadmin/registration-image';
    const staff = students.map((s) => {
      // Mirrors regImageSources() above: prefer the durable FaceImage count;
      // only fall back to Student.faceImages for legacy accounts that predate
      // the FaceImage collection. NEVER sum both — they're the same photos.
      const faceDocCount = faceDocCounts.get(String(s._id)) || 0;
      const imageCount = faceDocCount > 0
        ? faceDocCount
        : (Array.isArray(s.faceImages) ? s.faceImages.filter(Boolean).length : 0);
      return {
        id: s._id,
        fullName: s.fullName || '—',
        uid: s.uid || '',
        designation: s.designation || '',
        department: s.department || '',
        isActive: s.isActive !== false,
        imageCount,
        hasImage: imageCount > 0,
        imageUrls: Array.from({ length: imageCount }, (_, i) => `${base}/${s._id}/${i}`),
      };
    });

    return res.json({
      success: true,
      institute: { id: org._id, name: org.name },
      total: staff.length,
      withImage: staff.filter((s) => s.hasImage).length,
      staff,
    });
  } catch (err) {
    console.error('[superadmin/institutes/registration-images]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Serve one enrolled face image (by index) for any student, network-wide.
router.get('/registration-image/:studentId/:index', galleryImageAuth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).select('faceImages').lean();
    if (!student) return res.status(404).end();
    const sources = await regImageSources(student);
    const idx = Math.max(0, parseInt(req.params.index, 10) || 0);
    return sendImageString(res, sources[idx]);
  } catch (err) {
    console.error('[superadmin/registration-image]', err);
    return res.status(500).end();
  }
});

/* ════════════════════ Drill-down face report (disk-backed) ════════════════════
 * The real recognition images live on disk under face_storage/<Name>_<uid>/, NOT
 * in Mongo (the old Attendance.faceImage field holds only sentinels). This report
 * walks that tree: Network → Institute → Employee → date-wise captures, with the
 * pass/fail verdict and similarity score parsed out of each filename, e.g.
 *   2026-06-14/checkin/233529_pass_0.96_wut8.jpg  → 23:35:29 · pass · 0.96
 *   2026-06-14/spotcheck/233549_fail_a4jr.jpg     → 23:35:49 · fail */

const CAPTURE_TYPE_LABELS = {
  checkin: 'Check-in', checkout: 'Check-out', spotcheck: 'Spot-check', class: 'Class', other: 'Other',
};
const IMG_RE = /\.(jpe?g|png)$/i;

// Parse "<HHMMSS>[_pass|_fail][_<score>]_<rand>.jpg" → { time, result, score }.
function parseCaptureFile(fname) {
  const parts = fname.replace(/\.[^.]+$/, '').split('_');
  const hms = parts[0] || '';
  const time = /^\d{6}$/.test(hms) ? `${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}` : null;
  let result = null;
  if (parts.includes('pass')) result = 'pass';
  else if (parts.includes('fail')) result = 'fail';
  const scoreTok = parts.find((p) => /^\d+\.\d+$/.test(p));
  // Anti-spoof verdict baked in at capture time: `spoof-<label>-<score>`. Lets the
  // Face Report render the FAKE/unsure/real badge automatically (no manual scan).
  let spoof = null;
  const spoofTok = parts.find((p) => p.startsWith('spoof-'));
  if (spoofTok) {
    const [, label, scoreStr] = spoofTok.split('-');
    const sc = scoreStr != null && /^\d+\.\d+$/.test(scoreStr) ? parseFloat(scoreStr) : null;
    if (label) {
      spoof = {
        available: true,
        label,
        isFake: label === 'fake',
        isUncertain: label === 'uncertain',
        score: sc,
      };
    }
  }
  return { time, result, score: scoreTok ? parseFloat(scoreTok) : null, spoof };
}

// Walk one user's face_storage dir into { registration[], days[], totals }.
function walkUserCaptures(baseDir) {
  const out = { registration: [], days: [], totals: { total: 0, pass: 0, fail: 0, byType: {} }, lastDate: null };
  let entries;
  try { entries = fs.readdirSync(baseDir, { withFileTypes: true }); } catch { return out; }

  const dayMap = new Map();
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;

    if (ent.name === 'registered') {
      let files = [];
      try { files = fs.readdirSync(path.join(baseDir, 'registered')); } catch { /* ignore */ }
      files.filter((f) => IMG_RE.test(f)).forEach((f) => {
        const p = f.replace(/\.[^.]+$/, '').split('_');
        out.registration.push({ file: `registered/${f}`, date: p[0] || null });
      });
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(ent.name)) continue; // date folders only
    const date = ent.name;
    let typeDirs = [];
    try { typeDirs = fs.readdirSync(path.join(baseDir, date), { withFileTypes: true }); } catch { /* ignore */ }

    const types = [];
    for (const td of typeDirs) {
      if (!td.isDirectory()) continue;
      const type = td.name;
      let files = [];
      try { files = fs.readdirSync(path.join(baseDir, date, type)); } catch { /* ignore */ }
      const captures = files.filter((f) => IMG_RE.test(f))
        .map((f) => ({ file: `${date}/${type}/${f}`, ...parseCaptureFile(f) }))
        // Face Report shows genuine identity OUTCOMES only (pass/fail) — a
        // capture the PAD pipeline flagged 'fake' or 'uncertain' at capture
        // time belongs on the Spoof Detection page instead (SpoofAttempt
        // already records every fake/uncertain capture there), not mixed
        // into this report where it reads as noise / a false "Fail". This
        // is purely a display filter — nothing on disk is deleted or
        // touched, so the manual re-scan / Spoof Detection pages still see
        // the exact same underlying files.
        .filter((c) => !(c.spoof && (c.spoof.isFake || c.spoof.isUncertain)));
      captures.forEach((c) => {
        out.totals.total++;
        if (c.result === 'pass') out.totals.pass++;
        else if (c.result === 'fail') out.totals.fail++;
        out.totals.byType[type] = (out.totals.byType[type] || 0) + 1;
      });
      if (captures.length) {
        captures.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
        types.push({ type, label: CAPTURE_TYPE_LABELS[type] || type, captures });
      }
    }
    if (types.length) {
      types.sort((a, b) => a.type.localeCompare(b.type));
      dayMap.set(date, types);
    }
  }

  out.days = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, types]) => ({ date, types }));
  out.lastDate = out.days[0]?.date || null;
  return out;
}

// Enrich the disk-walked captures with the matching Mongo record's metadata —
// exact timestamp, lat/long, distance-from-campus, verification score, liveness
// verdict, device/injection risk, auth method, status and (for spot-checks)
// random-vs-manual trigger. The disk filename only carries HHMMSS + pass/fail, so
// we join by (local date, capture type) and pair each image to the nearest-in-time
// record in that bucket (the image is stamped at face-verify time, the DB row a few
// seconds later at mark-time, so exact-second matching is unreliable). Best-effort:
// a capture with no DB row (e.g. a failed face attempt that never marked) just keeps
// its filename-only detail.
async function enrichCapturesFromMongo(student, w) {
  if (!w.days.length) return;
  const minDate = w.days[w.days.length - 1].date; // days are newest-first
  const since = new Date(`${minDate}T00:00:00`);

  const localOf = (d) => {
    const dt = new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return {
      date: `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`,
      sec: dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds(),
    };
  };

  const [att, spots, classes, vlmFakes] = await Promise.all([
    Attendance.find({ student: student._id, type: { $in: ['in', 'out'] }, timestamp: { $gte: since } })
      .select('type timestamp latitude longitude location distance faceVerified verificationScore livenessVerdict injectionRisk authMethod status')
      .sort({ timestamp: 1 }).limit(5000).lean(),
    SpotCheck.find({ student: student._id, respondedAt: { $gte: since } })
      .select('triggeredBy respondedAt issuedAt responseLocation faceVerified verificationScore livenessVerdict injectionRisk status')
      .sort({ respondedAt: 1 }).limit(5000).lean(),
    ClassCheckin.find({ faculty: student._id, date: { $gte: minDate } })
      .select('date actualStart geo faceVerified status timetable')
      .populate('timetable', 'subject')
      .limit(5000).lean(),
    // The VLM rescan (antispoof_service.py no longer runs it inline — see
    // server/services/faceVerifyService.js's vlmRescan()) fires AFTER a
    // capture is already saved to disk, so the filename's baked-in
    // `_spoof-<label>-<score>` token can only ever reflect the FAST local
    // models' verdict at capture time — never the slower VLM's later
    // opinion. A capture the local models called 'real' but the VLM
    // rescan later confirmed 'fake' would otherwise keep showing on Face
    // Report as a normal pass forever (reported 2026-07-30: a clear
    // laptop-screen replay scored 'real' 0.63 by the fast models, still
    // "Verified" on this report even after the VLM rescan flagged it).
    SpoofAttempt.find({ student: student._id, model: 'vlm-rescan', label: 'fake', createdAt: { $gte: since } })
      .select('type createdAt score')
      .lean(),
  ]);

  // bucket key `${date}|${diskType}` → [{ sec, meta, used }]
  const buckets = new Map();
  const add = (date, diskType, sec, meta) => {
    const k = `${date}|${diskType}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push({ sec, meta, used: false });
  };

  att.forEach((r) => {
    const { date, sec } = localOf(r.timestamp);
    add(date, r.type === 'out' ? 'checkout' : 'checkin', sec, {
      source: 'attendance',
      timestamp: r.timestamp,
      latitude: r.latitude ?? r.location?.latitude ?? null,
      longitude: r.longitude ?? r.location?.longitude ?? null,
      distance: r.distance ?? null,
      faceVerified: !!r.faceVerified,
      verificationScore: r.verificationScore ?? null,
      liveness: r.livenessVerdict ?? null,
      injectionRisk: r.injectionRisk ?? null,
      authMethod: r.authMethod || 'face',
      status: r.status || null,
    });
  });
  spots.forEach((r) => {
    const when = r.respondedAt || r.issuedAt;
    if (!when) return;
    const { date, sec } = localOf(when);
    add(date, 'spotcheck', sec, {
      source: 'spotcheck',
      triggeredBy: r.triggeredBy === 'manual' ? 'manual' : 'random',
      timestamp: when,
      latitude: r.responseLocation?.latitude ?? null,
      longitude: r.responseLocation?.longitude ?? null,
      distance: null,
      faceVerified: !!r.faceVerified,
      verificationScore: r.verificationScore ?? null,
      liveness: r.livenessVerdict ?? null,
      injectionRisk: r.injectionRisk ?? null,
      authMethod: 'face',
      status: r.status || null,
    });
  });
  classes.forEach((r) => {
    if (!r.date) return;
    const [h, m] = String(r.actualStart || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
    add(r.date, 'class', h * 3600 + m * 60, {
      source: 'class',
      timestamp: null,
      subject: r.timetable?.subject || null,
      latitude: r.geo?.latitude ?? null,
      longitude: r.geo?.longitude ?? null,
      distance: r.geo?.distanceM ?? null,
      place: r.geo?.place || null,
      faceVerified: !!r.faceVerified,
      verificationScore: null,
      liveness: null,
      injectionRisk: null,
      authMethod: 'face',
      status: r.status || null,
    });
  });

  const secOf = (hms) => {
    if (!hms) return null;
    const [h, m, s] = hms.split(':').map(Number);
    return h * 3600 + m * 60 + (s || 0);
  };

  // Pair each disk image to the nearest unused DB row in its (date, type) bucket.
  for (const day of w.days) {
    for (const t of day.types) {
      const bucket = buckets.get(`${day.date}|${t.type}`);
      if (!bucket) continue;
      for (const cap of t.captures) {
        const csec = secOf(cap.time);
        let best = null, bestD = Infinity;
        for (const b of bucket) {
          if (b.used) continue;
          const dist = csec == null ? 0 : Math.abs(b.sec - csec);
          if (dist < bestD) { bestD = dist; best = b; }
        }
        if (best) { best.used = true; cap.detail = best.meta; }
      }
    }
  }

  // Match VLM-rescan fakes onto the capture they scored — a WIDER, AFTER-only
  // window (not the tight nearest-match above): the rescan always fires
  // seconds-to-a-couple-minutes AFTER the original capture (it's a real
  // network call to a hosted model, see faceVerifyService.vlmRescan), never
  // before and never at the same instant. 10 minutes comfortably covers the
  // measured 10-90s call time with headroom for a slow request.
  const DISK_TYPE_OF_SESSION = { in: 'checkin', out: 'checkout' };
  const VLM_MATCH_WINDOW_S = 600;
  if (vlmFakes.length) {
    const vlmByDayType = new Map(); // `${date}|${diskType}` -> [{sec, score}]
    vlmFakes.forEach((r) => {
      const { date, sec } = localOf(r.createdAt);
      const diskType = DISK_TYPE_OF_SESSION[r.type] || r.type || 'checkin';
      const k = `${date}|${diskType}`;
      if (!vlmByDayType.has(k)) vlmByDayType.set(k, []);
      vlmByDayType.get(k).push({ sec, score: r.score });
    });
    for (const day of w.days) {
      for (const t of day.types) {
        const vlmBucket = vlmByDayType.get(`${day.date}|${t.type}`);
        if (!vlmBucket) continue;
        for (const cap of t.captures) {
          const csec = secOf(cap.time);
          if (csec == null) continue;
          const hit = vlmBucket.some((v) => v.sec >= csec && v.sec - csec <= VLM_MATCH_WINDOW_S);
          if (hit) {
            cap.spoof = { available: true, label: 'fake', isFake: true, isUncertain: false, score: null };
          }
        }
      }
    }
  }
}

// Post-enrichment companion to walkUserCaptures' own fake/uncertain filter —
// removes any capture enrichCapturesFromMongo just flagged via a matched
// VLM-rescan fake, and keeps totals/day-emptiness consistent with what was
// actually removed (mirrors the counting walkUserCaptures does at write time).
function dropVlmFlaggedCaptures(w) {
  for (const day of w.days) {
    for (const t of day.types) {
      const before = t.captures.length;
      t.captures = t.captures.filter((c) => !(c.spoof && c.spoof.isFake));
      const dropped = before - t.captures.length;
      if (dropped > 0) {
        w.totals.total -= dropped;
        // Every capture reaching this point already passed the identity
        // match (that's how it got a VLM-rescan record at all — see
        // attendance.js/spotChecks.js's async block, only fired on success),
        // so every dropped one was counted as 'pass', never 'fail'.
        w.totals.pass = Math.max(0, w.totals.pass - dropped);
        w.totals.byType[t.type] = Math.max(0, (w.totals.byType[t.type] || 0) - dropped);
      }
    }
    day.types = day.types.filter((t) => t.captures.length > 0);
  }
  w.days = w.days.filter((d) => d.types.length > 0);
}

// Employees of one institute + their capture summary from disk.
router.get('/report/institute/:id/employees', superAdminAuth, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id).select('name organizationType state address').lean();
    if (!org) return res.status(404).json({ success: false, error: 'Institute not found' });

    const students = await Student.find({ organization: org._id })
      .select('fullName uid designation department isActive')
      .sort({ fullName: 1 })
      .limit(3000)
      .lean();

    const employees = students.map((s) => {
      const w = walkUserCaptures(faceStorageService.userDir(s));
      return {
        id: s._id,
        name: s.fullName || '—',
        uid: s.uid || '',
        designation: s.designation || '',
        department: s.department || '',
        isActive: s.isActive !== false,
        captureCount: w.totals.total,
        passCount: w.totals.pass,
        failCount: w.totals.fail,
        registrationCount: w.registration.length,
        lastCaptureDate: w.lastDate,
      };
    });
    // People with captures first, then alphabetical.
    employees.sort((a, b) => b.captureCount - a.captureCount || a.name.localeCompare(b.name));

    const withCaptures = employees.filter((e) => e.captureCount > 0).length;
    return res.json({
      success: true,
      institute: { id: org._id, name: org.name, type: org.organizationType || '—', state: org.state || org.address?.state || '—' },
      total: employees.length,
      withCaptures,
      employees,
    });
  } catch (err) {
    console.error('[superadmin/report/institute/employees]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// One employee's full capture history (date → type → images) from disk.
router.get('/report/employee/:studentId/captures', superAdminAuth, async (req, res) => {
  try {
    const s = await Student.findById(req.params.studentId)
      .select('fullName uid designation department organization')
      .populate('organization', 'name')
      .lean();
    if (!s) return res.status(404).json({ success: false, error: 'Employee not found' });

    const w = walkUserCaptures(faceStorageService.userDir(s));
    try { await enrichCapturesFromMongo(s, w); } catch (e) { console.error('[face-report enrich]', e.message); }
    // walkUserCaptures already dropped anything fake/uncertain in its OWN
    // filename token — but a VLM-rescan fake (matched onto `cap.spoof` just
    // now, inside enrichCapturesFromMongo) can only be known AFTER that
    // async call completes, well after the file was written. Re-apply the
    // exact same exclusion here, now that the VLM's later verdict is
    // available too, so a capture doesn't sit on Face Report as a normal
    // pass forever just because the fast models missed it at capture time.
    dropVlmFlaggedCaptures(w);
    const base = `/api/superadmin/report/employee/${s._id}/image`;
    const withUrl = (file) => `${base}?rel=${encodeURIComponent(file)}`;

    return res.json({
      success: true,
      employee: {
        id: s._id,
        name: s.fullName || '—',
        uid: s.uid || '',
        designation: s.designation || '',
        department: s.department || '',
        institute: s.organization?.name || '—',
      },
      totals: w.totals,
      registration: w.registration.map((r) => ({ ...r, imageUrl: withUrl(r.file) })),
      days: w.days.map((d) => ({
        date: d.date,
        types: d.types.map((t) => ({
          type: t.type,
          label: t.label,
          captures: t.captures.map((c) => ({ ...c, imageUrl: withUrl(c.file) })),
        })),
      })),
    });
  } catch (err) {
    console.error('[superadmin/report/employee/captures]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Serve one capture's bytes by relative path, sanitized to the employee's dir.
// <img> can't send headers, so the super-admin token may ride as ?token=.
router.get('/report/employee/:studentId/image', galleryImageAuth, async (req, res) => {
  try {
    const s = await Student.findById(req.params.studentId).select('fullName uid').lean();
    if (!s) return res.status(404).end();
    const base = path.resolve(faceStorageService.userDir(s));
    const target = path.resolve(base, String(req.query.rel || ''));
    // Path-traversal guard: the resolved file must stay inside the user's dir.
    if (target !== base && !target.startsWith(base + path.sep)) return res.status(403).end();
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return res.status(404).end();
    res.set('Content-Type', path.extname(target).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    return fs.createReadStream(target).pipe(res);
  } catch (err) {
    console.error('[superadmin/report/employee/image]', err);
    return res.status(500).end();
  }
});

// Retroactive anti-spoof scan: run the on-server PAD model over an employee's
// already-stored attendance captures (check-in/out, spot-checks, class) to flag
// any that were marked with a phone-screen / photo replay. Returns a per-file
// verdict the Face Report overlays as a FAKE badge. Best-effort + bounded.
const ANTISPOOF_SCAN_CAP = 200;     // max images scanned per request
// Kept low: the face engine serializes inference behind a lock anyway, so more
// parallel callers just queue (and hold connections open) without speeding it up.
const ANTISPOOF_SCAN_CONCURRENCY = 2; // parallel calls to the face engine
router.post('/report/employee/:studentId/antispoof-scan', superAdminAuth, async (req, res) => {
  try {
    const s = await Student.findById(req.params.studentId).select('fullName uid').lean();
    if (!s) return res.status(404).json({ success: false, error: 'Employee not found' });

    const base = path.resolve(faceStorageService.userDir(s));
    const w = walkUserCaptures(faceStorageService.userDir(s));

    // Collect every dated capture file (skip registration images — those are the
    // enrolled reference, not an attendance attempt).
    const files = [];
    for (const day of w.days) for (const t of day.types) for (const c of t.captures) files.push(c.file);
    const slice = files.slice(0, ANTISPOOF_SCAN_CAP);

    const results = [];
    let scanned = 0; let fake = 0; let uncertain = 0; let unavailable = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < slice.length) {
        const file = slice[cursor++];
        const target = path.resolve(base, file);
        // Path-traversal guard: must stay inside the employee's dir.
        if (target !== base && !target.startsWith(base + path.sep)) continue;
        let verdict = { available: false, isFake: false, isUncertain: false, label: null, score: null };
        try {
          const buf = fs.readFileSync(target);
          verdict = await faceVerifyService.scanImage(buf);
        } catch (e) {
          verdict = { available: false, isFake: false, isUncertain: false, label: null, score: null, error: e.message };
        }
        if (verdict.available) {
          scanned += 1;
          if (verdict.isFake) fake += 1;
          else if (verdict.isUncertain) uncertain += 1;
        } else {
          unavailable += 1;
        }
        results.push({
          file,
          available: verdict.available === true,
          isFake: verdict.isFake === true,
          isUncertain: verdict.isUncertain === true,
          label: verdict.label || null,
          score: typeof verdict.score === 'number' ? verdict.score : null,
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(ANTISPOOF_SCAN_CONCURRENCY, slice.length || 1) }, worker));

    return res.json({
      success: true,
      summary: {
        total: slice.length,
        scanned,
        fake,
        uncertain,
        unavailable,
        truncated: files.length > ANTISPOOF_SCAN_CAP,
      },
      results,
    });
  } catch (err) {
    console.error('[superadmin/antispoof-scan]', err);
    return res.status(500).json({ success: false, error: 'Anti-spoof scan failed' });
  }
});

/* ─────────── Outreach Activity Aggregates (super-admin) ─────────── */
router.get('/outreach', superAdminAuth, async (req, res) => {
  try {
    const orgs = await Organization.find({ isActive: { $ne: false } }).select('name').lean();

    const aggregates = await OutreachActivity.aggregate([
      {
        $group: {
          _id: { organization: '$organization', status: '$status' },
          count: { $sum: 1 },
          participants: { $sum: '$participants' }
        }
      }
    ]);

    // Map aggregates by organization ID
    const orgMap = new Map();
    orgs.forEach(org => {
      orgMap.set(org._id.toString(), {
        id: org._id,
        name: org.name,
        pending: 0,
        inProgress: 0,
        completed: 0,
        rejected: 0,
        total: 0,
        participants: 0
      });
    });

    aggregates.forEach(agg => {
      const orgId = agg._id.organization?.toString();
      if (!orgId || !orgMap.has(orgId)) return;
      const status = agg._id.status;
      const data = orgMap.get(orgId);

      data.total += agg.count;
      data.participants += agg.participants;

      if (status === 'pending') data.pending += agg.count;
      else if (status === 'in_progress') data.inProgress += agg.count;
      else if (status === 'completed') data.completed += agg.count;
      else if (status === 'rejected') data.rejected += agg.count;

      orgMap.set(orgId, data);
    });

    const rows = Array.from(orgMap.values());
    rows.sort((a, b) => b.total - a.total);

    // Compute network-wide metrics
    const networkSummary = {
      total: rows.reduce((s, r) => s + r.total, 0),
      pending: rows.reduce((s, r) => s + r.pending, 0),
      inProgress: rows.reduce((s, r) => s + r.inProgress, 0),
      completed: rows.reduce((s, r) => s + r.completed, 0),
      participants: rows.reduce((s, r) => s + r.participants, 0)
    };

    return res.json({
      success: true,
      summary: networkSummary,
      organizations: rows
    });
  } catch (err) {
    console.error('[superadmin/outreach]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ─────────── Spot-checks network trigger ─────────── */
router.post('/spot-checks/trigger', superAdminAuth, async (req, res) => {
  try {
    const { organizationIds, sampleSize, windowMinutes, onlyCheckedIn } = req.body;
    if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one organization' });
    }

    const results = [];
    const spotCheckService = require('../services/spotCheckService');

    for (const orgId of organizationIds) {
      try {
        const result = await spotCheckService.issueRound(orgId, {
          sampleSize: sampleSize != null ? parseInt(sampleSize) : null,
          windowMinutes: windowMinutes != null ? parseInt(windowMinutes) : 15,
          onlyCheckedIn: onlyCheckedIn !== undefined ? !!onlyCheckedIn : true,
          triggeredBy: 'manual',
        });
        results.push({ organizationId: orgId, success: true, ...result });
      } catch (err) {
        console.error(`[SuperAdmin SpotCheck] failed for org ${orgId}:`, err);
        results.push({ organizationId: orgId, success: false, error: err.message });
      }
    }

    return res.json({ success: true, results });
  } catch (err) {
    console.error('[SuperAdmin SpotCheck] trigger error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────── Spot-checks rounds history ─────────── */
router.get('/spot-checks/rounds', superAdminAuth, async (req, res) => {
  try {
    // Heatmap needs all rounds in the window, default to a large number so we don't truncate history
    const limit = parseInt(req.query.limit) || 5000;
    const rounds = await SpotCheck.aggregate([
      {
        $group: {
          _id: '$roundId',
          organizationId: { $first: '$organization' },
          issuedAt: { $first: '$issuedAt' },
          expiresAt: { $first: '$expiresAt' },
          windowMinutes: { $first: '$windowMinutes' },
          triggeredBy: { $first: '$triggeredBy' },
          total: { $sum: 1 },
          responded: {
            $sum: { $cond: [{ $eq: ['$status', 'responded'] }, 1, 0] },
          },
          missed: {
            $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          skipped: {
            $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] },
          },
        },
      },
      { $sort: { issuedAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'organizations',
          localField: 'organizationId',
          foreignField: '_id',
          as: 'organization',
        },
      },
      {
        $unwind: {
          path: '$organization',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          roundId: '$_id',
          issuedAt: 1,
          expiresAt: 1,
          windowMinutes: 1,
          triggeredBy: 1,
          total: 1,
          responded: 1,
          missed: 1,
          pending: 1,
          skipped: 1,
          organization: {
            _id: '$organization._id',
            name: '$organization.name',
          },
        },
      },
    ]);

    const populatedRounds = await Promise.all(
      rounds.map(async (round) => {
        if (!round.organization?._id) return round;
        const staffCount = await Student.countDocuments({
          organization: round.organization._id,
          isActive: true,
        });
        return {
          ...round,
          organization: {
            ...round.organization,
            staff: staffCount,
          },
        };
      })
    );

    return res.json({ success: true, rounds: populatedRounds });
  } catch (err) {
    console.error('[SuperAdmin SpotCheck] fetch rounds error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────── Spot-checks for a specific organization (detailed log) ─────────── */
router.get('/org/:id/spot-checks', superAdminAuth, async (req, res) => {
  try {
    const orgId = req.params.id;
    const limit = parseInt(req.query.limit) || 200;
    const checks = await SpotCheck.find({ organization: orgId })
      .populate('student', 'fullName uid designation department')
      .sort({ issuedAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, spotChecks: checks });
  } catch (err) {
    console.error('[SuperAdmin SpotCheck] fetch org spot checks error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ════════════════ Device & IP Tracking (login + attendance) ════════════════
 * Every login / check-in / check-out with the public IP, local IP, network
 * type and physical device it came from, newest first. Rows where the IP or
 * the DEVICE differs from the employee's previous one carry ipChanged /
 * deviceChanged (+ the previous values) so the panel can show the warning —
 * purely informational, nothing was blocked (device changes are additionally
 * in the audit trail as 'tracking.device_changed'). Filterable by month/year
 * + institute + event, with an "only changes" toggle (IP or device). */
router.get('/ip-logs', superAdminAuth, async (req, res) => {
  try {
    const win = galleryWindow(req); // reuses the same ?month=&year= window
    const orgId = req.query.instituteId || null;
    const event = ['login', 'in', 'out'].includes(req.query.event) ? req.query.event : null;
    const changedOnly = req.query.changedOnly === 'true' || req.query.changedOnly === '1';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize, 10) || 25));

    const match = {};
    if (orgId) match.organization = orgId;
    if (win) match.timestamp = win;
    if (event) match.event = event;
    if (changedOnly) match.$or = [{ ipChanged: true }, { deviceChanged: true }];

    const [total, changedTotal, deviceChangedTotal, rows] = await Promise.all([
      IpActivityLog.countDocuments(match),
      IpActivityLog.countDocuments({ ...match, ipChanged: true }),
      IpActivityLog.countDocuments({ ...match, deviceChanged: true }),
      IpActivityLog.find(match)
        .sort({ timestamp: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate('student', 'fullName uid designation department')
        .populate('organization', 'name')
        .lean(),
    ]);

    const items = rows.map((r) => ({
      id: r._id,
      // Fall back to the denormalized name/uid if the student was removed.
      personName: r.student?.fullName || r.studentName || '—',
      uid: r.student?.uid || r.uid || '',
      designation: r.student?.designation || '',
      department: r.student?.department || '',
      institute: r.organization?.name || '—',
      instituteId: r.organization?._id || null,
      event: r.event,
      attendanceId: r.attendance || null,
      publicIp: r.publicIp || null,
      previousIp: r.previousIp || null,
      ipChanged: r.ipChanged === true,
      localIp: r.localIp || null,
      networkType: r.networkType || null,
      deviceId: r.deviceId || null,
      deviceModel: r.deviceModel || null,
      manufacturer: r.manufacturer || null,
      androidVersion: r.androidVersion || null,
      deviceChanged: r.deviceChanged === true,
      previousDeviceId: r.previousDeviceId || null,
      previousDeviceModel: r.previousDeviceModel || null,
      previousDeviceManufacturer: r.previousDeviceManufacturer || null,
      time: r.timestamp,
    }));

    return res.json({
      success: true,
      total,
      changedTotal,
      deviceChangedTotal,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    });
  } catch (err) {
    console.error('[superadmin/ip-logs]', err);
    return res.status(500).json({ success: false, error: 'Failed to load IP activity' });
  }
});

/* ════════════════ Login sessions (concurrent-session cap log) ════════════════
 * History of every ADMIN-type login session (super admin, Admin, HOD, …):
 * login/logout time, device, IP, duration and WHY it ended — manual logout,
 * expiry, or terminated to make room for a login past the device cap
 * (services/sessionService.js MAX_ACTIVE_SESSIONS).
 * Faculty/students are outside this system and never appear. */
const LOGOUT_REASON_LABEL = {
  manual_logout: 'Manual Logout',
  session_expired: 'Session Expired',
  logged_in_another_device: 'Logged in From Another Device',
  token_expired: 'Token Expired',
};

router.get('/sessions', superAdminAuth, async (req, res) => {
  try {
    const win = galleryWindow(req); // same ?month=&year= window
    const orgId = req.query.instituteId || null;
    const status = ['active', 'ended'].includes(req.query.status) ? req.query.status : null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize, 10) || 25));

    const match = {};
    if (orgId) match.organization = orgId;
    if (win) match.loginAt = win;
    if (status) match.active = status === 'active';

    const [total, activeTotal, kickedTotal, rows] = await Promise.all([
      AdminSession.countDocuments(match),
      AdminSession.countDocuments({ ...match, active: true }),
      AdminSession.countDocuments({ ...match, logoutReason: 'logged_in_another_device' }),
      AdminSession.find(match)
        .sort({ loginAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate('organization', 'name')
        .lean(),
    ]);

    const items = rows.map((r) => {
      const end = r.logoutAt || (r.active ? new Date() : r.lastActivityAt);
      return {
        id: r._id,
        user: r.userLabel || r.userKey,
        role: r.role || r.userType,
        userType: r.userType,
        institute: r.organization?.name || (r.userType === 'superadmin' ? 'Anuvadini Network' : '—'),
        ip: r.ip || null,
        device: r.deviceInfo?.deviceModel
          ? [r.deviceInfo.manufacturer, r.deviceInfo.deviceModel].filter(Boolean).join(' ')
          : r.deviceInfo?.userAgent || null,
        loginAt: r.loginAt,
        lastActivityAt: r.lastActivityAt,
        logoutAt: r.logoutAt || null,
        durationMs: end && r.loginAt ? Math.max(0, end.getTime() - r.loginAt.getTime()) : null,
        active: r.active === true,
        logoutReason: r.logoutReason || null,
        logoutReasonLabel: r.active ? 'Active' : LOGOUT_REASON_LABEL[r.logoutReason] || 'Session Expired',
      };
    });

    return res.json({
      success: true,
      total,
      activeTotal,
      kickedTotal,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    });
  } catch (err) {
    console.error('[superadmin/sessions]', err);
    return res.status(500).json({ success: false, error: 'Failed to load login sessions' });
  }
});

// POST /api/superadmin/logout-all — end every login (admin sessions and all older tokens).
// The super admin who clicks it is logged out too and must sign in again.
router.post('/logout-all', superAdminAuth, async (req, res) => {
  try {
    const out = await sessionService.logoutEveryone();
    try {
      auditService.log({
        organization: null,
        actorType: 'system',
        actorLabel: 'Super Admin',
        action: 'auth.logout_everyone',
        outcome: 'flagged',
        targetType: 'auth',
        metadata: { endedAdminSessions: out.endedAdminSessions },
      });
    } catch (e) { /* audit is best-effort */ }
    res.json({ success: true, ...out });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not log everyone out.' });
  }
});

module.exports = router;
