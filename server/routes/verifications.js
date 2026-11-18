const express = require('express');
const auth = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');
const resolveOrgId = require('../utils/resolveOrg');
const { deptScopeIds } = require('../utils/deptScope');

const router = express.Router();

const ACTIONS = [
  'attendance.face_verify',
  'attendance.liveness',
  'attendance.marked',
  'spot_check.missed',
];

const EVENT_LABEL = {
  'attendance.face_verify': 'Face verification',
  'attendance.liveness': 'Liveness check',
  'attendance.marked': 'Check-in / out',
  'spot_check.missed': 'Spot-check',
};

function toRow(doc) {
  const m = doc.metadata || {};
  const time = new Date(doc.at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  let face = null;
  if (typeof m.score === 'number') face = m.score;
  else if (typeof m.verificationScore === 'number') face = m.verificationScore;

  let liveness = '—';
  let livenessNote = '';
  if (doc.action === 'attendance.liveness') {
    liveness = m.passed ? 'passed' : 'failed';
    livenessNote = Array.isArray(m.reasons) ? m.reasons.join(', ') : '';
  } else if (doc.action === 'spot_check.missed') {
    liveness = 'timeout';
    livenessNote = 'spot-check window expired without response';
  } else if (doc.action === 'attendance.marked') {
    liveness = m.faceVerified ? 'passed' : '—';
  } else if (doc.action === 'attendance.face_verify') {
    liveness = '—';
    livenessNote = m.reason || '';
  }

  let gps = '—';
  if (doc.action === 'attendance.marked') {
    gps = m.mocked ? 'mocked' : 'verified';
  }

  const failed = doc.outcome === 'failure';
  const flagged = doc.outcome === 'flagged' || doc.action === 'spot_check.missed';
  let risk;
  if (failed) risk = face != null ? Math.round(100 - face * 100) : 85;
  else if (flagged) risk = 55;
  else risk = face != null ? Math.max(1, Math.round((1 - face) * 30)) : 5;

  return {
    id: doc._id,
    time,
    at: doc.at,
    staff: doc.actorLabel || 'Unknown',
    event: EVENT_LABEL[doc.action] || doc.action,
    action: doc.action,
    face,
    liveness,
    livenessNote,
    gps,
    tamper: doc.action === 'attendance.face_verify' && failed ? 'suspect' : doc.action === 'attendance.marked' ? 'clean' : '—',
    risk: Math.max(0, Math.min(100, risk)),
    decision: failed ? 'rejected' : flagged ? 'flagged' : 'accepted',
  };
}

// @route   GET /api/verifications?date=YYYY-MM-DD
// @desc    All verification attempts adjudicated on a day (from the audit log)
router.get('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);

    // HOD: only audit entries whose actor is a department member.
    const scope = await deptScopeIds(req);
    const q = { organization, action: { $in: ACTIONS }, at: { $gte: start, $lte: end } };
    if (scope) q.actor = { $in: scope };
    const docs = await AuditLog.find(q)
      .sort({ at: -1 })
      .limit(300)
      .lean();

    return res.json({ success: true, date, attempts: docs.map(toRow) });
  } catch (err) {
    console.error('[Verifications] list error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
