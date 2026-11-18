const AuditLog = require('../models/AuditLog');

/**
 * AuditService — single entry point for writing/querying the audit trail.
 *
 * `log()` is FIRE-AND-FORGET and never throws: auditing must never break the
 * action it records. Callers may `await` it but a failure is swallowed (logged
 * to console) so the request still succeeds.
 */
class AuditService {
  /**
   * Append an audit entry.
   * @param {Object} e {
   *   organization, actorType, actor, actorLabel,
   *   action (required), outcome, targetType, target, metadata, ip
   * }
   * @returns {Promise<Object|null>} the saved doc, or null on failure
   */
  async log(e) {
    try {
      if (!e || !e.action) return null;
      const doc = await AuditLog.create({
        organization: e.organization || null,
        actorType: e.actorType || 'system',
        actor: e.actor || null,
        actorLabel: e.actorLabel || null,
        action: e.action,
        outcome: e.outcome || 'info',
        targetType: e.targetType || null,
        target: e.target || null,
        metadata: e.metadata || null,
        ip: e.ip || null,
        at: e.at || new Date(),
      });
      return doc;
    } catch (err) {
      // Never let auditing failures bubble into the request path.
      console.error('[Audit] failed to write entry:', err.message);
      return null;
    }
  }

  /** Convenience: pull actor identity + ip off an Express req. */
  fromReq(req, extra = {}) {
    const base = {
      ip: req.headers?.['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || null,
    };
    if (req.student) {
      base.actorType = 'student';
      base.actor = req.student._id;
      base.actorLabel = req.student.fullName || req.student.uid;
      base.organization = req.student.organization;
    } else if (req.organization) {
      base.actorType = 'organization';
      base.actor = req.organization._id;
      base.actorLabel = req.organization.name || req.organization.email;
      base.organization = req.organization._id;
    }
    return { ...base, ...extra };
  }

  /**
   * Query the audit trail (org-scoped, paginated, newest first).
   * @param {Object} filters { organization, action, actorType, actor, outcome,
   *                           targetType, from, to, page, limit }
   */
  async query(filters = {}) {
    const q = {};
    if (filters.organization) q.organization = filters.organization;
    if (filters.action) q.action = filters.action;
    if (filters.actorType) q.actorType = filters.actorType;
    if (filters.actor) q.actor = filters.actor;
    if (filters.outcome) q.outcome = filters.outcome;
    if (filters.targetType) q.targetType = filters.targetType;
    if (filters.from || filters.to) {
      q.at = {};
      if (filters.from) q.at.$gte = new Date(filters.from);
      if (filters.to) q.at.$lte = new Date(filters.to);
    }

    const page = Math.max(1, parseInt(filters.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit || '50', 10)));
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      AuditLog.find(q).sort({ at: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(q),
    ]);

    return {
      success: true,
      entries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }
}

module.exports = new AuditService();
