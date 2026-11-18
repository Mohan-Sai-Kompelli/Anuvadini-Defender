// Checkout-compliance monitoring: finds employees who check IN but repeatedly
// fail to check OUT, keeps a per-employee compliance snapshot, raises/updates
// red flags against the configured thresholds, and generates warning memos.
//
// Runs from the daily cron (services/cronService.js) and on demand from the
// super-admin "Attendance Compliance" module (routes/checkoutCompliance.js).
// Read-only over the attendance data — it NEVER writes to Attendance, so the
// existing attendance/biometric flow is untouched by design.

const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const ComplianceConfig = require('../models/ComplianceConfig');
const CheckoutComplianceRecord = require('../models/CheckoutComplianceRecord');
const CheckoutRedFlag = require('../models/CheckoutRedFlag');
const ComplianceMemo = require('../models/ComplianceMemo');
const ComplianceNotification = require('../models/ComplianceNotification');
const audit = require('./auditService');

/* ───────────────────────── helpers ───────────────────────── */

// Server-local timezone as a fixed offset for Mongo's $dateToString, so a
// "day" here matches the wall-clock day attendance was marked on.
function localTzOffset() {
  const min = -new Date().getTimezoneOffset();
  const sign = min < 0 ? '-' : '+';
  const abs = Math.abs(min);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Analysis window: the last `windowDays` COMPLETED days. Today is excluded —
// an employee still at work hasn't missed today's checkout yet.
function analysisWindow(windowDays) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - windowDays);
  return { start, end };
}

function riskLevelFor(missed, cfg) {
  if (missed >= cfg.highMissedCount) return 'high';
  if (missed >= cfg.warnMissedCount) return 'warning';
  return 'normal';
}

// 0–100 composite risk: how many misses, plus how large a share of workdays
// they are. 5 misses at 50% of days ≈ 80; capped at 100.
function riskScoreFor(missed, missedPct) {
  return Math.min(100, Math.round(missed * 12 + missedPct * 0.4));
}

const DEFAULT_WARNING = (m) =>
  `This is a formal warning regarding your attendance records. Our compliance review found ${m.violationCount} ` +
  `working day(s) in the last ${m.windowDays} days on which you marked Check-In but did not mark Check-Out. ` +
  `Complete attendance (Check-In AND Check-Out) is mandatory for every working day. You are directed to mark ` +
  `your checkout without fail from the date of this memo. Continued non-compliance will invite further ` +
  `administrative action as per Anuvadini norms.`;

/* ───────────────────────── detection core ───────────────────────── */

/**
 * Group attendance by (student, local day) over the window and reduce to one
 * row per student: total check-in days, days with no checkout, and the dates.
 * Optionally scoped to one organization (used by the drill-down endpoints).
 */
async function aggregateMissedCheckouts({ start, end, organization = null }) {
  const match = {
    timestamp: { $gte: start, $lt: end },
    type: { $in: ['in', 'out'] },
  };
  if (organization) match.organization = new mongoose.Types.ObjectId(String(organization));

  return Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          student: '$student',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: localTzOffset() } },
        },
        hasIn: { $max: { $cond: [{ $eq: ['$type', 'in'] }, 1, 0] } },
        hasOut: { $max: { $cond: [{ $eq: ['$type', 'out'] }, 1, 0] } },
        organization: { $first: '$organization' },
      },
    },
    { $match: { hasIn: 1 } },
    { $sort: { '_id.day': 1 } },
    {
      $group: {
        _id: '$_id.student',
        organization: { $first: '$organization' },
        totalCheckIns: { $sum: 1 },
        missedCheckouts: { $sum: { $cond: [{ $eq: ['$hasOut', 0] }, 1, 0] } },
        missedDates: { $push: { $cond: [{ $eq: ['$hasOut', 0] }, '$_id.day', '$$REMOVE'] } },
      },
    },
  ]);
}

/**
 * Full analysis pass: refresh every employee's compliance snapshot, then
 * raise / update / auto-resolve red flags per the configured thresholds.
 * Returns a summary for the caller (cron log or the "Run analysis" button).
 */
