const express = require('express');
const Router = express.Router();
const Student = require('../models/Student');
const auth = require('../middleware/auth');
const { deptScopeIds } = require('../utils/deptScope');
const pushNotificationService = require('../services/pushNotificationService');

// Get all students for WFH assignment
Router.get('/students', auth, async (req, res) => {
  try {
    const { search, class: className, department, bureau, page = 1, limit = 50 } = req.query;

    const query = {
      organization: req.organization._id,
      isActive: true
    };

    // HOD: only their department's members.
    const scope = await deptScopeIds(req);
    if (scope) query._id = { $in: scope };

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { uid: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (className) query.class = className;
    if (department) query.department = department;
    if (bureau) query.bureau = bureau;
    
    const skip = (page - 1) * limit;
    
    const students = await Student.find(query)
      .select('fullName uid email class department bureau wfhAssignments')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ fullName: 1 });
    
    const total = await Student.countDocuments(query);
    
    // Add current WFH status to each student
    const studentsWithWFH = students.map(student => ({
      ...student.toObject(),
      hasActiveWFH: student.hasActiveWFH(),
      currentWFHAssignment: student.getCurrentWFHAssignment()
    }));
    
    res.json({
      success: true,
      data: {
        students: studentsWithWFH,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          count: students.length,
          totalStudents: total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching students for WFH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message
    });
  }
});

// Assign WFH to multiple students
Router.post('/assign', auth, async (req, res) => {
  try {
    const { studentIds, startDate, endDate, reason } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Student IDs are required'
      });
    }
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'End date cannot be before start date'
      });
    }
    
    const wfhAssignment = {
      startDate: start,
      endDate: end,
      reason: reason || 'Work from home assignment',
      assignedBy: req.user._id,
      assignedAt: new Date(),
      isActive: true
    };
    
    // Update all selected students
    const result = await Student.updateMany(
      { 
        _id: { $in: studentIds },
        organization: req.organization._id 
      },
      { 
        $push: { wfhAssignments: wfhAssignment },
        $set: { WFH: 'WFH allowed' } // Update legacy field for compatibility
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No students found'
      });
    }
    
    // Get updated student details
    const updatedStudents = await Student.find({
      _id: { $in: studentIds },
      organization: req.organization._id
    }).select('fullName uid email');
    
    // Send push notifications to assigned students
    try {
      const pushNotificationService = require('../services/pushNotificationService');
      await pushNotificationService.sendWFHAssignedNotification(studentIds, {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        reason: reason || 'Work from home assignment'
      });
      console.log(`Push notifications sent for WFH assignment to ${studentIds.length} students`);
    } catch (notificationError) {
      console.error('Failed to send push notifications:', notificationError);
      // Don't fail the request if notifications fail
    }
    
    res.json({
      success: true,
      message: `WFH assigned to ${result.modifiedCount} students`,
      data: {
        assignedCount: result.modifiedCount,
        students: updatedStudents,
        assignment: wfhAssignment
      }
    });
  } catch (error) {
    console.error('Error assigning WFH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign WFH',
      error: error.message
    });
  }
});

// Remove WFH assignment from students
Router.post('/remove', auth, async (req, res) => {
  try {
    const { studentIds, assignmentId } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({
        success: false,
        message: 'Student IDs are required'
      });
    }
    
    let updateQuery;
    if (assignmentId) {
      // Remove specific assignment
      updateQuery = {
        $set: { 'wfhAssignments.$[elem].isActive': false }
      };
    } else {
      // Deactivate all current assignments
      updateQuery = {
        $set: { 
          'wfhAssignments.$[elem].isActive': false,
          WFH: 'NO' // Update legacy field
        }
      };
    }
    
    const result = await Student.updateMany(
      { 
        _id: { $in: studentIds },
        organization: req.organization._id 
      },
      updateQuery,
      {
        arrayFilters: assignmentId 
          ? [{ 'elem._id': assignmentId, 'elem.isActive': true }]
          : [{ 'elem.isActive': true }]
      }
    );
    
    // Send push notifications to students whose WFH was removed
    try {
      const pushNotificationService = require('../services/pushNotificationService');
      await pushNotificationService.sendWFHRemovedNotification(
        studentIds, 
        'WFH assignment has been removed by administrator'
      );
      console.log(`Push notifications sent for WFH removal to ${studentIds.length} students`);
    } catch (notificationError) {
      console.error('Failed to send push notifications:', notificationError);
      // Don't fail the request if notifications fail
    }
    
    res.json({
      success: true,
      message: `WFH removed from ${result.modifiedCount} students`,
      data: { removedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error removing WFH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove WFH',
      error: error.message
    });
  }
});

