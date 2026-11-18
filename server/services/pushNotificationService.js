const firebaseService = require('./firebaseService');
const Student = require('../models/Student');

class PushNotificationService {
  constructor() {
    // Initialize Firebase on service creation
    firebaseService.initialize();
  }

  async sendNotificationToStudent(studentId, notification, data = {}) {
    try {
      const student = await Student.findById(studentId).select('fcmToken fullName');
      
      if (!student) {
        console.warn(`Student not found: ${studentId}`);
        return { success: false, error: 'Student not found' };
      }

      if (!student.fcmToken) {
        console.warn(`No FCM token for student: ${student.fullName}`);
        return { success: false, error: 'No FCM token registered' };
      }

      console.log(`Sending notification to ${student.fullName}: ${notification.title}`);
      
      const result = await firebaseService.sendNotification(student.fcmToken, notification, data);
      
      if (result.success) {
        console.log(`✅ Notification sent to ${student.fullName}: ${result.messageId}`);
      } else {
        console.error(`❌ Failed to send notification to ${student.fullName}: ${result.error}`);
        
        // Remove invalid token
        if (result.error && result.error.includes('registration-token-not-registered')) {
          student.fcmToken = null;
          student.fcmTokenUpdatedAt = null;
          await student.save();
          console.log(`🧹 Removed invalid FCM token for ${student.fullName}`);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error sending notification to student:', error);
      return { success: false, error: error.message };
    }
  }

  // WFH is out of scope for this deployment — all WFH notification senders
  // no-op so no WFH push can ever reach a device (cron / legacy DB assignments
  // included). Remove WFH_NOTIFICATIONS_DISABLED to re-enable.
  static WFH_NOTIFICATIONS_DISABLED = true;

  async sendWFHAssignedNotification(studentIds, wfhDetails) {
    if (PushNotificationService.WFH_NOTIFICATIONS_DISABLED) {
      return { success: true, message: 'WFH notifications disabled' };
    }
    try {
      console.log(`Sending WFH assigned notifications to ${studentIds.length} students`);
      
      const students = await Student.find({ 
        _id: { $in: studentIds },
        fcmToken: { $exists: true, $ne: null, $ne: '' }
      }).select('_id fullName fcmToken');

      if (students.length === 0) {
        console.log('No students with FCM tokens found');
        return { success: true, message: 'No students to notify' };
      }

      const tokens = students.map(s => s.fcmToken);
      const startDate = new Date(wfhDetails.startDate).toLocaleDateString();
      const endDate = new Date(wfhDetails.endDate).toLocaleDateString();

      const notification = {
        title: '🏠 Work From Home Assigned',
        body: `WFH approved from ${startDate} to ${endDate}. ${wfhDetails.reason || 'You can now mark attendance from home.'}`
      };

      const data = {
        type: 'wfh_assigned',
        action: 'assigned',
        startDate: wfhDetails.startDate,
        endDate: wfhDetails.endDate,
        reason: wfhDetails.reason || '',
        wfhStatus: 'active',
        timestamp: new Date().toISOString()
      };

      const result = await firebaseService.sendBatchNotification(tokens, notification, data);
      
      // Log notification history
      await this.logNotificationHistory(students, 'wfh_assigned', notification, data);

      return result;
    } catch (error) {
      console.error('Error sending WFH assigned notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWFHRemovedNotification(studentIds, reason = 'WFH assignment removed') {
    if (PushNotificationService.WFH_NOTIFICATIONS_DISABLED) {
      return { success: true, message: 'WFH notifications disabled' };
    }
    try {
      console.log(`Sending WFH removed notifications to ${studentIds.length} students`);
      
      const students = await Student.find({ 
        _id: { $in: studentIds },
        fcmToken: { $exists: true, $ne: null, $ne: '' }
      }).select('_id fullName fcmToken');

      if (students.length === 0) {
        console.log('No students with FCM tokens found');
        return { success: true, message: 'No students to notify' };
      }

      const tokens = students.map(s => s.fcmToken);

      const notification = {
        title: '🏢 Work From Home Removed',
        body: `${reason}. Please report to office for attendance marking.`
      };

      const data = {
        type: 'wfh_removed',
        action: 'removed',
        reason: reason,
        wfhStatus: 'inactive',
        timestamp: new Date().toISOString()
      };

      const result = await firebaseService.sendBatchNotification(tokens, notification, data);
      
      // Log notification history
      await this.logNotificationHistory(students, 'wfh_removed', notification, data);

      return result;
    } catch (error) {
      console.error('Error sending WFH removed notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWFHExpiringNotification(studentIds, expirationDate) {
    if (PushNotificationService.WFH_NOTIFICATIONS_DISABLED) {
      return { success: true, message: 'WFH notifications disabled' };
    }
    try {
      console.log(`Sending WFH expiring notifications to ${studentIds.length} students`);
      
      const students = await Student.find({ 
        _id: { $in: studentIds },
        fcmToken: { $exists: true, $ne: null, $ne: '' }
      }).select('_id fullName fcmToken');

      if (students.length === 0) {
        console.log('No students with FCM tokens found');
        return { success: true, message: 'No students to notify' };
      }

      const tokens = students.map(s => s.fcmToken);
      const expDate = new Date(expirationDate).toLocaleDateString();

      const notification = {
        title: '⏰ Work From Home Expiring',
        body: `Your WFH ends on ${expDate}. Prepare for office attendance from the next working day.`
      };

      const data = {
        type: 'wfh_expiring',
        action: 'expiring',
        expirationDate: expirationDate,
        wfhStatus: 'expiring',
        timestamp: new Date().toISOString()
      };

      const result = await firebaseService.sendBatchNotification(tokens, notification, data);
      
      // Log notification history
      await this.logNotificationHistory(students, 'wfh_expiring', notification, data);

      return result;
    } catch (error) {
      console.error('Error sending WFH expiring notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWFHExpiredNotification(studentIds) {
    if (PushNotificationService.WFH_NOTIFICATIONS_DISABLED) {
      return { success: true, message: 'WFH notifications disabled' };
    }
    try {
      console.log(`Sending WFH expired notifications to ${studentIds.length} students`);
      
      const students = await Student.find({ 
        _id: { $in: studentIds },
        fcmToken: { $exists: true, $ne: null, $ne: '' }
      }).select('_id fullName fcmToken');

      if (students.length === 0) {
        console.log('No students with FCM tokens found');
        return { success: true, message: 'No students to notify' };
      }

      const tokens = students.map(s => s.fcmToken);

      const notification = {
        title: '🏢 Work From Home Expired',
        body: 'Your WFH period has ended. Office attendance is now required.'
      };

      const data = {
        type: 'wfh_expired',
        action: 'expired',
        wfhStatus: 'inactive',
        timestamp: new Date().toISOString()
      };

      const result = await firebaseService.sendBatchNotification(tokens, notification, data);
      
      // Log notification history
      await this.logNotificationHistory(students, 'wfh_expired', notification, data);

      return result;
    } catch (error) {
      console.error('Error sending WFH expired notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendLocationUpdateNotification(organizationId, message) {
    try {
      console.log(`Sending location update notification to organization ${organizationId}`);
      
      const students = await Student.find({ 
        organization: organizationId,
        fcmToken: { $exists: true, $ne: null, $ne: '' }
      }).select('_id fullName fcmToken');

      if (students.length === 0) {
        console.log('No students with FCM tokens found');
        return { success: true, message: 'No students to notify' };
      }

      const tokens = students.map(s => s.fcmToken);

      const notification = {
        title: '📍 Location Settings Updated',
        body: message || 'Organization location or attendance settings have been updated.'
      };

      const data = {
        type: 'location_update',
        action: 'location_changed',
        organizationId: organizationId.toString()
      };

      const result = await firebaseService.sendBatchNotification(tokens, notification, data);
      
      // Log notification history
      await this.logNotificationHistory(students, 'location_update', notification, data);

      return result;
    } catch (error) {
      console.error('Error sending location update notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendCustomNotification(studentIds, title, body, data = {}) {
    try {
      console.log(`Sending custom notification to ${studentIds.length} students`);
      
      const students = await Student.find({ 
        _id: { $in: studentIds },
        fcmToken: { $exists: true, $ne: null, $ne: '' }
      }).select('_id fullName fcmToken');

      if (students.length === 0) {
        console.log('No students with FCM tokens found');
        return { success: true, message: 'No students to notify' };
      }

      const tokens = students.map(s => s.fcmToken);

      const notification = { title, body };
      const notificationData = {
        type: 'custom',
        action: 'custom_message',
        ...data
      };

      const result = await firebaseService.sendBatchNotification(tokens, notification, notificationData);
      
      // Log notification history
      await this.logNotificationHistory(students, 'custom', notification, notificationData);

      return result;
    } catch (error) {
      console.error('Error sending custom notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Random spot-check prompt. Tells the staff member to open the app and
   * complete a live face verification before the window closes. The payload
   * carries the spotCheckId so the app can deep-link into the liveness flow
   * and post the response back to /api/spot-checks/:id/respond.
   */
  async sendSpotCheckNotification(studentId, details = {}) {
    const windowMinutes = details.windowMinutes || 15;
    const notification = {
      title: '🛡️ Attendance Spot-Check',
      body: `Verify you're on duty now — open the app and complete a quick face check within ${windowMinutes} minutes.`,
    };
    const data = {
      type: 'spot_check',
      action: 'spot_check_prompt',
      spotCheckId: String(details.spotCheckId || ''),
      roundId: String(details.roundId || ''),
      expiresAt: String(details.expiresAt || ''),
      windowMinutes: String(windowMinutes),
    };
    return this.sendNotificationToStudent(studentId, notification, data);
  }

  async logNotificationHistory(students, type, notification, data) {
    try {
      // Create a simple log entry (you can enhance this with a proper NotificationHistory model)
      const logEntry = {
        timestamp: new Date(),
        type,
        title: notification.title,
        body: notification.body,
        studentCount: students.length,
        studentIds: students.map(s => s._id),
        data
      };

      console.log('Notification sent:', JSON.stringify(logEntry, null, 2));
      
      // TODO: Save to database if you want persistent notification history
      // await NotificationHistory.create(logEntry);
    } catch (error) {
      console.error('Error logging notification history:', error);
    }
  }

  async updateStudentFCMToken(studentId, fcmToken) {
    try {
      // Validate token first. A token the device JUST obtained via getToken()
      // is virtually certainly real — only reject it when Firebase has
      // CONFIRMED it's dead. Rejecting on a transient validation error here
      // used to block a brand-new, perfectly good registration outright.
      const validation = await firebaseService.validateToken(fcmToken);
      if (!validation.valid && validation.confirmed) {
        console.warn(`Invalid FCM token for student ${studentId}:`, validation.error);
        return { success: false, error: 'Invalid FCM token' };
      }

      await Student.findByIdAndUpdate(studentId, { 
        fcmToken,
        fcmTokenUpdatedAt: new Date()
      });

      console.log(`FCM token updated for student ${studentId}`);
      return { success: true };
    } catch (error) {
      console.error('Error updating FCM token:', error);
      return { success: false, error: error.message };
    }
  }

  async removeStudentFCMToken(studentId) {
    try {
      await Student.findByIdAndUpdate(studentId, { 
        $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 }
      });

      console.log(`FCM token removed for student ${studentId}`);
      return { success: true };
    } catch (error) {
      console.error('Error removing FCM token:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PushNotificationService();