async function runAnalysis({ triggeredBy = 'system' } = {}) {
  const cfg = await ComplianceConfig.get();
  const { start, end } = analysisWindow(cfg.windowDays);
  const startedAt = new Date();

  const rows = await aggregateMissedCheckouts({ start, end });

  // Identity snapshots for every student in the result set (one query).
  const studentIds = rows.map((r) => r._id);
  const students = await Student.find({ _id: { $in: studentIds } })
    .select('fullName uid department designation organization')
    .lean();
  const orgIds = [...new Set(students.map((s) => String(s.organization)).filter(Boolean))];
  const orgs = await Organization.find({ _id: { $in: orgIds } }).select('name').lean();
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]));
  const studentById = new Map(students.map((s) => [String(s._id), s]));

  let flagged = 0;
  let escalated = 0;
  let autoResolved = 0;
  let memosAutoGenerated = 0;

  for (const row of rows) {
    const s = studentById.get(String(row._id));
    const missed = row.missedCheckouts;
    const missedPct = row.totalCheckIns ? Math.round((missed / row.totalCheckIns) * 1000) / 10 : 0;
    const level = riskLevelFor(missed, cfg);
    const lastMissedDate = row.missedDates.length ? row.missedDates[row.missedDates.length - 1] : null;

    // 1) Current-state snapshot (upsert; the permanent history lives in the
    //    red flags / memos / notifications, which are never overwritten).
    await CheckoutComplianceRecord.updateOne(
      { student: row._id },
      {
        $set: {
          organization: row.organization || s?.organization || null,
          studentName: s?.fullName || null,
          uid: s?.uid || null,
          department: s?.department || null,
          designation: s?.designation || null,
          windowDays: cfg.windowDays,
          totalCheckIns: row.totalCheckIns,
          missedCheckouts: missed,
          missedPct,
          missedDates: row.missedDates,
          lastMissedDate,
          riskLevel: level,
          analyzedAt: startedAt,
        },
      },
      { upsert: true }
    );

    // 2) Red-flag lifecycle for this student.
    const openFlag = await CheckoutRedFlag.findOne({
      student: row._id,
      status: { $in: ['active', 'memo_issued'] },
    });

    const flagFields = {
      windowDays: cfg.windowDays,
      totalCheckIns: row.totalCheckIns,
      missedCount: missed,
      missedPct,
      frequencyPerWeek: Math.round((missed / (cfg.windowDays / 7)) * 10) / 10,
      violationDates: row.missedDates,
      lastIncidentDate: lastMissedDate,
      riskScore: riskScoreFor(missed, missedPct),
    };

    if (level === 'normal') {
      if (openFlag) {
        openFlag.status = 'resolved';
        openFlag.resolvedAt = new Date();
        openFlag.resolvedBy = 'System';
        openFlag.resolutionNote = 'Auto-resolved: checkout compliance returned to normal.';
        await openFlag.save();
        autoResolved += 1;
      }
      continue;
    }

    if (!openFlag) {
      const flag = await CheckoutRedFlag.create({
        student: row._id,
        organization: row.organization || s?.organization || null,
        studentName: s?.fullName || null,
        uid: s?.uid || null,
        department: s?.department || null,
        designation: s?.designation || null,
        organizationName: orgName.get(String(row.organization || s?.organization)) || null,
        riskLevel: level,
        reason: 'Repeated Missing Checkout Attendance',
        status: 'active',
        ...flagFields,
      });
      flagged += 1;
      await notify({
        type: 'red_flag',
        title: `${level === 'high' ? 'High-risk' : 'Warning'} red flag: ${flag.studentName || flag.uid}`,
        message:
          `${flag.studentName || 'Employee'} (${flag.uid || '—'}) missed checkout on ${missed} of ` +
          `${row.totalCheckIns} working days in the last ${cfg.windowDays} days (${missedPct}%).`,
        riskLevel: level,
        actionRequired: level === 'high' ? 'Review and issue a warning memo' : 'Monitor — below memo threshold',
        flag,
      });
      audit.log({
        organization: flag.organization,
        actorType: 'system',
        actorLabel: triggeredBy,
        action: 'compliance.red_flag_raised',
        outcome: 'flagged',
        targetType: 'red_flag',
        target: flag._id,
        metadata: { uid: flag.uid, missed, missedPct, riskLevel: level, windowDays: cfg.windowDays },
      });
      if (cfg.autoIssueMemo && level === 'high') {
        await issueMemo({ flagId: flag._id, auto: true, by: 'System (auto rule)' });
        memosAutoGenerated += 1;
      }
    } else {
      const wasHigh = openFlag.riskLevel === 'high';
      Object.assign(openFlag, flagFields);
      if (level === 'high') openFlag.riskLevel = 'high'; // never de-escalate an open flag's level
      await openFlag.save();
      if (!wasHigh && level === 'high') {
        escalated += 1;
        await notify({
          type: 'red_flag_escalated',
          title: `Escalated to HIGH RISK: ${openFlag.studentName || openFlag.uid}`,
          message:
            `${openFlag.studentName || 'Employee'} (${openFlag.uid || '—'}) now has ${missed} missed ` +
            `checkouts in ${cfg.windowDays} days — crossed the high-risk threshold (${cfg.highMissedCount}).`,
          riskLevel: 'high',
          actionRequired: 'Review and issue a warning memo',
          flag: openFlag,
        });
        if (cfg.autoIssueMemo) {
          const existing = await ComplianceMemo.countDocuments({ redFlag: openFlag._id });
          if (!existing) {
            await issueMemo({ flagId: openFlag._id, auto: true, by: 'System (auto rule)' });
            memosAutoGenerated += 1;
          }
        }
      }
    }
  }

  // Students with an open flag but NO check-ins in the current window fell out
  // of the result set entirely — their compliance is normal now; close them.
  const seen = new Set(rows.map((r) => String(r._id)));
  const orphanFlags = await CheckoutRedFlag.find({ status: { $in: ['active', 'memo_issued'] } }).select('student');
  for (const f of orphanFlags) {
    if (!seen.has(String(f.student))) {
      await CheckoutRedFlag.updateOne(
        { _id: f._id },
        {
          $set: {
            status: 'resolved',
            resolvedAt: new Date(),
            resolvedBy: 'System',
            resolutionNote: 'Auto-resolved: no attendance activity in the current analysis window.',
          },
        }
      );
      autoResolved += 1;
    }
  }

  // Drop snapshot rows not refreshed by this run (student had no activity).
  await CheckoutComplianceRecord.deleteMany({ analyzedAt: { $lt: startedAt } });

  return {
    analyzedAt: startedAt,
    windowDays: cfg.windowDays,
    employeesAnalyzed: rows.length,
    flagged,
    escalated,
    autoResolved,
    memosAutoGenerated,
  };
}

