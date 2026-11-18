const jwt = require('jsonwebtoken');
const Organization = require('../models/Organization');
const Student = require('../models/Student');
const sessionService = require('../services/sessionService');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.', code: 'no_token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (await sessionService.isLoggedOutEveryone(decoded)) return res.status(401).json({ success: false, code: 'logged_out_everyone', message: sessionService.LOGGED_OUT_EVERYONE_MESSAGE });

    // Super Admin "view as institute" — lets the Anuvadini super admin browse ANY
    // organization's Admin data through the normal org-scoped endpoints. The target
    // org rides in the `x-view-org` header (or ?asOrg=). This is READ-ONLY: any
    // non-GET is rejected, so the super admin can look at everything but change
    // nothing. (The token carries { sa:true } and has no org/student of its own.)
    if (decoded.sa === true) {
      // Single-active-session check: a super-admin token is only good while
      // its session is the LATEST login (a newer login answers 401 with
      // code 'session_terminated' + the security message).
      if (!(await sessionService.enforceOrReject(decoded, res))) return;
      const viewOrgId = req.header('x-view-org') || req.query.asOrg;
      if (!viewOrgId) {
        return res.status(400).json({ message: 'Super admin must select an institute to view (x-view-org).' });
      }
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

    // Try to find organization first
    let organization = await Organization.findById(decoded.id).select('-password');
    
    if (organization) {
      if (!organization.isActive) {
        return res.status(401).json({ message: 'Account is deactivated.', code: 'account_deactivated' });
      }
      // Organization (Admin/admin) = admin role → the session must still be the
      // latest login. Tokens minted before this feature carry no sid and are
      // rejected too (they could never be remotely invalidated) — the owner
      // simply logs in once more.
      if (!(await sessionService.enforceOrReject(decoded, res))) return;
      req.organization = organization;
      req.user = organization; // For backward compatibility
      return next();
    }
    
    // If not organization, try to find student
    let student = await Student.findById(decoded.id).select('-password');

    if (student) {
      if (!student.isActive) {
        return res.status(401).json({ message: 'Account is deactivated.', code: 'account_deactivated' });
      }
      // Student-id tokens are only session-checked when they CARRY a session
      // (an admin-type web-portal login, e.g. HOD). Faculty/student tokens —
      // including every mobile-app login — have no sid and pass untouched.
      if (decoded.sid && !(await sessionService.enforceOrReject(decoded, res))) return;
      req.student = student;
      req.user = student; // For backward compatibility

      // HOD web sessions: they use the FULL Admin dashboard, so promote them to
      // an organization context (org-scoped endpoints expect req.organization)
      // and flag the department so endpoints can restrict to it. Faculty/staff
      // are NOT promoted — they only hit /api/portal/my/* (self) endpoints.
      if (student.role === 'hod' && student.organization) {
        const org = await Organization.findById(student.organization).select('-password');
        if (org) {
          req.organization = org;
          req.isHod = true;
          req.hodDepartment = student.department || null;
        }
      }
      return next();
    }
    
    // If neither found, token is invalid
    return res.status(401).json({ message: 'Invalid token.', code: 'invalid_token' });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.', code: 'invalid_token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.', code: 'token_expired' });
    }
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = auth; 