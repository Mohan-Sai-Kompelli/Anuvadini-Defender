// Attendance Compliance (checkout-miss monitoring) — Anuvadini Super Admin module.
// Mounted at /api/superadmin/checkout-compliance (see server/index.js).
// Everything here is super-admin only and read-only over Attendance itself.

const express = require('express');
const mongoose = require('mongoose');
const superAdminAuth = require('../middleware/superAdminAuth');
const compliance = require('../services/checkoutComplianceService');
const ComplianceConfig = require('../models/ComplianceConfig');
const CheckoutComplianceRecord = require('../models/CheckoutComplianceRecord');
const CheckoutRedFlag = require('../models/CheckoutRedFlag');
const ComplianceMemo = require('../models/ComplianceMemo');
const ComplianceNotification = require('../models/ComplianceNotification');
const Attendance = require('../models/Attendance');
const audit = require('../services/auditService');

const router = express.Router();
router.use(superAdminAuth);

const pageParams = (req, def = 25) => ({
  page: Math.max(1, parseInt(req.query.page, 10) || 1),
  pageSize: Math.min(100, Math.max(5, parseInt(req.query.pageSize, 10) || def)),
});

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ─────────── overview (cards + charts) ─────────── */
router.get('/overview', async (req, res) => {
  try {
    const data = await compliance.overview({ organization: req.query.instituteId || null });
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error('[checkout-compliance/overview]', err);
    return res.status(500).json({ success: false, error: 'Failed to load compliance overview' });
  }
});