/* ───────────────────────── memos ───────────────────────── */

// ANUVADINI/AC/<year>/<seq> — unique index on referenceNumber + retry handles the
// (super-admin-only, so effectively nil) concurrency window.
async function nextReferenceNumber() {
  const year = new Date().getFullYear();
  const prefix = `ANUVADINI/AC/${year}/`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await ComplianceMemo.countDocuments({ referenceNumber: new RegExp(`^${prefix.replace(/\//g, '\\/')}`) });
    const ref = `${prefix}${String(count + 1 + attempt).padStart(4, '0')}`;
    const clash = await ComplianceMemo.exists({ referenceNumber: ref });
    if (!clash) return ref;
  }
  return `${prefix}${Date.now()}`; // unreachable in practice
}

/**
 * Generate a warning memo from a red flag. Manual issue ('issued' immediately)
 * or auto rule ('pending' until the super admin reviews it).
 */
async function issueMemo({ flagId, by = 'Anuvadini Super Admin', warningMessage = null, auto = false }) {
  const flag = await CheckoutRedFlag.findById(flagId);
  if (!flag) throw new Error('Red flag not found');

  const referenceNumber = await nextReferenceNumber();
  const status = auto ? 'pending' : 'issued';
  const now = new Date();

  const memo = await ComplianceMemo.create({
    referenceNumber,
    redFlag: flag._id,
    student: flag.student,
    organization: flag.organization,
    organizationName: flag.organizationName,
    studentName: flag.studentName,
    uid: flag.uid,
    department: flag.department,
    designation: flag.designation,
    issueType: 'Repeated Missing Checkout Attendance',
    violationCount: flag.missedCount,
    violationDates: flag.violationDates,
    attendanceSummary: {
      windowDays: flag.windowDays,
      totalCheckIns: flag.totalCheckIns,
      missedCheckouts: flag.missedCount,
      missedPct: flag.missedPct,
      riskLevel: flag.riskLevel,
    },
    warningMessage:
      warningMessage ||
      DEFAULT_WARNING({ violationCount: flag.missedCount, windowDays: flag.windowDays }),
    issuedBy: 'Anuvadini Super Admin',
    issuedAt: auto ? null : now,
    autoGenerated: auto,
    status,
    statusHistory: [{ status, by, at: now }],
  });

  flag.status = 'memo_issued';
  await flag.save();

  await notify({
    type: auto ? 'memo_pending' : 'memo_issued',
    title: auto
      ? `Memo auto-generated (pending review): ${memo.referenceNumber}`
      : `Memo issued: ${memo.referenceNumber}`,
    message:
      `${memo.issueType} — ${memo.studentName || 'Employee'} (${memo.uid || '—'}), ` +
      `${memo.violationCount} violation(s) in ${memo.attendanceSummary.windowDays} days.`,
    riskLevel: flag.riskLevel,
    actionRequired: auto ? 'Review and issue the pending memo' : null,
    flag,
    memo,
  });
  audit.log({
    organization: memo.organization,
    actorType: 'system',
    actorLabel: by,
    action: auto ? 'compliance.memo_auto_generated' : 'compliance.memo_issued',
    outcome: 'info',
    targetType: 'memo',
    target: memo._id,
    metadata: { referenceNumber, uid: memo.uid, violationCount: memo.violationCount, auto },
  });

  return memo;
}

/* ───────────────────────── notifications ───────────────────────── */

