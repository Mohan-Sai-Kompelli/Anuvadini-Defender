const express = require('express');
const auth = require('../middleware/auth');
const audit = require('../services/auditService');

const router = express.Router();

function resolveOrgId(req) {
  if (req.organization) return req.organization._id;
  if (req.student) return req.student.organization;
  if (req.user && req.user.role === 'organization') return req.user.id;
  return null;
}

// @route   GET /api/audit
// @desc    Query the audit trail (org-scoped, paginated, newest first).
// @access  Private (organization)
// @query   action, actorType, actor, outcome, targetType, from, to, page, limit
router.get('/', auth, async (req, res) => {
  try {
    // Only organization accounts may read the audit trail.
    if (!req.organization && !(req.user && req.user.role === 'organization')) {
      return res.status(403).json({ success: false, error: 'Organization access required' });
    }
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }

    const result = await audit.query({
      organization,
      action: req.query.action,
      actorType: req.query.actorType,
      actor: req.query.actor,
      outcome: req.query.outcome,
      targetType: req.query.targetType,
      from: req.query.from,
      to: req.query.to,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json(result);
  } catch (err) {
    console.error('[Audit] query error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