/* ─────────── run the analysis on demand ─────────── */
router.post('/analyze', async (req, res) => {
  try {
    const summary = await compliance.runAnalysis({ triggeredBy: 'Anuvadini Super Admin (manual)' });
    audit.log({
      actorType: 'system',
      actorLabel: 'Anuvadini Super Admin',
      action: 'compliance.analysis_run',
      outcome: 'success',
      targetType: 'compliance',
      metadata: summary,
    });
    return res.json({ success: true, summary });
  } catch (err) {
    console.error('[checkout-compliance/analyze]', err);
    return res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

/* ─────────── per-employee compliance table ─────────── */
router.get('/records', async (req, res) => {
  try {
    const { page, pageSize } = pageParams(req);
    const match = {};
    if (req.query.instituteId) match.organization = req.query.instituteId;
    if (['normal', 'warning', 'high'].includes(req.query.risk)) match.riskLevel = req.query.risk;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      match.$or = [{ studentName: rx }, { uid: rx }, { department: rx }];
    }

    const sortable = {
      name: 'studentName',
      missed: 'missedCheckouts',
      pct: 'missedPct',
      checkins: 'totalCheckIns',
      last: 'lastMissedDate',
      risk: 'riskLevel',
    };
    const sortField = sortable[req.query.sort] || 'missedCheckouts';
    const sortDir = req.query.dir === 'asc' ? 1 : -1;

    const [total, rows] = await Promise.all([
      CheckoutComplianceRecord.countDocuments(match),
      CheckoutComplianceRecord.find(match)
        .sort({ [sortField]: sortDir, _id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate('organization', 'name')
        .lean(),
    ]);

    return res.json({
      success: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map((r) => ({
        id: r._id,
        studentId: r.student,
        name: r.studentName || '—',
        uid: r.uid || '',
        department: r.department || '',
        designation: r.designation || '',
        institute: r.organization?.name || '—',
        windowDays: r.windowDays,
        totalCheckIns: r.totalCheckIns,
        missedCheckouts: r.missedCheckouts,
        missedPct: r.missedPct,
        lastMissedDate: r.lastMissedDate,
        riskLevel: r.riskLevel,
        analyzedAt: r.analyzedAt,
      })),
    });
  } catch (err) {
    console.error('[checkout-compliance/records]', err);
    return res.status(500).json({ success: false, error: 'Failed to load compliance records' });
  }
});

/* ─────────── red flags ─────────── */
router.get('/red-flags', async (req, res) => {
  try {
    const { page, pageSize } = pageParams(req);
    const match = {};
    if (req.query.instituteId) match.organization = req.query.instituteId;
    if (['active', 'memo_issued', 'resolved'].includes(req.query.status)) match.status = req.query.status;
    else if (req.query.status === 'open') match.status = { $in: ['active', 'memo_issued'] };
    if (['warning', 'high'].includes(req.query.risk)) match.riskLevel = req.query.risk;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      match.$or = [{ studentName: rx }, { uid: rx }, { department: rx }];
    }

    const [total, rows] = await Promise.all([
      CheckoutRedFlag.countDocuments(match),
      CheckoutRedFlag.find(match)
        .sort({ status: 1, riskScore: -1, updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    return res.json({
      success: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows,
    });
  } catch (err) {
    console.error('[checkout-compliance/red-flags]', err);
    return res.status(500).json({ success: false, error: 'Failed to load red flags' });
  }
});

// Full detail for one flag: violation picture + attendance history of the
// window (day-by-day in/out) + memos already issued for this employee.
router.get('/red-flags/:id', async (req, res) => {
  try {
    const flag = await CheckoutRedFlag.findById(req.params.id).lean();
    if (!flag) return res.status(404).json({ success: false, error: 'Red flag not found' });

    const { start, end } = compliance.analysisWindow(flag.windowDays || 30);
    const [dayRows, memos, previousFlags] = await Promise.all([
      Attendance.aggregate([
        {
          $match: {
            student: new mongoose.Types.ObjectId(String(flag.student)),
            timestamp: { $gte: start, $lt: end },
            type: { $in: ['in', 'out'] },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            firstIn: { $min: { $cond: [{ $eq: ['$type', 'in'] }, '$timestamp', null] } },
            lastOut: { $max: { $cond: [{ $eq: ['$type', 'out'] }, '$timestamp', null] } },
            hasIn: { $max: { $cond: [{ $eq: ['$type', 'in'] }, 1, 0] } },
            hasOut: { $max: { $cond: [{ $eq: ['$type', 'out'] }, 1, 0] } },
          },
        },
        { $match: { hasIn: 1 } },
        { $sort: { _id: -1 } },
      ]),
      ComplianceMemo.find({ student: flag.student }).sort({ createdAt: -1 }).lean(),
      CheckoutRedFlag.find({ student: flag.student, _id: { $ne: flag._id } })
        .sort({ createdAt: -1 })
        .select('riskLevel status missedCount windowDays createdAt resolvedAt resolutionNote')
        .lean(),
    ]);

    return res.json({
      success: true,
      flag,
      attendanceDays: dayRows.map((d) => ({
        date: d._id,
        checkIn: d.firstIn,
        checkOut: d.lastOut,
        missedCheckout: d.hasOut === 0,
      })),
      memos,
      previousFlags,
    });
  } catch (err) {
    console.error('[checkout-compliance/red-flag]', err);
    return res.status(500).json({ success: false, error: 'Failed to load red flag' });
  }
});

// Issue a warning memo from a flag (manual — memo is 'issued' immediately).
router.post('/red-flags/:id/memo', async (req, res) => {
  try {
    const memo = await compliance.issueMemo({
      flagId: req.params.id,
      by: 'Anuvadini Super Admin',
      warningMessage: typeof req.body?.warningMessage === 'string' && req.body.warningMessage.trim()
        ? req.body.warningMessage.trim().slice(0, 4000)
        : null,
      auto: false,
    });
    return res.json({ success: true, memo });
  } catch (err) {
    console.error('[checkout-compliance/issue-memo]', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to issue memo' });
  }
});

router.post('/red-flags/:id/resolve', async (req, res) => {
  try {
    const flag = await CheckoutRedFlag.findById(req.params.id);
    if (!flag) return res.status(404).json({ success: false, error: 'Red flag not found' });
    if (flag.status === 'resolved') return res.json({ success: true, flag });
    flag.status = 'resolved';
    flag.resolvedAt = new Date();
    flag.resolvedBy = 'Anuvadini Super Admin';
    flag.resolutionNote = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) || null : null;
    await flag.save();
    audit.log({
      organization: flag.organization,
      actorType: 'system',
      actorLabel: 'Anuvadini Super Admin',
      action: 'compliance.red_flag_resolved',
      outcome: 'success',
      targetType: 'red_flag',
      target: flag._id,
      metadata: { uid: flag.uid, note: flag.resolutionNote },
    });
    return res.json({ success: true, flag });
  } catch (err) {
    console.error('[checkout-compliance/resolve]', err);
    return res.status(500).json({ success: false, error: 'Failed to resolve red flag' });
  }
});

router.post('/red-flags/:id/remarks', async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1000) : '';
    if (!text) return res.status(400).json({ success: false, error: 'Remark text is required' });
    const flag = await CheckoutRedFlag.findByIdAndUpdate(
      req.params.id,
      { $push: { remarks: { text, by: 'Anuvadini Super Admin', at: new Date() } } },
      { new: true }
    );
    if (!flag) return res.status(404).json({ success: false, error: 'Red flag not found' });
    return res.json({ success: true, remarks: flag.remarks });
  } catch (err) {
    console.error('[checkout-compliance/remarks]', err);
    return res.status(500).json({ success: false, error: 'Failed to add remark' });
  }
});

/* ─────────── memos ─────────── */
router.get('/memos', async (req, res) => {
  try {
    const { page, pageSize } = pageParams(req);
    const match = {};
    if (['pending', 'issued', 'acknowledged', 'closed'].includes(req.query.status)) match.status = req.query.status;
    if (req.query.instituteId) match.organization = req.query.instituteId;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      match.$or = [{ studentName: rx }, { uid: rx }, { referenceNumber: rx }];
    }

    const [total, counts, rows] = await Promise.all([
      ComplianceMemo.countDocuments(match),
      ComplianceMemo.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      ComplianceMemo.find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    const byStatus = { pending: 0, issued: 0, acknowledged: 0, closed: 0 };
    counts.forEach((c) => { if (c._id in byStatus) byStatus[c._id] = c.count; });

    return res.json({
      success: true,
      total,
      byStatus,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows,
    });
  } catch (err) {
    console.error('[checkout-compliance/memos]', err);
    return res.status(500).json({ success: false, error: 'Failed to load memos' });
  }
});

router.get('/memos/:id', async (req, res) => {
  try {
    const memo = await ComplianceMemo.findById(req.params.id).lean();
    if (!memo) return res.status(404).json({ success: false, error: 'Memo not found' });
    return res.json({ success: true, memo });
  } catch (err) {
    console.error('[checkout-compliance/memo]', err);
    return res.status(500).json({ success: false, error: 'Failed to load memo' });
  }
});

// Move a memo along its lifecycle: pending → issued → acknowledged → closed.
router.post('/memos/:id/status', async (req, res) => {
  try {
    const next = String(req.body?.status || '');
    const ORDER = ['pending', 'issued', 'acknowledged', 'closed'];
    if (!ORDER.includes(next)) return res.status(400).json({ success: false, error: 'Invalid status' });
    const memo = await ComplianceMemo.findById(req.params.id);
    if (!memo) return res.status(404).json({ success: false, error: 'Memo not found' });
    if (ORDER.indexOf(next) < ORDER.indexOf(memo.status)) {
      return res.status(400).json({ success: false, error: `Cannot move a ${memo.status} memo back to ${next}` });
    }
    if (next !== memo.status) {
      memo.status = next;
      if (next === 'issued' && !memo.issuedAt) memo.issuedAt = new Date();
      memo.statusHistory.push({ status: next, by: 'Anuvadini Super Admin', at: new Date() });
      await memo.save();
      audit.log({
        organization: memo.organization,
        actorType: 'system',
        actorLabel: 'Anuvadini Super Admin',
        action: 'compliance.memo_status_changed',
        outcome: 'success',
        targetType: 'memo',
        target: memo._id,
        metadata: { referenceNumber: memo.referenceNumber, status: next },
      });
    }
    return res.json({ success: true, memo });
  } catch (err) {
    console.error('[checkout-compliance/memo-status]', err);
    return res.status(500).json({ success: false, error: 'Failed to update memo status' });
  }
});

/* ─────────── configuration ─────────── */
router.get('/config', async (req, res) => {
  try {
    const cfg = await ComplianceConfig.get();
    return res.json({ success: true, config: cfg });
  } catch (err) {
    console.error('[checkout-compliance/config]', err);
    return res.status(500).json({ success: false, error: 'Failed to load configuration' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const cfg = await ComplianceConfig.get();
    const num = (v, min, max, fallback) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    };
    cfg.warnMissedCount = num(req.body?.warnMissedCount, 1, 100, cfg.warnMissedCount);
    cfg.highMissedCount = num(req.body?.highMissedCount, 1, 100, cfg.highMissedCount);
    if (cfg.highMissedCount < cfg.warnMissedCount) cfg.highMissedCount = cfg.warnMissedCount;
    cfg.windowDays = num(req.body?.windowDays, 7, 365, cfg.windowDays);
    if (typeof req.body?.autoIssueMemo === 'boolean') cfg.autoIssueMemo = req.body.autoIssueMemo;
    cfg.updatedBy = 'Anuvadini Super Admin';
    await cfg.save();
    audit.log({
      actorType: 'system',
      actorLabel: 'Anuvadini Super Admin',
      action: 'compliance.config_updated',
      outcome: 'success',
      targetType: 'compliance',
      metadata: {
        warnMissedCount: cfg.warnMissedCount,
        highMissedCount: cfg.highMissedCount,
        windowDays: cfg.windowDays,
        autoIssueMemo: cfg.autoIssueMemo,
      },
    });
    return res.json({ success: true, config: cfg });
  } catch (err) {
    console.error('[checkout-compliance/config-update]', err);
    return res.status(500).json({ success: false, error: 'Failed to update configuration' });
  }
});

/* ─────────── notifications ─────────── */
router.get('/notifications', async (req, res) => {
  try {
    const { page, pageSize } = pageParams(req, 20);
    const match = req.query.unread === 'true' ? { read: false } : {};
    const [total, unread, rows] = await Promise.all([
      ComplianceNotification.countDocuments(match),
      ComplianceNotification.countDocuments({ read: false }),
      ComplianceNotification.find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);
    return res.json({
      success: true,
      total,
      unread,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows,
    });
  } catch (err) {
    console.error('[checkout-compliance/notifications]', err);
    return res.status(500).json({ success: false, error: 'Failed to load notifications' });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((i) => mongoose.isValidObjectId(i)) : null;
    await ComplianceNotification.updateMany(ids ? { _id: { $in: ids } } : { read: false }, { $set: { read: true } });
    return res.json({ success: true });
  } catch (err) {
    console.error('[checkout-compliance/notifications-read]', err);
    return res.status(500).json({ success: false, error: 'Failed to mark notifications read' });
  }
});

module.exports = router;