// Get WFH assignments summary
Router.get('/summary', auth, async (req, res) => {
  try {
    const now = new Date();

    // HOD scope (null for Admin).
    const scope = await deptScopeIds(req);
    const stuScope = scope ? { _id: { $in: scope } } : {};
    const reqScope = scope ? { student: { $in: scope } } : {};

    // Get students with WFH assignments (existing system)
    const allStudentsWithWFH = await Student.find({
      organization: req.organization._id,
      ...stuScope,
      isActive: true,
      wfhAssignments: { $exists: true, $ne: [] }
    }).select('fullName uid wfhAssignments');
    
    console.log('[WFH Summary] Students with WFH assignments:', allStudentsWithWFH.length);
    
    // Get active WFH assignments
    const studentsWithActiveWFH = [];
    
    for (const student of allStudentsWithWFH) {
      const activeAssignments = student.wfhAssignments.filter(assignment => {
        const isActive = assignment.isActive;
        const startDate = new Date(assignment.startDate);
        const endDate = new Date(assignment.endDate);
        const isInDateRange = startDate <= now && endDate >= now;
        
        return isActive && isInDateRange;
      });
      
      if (activeAssignments.length > 0) {
        studentsWithActiveWFH.push({
          _id: student._id,
          fullName: student.fullName,
          uid: student.uid,
          email: student.email,
          class: student.class,
          department: student.department,
          bureau: student.bureau,
          currentAssignment: activeAssignments[0]
        });
      }
    }
    
    // Also get active WFH requests from new system
    const WFHRequest = require('../models/WFHRequest');
    const activeWFHRequests = await WFHRequest.find({
      organization: req.organization._id,
      ...reqScope,
      status: 'approved',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).populate('student', 'fullName uid email class department bureau');
    
    console.log('[WFH Summary] Active WFH requests from new system:', activeWFHRequests.length);
    
    // Combine both systems (avoid duplicates by student ID)
    const combinedActiveWFH = [...studentsWithActiveWFH];
    const existingStudentIds = new Set(studentsWithActiveWFH.map(s => s._id.toString()));
    
    for (const request of activeWFHRequests) {
      if (!existingStudentIds.has(request.student._id.toString())) {
        combinedActiveWFH.push({
          _id: request.student._id,
          fullName: request.student.fullName,
          uid: request.student.uid,
          email: request.student.email,
          class: request.student.class,
          department: request.student.department,
          bureau: request.student.bureau,
          currentAssignment: {
            startDate: request.startDate,
            endDate: request.endDate,
            reason: request.reason,
            assignedAt: request.createdAt
          }
        });
      }
    }
    
    console.log('[WFH Summary] Combined active WFH students:', combinedActiveWFH.length);
    
    // Get assignments ending soon (within 3 days)
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const endingSoon = [];
    for (const student of allStudentsWithWFH) {
      const endingAssignments = student.wfhAssignments.filter(assignment => {
        const isActive = assignment.isActive;
        const endDate = new Date(assignment.endDate);
        const isEndingSoon = endDate >= now && endDate <= threeDaysFromNow;
        return isActive && isEndingSoon;
      });
      
      if (endingAssignments.length > 0) {
        endingSoon.push({
          _id: student._id,
          fullName: student.fullName,
          uid: student.uid,
          endingAssignments
        });
      }
    }
    
    // Also check new system for ending soon
    const endingSoonRequests = await WFHRequest.find({
      organization: req.organization._id,
      ...reqScope,
      status: 'approved',
      endDate: { $gte: now, $lte: threeDaysFromNow }
    }).populate('student', 'fullName uid');
    
    for (const request of endingSoonRequests) {
      const existingIndex = endingSoon.findIndex(s => s._id.toString() === request.student._id.toString());
      if (existingIndex === -1) {
        endingSoon.push({
          _id: request.student._id,
          fullName: request.student.fullName,
          uid: request.student.uid,
          endingAssignments: [{
            startDate: request.startDate,
            endDate: request.endDate,
            reason: request.reason
          }]
        });
      }
    }
    
    console.log('[WFH Summary] Found assignments ending soon:', endingSoon.length);
    
    // Format for dashboard modal compatibility
    const wfhRequests = combinedActiveWFH.map(student => ({
      _id: student._id,
      student: {
        fullName: student.fullName,
        uid: student.uid,
        email: student.email,
        class: student.class,
        department: student.department,
        bureau: student.bureau
      },
      leaveDetails: `[WFH] ${student.currentAssignment?.reason || 'Work from home assignment'}`,
      leaveDates: {
        start: student.currentAssignment?.startDate,
        end: student.currentAssignment?.endDate
      },
      status: 'approved',
      createdAt: student.currentAssignment?.assignedAt
    }));
    
    console.log('[WFH Summary] Formatted WFH requests for dashboard:', wfhRequests.length);
    
    const responseData = {
      activeWFHCount: combinedActiveWFH.length,
      activeWFHStudents: combinedActiveWFH,
      endingSoonCount: endingSoon.length,
      endingSoon,
      summary: {
        totalActive: combinedActiveWFH.length,
        endingIn3Days: endingSoon.length
      },
      wfhRequests
    };
    
    console.log('[WFH Summary] Sending response:', {
      activeWFHCount: responseData.activeWFHCount,
      wfhRequestsCount: responseData.wfhRequests.length
    });
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('[WFH Summary] Error getting WFH summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WFH summary',
      error: error.message
    });
  }
});

