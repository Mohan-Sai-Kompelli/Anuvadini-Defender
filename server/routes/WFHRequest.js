const express = require('express');
const Router = express.Router();
const WFHRequest = require('../models/WFHRequest');
const Student = require('../models/Student');
const passport = require('../config/passport');
const auth = require("../middleware/auth");
const { deptScopeIds } = require('../utils/deptScope');

// Student endpoints for WFH requests

// Apply for WFH
Router.post(
  "/wfh/apply",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      const { startDate, endDate, reason, notes } = req.body;
      
      if (!startDate || !endDate || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Start date, end date, and reason are required'
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

      // Check for overlapping WFH requests
      const existingRequest = await WFHRequest.findOne({
        student: req.user._id,
        $or: [
          {
            startDate: { $lte: end },
            endDate: { $gte: start }
          }
        ],
        status: { $in: ['pending', 'approved'] }
      });

      if (existingRequest) {
        return res.status(409).json({
          success: false,
          message: 'You already have a WFH request covering these dates'
        });
      }

      // Get student's organization
      const student = await Student.findById(req.user._id);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      const wfhRequest = new WFHRequest({
        student: req.user._id,
        startDate: start,
        endDate: end,
        reason: reason.trim(),
        notes: notes?.trim(),
        organization: student.organization,
        status: 'pending'
      });

      await wfhRequest.save();

      console.log('[WFH Apply] Created request:', {
        studentId: req.user._id,
        startDate: start,
        endDate: end,
        reason: reason.trim()
      });

      // Send FCM notification to student confirming request submission
      try {
        const pushNotificationService = require('../services/pushNotificationService');
        
        const notificationData = {
          type: 'wfh_request_submitted',
          action: 'wfh_request_created',
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          reason: reason.trim(),
          timestamp: new Date().toISOString()
        };

        const notification = {
          title: '📝 WFH Request Submitted',
          body: `Your work from home request for ${start.toDateString()} to ${end.toDateString()} has been submitted for approval`
        };

        await pushNotificationService.sendNotificationToStudent(req.user._id, notification, notificationData);
        console.log(`[WFH Apply] Submission notification sent to student`);
      } catch (notificationError) {
        console.error('[WFH Apply] Failed to send FCM notification:', notificationError);
        // Don't fail the request if notification fails
      }

      res.status(201).json({
        success: true,
        message: 'WFH request submitted successfully',
        data: {
          request: {
            _id: wfhRequest._id,
            startDate: wfhRequest.startDate,
            endDate: wfhRequest.endDate,
            reason: wfhRequest.reason,
            notes: wfhRequest.notes,
            status: wfhRequest.status,
            days: wfhRequest.days,
            createdAt: wfhRequest.createdAt
          }
        }
      });
    } catch (error) {
      console.error('[WFH Apply] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit WFH request',
        error: error.message
      });
    }
  }
);

