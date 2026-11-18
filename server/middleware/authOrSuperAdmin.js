// Accepts a normal org/student token (via the standard `auth` middleware) OR a
// super-admin token.
//
// For a super-admin token there are two modes:
//   • "view as institute" — an `x-view-org` (or ?asOrg=) header is present, so we
//     scope the request to that organization exactly like the `auth` middleware
//     does, and enforce READ-ONLY (any non-GET is rejected). This keeps the
//     compliance endpoints institute-scoped while the super admin browses an org.
//   • network-wide — no target org, so no org context is attached and downstream
//     all-organization queries run across the whole network (Compliance view).
const jwt = require('jsonwebtoken');
const auth = require('./auth');
const Organization = require('../models/Organization');
const sessionService = require('../services/sessionService');

module.exports = async function authOrSuperAdmin(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (await sessionService.isLoggedOutEveryone(decoded)) return res.status(401).json({ success: false, code: 'logged_out_everyone', message: sessionService.LOGGED_OUT_EVERYONE_MESSAGE });
      if (decoded && decoded.sa === true) {
        // Single-active-session check (latest super-admin login only).
        if (!(await sessionService.enforceOrReject(decoded, res))) return;
        const viewOrgId = req.header('x-view-org') || req.query.asOrg;
        if (viewOrgId) {
          // Read-only institute view — block every mutation.
          const isTriggerSpotCheck = req.method === 'POST' && req.originalUrl.split('?')[0].replace(/\/$/, '') === '/api/spot-checks/trigger';
          if (req.method !== 'GET' && !isTriggerSpotCheck) {
            return res.status(403).json({ message: 'Super admin institute view is read-only.' });
          }
          const viewOrg = await Organization.findById(viewOrgId).select('-password');
          if (!viewOrg) {
            return res.status(404).json({ message: 'Institute not found.' });
          }
          req.organization = viewOrg;
          req.user = viewOrg;
          req.isSuperAdminView = true;
          return next();
        }
        // No target org → network-wide super-admin context.
        req.superAdmin = true;
        return next();
      }
    } catch (e) {
      // not a valid super-admin token — fall through to normal auth
    }
  }
  return auth(req, res, next);
};
