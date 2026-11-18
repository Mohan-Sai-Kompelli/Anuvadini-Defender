// Super Admin auth — Anuvadini network-wide access across ALL organizations.
// The token is issued by /api/portal/login for the "superadmin" identity and
// carries { sa: true }. No org/student lookup is involved.
const jwt = require('jsonwebtoken');
const sessionService = require('../services/sessionService');

module.exports = async function superAdminAuth(req, res, next) {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (await sessionService.isLoggedOutEveryone(decoded)) return res.status(401).json({ success: false, code: 'logged_out_everyone', message: sessionService.LOGGED_OUT_EVERYONE_MESSAGE });
    if (!decoded || decoded.sa !== true) {
      return res.status(403).json({ success: false, error: 'Super admin access required' });
    }
    // Single active session: only the LATEST super-admin login stays valid; a
    // newer login answers 401 'session_terminated' with the security message.
    if (!(await sessionService.enforceOrReject(decoded, res))) return;
    req.superAdmin = true;
    return next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ success: false, error: 'Invalid token' });
    if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, error: 'Token expired' });
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};