// Get my WFH requests
Router.get(
  "/wfh/my",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      const { status, startDate, endDate, limit = 50, page = 1 } = req.query;
      
      const query = { student: req.user._id };
      
      if (status) {
        query.status = status;
      }
      
      if (startDate || endDate) {
        query.$and = [];
        if (startDate) {
          query.$and.push({ startDate: { $gte: new Date(startDate) } });
        }
        if (endDate) {
          query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const requests = await WFHRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('reviewedBy', 'name email');

      const total = await WFHRequest.countDocuments(query);

      console.log('[WFH My] Found requests:', {
        studentId: req.user._id,
        count: requests.length,
        total
      });

      res.json({
        success: true,
        data: {
          requests: requests.map(req => ({
            _id: req._id,
            startDate: req.startDate,
            endDate: req.endDate,
            reason: req.reason,
            notes: req.notes,
            status: req.status,
            reson: req.reson, // rejection reason
            days: req.days,
            createdAt: req.createdAt,
            updatedAt: req.updatedAt,
            reviewedBy: req.reviewedBy,
            reviewedAt: req.reviewedAt
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('[WFH My] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch WFH requests',
        error: error.message
      });
    }
  }
);

// Test endpoint to verify authentication
Router.get(
  "/wfh/test-auth",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      console.log('[WFH Test Auth] User from token:', req.user);
      
      res.json({
        success: true,
        data: {
          userId: req.user._id,
          userEmail: req.user.email,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[WFH Test Auth] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Test auth failed',
        error: error.message
      });
    }
  }
);

// Get current WFH status (fallback for existing system compatibility)
Router.get(
  "/wfh/status",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      console.log('[WFH Status] Starting request for user:', req.user._id);
      
      // Basic response structure
      const response = {
        success: true,
        data: {
          hasActiveWFH: false,
          currentAssignment: null,
          legacyWFH: 'NO'
        }
      };

      // Try to find student
      let student;
      try {
        student = await Student.findById(req.user._id);
        console.log('[WFH Status] Student query result:', !!student);
      } catch (studentError) {
        console.error('[WFH Status] Error finding student:', studentError);
        return res.json(response); // Return default response
      }

      if (!student) {
        console.log('[WFH Status] Student not found, returning default');
        return res.json(response);
      }

      // Set legacy WFH status
      response.data.legacyWFH = student.WFH || 'NO';
      console.log('[WFH Status] Legacy WFH:', response.data.legacyWFH);

      // Check legacy WFH assignments (with error handling)
      let hasActiveWFH = false;
      let currentAssignment = null;
      
      try {
        if (student.wfhAssignments && Array.isArray(student.wfhAssignments)) {
          console.log('[WFH Status] Checking', student.wfhAssignments.length, 'WFH assignments');
          
          const now = new Date();
          for (const assignment of student.wfhAssignments) {
            if (assignment.isActive && 
                assignment.startDate && 
                assignment.endDate &&
                assignment.startDate <= now && 
                assignment.endDate >= now) {
              hasActiveWFH = true;
              currentAssignment = {
                startDate: assignment.startDate,
                endDate: assignment.endDate,
                reason: assignment.reason,
                assignedAt: assignment.assignedAt
              };
              break;
            }
          }
        }
        console.log('[WFH Status] Legacy WFH check result:', hasActiveWFH);
      } catch (legacyError) {
        console.error('[WFH Status] Error checking legacy WFH:', legacyError);
        // Continue with default values
      }

      // Check new WFH request system
      try {
        const now = new Date();
        
        // Find WFH requests that are active TODAY only
        // This means: startDate <= today AND endDate >= today
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        
        console.log('[WFH Status] Checking for WFH active TODAY:', {
          todayStart: todayStart.toISOString(),
          todayEnd: todayEnd.toISOString(),
          currentTime: now.toISOString()
        });
        
        // Find WFH requests that are active right now (today)
        const activeWFHRequests = await WFHRequest.find({
          student: req.user._id,
          status: 'approved',
          startDate: { $lte: todayEnd },   // Started today or before
          endDate: { $gte: todayStart }    // Ends today or after
        }).sort({ startDate: 1 }); // Earliest start date first

        console.log('[WFH Status] Found', activeWFHRequests.length, 'potentially active WFH requests');

        // Filter to only include requests that are active TODAY
        const todayActiveRequests = activeWFHRequests.filter(req => {
          const reqStart = new Date(req.startDate);
          const reqEnd = new Date(req.endDate);
          reqStart.setHours(0, 0, 0, 0);
          reqEnd.setHours(23, 59, 59, 999);
          
          // Check if today falls within the request period
          const isActiveToday = reqStart <= now && reqEnd >= now;
          
          console.log('[WFH Status] Request check:', {
            id: req._id,
            start: req.startDate.toDateString(),
            end: req.endDate.toDateString(),
            reason: req.reason,
            isActiveToday,
            startTime: reqStart.toISOString(),
            endTime: reqEnd.toISOString()
          });
          
          return isActiveToday;
        });

        console.log('[WFH Status] Filtered to', todayActiveRequests.length, 'requests active TODAY');

        let activeWFHRequest = null;
        if (todayActiveRequests.length > 0) {
          // Take the first active request for today
          activeWFHRequest = todayActiveRequests[0];
          
          console.log('[WFH Status] Selected active request for TODAY:', {
            id: activeWFHRequest._id,
            start: activeWFHRequest.startDate.toDateString(),
            end: activeWFHRequest.endDate.toDateString(),
            reason: activeWFHRequest.reason,
            days: activeWFHRequest.days
          });
        }

        if (activeWFHRequest && !hasActiveWFH) {
          hasActiveWFH = true;
          currentAssignment = {
            startDate: activeWFHRequest.startDate,
            endDate: activeWFHRequest.endDate,
            reason: activeWFHRequest.reason,
            assignedAt: activeWFHRequest.createdAt
          };
        }
      } catch (requestError) {
        console.error('[WFH Status] Error checking WFH requests:', requestError);
        // Continue with legacy values
      }

      // Set final response
      response.data.hasActiveWFH = hasActiveWFH;
      response.data.currentAssignment = currentAssignment;

      console.log('[WFH Status] Final response:', {
        hasActiveWFH: response.data.hasActiveWFH,
        hasAssignment: !!response.data.currentAssignment,
        legacyWFH: response.data.legacyWFH
      });

      res.json(response);

    } catch (error) {
      console.error('[WFH Status] Unhandled error:', error);
      
      // Return a safe default response even on error
      res.json({
        success: true,
        data: {
          hasActiveWFH: false,
          currentAssignment: null,
          legacyWFH: 'NO'
        }
      });
    }
  }
);

// Debug endpoint to check WFH data for student
Router.get(
  "/wfh/debug",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      console.log('[WFH Debug] Getting debug info for user:', req.user._id);
      
      const student = await Student.findById(req.user._id);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      // Get all WFH requests for this student
      const allWFHRequests = await WFHRequest.find({
        student: req.user._id
      }).sort({ createdAt: -1 });

      // Get active WFH requests
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      
      // All approved requests
      const allApprovedRequests = await WFHRequest.find({
        student: req.user._id,
        status: 'approved'
      }).sort({ startDate: 1 });
      
      // Requests active today
      const todayActiveRequests = await WFHRequest.find({
        student: req.user._id,
        status: 'approved',
        startDate: { $lte: todayEnd },
        endDate: { $gte: todayStart }
      }).sort({ startDate: 1 });
      
      // Filter to only those truly active today
      const actuallyActiveToday = todayActiveRequests.filter(req => {
        const reqStart = new Date(req.startDate);
        const reqEnd = new Date(req.endDate);
        reqStart.setHours(0, 0, 0, 0);
        reqEnd.setHours(23, 59, 59, 999);
        return reqStart <= now && reqEnd >= now;
      });

      // Calculate days remaining for each request
      const allWithDays = allApprovedRequests.map(req => {
        const reqEnd = new Date(req.endDate);
        reqEnd.setHours(23, 59, 59, 999);
        const daysRemaining = Math.ceil((reqEnd.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        const isActiveToday = actuallyActiveToday.some(active => active._id.toString() === req._id.toString());
        
        return {
          _id: req._id,
          startDate: req.startDate,
          endDate: req.endDate,
          status: req.status,
          reason: req.reason,
          days: req.days,
          daysRemaining: Math.max(0, daysRemaining),
          createdAt: req.createdAt,
          isActiveToday,
          isToday: req.startDate.toDateString() === now.toDateString(),
          isFuture: req.startDate > now
        };
      });

      res.json({
        success: true,
        data: {
          currentTime: now,
          currentDateString: now.toDateString(),
          todayStart: todayStart.toISOString(),
          todayEnd: todayEnd.toISOString(),
          studentId: student._id,
          studentName: student.fullName,
          legacyWFH: student.WFH,
          wfhAssignments: student.wfhAssignments || [],
          totalWFHRequests: allWFHRequests.length,
          approvedWFHRequests: allWithDays,
          activeToday: actuallyActiveToday.map(req => ({
            _id: req._id,
            startDate: req.startDate,
            endDate: req.endDate,
            reason: req.reason,
            days: req.days
          })),
          allWFHRequests: allWFHRequests.map(req => ({
            _id: req._id,
            startDate: req.startDate,
            endDate: req.endDate,
            status: req.status,
            reason: req.reason,
            days: req.days,
            createdAt: req.createdAt,
            isActive: req.status === 'approved' && req.startDate <= now && req.endDate >= now
          }))
        }
      });
    } catch (error) {
      console.error('[WFH Debug] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get debug info',
        error: error.message
      });
    }
  }
);

// Organization/Admin endpoints for WFH request management

// Get all WFH requests for organization
Router.get(
  "/wfh-requests/all",
  auth,
  async (req, res) => {
    try {
      const { status, studentId, startDate, endDate, limit = 50, page = 1 } = req.query;
      
      const query = { organization: req.organization._id };
      
      if (status) {
        query.status = status;
      }
      
      // HOD department scope restriction
      const scope = await deptScopeIds(req);
      if (scope) {
        if (studentId) {
          const scopeStr = scope.map(id => id.toString());
          if (scopeStr.includes(studentId.toString())) {
            query.student = studentId;
          } else {
            query.student = { $in: [] }; // match nothing
          }
        } else {
          query.student = { $in: scope };
        }
      } else {
        if (studentId) {
          query.student = studentId;
        }
      }
      
      if (startDate || endDate) {
        query.$and = [];
        if (startDate) {
          query.$and.push({ startDate: { $gte: new Date(startDate) } });
        }
        if (endDate) {
          query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const requests = await WFHRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('student', 'fullName uid email class department bureau')
        .populate('reviewedBy', 'name email');

      const total = await WFHRequest.countDocuments(query);

      res.json({
        success: true,
        data: {
          requests,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('[WFH All] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch WFH requests',
        error: error.message
      });
    }
  }
);

// Update WFH request status (approve/reject)
Router.put(
  "/wfh-requests/update-status/:id",
  auth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reson } = req.body;
      
      console.log('[WFH Update Status] Request:', {
        id,
        status,
        reson,
        organizationId: req.organization._id
      });
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be either approved or rejected'
        });
      }

      const scope = await deptScopeIds(req);
      const query = {
        _id: id,
        organization: req.organization._id
      };
      if (scope) {
        query.student = { $in: scope };
      }

      const wfhRequest = await WFHRequest.findOne(query).populate('student', 'fullName uid email');

      if (!wfhRequest) {
        console.log('[WFH Update Status] Request not found:', id);
        return res.status(404).json({
          success: false,
          message: 'WFH request not found'
        });
      }

      console.log('[WFH Update Status] Found request:', {
        id: wfhRequest._id,
        currentStatus: wfhRequest.status,
        studentName: wfhRequest.student?.fullName,
        startDate: wfhRequest.startDate,
        endDate: wfhRequest.endDate
      });

      if (wfhRequest.status !== 'pending') {
        console.log('[WFH Update Status] Request not pending:', {
          id: wfhRequest._id,
          currentStatus: wfhRequest.status,
          requestedStatus: status
        });
        
        // If it's already approved and we're trying to approve again, just return success
        if (wfhRequest.status === 'approved' && status === 'approved') {
          return res.json({
            success: true,
            message: 'WFH request already approved',
            data: {
              request: wfhRequest
            }
          });
        }
        
        // If it's already rejected and we're trying to reject again, just return success
        if (wfhRequest.status === 'rejected' && status === 'rejected') {
          return res.json({
            success: true,
            message: 'WFH request already rejected',
            data: {
              request: wfhRequest
            }
          });
        }
        
        return res.status(400).json({
          success: false,
          message: `Request is currently ${wfhRequest.status}. Only pending requests can be updated.`
        });
      }

      wfhRequest.status = status;
      wfhRequest.reviewedBy = req.user._id;
      wfhRequest.reviewedAt = new Date();
      
      if (status === 'rejected' && reson) {
        wfhRequest.reson = reson.trim();
      }

      await wfhRequest.save();

      // Send FCM notification for WFH request status update
      try {
        const pushNotificationService = require('../services/pushNotificationService');
        
        if (status === 'approved') {
          const notificationData = {
            type: 'wfh_assigned',
            action: 'wfh_request_approved',
            wfhStatus: 'active',
            startDate: wfhRequest.startDate.toISOString(),
            endDate: wfhRequest.endDate.toISOString(),
            reason: wfhRequest.reason,
            timestamp: new Date().toISOString()
          };

          const notification = {
            title: '🎉 WFH Request Approved!',
            body: `Your work from home request has been approved from ${wfhRequest.startDate.toDateString()} to ${wfhRequest.endDate.toDateString()}`
          };

          await pushNotificationService.sendNotificationToStudent(wfhRequest.student._id, notification, notificationData);
          console.log(`[WFH Update Status] Approval notification sent to ${wfhRequest.student.fullName}`);
        } else if (status === 'rejected') {
          const notificationData = {
            type: 'wfh_rejected',
            action: 'wfh_request_rejected',
            reason: reson || 'No reason provided',
            timestamp: new Date().toISOString()
          };

          const notification = {
            title: '❌ WFH Request Rejected',
            body: `Your work from home request has been rejected. ${reson ? `Reason: ${reson}` : ''}`
          };

          await pushNotificationService.sendNotificationToStudent(wfhRequest.student._id, notification, notificationData);
          console.log(`[WFH Update Status] Rejection notification sent to ${wfhRequest.student.fullName}`);
        }
      } catch (notificationError) {
        console.error('[WFH Update Status] Failed to send FCM notification:', notificationError);
        // Don't fail the request if notification fails
      }

      // If approved, update student's WFH assignment for compatibility
      if (status === 'approved') {
        const student = await Student.findById(wfhRequest.student._id);
        if (student) {
          const wfhAssignment = {
            startDate: wfhRequest.startDate,
            endDate: wfhRequest.endDate,
            reason: wfhRequest.reason,
            assignedBy: req.user._id,
            assignedAt: new Date(),
            isActive: true,
            requestId: wfhRequest._id // Link to the request
          };
          
          student.wfhAssignments.push(wfhAssignment);
          student.WFH = 'WFH allowed'; // Update legacy field
          await student.save();
          
          console.log('[WFH Approve] Updated student WFH assignment:', {
            studentId: student._id,
            requestId: wfhRequest._id
          });
        }
      }

      console.log('[WFH Update Status] Success:', {
        requestId: id,
        status,
        studentName: wfhRequest.student.fullName,
        reviewedBy: req.user._id
      });

      res.json({
        success: true,
        message: `WFH request ${status} successfully`,
        data: {
          request: wfhRequest
        }
      });
    } catch (error) {
      console.error('[WFH Update Status] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update WFH request status',
        error: error.message
      });
    }
  }
);

