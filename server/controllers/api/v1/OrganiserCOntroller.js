const Model_cheakoutRequest = require("../../../models/Model_cheakoutRequest");
const Model_LeaveRequest = require("../../../models/Model_LeaveRequest");
const Attendance = require("../../../models/Attendance");
const Student = require("../../../models/Student");
const mongoose = require("mongoose");

// this function return all leave request of students of a particular organiser
const OrganiserController = async (req, res) => {
  const orgId = req.organization?._id; // comes from your auth middleware
  console.log('[OrganiserController] org present:', !!req.organization, 'orgId:', orgId);
  if (!orgId) {
    console.warn('[OrganiserController] Missing req.organization');
  }

  // Aggregate to join LeaveRequest with Student and filter by organization by mogodb even before fetching

  const pipeline = [
    {
      $lookup: {
        from: "students",
        localField: "student",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: "$student" },
    { $match: { "student.organization": orgId, status: { $ne: "cancelled" } } },
    {
      $lookup: {
        from: "students",
        localField: "delegate",
        foreignField: "_id",
        as: "delegate",
      },
    },
    { $unwind: { path: "$delegate", preserveNullAndEmptyArrays: true } },
  ];

  // HOD: restrict to their own department members.
  if (req.isHod && req.hodDepartment) {
    pipeline.push({ $match: { "student.department": req.hodDepartment } });
  }

  // Optional: filter by a specific student id if provided
  const studentIdParam = (req.query?.studentId || "").toString().trim();
  if (studentIdParam) {
    try {
      const studentObjectId = new mongoose.Types.ObjectId(studentIdParam);
      pipeline.push({ $match: { "student._id": studentObjectId } });
    } catch (e) {
      console.warn('[OrganiserController] invalid studentId query param:', studentIdParam);
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({
    $project: {
      leaveDetails: 1,
      leaveDates: 1,
      status: 1,
      reson: 1,
      reason: 1,
      description: 1,
      comments: 1,
      leaveTypeCode: 1,
      leaveTypeName: 1,
      isEmergency: 1,
      dayPortion: 1,
      halfDayType: 1,
      contactNumber: 1,
      addressDuringLeave: 1,
      expectedReturnDate: 1,
      totalDays: 1,
      createdAt: 1,
      updatedAt: 1,
      "attachments._id": 1,
      "attachments.originalName": 1,
      "attachments.mimeType": 1,
      "attachments.size": 1,
      "attachments.category": 1,
      "student.fullName": 1,
      "student.email": 1,
      "student.uid": 1,
      "student._id": 1,
      "delegate.fullName": 1,
      "delegate.uid": 1,
      "delegate.designation": 1,
      "delegate._id": 1,
    },
  });

  const allRequests = await Model_LeaveRequest.aggregate(pipeline);

  console.log('[OrganiserController] count:', allRequests.length);

  return res.json(allRequests);
};

// This function returns leave requests for the CALLER'S organization only
// (HOD callers further restricted to their own department). Despite the name
// ("all"), this must never span organizations — it previously had no org
// filter at all, which meant any logged-in org/HOD token could read every
// other institution's leave requests. Fixed to mirror OrganiserController's
// scoping above.
const getAllLeaveRequests = async (req, res) => {
  try {
    const orgId = req.organization?._id;
    console.log('[getAllLeaveRequests] called. user present:', !!req.user, 'org present:', !!req.organization);
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const pipeline = [
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      { $match: { "student.organization": orgId, status: { $ne: "cancelled" } } },
      {
        $lookup: {
          from: "students",
          localField: "delegate",
          foreignField: "_id",
          as: "delegate",
        },
      },
      { $unwind: { path: "$delegate", preserveNullAndEmptyArrays: true } },
    ];

    // HOD: restrict to their own department members.
    if (req.isHod && req.hodDepartment) {
      pipeline.push({ $match: { "student.department": req.hodDepartment } });
    }

    const studentIdParam = (req.query?.studentId || "").toString().trim();
    if (studentIdParam) {
      try {
        const studentObjectId = new mongoose.Types.ObjectId(studentIdParam);
        pipeline.push({ $match: { "student._id": studentObjectId } });
      } catch (e) {
        console.warn('[getAllLeaveRequests] invalid studentId query param:', studentIdParam);
      }
    }

    pipeline.push({ $project: {
      leaveDetails: 1,
      leaveDates: 1,
      status: 1,
      reson: 1,
      reason: 1,
      description: 1,
      comments: 1,
      leaveTypeCode: 1,
      leaveTypeName: 1,
      isEmergency: 1,
      dayPortion: 1,
      halfDayType: 1,
      contactNumber: 1,
      addressDuringLeave: 1,
      expectedReturnDate: 1,
      totalDays: 1,
      createdAt: 1,
      updatedAt: 1,
      "attachments._id": 1,
      "attachments.originalName": 1,
      "attachments.mimeType": 1,
      "attachments.size": 1,
      "attachments.category": 1,
      "student.fullName": 1,
      "student.email": 1,
      "student.uid": 1,
      "student._id": 1,
      "delegate.fullName": 1,
      "delegate.uid": 1,
      "delegate.designation": 1,
      "delegate._id": 1,
    } });
    pipeline.push({ $sort: { createdAt: -1 } });

    const allRequests = await Model_LeaveRequest.aggregate(pipeline);
    console.log('[getAllLeaveRequests] count:', allRequests.length);
    if (allRequests.length > 0) {
      console.log('[getAllLeaveRequests] first doc id:', allRequests[0]._id, 'status:', allRequests[0].status);
    }
    return res.json({ success: true, data: allRequests });
  } catch (err) {
    console.error("[getAllLeaveRequests] Error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

const updateLeaveRequestStatusController = async (req, res) => {
  const id = req.params.id;
  console.log("id", id);
  const { status, reson } = req.body;
  try {
    const validStatuses = ["approved", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const leaverequest = await Model_LeaveRequest.findById(id).populate('student');

    if (!leaverequest) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    if (req.isHod && req.hodDepartment) {
      if (!leaverequest.student || leaverequest.student.department !== req.hodDepartment) {
        return res.status(403).json({ message: "Access denied. Student not in your department." });
      }
    }

    leaverequest.status = status;
    leaverequest.reson = reson;
    await leaverequest.save();

    // Auto-reflect the decision in attendance (SAACMS Module 4).
    let leaveMark = null;
    try {
      const leaveAttendanceService = require("../../../services/leaveAttendanceService");
      const audit = require("../../../services/auditService");
      if (status === "approved") {
        leaveMark = await leaveAttendanceService.markApprovedLeave(leaverequest);
        // Clear any unapproved-absence flags now covered by this approved leave
        // (handles retroactive approval after the absence cron already ran).
        if (leaverequest.leaveDates && leaverequest.leaveDates.start && leaverequest.leaveDates.end) {
          const AbsenceFlag = require("../../../models/AbsenceFlag");
          const ds = new Date(leaverequest.leaveDates.start);
          ds.setHours(0, 0, 0, 0);
          const de = new Date(leaverequest.leaveDates.end);
          de.setHours(23, 59, 59, 999);
          await AbsenceFlag.deleteMany({
            student: leaverequest.student,
            date: { $gte: ds, $lte: de },
          });
        }
      } else if (status === "rejected") {
        // Undo any previously auto-marked leave days if it is now rejected.
        leaveMark = await leaveAttendanceService.clearLeaveMarks(leaverequest._id);
      }
      audit.log(
        audit.fromReq(req, {
          action: "leave.status_updated",
          outcome: status === "approved" ? "success" : "info",
          targetType: "leave",
          target: leaverequest._id,
          metadata: { status, student: String(leaverequest.student), leaveMark },
        })
      );
    } catch (markErr) {
      console.error("[updateLeaveRequestStatus] auto-mark failed:", markErr.message);
      // Do not fail the approval if the auto-mark has an issue.
    }

    // Notify the requester of the decision (best-effort; never fail the update).
    try {
      const pushNotificationService = require("../../../services/pushNotificationService");
      const approved = status === "approved";
      await pushNotificationService.sendNotificationToStudent(
        leaverequest.student,
        {
          title: approved ? "Leave approved" : "Leave rejected",
          body: approved
            ? "Your leave request has been approved."
            : `Your leave request was rejected${reson ? `: ${reson}` : "."}`,
        },
        { type: approved ? "leave_approved" : "leave_rejected", leaveId: String(leaverequest._id) }
      );
    } catch (notifyErr) {
      console.error("[updateLeaveRequestStatus] push failed:", notifyErr.message);
    }

    res.json({ message: "Leave request status updated", leaverequest, leaveMark });
  } catch (err) {
    console.error("Error updating leave request status:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const updateCheakoutRequestStatusController = async (req, res) => {
  const { id } = req.params;
  console.log("id", id);
  const { status, reson, reason } = req.body;
  const rejectionNote = reson || reason || "";
  try {
    const validStatuses = ["approved", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const cheakoutRequest = await Model_cheakoutRequest.findById(id).populate('student');

    if (!cheakoutRequest) {
      return res.status(404).json({ message: "Checkout request not found" });
    }

    if (req.isHod && req.hodDepartment) {
      if (!cheakoutRequest.student || cheakoutRequest.student.department !== req.hodDepartment) {
        return res.status(403).json({ message: "Access denied. Student not in your department." });
      }
    }

    cheakoutRequest.status = status;
    cheakoutRequest.reson = rejectionNote;
    await cheakoutRequest.save();

    const studentObj = cheakoutRequest.student;
    const studentId = studentObj?._id || studentObj;

    // If approved, create an 'out' attendance at 6:00 PM for that date (if not already present)
    if (status === "approved") {
      try {
        const student = studentObj?._id ? studentObj : (await Student.findById(studentId));
        if (!student) {
          console.warn("[updateCheakoutRequestStatus] student not found for request", id);
        } else {
          // Build day bounds from request date
          const dayStart = new Date(cheakoutRequest.date);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(cheakoutRequest.date);
          dayEnd.setHours(23, 59, 59, 999);

          // Check if an 'out' already exists for that day
          const existingOut = await Attendance.findOne({
            student: student._id,
            type: 'out',
            timestamp: { $gte: dayStart, $lte: dayEnd },
          });

          if (!existingOut) {
            const checkoutTime = new Date(cheakoutRequest.date);
            checkoutTime.setHours(18, 0, 0, 0); // 6:00 PM local server time

            const attendance = new Attendance({
              student: student._id,
              organization: student.organization,
              type: 'out',
              timestamp: checkoutTime,
              latitude: 0,
              longitude: 0,
              distance: 0,
              faceVerified: false,
              faceImage: null,
              authMethod: 'manual',
              status: 'success',
            });
            await attendance.save();
          }
        }
      } catch (err) {
        console.error("[updateCheakoutRequestStatus] failed to create 6PM checkout attendance:", err);
        // Continue; do not fail the status update due to attendance creation error
      }
    }

    // Notify the requester of the decision (best-effort; never fail the update).
    try {
      if (studentId) {
        const pushNotificationService = require("../../../services/pushNotificationService");
        const approved = status === "approved";
        await pushNotificationService.sendNotificationToStudent(
          studentId,
          {
            title: approved ? "Check-out approved" : "Check-out rejected",
            body: approved
              ? "Your check-out request has been approved."
              : `Your check-out request was rejected${rejectionNote ? `: ${rejectionNote}` : "."}`,
          },
          { type: approved ? "checkout_approved" : "checkout_rejected", checkoutId: String(cheakoutRequest._id) }
        );
      }
    } catch (notifyErr) {
      console.error("[updateCheakoutRequestStatus] push failed:", notifyErr.message);
    }

    res.json({ message: "Checkout request status updated", cheakoutRequest });
  } catch (err) {
    console.error("Error updating checkout request status:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getcheakOutrequest = async (req, res) => {
  try {
    const orgId = req.organization?._id;
    const studentId = req.student?._id;

    if (!orgId && !studentId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    console.log("[getcheakOutrequest] orgId:", orgId, "studentId:", studentId);

    const pipeline = [
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
    ];

    if (orgId) {
      pipeline.push({ $match: { "student.organization": orgId, status: { $ne: "cancelled" } } });
    }
    if (req.isHod && req.hodDepartment) {
      pipeline.push({ $match: { "student.department": req.hodDepartment } });
    }
    // Self-scope ONLY for a pure faculty/staff token (no org context). An HOD
    // also has req.student set, but must see the whole department, not just self.
    if (studentId && !orgId) {
      pipeline.push({ $match: { "student._id": studentId } });
    }

    pipeline.push({
      $project: {
        date: 1,
        details: 1,
        evidence: 1,
        status: 1,
        reson: 1,
        createdAt: 1,
        updatedAt: 1,
        "student.fullName": 1,
        "student.email": 1,
        "student.uid": 1,
        "student._id": 1,
      },
    });
    pipeline.push({ $sort: { createdAt: -1 } });

    const allCheakoutrequests = await Model_cheakoutRequest.aggregate(pipeline);
    console.log("[getcheakOutrequest] count:", allCheakoutrequests.length);

    return res.json(allCheakoutrequests);
  } catch (err) {
    console.error("[getcheakOutrequest] Error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// Get approved leave and WFH requests
const getApprovedLeaveAndWFHRequests = async (req, res) => {
  try {
    console.log('[getApprovedLeaveAndWFHRequests] called. user present:', !!req.user, 'org present:', !!req.organization);
    
    const orgId = req.organization?._id;
    
    const pipeline = [
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "students",
          localField: "delegate",
          foreignField: "_id",
          as: "delegate",
        },
      },
      { $unwind: { path: "$delegate", preserveNullAndEmptyArrays: true } },
      // Filter for approved status only
      { $match: { status: "approved" } }
    ];

    // Filter by organization if available
    if (orgId) {
      pipeline.push({ $match: { "student.organization": orgId } });
    }
    if (req.isHod && req.hodDepartment) {
      pipeline.push({ $match: { "student.department": req.hodDepartment } });
    }

    const studentIdParam = (req.query?.studentId || "").toString().trim();
    if (studentIdParam) {
      try {
        const studentObjectId = new mongoose.Types.ObjectId(studentIdParam);
        pipeline.push({ $match: { "student._id": studentObjectId } });
      } catch (e) {
        console.warn('[getApprovedLeaveAndWFHRequests] invalid studentId query param:', studentIdParam);
      }
    }

    pipeline.push({ 
      $project: {
        leaveDetails: 1,
        leaveDates: 1,
        status: 1,
        reson: 1,
        createdAt: 1,
        updatedAt: 1,
        "student.fullName": 1,
        "student.email": 1,
        "student.uid": 1,
        "student._id": 1,
        "delegate.fullName": 1,
        "delegate.uid": 1,
        "delegate.designation": 1,
        "delegate._id": 1,
        // Add a field to categorize as WFH or regular leave
        requestType: {
          $cond: {
            if: { $regexMatch: { input: "$leaveDetails", regex: /^\[WFH\]/i } },
            then: "WFH",
            else: "Leave"
          }
        }
      } 
    });
    
    pipeline.push({ $sort: { createdAt: -1 } });

    const allRequests = await Model_LeaveRequest.aggregate(pipeline);
    
    // Separate WFH and regular leave requests
    const wfhRequests = allRequests.filter(req => req.requestType === "WFH");
    const leaveRequests = allRequests.filter(req => req.requestType === "Leave");
    
    console.log('[getApprovedLeaveAndWFHRequests] total count:', allRequests.length, 'WFH:', wfhRequests.length, 'Leave:', leaveRequests.length);
    
    return res.json({ 
      success: true, 
      data: {
        wfhRequests,
        leaveRequests,
        total: allRequests.length
      }
    });
  } catch (err) {
    console.error("[getApprovedLeaveAndWFHRequests] Error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

module.exports = {
  OrganiserController,
  updateLeaveRequestStatusController,
  getcheakOutrequest,
  updateCheakoutRequestStatusController,
  getAllLeaveRequests,
  getApprovedLeaveAndWFHRequests,
};
