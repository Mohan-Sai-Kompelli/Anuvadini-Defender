// Department scoping for HOD web sessions.
//
// An HOD logs in with a Student token but is shown the FULL Admin dashboard.
// Every org-scoped data endpoint must then be restricted to the members of the
// HOD's own department. This helper resolves (and memoises on the request) the
// set of student _ids that belong to the HOD's department.
//
//   const scope = await deptScopeIds(req);
//   if (scope) query.student = { $in: scope };   // HOD → department only
//                                                 // Admin → scope is null (no-op)
//
// For Admin/organization tokens it returns null, so callers keep their exact
// existing org-wide behaviour (zero regression).

const Student = require('../models/Student');

async function deptScopeIds(req) {
  if (req._deptScopeResolved) return req._deptScope;
  req._deptScopeResolved = true;

  if (req.isHod && req.hodDepartment && req.organization) {
    const members = await Student.find({
      organization: req.organization._id,
      department: req.hodDepartment,
    }).select('_id');
    req._deptScope = members.map((m) => m._id);
  } else {
    req._deptScope = null; // organization-wide (Admin) — no scoping
  }
  return req._deptScope;
}

// The HOD's department name (or null for Admin).
function deptScopeName(req) {
  return req.isHod && req.hodDepartment ? req.hodDepartment : null;
}

module.exports = { deptScopeIds, deptScopeName };