// Get approved WFH requests (for calendar integration)
Router.get(
  "/wfh-requests/approved",
  auth,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      const query = { 
        organization: req.organization._id,
        status: 'approved'
      };
      
      const scope = await deptScopeIds(req);
      if (scope) {
        query.student = { $in: scope };
      }
      
      if (startDate || endDate) {
        query.$and = [];
        if (startDate) {
          query.$and.push({ startDate: { $gte: new Date(startDate) } });
        }
        if (endDate) {
          query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }
      }

      const approvedRequests = await WFHRequest.find(query)
        .sort({ startDate: 1 })
        .populate('student', 'fullName uid email class department bureau');

      // Format for calendar integration
      const calendarEvents = approvedRequests.map(req => ({
        id: req._id,
        title: `${req.student.fullName} - WFH`,
        start: req.startDate,
        end: req.endDate,
        type: 'wfh',
        student: {
          _id: req.student._id,
          fullName: req.student.fullName,
          uid: req.student.uid,
          email: req.student.email,
          class: req.student.class,
          department: req.student.department,
          bureau: req.student.bureau
        },
        reason: req.reason,
        notes: req.notes,
        days: req.days
      }));

      res.json({
        success: true,
        data: {
          wfhRequests: approvedRequests,
          calendarEvents,
          total: approvedRequests.length
        }
      });
    } catch (error) {
      console.error('[WFH Approved] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch approved WFH requests',
        error: error.message
      });
    }
  }
);

