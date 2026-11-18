const express = require('express');
const auth = require('../middleware/auth');
const absenceService = require('../services/absenceService');

const router = express.Router();

function resolveOrgId(req) {
  if (req.organization) return req.organization._id;
  if (req.student) return req.student.organization;
  if (req.user && req.user.role === 'organization') return req.user.id;
  return null;
}

// @route   GET /api/absences?date=YYYY-MM-DD
// @desc    Admin view of today's (or a given day's) unapproved absentees
// @access  Private (organization)
router.get('/', auth, async (req, res) => {
  try {
    const organizationId = resolveOrgId(req);
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    const result = await absenceService.getAbsences(organizationId, { date: req.query.date });

    // HOD: keep only absentees from their own department.
    if (req.isHod && req.hodDepartment && result && Array.isArray(result.absentees)) {
      const dept = req.hodDepartment;
      result.absentees = result.absentees.filter((a) => (a.department || null) === dept);
      result.absentCount = result.absentees.length;
      if (typeof result.count === 'number') result.count = result.absentees.length;
    }
    return res.json(result);
  } catch (err) {
    console.error('[Absence] list error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/absences/detect
// @desc    Run unapproved-absence detection now (also runs on cron)
// @access  Private (organization)
router.post('/detect', auth, async (req, res) => {
  try {
    if (!req.organization && !(req.user && req.user.role === 'organization')) {
      return res.status(403).json({ success: false, error: 'Organization access required' });
    }
    const organizationId = resolveOrgId(req);
    const result = await absenceService.detectForOrg(organizationId, {
      date: req.body.date,
      source: 'manual',
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Absence] detect error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
