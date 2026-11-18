// Resolve the organization id from an authenticated request
// (org token → its own id; staff token → their organization).
module.exports = function resolveOrgId(req) {
  if (req.organization) return req.organization._id;
  if (req.student) return req.student.organization;
  if (req.user && req.user.role === 'organization') return req.user.id;
  return null;
};