// Debug endpoint to manually create test WFH assignment
Router.post('/debug/create-test', auth, async (req, res) => {
  try {
    const { studentId } = req.body;
    
    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }
    
    const student = await Student.findOne({
      _id: studentId,
      organization: req.organization._id
    });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Create a test WFH assignment for today
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0); // Start of today
    
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 7); // End in 7 days
    endDate.setHours(23, 59, 59, 999); // End of day
    
    const testAssignment = {
      startDate,
      endDate,
      reason: 'Test WFH assignment created via debug endpoint',
      assignedBy: req.user._id,
      assignedAt: new Date(),
      isActive: true
    };
    
    student.wfhAssignments.push(testAssignment);
    student.WFH = 'WFH allowed'; // Also set legacy field
    
    await student.save();
    
    console.log('[WFH Debug] Created test assignment for:', student.fullName);
    console.log('[WFH Debug] Assignment:', testAssignment);
    
    res.json({
      success: true,
      message: `Test WFH assignment created for ${student.fullName}`,
      data: {
        student: {
          _id: student._id,
          fullName: student.fullName,
          uid: student.uid
        },
        assignment: testAssignment,
        hasActiveWFH: student.hasActiveWFH(),
        currentAssignment: student.getCurrentWFHAssignment()
      }
    });
  } catch (error) {
    console.error('[WFH Debug] Error creating test assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test assignment',
      error: error.message
    });
  }
});

// Debug endpoint to check student WFH assignments
Router.get('/debug/students', auth, async (req, res) => {
  try {
    const students = await Student.find({
      organization: req.organization._id,
      isActive: true
    }).select('fullName uid wfhAssignments WFH').limit(10);
    
    console.log('[WFH Debug] Found students:', students.length);
    
    const studentsWithWFH = students.map(student => ({
      _id: student._id,
      fullName: student.fullName,
      uid: student.uid,
      legacyWFH: student.WFH,
      wfhAssignments: student.wfhAssignments,
      hasActiveWFH: student.hasActiveWFH ? student.hasActiveWFH() : false,
      currentAssignment: student.getCurrentWFHAssignment ? student.getCurrentWFHAssignment() : null
    }));
    
    res.json({
      success: true,
      data: {
        students: studentsWithWFH,
        totalStudents: students.length,
        studentsWithAssignments: studentsWithWFH.filter(s => s.wfhAssignments && s.wfhAssignments.length > 0).length,
        studentsWithActiveWFH: studentsWithWFH.filter(s => s.hasActiveWFH).length
      }
    });
  } catch (error) {
    console.error('[WFH Debug] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
});

// Get WFH status for a specific student or current user
Router.get('/status/:studentId?', auth, async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;
    
    const student = await Student.findOne({
      _id: studentId,
      organization: req.organization._id
    });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    const hasActiveWFH = student.hasActiveWFH();
    const currentAssignment = student.getCurrentWFHAssignment();
    
    res.json({
      success: true,
      data: {
        hasActiveWFH,
        currentAssignment: currentAssignment ? {
          startDate: currentAssignment.startDate,
          endDate: currentAssignment.endDate,
          reason: currentAssignment.reason,
          assignedBy: currentAssignment.assignedBy,
          assignedAt: currentAssignment.assignedAt
        } : null,
        legacyWFH: student.WFH // For backward compatibility
      }
    });
  } catch (error) {
    console.error('Error getting WFH status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WFH status',
      error: error.message
    });
  }
});

module.exports = Router;