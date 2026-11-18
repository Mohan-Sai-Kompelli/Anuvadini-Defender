const admin = require('firebase-admin');

class FirebaseService {
  constructor() {
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    try {
      // Check if Firebase app is already initialized
      if (admin.apps.length > 0) {
        console.log('Firebase Admin SDK already initialized');
        this.initialized = true;
        return;
      }

      // Initialize Firebase Admin SDK
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : require('../config/firebase-service-account.json'); // Fallback to file

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
      });

      this.initialized = true;
      console.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Firebase Admin SDK:', error.message);
      // Don't throw error - allow app to continue without push notifications
    }
  }

  async sendNotification(token, notification, data = {}) {
    if (!this.initialized) {
      console.warn('Firebase not initialized - skipping notification');
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      // Determine notification channel based on type
      const notificationType = data.type || 'general';
      let channelId = 'general_notifications_v4';
      
      switch (notificationType) {
        case 'wfh_assigned':
        case 'wfh_removed':
        case 'wfh_expired':
        case 'wfh_expiring':
        case 'wfh_request_approved':
        case 'wfh_request_rejected':
          channelId = 'wfh_updates_v4';
          break;
        case 'check_in':
        case 'check_out':
        case 'attendance_marked':
        case 'spot_check':
        case 'class_reminder':
        case 'class_notify':
        case 'geofence_exit':
        case 'geofence_enter':
        case 'class_log_missing':
        case 'clinic_log_missing':
          channelId = 'attendance_updates_v4';
          break;
        case 'leave_approved':
        case 'leave_rejected':
        case 'leave_request_submitted':
          channelId = 'leave_requests_v4';
          break;
      }

      const message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, String(value)])
          ),
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'dragon_alert',
            channelId: channelId,
            priority: 'high',
            defaultSound: false,
            defaultVibrateTimings: true,
            defaultLightSettings: true,
            sticky: false,
            localOnly: false,
            tag: notificationType, // Prevents duplicate notifications of same type
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'dragon_alert.mp3',
              badge: 1,
              alert: {
                title: notification.title,
                body: notification.body,
              },
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('Push notification sent successfully:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('Failed to send push notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendBatchNotification(tokens, notification, data = {}) {
    if (!this.initialized) {
      console.warn('Firebase not initialized - skipping batch notification');
      return { success: false, error: 'Firebase not initialized' };
    }

    if (!tokens || tokens.length === 0) {
      return { success: false, error: 'No tokens provided' };
    }

    try {
      // Filter out empty tokens
      const validTokens = tokens.filter(token => token && token.trim() !== '');
      
      if (validTokens.length === 0) {
        return { success: false, error: 'No valid tokens provided' };
      }

      // Determine notification channel based on type
      const notificationType = data.type || 'general';
      let channelId = 'general_notifications_v4';
      
      switch (notificationType) {
        case 'wfh_assigned':
        case 'wfh_removed':
        case 'wfh_expired':
        case 'wfh_expiring':
        case 'wfh_request_approved':
        case 'wfh_request_rejected':
          channelId = 'wfh_updates_v4';
          break;
        case 'check_in':
        case 'check_out':
        case 'attendance_marked':
        case 'spot_check':
        case 'class_reminder':
        case 'class_notify':
        case 'geofence_exit':
        case 'geofence_enter':
        case 'class_log_missing':
        case 'clinic_log_missing':
          channelId = 'attendance_updates_v4';
          break;
        case 'leave_approved':
        case 'leave_rejected':
        case 'leave_request_submitted':
          channelId = 'leave_requests_v4';
          break;
      }

      // Try sendMulticast first (newer method)
      try {
        // Check if sendMulticast is available
        if (typeof admin.messaging().sendMulticast !== 'function') {
          throw new Error('sendMulticast method not available in this Firebase Admin SDK version');
        }

        const message = {
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            ...Object.fromEntries(
              Object.entries(data).map(([key, value]) => [key, String(value)])
            ),
            timestamp: new Date().toISOString(),
          },
          tokens: validTokens,
          android: {
            priority: 'high',
            notification: {
              sound: 'dragon_alert',
              channelId: channelId,
              priority: 'high',
              defaultSound: false,
              defaultVibrateTimings: true,
              defaultLightSettings: true,
              sticky: false,
              localOnly: false,
              tag: notificationType,
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'dragon_alert.mp3',
                badge: 1,
                alert: {
                  title: notification.title,
                  body: notification.body,
                },
              },
            },
          },
        };

        const response = await admin.messaging().sendMulticast(message);
        console.log(`Batch notification sent: ${response.successCount}/${validTokens.length} successful`);
        
        if (response.failureCount > 0) {
          console.warn('Some notifications failed:', response.responses
            .filter(r => !r.success)
            .map(r => r.error?.message)
          );
        }

        return { 
          success: true, 
          successCount: response.successCount,
          failureCount: response.failureCount,
          responses: response.responses
        };
      } catch (multicastError) {
        console.warn('sendMulticast failed, falling back to individual sends:', multicastError.message);
        
        // Fallback to individual sends
        const results = [];
        let successCount = 0;
        let failureCount = 0;

        for (const token of validTokens) {
          try {
            const individualMessage = {
              token,
              notification: {
                title: notification.title,
                body: notification.body,
              },
              data: {
                ...Object.fromEntries(
                  Object.entries(data).map(([key, value]) => [key, String(value)])
                ),
                timestamp: new Date().toISOString(),
              },
              android: {
                priority: 'high',
                notification: {
                  sound: 'dragon_alert',
                  channelId: channelId,
                  priority: 'high',
                  defaultSound: false,
                  defaultVibrateTimings: true,
                  defaultLightSettings: true,
                  sticky: false,
                  localOnly: false,
                  tag: notificationType,
                },
              },
              apns: {
                payload: {
                  aps: {
                    sound: 'dragon_alert.mp3',
                    badge: 1,
                    alert: {
                      title: notification.title,
                      body: notification.body,
                    },
                  },
                },
              },
            };

            const response = await admin.messaging().send(individualMessage);
            results.push({ success: true, messageId: response });
            successCount++;
          } catch (error) {
            results.push({ success: false, error: error.message });
            failureCount++;
            console.warn(`Failed to send to token ${token.substring(0, 10)}...`, error.message);
          }
        }

        console.log(`Individual sends completed: ${successCount}/${validTokens.length} successful`);
        
        return {
          success: successCount > 0,
          successCount,
          failureCount,
          responses: results,
          method: 'individual'
        };
      }
    } catch (error) {
      console.error('Failed to send batch notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Error codes that mean the token is DEFINITELY dead (app uninstalled,
  // token rotated/expired, malformed). Any other error — rate limiting, a
  // transient network/server blip, temporary auth hiccups — is NOT proof the
  // token is bad. Treating every error as "invalid" used to wipe perfectly
  // good tokens for many staff at once whenever a live validation call hit a
  // transient Firebase error (e.g. during the weekly cleanup sweep, or even
  // when a device had JUST registered a brand-new token).
  static DEAD_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument',
  ]);

  async validateToken(token) {
    if (!this.initialized) {
      return { valid: false, confirmed: false, error: 'Firebase not initialized' };
    }

    try {
      // For mock tokens, just check the format
      if (token.startsWith('mock_fcm_token_')) {
        return { valid: false, confirmed: true, error: 'Mock token - not valid for actual delivery' };
      }

      // For real tokens, try to send a test message
      await admin.messaging().send({
        token,
        data: { test: 'true' },
        // Remove dryRun as it's not supported in newer Firebase versions
      });
      return { valid: true, confirmed: true };
    } catch (error) {
      const confirmed = FirebaseService.DEAD_TOKEN_CODES.has(error.code);
      console.warn(
        'FCM token validation error:', error.code || error.message,
        confirmed ? '(confirmed dead — safe to remove)' : '(transient/unknown — NOT removing)'
      );
      return { valid: false, confirmed, error: error.message };
    }
  }
}

module.exports = new FirebaseService();