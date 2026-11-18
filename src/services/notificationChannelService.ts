import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';

export class NotificationChannelService {
  private static instance: NotificationChannelService;
  private channelsCreated = false;

  static getInstance(): NotificationChannelService {
    if (!NotificationChannelService.instance) {
      NotificationChannelService.instance = new NotificationChannelService();
    }
    return NotificationChannelService.instance;
  }

  async createNotificationChannels(): Promise<void> {
    if (this.channelsCreated || Platform.OS !== 'android') {
      return;
    }

    try {
      console.log('Creating notification channels...');

      // Create WFH Updates channel
      const wfhChannel = {
        channelId: 'wfh_updates_v4',
        name: 'WFH Updates',
        description: 'Work from home assignment and status updates',
        importance: 4, // HIGH
        sound: 'dragon_alert',
        vibrate: true,
        showBadge: true,
      };

      // Create Attendance channel
      const attendanceChannel = {
        channelId: 'attendance_updates_v4',
        name: 'Attendance Updates',
        description: 'Check-in and check-out notifications',
        importance: 4, // HIGH (Important for spot checks)
        sound: 'dragon_alert',
        vibrate: true,
        showBadge: true,
      };

      // Create Leave Requests channel
      const leaveChannel = {
        channelId: 'leave_requests_v4',
        name: 'Leave Requests',
        description: 'Leave request status updates',
        importance: 4, // HIGH
        sound: 'dragon_alert',
        vibrate: true,
        showBadge: true,
      };

      // Create General channel
      const generalChannel = {
        channelId: 'general_notifications_v4',
        name: 'General Notifications',
        description: 'General app notifications',
        importance: 3, // DEFAULT
        sound: 'dragon_alert',
        vibrate: false,
        showBadge: true,
      };

      // Note: React Native Firebase doesn't have direct channel creation API
      // Channels are created automatically when first notification is sent
      // But we can configure them in the Firebase service

      this.channelsCreated = true;
      console.log('Notification channels configured');
    } catch (error) {
      console.error('Error creating notification channels:', error);
    }
  }

  getChannelForNotificationType(type: string): string {
    switch (type) {
      case 'wfh_assigned':
      case 'wfh_removed':
      case 'wfh_expired':
      case 'wfh_expiring':
      case 'wfh_request_approved':
      case 'wfh_request_rejected':
        return 'wfh_updates_v4';
      
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
        return 'attendance_updates_v4';
      
      case 'leave_approved':
      case 'leave_rejected':
      case 'leave_request_submitted':
        return 'leave_requests_v4';
      
      default:
        return 'general_notifications_v4';
    }
  }
}

export const notificationChannelService = NotificationChannelService.getInstance();