// Get WFH summary for dashboard
Router.get(
  "/wfh-requests/summary",
  auth,
  async (req, res) => {
    try {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      // Get today's active WFH requests
      const scope = await deptScopeIds(req);
      const queryToday = {
        organization: req.organization._id,
        status: 'approved',
        startDate: { $lte: endOfDay },
        endDate: { $gte: startOfDay }
      };
      if (scope) {
        queryToday.student = { $in: scope };
      }

      const todayWFH = await WFHRequest.find(queryToday).populate('student', 'fullName uid email class department bureau');

      // Get pending requests
      const queryPending = {
        organization: req.organization._id,
        status: 'pending'
      };
      if (scope) {
        queryPending.student = { $in: scope };
      }

      const pendingCount = await WFHRequest.countDocuments(queryPending);

      // Format for dashboard compatibility
      const wfhRequests = todayWFH.map(req => ({
        _id: req._id,
        student: {
          _id: req.student._id,
          fullName: req.student.fullName,
          uid: req.student.uid,
          email: req.student.email,
          class: req.student.class,
          department: req.student.department,
          bureau: req.student.bureau
        },
        leaveDetails: `[WFH] ${req.reason}`,
        leaveDates: {
          start: req.startDate,
          end: req.endDate
        },
        status: 'approved',
        createdAt: req.createdAt,
        requestType: 'WFH'
      }));

      res.json({
        success: true,
        data: {
          wfhRequests,
          todayCount: todayWFH.length,
          pendingCount,
          total: todayWFH.length
        }
      });
    } catch (error) {
      console.error('[WFH Summary] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get WFH summary',
        error: error.message
      });
    }
  }
);

// Debug endpoint to check WFH request details
Router.get(
  "/wfh-requests/debug/:id",
  auth,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const wfhRequest = await WFHRequest.findById(id)
        .populate('student', 'fullName uid email')
        .populate('reviewedBy', 'name email');

      if (!wfhRequest) {
        return res.status(404).json({
          success: false,
          message: 'WFH request not found'
        });
      }

      res.json({
        success: true,
        data: {
          request: {
            _id: wfhRequest._id,
            student: wfhRequest.student,
            startDate: wfhRequest.startDate,
            endDate: wfhRequest.endDate,
            reason: wfhRequest.reason,
            notes: wfhRequest.notes,
            status: wfhRequest.status,
            reson: wfhRequest.reson,
            reviewedBy: wfhRequest.reviewedBy,
            reviewedAt: wfhRequest.reviewedAt,
            organization: wfhRequest.organization,
            createdAt: wfhRequest.createdAt,
            updatedAt: wfhRequest.updatedAt
          }
        }
      });
    } catch (error) {
      console.error('[WFH Debug] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get WFH request details',
        error: error.message
      });
    }
  }
);

module.exports = Router;