async function notify({ type, title, message, riskLevel = null, actionRequired = null, flag = null, memo = null }) {
  try {
    await ComplianceNotification.create({
      type,
      title,
      message,
      riskLevel,
      actionRequired,
      student: flag?.student || memo?.student || null,
      studentName: flag?.studentName || memo?.studentName || null,
      uid: flag?.uid || memo?.uid || null,
      organization: flag?.organization || memo?.organization || null,
      organizationName: flag?.organizationName || memo?.organizationName || null,
      redFlag: flag?._id || null,
      memo: memo?._id || null,
    });
  } catch (e) {
    console.error('[compliance] notification write failed:', e.message);
  }
}

/* ───────────────────────── dashboard data ───────────────────────── */

/** Overview cards + chart series for the module's landing tab. */
async function overview({ organization = null } = {}) {
  const cfg = await ComplianceConfig.get();
  const { start, end } = analysisWindow(cfg.windowDays);
  const orgMatch = organization ? { organization: new mongoose.Types.ObjectId(String(organization)) } : {};

  const [totalEmployees, sums, missingCases, activeFlags, pendingMemos, resolvedCases, riskDist, daily] =
    await Promise.all([
      Student.countDocuments({ isActive: true, ...(organization ? { organization } : {}) }),
      CheckoutComplianceRecord.aggregate([
        { $match: orgMatch },
        { $group: { _id: null, checkIns: { $sum: '$totalCheckIns' }, missed: { $sum: '$missedCheckouts' } } },
      ]),
      CheckoutComplianceRecord.countDocuments({ ...(organization ? { organization } : {}), missedCheckouts: { $gt: 0 } }),
      CheckoutRedFlag.countDocuments({ ...(organization ? { organization } : {}), status: { $in: ['active', 'memo_issued'] } }),
      ComplianceMemo.countDocuments({ ...(organization ? { organization } : {}), status: { $in: ['pending', 'issued'] } }),
      CheckoutRedFlag.countDocuments({ ...(organization ? { organization } : {}), status: 'resolved' }),
      CheckoutComplianceRecord.aggregate([
        { $match: orgMatch },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
      ]),
      // Day-by-day check-ins vs missed checkouts across the window (trend chart).
      Attendance.aggregate([
        {
          $match: {
            timestamp: { $gte: start, $lt: end },
            type: { $in: ['in', 'out'] },
            ...orgMatch,
          },
        },
        {
          $group: {
            _id: {
              student: '$student',
              day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: localTzOffset() } },
            },
            hasIn: { $max: { $cond: [{ $eq: ['$type', 'in'] }, 1, 0] } },
            hasOut: { $max: { $cond: [{ $eq: ['$type', 'out'] }, 1, 0] } },
          },
        },
        { $match: { hasIn: 1 } },
        {
          $group: {
            _id: '$_id.day',
            checkIns: { $sum: 1 },
            missed: { $sum: { $cond: [{ $eq: ['$hasOut', 0] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

  const checkIns = sums[0]?.checkIns || 0;
  const missed = sums[0]?.missed || 0;
  const topOffenders = await CheckoutComplianceRecord.find({ ...(organization ? { organization } : {}), missedCheckouts: { $gt: 0 } })
    .sort({ missedCheckouts: -1, missedPct: -1 })
    .limit(8)
    .select('studentName uid missedCheckouts totalCheckIns missedPct riskLevel')
    .lean();

  const dist = { normal: 0, warning: 0, high: 0 };
  riskDist.forEach((r) => { if (r._id in dist) dist[r._id] = r.count; });

  return {
    config: {
      warnMissedCount: cfg.warnMissedCount,
      highMissedCount: cfg.highMissedCount,
      windowDays: cfg.windowDays,
      autoIssueMemo: cfg.autoIssueMemo,
    },
    cards: {
      totalEmployees,
      compliancePct: checkIns ? Math.round((1 - missed / checkIns) * 1000) / 10 : 100,
      missingCheckoutCases: missingCases,
      activeRedFlags: activeFlags,
      pendingMemos,
      resolvedCases,
    },
    charts: {
      riskDistribution: [
        { level: 'normal', label: 'Normal', count: dist.normal },
        { level: 'warning', label: 'Warning', count: dist.warning },
        { level: 'high', label: 'High Risk', count: dist.high },
      ],
      dailyTrend: daily.map((d) => ({ date: d._id, checkIns: d.checkIns, missed: d.missed })),
      topOffenders: topOffenders.map((t) => ({
        name: t.studentName || t.uid || '—',
        uid: t.uid,
        missed: t.missedCheckouts,
        total: t.totalCheckIns,
        pct: t.missedPct,
        riskLevel: t.riskLevel,
      })),
    },
  };
}

module.exports = {
  runAnalysis,
  issueMemo,
  overview,
  aggregateMissedCheckouts,
  analysisWindow,
  DEFAULT_WARNING,
};
