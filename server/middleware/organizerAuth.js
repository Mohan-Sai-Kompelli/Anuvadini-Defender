const jwt = require('jsonwebtoken');
const Organization = require('../models/Organization');
const Student = require('../models/Student');
const sessionService = require('../services/sessionService');

const organizerAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (await sessionService.isLoggedOutEveryone(decoded)) return res.status(401).json({ success: false, code: 'logged_out_everyone', message: sessionService.LOGGED_OUT_EVERYONE_MESSAGE });

    // Super Admin: token carries { sa: true }.
    // If it is a super admin token, we find the organization from req.params.orgId, req.params.id, or x-view-org header
    // and assign it so that organization-level operations work for that institute.
    if (decoded && decoded.sa === true) {
      // Single-active-session check (latest super-admin login only).
      if (!(await sessionService.enforceOrReject(decoded, res))) return;
      req.superAdmin = true;
      const orgId = req.params.orgId || req.params.id || req.header('x-view-org');
      if (orgId) {
        const organization = await Organization.findById(orgId).select('-password');
        if (organization) {
          req.organization = organization;
          req.user = organization;
          return next();
        }
      }
      return res.status(400).json({
        success: false,
        message: 'Super admin must target a specific organization ID.'
      });
    }

    // Find organization by decoded ID
    let organization = await Organization.findById(decoded.id).select('-password');

    // Organization (Admin/admin) token → the session must still be the latest
    // login (single active session for admin roles).
    if (organization) {
      if (!(await sessionService.enforceOrReject(decoded, res))) return;
    }

    // HOD: token is a Student id. Promote to their organization context with a
    // department flag so org-admin endpoints work but stay department-scoped.
    if (!organization) {
      const student = await Student.findById(decoded.id).select('-password');
      if (student && student.role === 'hod' && student.isActive) {
        // HOD web-portal tokens carry a sid → enforce; sid-less (mobile app)
        // tokens pass untouched so attendance flows are never affected.
        if (decoded.sid && !(await sessionService.enforceOrReject(decoded, res))) return;
        organization = await Organization.findById(student.organization).select('-password');
        if (organization) {
          req.isHod = true;
          req.hodDepartment = student.department || null;
        }
      }
    }

    if (!organization) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Organization not found.'
      });
    }

    if (!organization.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. Organization account is deactivated.' 
      });
    }

    // Attach organization to request object
    req.organization = organization;
    req.user = organization; // For backward compatibility
    
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. Invalid token.' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. Token expired.' 
      });
    }
    console.error('Organizer auth error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during authentication.' 
    });
  }
};

module.exports = organizerAuth;