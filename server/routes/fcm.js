const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pushNotificationService = require('../services/pushNotificationService');
const cronService = require('../services/cronService');

// @route   POST /api/fcm/token
// @desc    Update FCM token for student
// @access  Private (Student)
router.post('/token', auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    
    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }

    // Get student ID from auth middleware
    let studentId;
    if (req.student) {
      studentId = req.student._id;
    } else if (req.user && req.user.role === 'student') {
      studentId = req.user.id;
    } else {
      return res.status(401).json({
        success: false,
        message: 'Student authentication required'
      });
    }

    const result = await pushNotificationService.updateStudentFCMToken(studentId, fcmToken);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'FCM token updated successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to update FCM token'
      });
    }
  } catch (error) {
    console.error('Error updating FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/fcm/token
// @desc    Remove FCM token for student (logout)
// @access  Private (Student)
router.delete('/token', auth, async (req, res) => {
  try {
    // Get student ID from auth middleware
    let studentId;
    if (req.student) {
      studentId = req.student._id;
    } else if (req.user && req.user.role === 'student') {
      studentId = req.user.id;
    } else {
      return res.status(401).json({
        success: false,
        message: 'Student authentication required'
      });
    }

    const result = await pushNotificationService.removeStudentFCMToken(studentId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'FCM token removed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to remove FCM token'
      });
    }
  } catch (error) {
    console.error('Error removing FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/fcm/admin/broadcast
// @desc    Send broadcast notification to all students in organization
// @access  Private (Admin/Organization)
router.post('/admin/broadcast', auth, async (req, res) => {
  try {
    const { title, body, data = {} } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required'
      });
    }

    // Ensure user is admin/organization
    if (!req.organization && (!req.user || req.user.role !== 'organization')) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const organizationId = req.organization?._id || req.user.id;
    
    // Get all students in organization
    const Student = require('../models/Student');
    const students = await Student.find({
      organization: organizationId,
      fcmToken: { $exists: true, $ne: null, $ne: '' }
    }).select('_id');

    if (students.length === 0) {
      return res.json({
        success: true,
        message: 'No students with FCM tokens found',
        data: { successCount: 0, failureCount: 0 }
      });
    }

    const studentIds = students.map(s => s._id);
    const result = await pushNotificationService.sendCustomNotification(
      studentIds,
      title,
      body,
      { ...data, type: 'broadcast', action: 'admin_broadcast' }
    );
    
    if (result.success) {
      res.json({
        success: true,
        message: `Broadcast sent to ${result.successCount} students`,
        data: {
          successCount: result.successCount,
          failureCount: result.failureCount,
          totalStudents: students.length
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to send broadcast notification'
      });
    }
  } catch (error) {
    console.error('Error sending broadcast notification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/fcm/admin/cron/trigger
// @desc    Manually trigger cron jobs for testing
// @access  Private (Admin/Organization)
router.post('/admin/cron/trigger', auth, async (req, res) => {
  try {
    const { job } = req.body;
    
    // Ensure user is admin/organization
    if (!req.organization && (!req.user || req.user.role !== 'organization')) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    let result;
    switch (job) {
      case 'expiring':
        await cronService.triggerExpiringWFHCheck();
        result = 'Expiring WFH check triggered';
        break;
      case 'expired':
        await cronService.triggerExpiredWFHCheck();
        result = 'Expired WFH check triggered';
        break;
      case 'cleanup':
        await cronService.triggerTokenCleanup();
        result = 'FCM token cleanup triggered';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid job type. Use: expiring, expired, or cleanup'
        });
    }

    res.json({
      success: true,
      message: result
    });
  } catch (error) {
    console.error('Error triggering cron job:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/fcm/admin/stats
// @desc    Get FCM token statistics
// @access  Private (Admin/Organization)
router.get('/admin/stats', auth, async (req, res) => {
  try {
    // Ensure user is admin/organization
    if (!req.organization && (!req.user || req.user.role !== 'organization')) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const organizationId = req.organization?._id || req.user.id;
    
    const Student = require('../models/Student');
    
    // Get total students
    const totalStudents = await Student.countDocuments({
      organization: organizationId,
      isActive: true
    });

    // Get students with FCM tokens
    const studentsWithTokens = await Student.countDocuments({
      organization: organizationId,
      isActive: true,
      fcmToken: { $exists: true, $ne: null, $ne: '' }
    });

    // Get students with recent token updates (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentTokenUpdates = await Student.countDocuments({
      organization: organizationId,
      isActive: true,
      fcmTokenUpdatedAt: { $gte: sevenDaysAgo }
    });

    res.json({
      success: true,
      data: {
        totalStudents,
        studentsWithTokens,
        studentsWithoutTokens: totalStudents - studentsWithTokens,
        tokenCoverage: totalStudents > 0 ? Math.round((studentsWithTokens / totalStudents) * 100) : 0,
        recentTokenUpdates
      }
    });
  } catch (error) {
    console.error('Error getting FCM stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;