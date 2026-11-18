const express = require('express');
const router = express.Router();
const ComplianceMemo = require('../models/ComplianceMemo');
const audit = require('../services/auditService');
const auth = require('../middleware/auth');

// Employee-facing view of warning memos issued against them. 'pending' memos
// are drafts the super admin hasn't sent yet (see ComplianceMemo model /
// SuperAdminAttendanceCompliance.js "Issue Memo" flow) so they're excluded —
// the employee only ever sees a memo once an admin has actually issued it.
router.get('/my-memos', auth, async (req, res) => {
  try {
    const memos = await ComplianceMemo.find({
      student: req.user._id,
      status: { $in: ['issued', 'acknowledged', 'closed'] },
    }).sort({ issuedAt: -1, createdAt: -1 });
    res.json({ success: true, memos });
  } catch (error) {
    console.error('Get My Memos Error:', error);
    res.status(500).json({ error: 'Failed to fetch memos.' });
  }
});

// Employee acknowledges a memo they've read. Only moves issued -> acknowledged;
// the admin still owns closing it out.
router.post('/:id/acknowledge', auth, async (req, res) => {
  try {
    const memo = await ComplianceMemo.findById(req.params.id);
    if (!memo) return res.status(404).json({ error: 'Memo not found.' });
    if (String(memo.student) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (memo.status !== 'issued') {
      return res.status(400).json({ error: `Memo is already ${memo.status}.` });
    }

    memo.status = 'acknowledged';
    memo.statusHistory.push({ status: 'acknowledged', by: req.user.fullName || req.user.uid || 'Employee', at: new Date() });
    await memo.save();

    audit.log({
      organization: memo.organization,
      actorType: 'student',
      actor: req.user._id,
      actorLabel: req.user.fullName || req.user.uid,
      action: 'compliance.memo_acknowledged',
      outcome: 'success',
      targetType: 'memo',
      target: memo._id,
      metadata: { referenceNumber: memo.referenceNumber },
    });

    res.json({ success: true, memo });
  } catch (error) {
    console.error('Acknowledge Memo Error:', error);
    res.status(500).json({ error: 'Failed to acknowledge memo.' });
  }
});

module.exports = router;
