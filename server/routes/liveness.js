const express = require('express');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const livenessService = require('../services/livenessService');

const router = express.Router();

// @route   POST /api/liveness/challenge
// @desc    Issue a server-signed, randomized liveness challenge bound to a
//          single-use nonce. The app performs the prompted actions and submits
//          the evidence with the attendance mark (adjudicated server-side).
// @access  Private (student/staff)
router.post(
  '/challenge',
  auth,
  rateLimit({ windowMs: 60 * 1000, max: 20 }),
  async (req, res) => {
    try {
      if (!req.student) {
        return res.status(403).json({ success: false, error: 'Staff token required' });
      }
      const challenge = livenessService.issueChallenge(req.student._id);
      return res.json({ success: true, challenge });
    } catch (err) {
      console.error('[Liveness] challenge error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// @route   POST /api/liveness/verify
// @desc    Standalone adjudication (e.g. for spot-check responses). The normal
//          attendance flow adjudicates inline in /api/attendance/mark.
// @access  Private (student/staff)
router.post(
  '/verify',
  auth,
  rateLimit({ windowMs: 60 * 1000, max: 30 }),
  async (req, res) => {
    try {
      if (!req.student) {
        return res.status(403).json({ success: false, error: 'Staff token required' });
      }
      const { nonce, events } = req.body || {};
      const verdict = livenessService.adjudicate({
        nonce,
        studentId: req.student._id,
        events,
      });
      return res.json({ success: true, verdict });
    } catch (err) {
      console.error('[Liveness] verify error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
