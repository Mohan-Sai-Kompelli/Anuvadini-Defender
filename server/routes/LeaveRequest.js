const express = require('express');
const Router = express.Router();
const StudentController = require('../controllers/api/v1/StudentController');
const OrganiserController = require('../controllers/api/v1/OrganiserCOntroller')
const passport = require('../config/passport') ;


const auth = require("../middleware/auth");
// Introspection endpoint to verify routes are mounted in production
Router.get('/leaves/_introspect', (req, res) => {
  res.json({ success: true, routes: [
    'POST /leave-request',
    'POST /leaves/apply',
    'GET  /leaves/my',
    'POST /leave/apply',
    'GET  /leave/my',
    'GET  /get-leave-requests (organiser)',
    'PUT  /leave-requests/update-status/:id (organiser)',
    'GET  /leave-requests/all (organiser)',
  ]});
});


// Legacy student leave request endpoint
Router.post(
  "/leave-request",
  passport.authenticate("jwt", { session: false }),
  StudentController.LeaveRequestController
);

// New student endpoints for mobile client
Router.post(
  "/leaves/apply",
  passport.authenticate("jwt", { session: false }),
  StudentController.applyLeaveV2
);

Router.get(
  "/leaves/my",
  passport.authenticate("jwt", { session: false }),
  StudentController.getMyLeaveRequests
);

// Colleagues (same org + department) the logged-in faculty/staff can name as
// a leave delegate — "who covers my work while I'm on leave".
Router.get(
  "/leaves/colleagues",
  passport.authenticate("jwt", { session: false }),
  StudentController.getDepartmentColleagues
);

// Aliases to support singular path used by some clients
Router.post(
  "/leave/apply",
  passport.authenticate("jwt", { session: false }),
  StudentController.applyLeaveV2
);

Router.get(
  "/leave/my",
  passport.authenticate("jwt", { session: false }),
  StudentController.getMyLeaveRequests
);

// Cancel your own pending leave request — only within 1 hour of submitting it.
Router.delete(
  "/leaves/:id",
  passport.authenticate("jwt", { session: false }),
  StudentController.cancelMyLeaveRequest
);
Router.delete(
  "/leave/:id",
  passport.authenticate("jwt", { session: false }),
  StudentController.cancelMyLeaveRequest
);


// Organiser endpoints
Router.get(
  "/get-leave-requests",
  auth,
  OrganiserController.OrganiserController
);

Router.put(
  "/leave-requests/update-status/:id",
  auth,
  OrganiserController.updateLeaveRequestStatusController
);

// Admin/debug: fetch ALL leave requests across DB
Router.get(
  "/leave-requests/all",
  auth,
  OrganiserController.getAllLeaveRequests
);

// Get approved leave and WFH requests
Router.get(
  "/leave-requests/approved",
  auth,
  OrganiserController.getApprovedLeaveAndWFHRequests
);

module.exports = Router;