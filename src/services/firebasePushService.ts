import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from './api';
import { notificationChannelService } from './notificationChannelService';
import { spotCheckEvents } from './spotCheckEvents';
import { showToast } from '../utils/toast';
import { playNotificationSound } from '../utils/notificationSound';

// Safely import Firebase messaging with error handling
let messaging: any = null;
let firebaseApp: any = null;
try {
  messaging = require('@react-native-firebase/messaging').default;
  firebaseApp = require('@react-native-firebase/app').default;
  console.log('Firebase messaging imported successfully in push service');
} catch (error) {
  console.error('Failed to import Firebase messaging in push service:', error);
}

/**
 * The native default Firebase app auto-initializes from google-services.json
 * at app launch, on a separate native start-up path from the JS bundle. On a
 * cold start (or a dev Fast Refresh right after one) the JS thread can reach
 * `messaging()` before that native init has actually finished, throwing
 * "No Firebase App '[DEFAULT]' has been created" even though the app is
 * correctly configured — it just isn't ready *yet*. Poll briefly instead of
 * calling straight through.
 */
const waitForDefaultFirebaseApp = async (timeoutMs = 5000, intervalMs = 150): Promise<boolean> => {
  if (!firebaseApp) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (firebaseApp.apps && firebaseApp.apps.length > 0) return true;
    } catch {
      // fall through to retry
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
};

export interface PushNotificationData {
  type: 'wfh_assigned' | 'wfh_removed' | 'wfh_expiring' | 'wfh_expired' | 'location_update' | 'location_assigned' | 'location_request_approved' | 'location_request_rejected' | 'spot_check' | 'check_in' | 'check_out' | 'leave_approved' | 'leave_rejected' | 'checkout_approved' | 'checkout_rejected' | 'class_reminder' | 'class_notify' | 'geofence_exit' | 'geofence_enter' | 'class_log_missing' | 'clinic_log_missing' | 'custom' | 'test';
  action: string;
  wfhStatus?: 'active' | 'inactive' | 'expiring';
  startDate?: string;
  endDate?: string;
  reason?: string;
  locationId?: string;
  locationName?: string;
  geofenceRadius?: number;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  rejectionReason?: string;
  timestamp: string;
}

class FirebasePushService {
  private initialized = false;
  private onWFHUpdateCallback?: (data: PushNotificationData) => void;

  async initialize(): Promise<boolean> {
    try {
      // Prevent multiple initializations
      if (this.initialized) {
        console.log('Push notifications already initialized');
        return true;
      }

      if (!messaging) {
        console.warn('Firebase messaging not available - push notifications disabled');
        return false;
      }

      console.log('Initializing push notifications...');

      // Guard against the native default app not being ready yet (see
      // waitForDefaultFirebaseApp doc comment above) — avoids a spurious
      // "No Firebase App '[DEFAULT]' has been created" on a fast cold start.
      const appReady = await waitForDefaultFirebaseApp();
      if (!appReady) {
        console.warn('Firebase default app not ready after waiting - push notifications disabled for this session');
        return false;
      }

      // Request permission
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === 1 || // AuthorizationStatus.AUTHORIZED
        authStatus === 2;   // AuthorizationStatus.PROVISIONAL

      if (!enabled) {
        console.log('Push notification permission denied');
        return false;
      }

      console.log('Push notification permission granted');

      // Create notification channels
      await notificationChannelService.createNotificationChannels();

      // Get FCM token
      const token = await messaging().getToken();
      console.log('FCM Token:', token);

      // Send token to server
      await this.updateServerToken(token);

      // Set up message handlers
      this.setupMessageHandlers();

      // Handle token refresh
      messaging().onTokenRefresh(async (newToken: string) => {
        console.log('FCM Token refreshed:', newToken);
        await this.updateServerToken(newToken);
      });

      this.initialized = true;
      console.log('Push notifications initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
      return false;
    }
  }

  private async updateServerToken(token: string): Promise<void> {
    try {
      const response = await apiService.updateFCMToken(token);
      if (response.success) {
        console.log('FCM token updated on server');
        await AsyncStorage.setItem('fcmToken', token);
      } else {
        console.error('Failed to update FCM token on server:', response.error);
      }
    } catch (error) {
      console.error('Error updating FCM token on server:', error);
    }
  }

  private setupMessageHandlers(): void {
    if (!messaging) {
      console.warn('Firebase messaging not available - message handlers not set up');
      return;
    }

    try {
      // Handle foreground messages
      messaging().onMessage(async (remoteMessage: any) => {
        console.log('Foreground message received:', remoteMessage);
        await this.handleMessage(remoteMessage, 'foreground');
      });

      // Handle notification opened from quit state
      messaging()
        .getInitialNotification()
        .then(async (remoteMessage: any) => {
          if (remoteMessage) {
            console.log('App opened from quit state by notification:', remoteMessage);
            await this.handleMessage(remoteMessage, 'quit');
          }
        });

      // Handle notification opened from background state
      messaging().onNotificationOpenedApp(async (remoteMessage: any) => {
        console.log('App opened from background by notification:', remoteMessage);
        await this.handleMessage(remoteMessage, 'background_opened');
      });
    } catch (error) {
      console.error('Error setting up message handlers:', error);
    }
  }

  private async handleMessage(
    remoteMessage: any,
    context: 'foreground' | 'background' | 'quit' | 'background_opened'
  ): Promise<void> {
    try {
      const { notification, data } = remoteMessage;
      
      console.log(`Handling ${context} message:`, {
        title: notification?.title,
        body: notification?.body,
        data
      });

      // The OS does NOT display a banner OR play the channel sound for
      // foreground messages — that only happens when Android itself draws the
      // system notification (backgrounded/killed app). Surface a visible
      // in-app heads-up AND play the same dragon_alert sound configured on
      // every channel server-side, so a spot-check (or any other push) is
      // just as audible whether the app is open or closed.
      if (context === 'foreground' && notification && (notification.title || notification.body)) {
        const t = (data?.type as string) || '';
        const toastType: 'success' | 'error' | 'warning' | 'info' =
          t.includes('exit') || t.includes('rejected') ? 'warning'
            : t.includes('approved') || t === 'check_in' ? 'success'
            : 'info';
        try {
          showToast({ type: toastType, title: notification.title || 'Notification', message: notification.body || '' });
        } catch (e) {
          console.warn('[push] foreground toast failed:', e);
        }
        playNotificationSound().catch((e) => console.warn('[push] foreground sound failed:', e));
      }

      if (data && data.type) {
        const notificationData: PushNotificationData = {
          type: data.type as PushNotificationData['type'],
          action: (data.action || '') as string,
          wfhStatus: data.wfhStatus as PushNotificationData['wfhStatus'],
          startDate: data.startDate as string,
          endDate: data.endDate as string,
          reason: data.reason as string,
          locationId: data.locationId as string,
          locationName: data.locationName as string,
          geofenceRadius: data.geofenceRadius ? parseInt(data.geofenceRadius) : undefined,
          coordinates: data.coordinates ? (
            typeof data.coordinates === 'string' ? 
              JSON.parse(data.coordinates) : 
              {
                latitude: parseFloat(data.latitude || data.coordinates.latitude),
                longitude: parseFloat(data.longitude || data.coordinates.longitude)
              }
          ) : (data.latitude && data.longitude ? {
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude)
          } : undefined),
          rejectionReason: data.rejectionReason as string,
          timestamp: (data.timestamp || new Date().toISOString()) as string
        };

        // Handle different notification types
        switch (data.type) {
          case 'wfh_assigned':
          case 'wfh_removed':
          case 'wfh_expired':
            await this.handleWFHStatusUpdate(notificationData);
            break;
          case 'wfh_expiring':
            await this.handleWFHExpiring(notificationData);
            break;
          case 'location_update':
            await this.handleLocationUpdate(notificationData);
            break;
          case 'location_assigned':
            await this.handleLocationAssigned(notificationData);
            break;
          case 'location_request_approved':
            await this.handleLocationRequestApproved(notificationData);
            break;
          case 'location_request_rejected':
            await this.handleLocationRequestRejected(notificationData);
            break;
          case 'spot_check':
            // Nudge the in-app SpotCheckResponder to fetch + present the
            // pending spot-check (it also polls on app-resume as a fallback).
            spotCheckEvents.notify();
            break;
          case 'check_in':
          case 'check_out':
          case 'leave_approved':
          case 'leave_rejected':
          case 'checkout_approved':
          case 'checkout_rejected':
          case 'class_reminder':
          case 'class_notify':
          case 'geofence_exit':
          case 'geofence_enter':
          case 'class_log_missing':
          case 'clinic_log_missing':
            // Informational: the OS displays the notification; the relevant
            // screen refreshes from the server on next view.
            console.log('[push] informational notification:', data.type);
            break;
          default:
            console.log('Unknown notification type:', data.type);
        }

        // Call callback if registered
        if (this.onWFHUpdateCallback) {
          this.onWFHUpdateCallback(notificationData);
        }

        // Store notification for later processing
        await this.storeNotificationHistory(notificationData, notification);
      }
    } catch (error) {
      console.error('Error handling push notification:', error);
    }
  }

  private async handleWFHStatusUpdate(data: PushNotificationData): Promise<void> {
    try {
      console.log('Handling WFH status update:', data);

      // For WFH removal, clear the cache completely
      if (data.type === 'wfh_removed' || data.wfhStatus === 'inactive') {
        console.log('WFH removed - clearing cache completely');
        await AsyncStorage.removeItem('wfhStatus');
        
        // Trigger app refresh to force server fetch
        await this.triggerAppRefresh('wfh_removed');
        return;
      }

      // Update local WFH status for active WFH
      const wfhStatus = {
        hasActiveWFH: data.wfhStatus === 'active',
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        lastUpdated: data.timestamp
      };

      await AsyncStorage.setItem('wfhStatus', JSON.stringify(wfhStatus));
      console.log('Local WFH status updated:', wfhStatus);

      // Trigger app refresh if needed
      await this.triggerAppRefresh('wfh_status_changed');
    } catch (error) {
      console.error('Error handling WFH status update:', error);
    }
  }

  private async handleWFHExpiring(data: PushNotificationData): Promise<void> {
    try {
      console.log('Handling WFH expiring notification:', data);
      
      // Store expiring notification
      await AsyncStorage.setItem('wfhExpiringNotification', JSON.stringify({
        expirationDate: data.endDate,
        notifiedAt: data.timestamp
      }));

      // Trigger app refresh
      await this.triggerAppRefresh('wfh_expiring');
    } catch (error) {
      console.error('Error handling WFH expiring notification:', error);
    }
  }

  private async handleLocationUpdate(data: PushNotificationData): Promise<void> {
    try {
      console.log('Handling location update notification:', data);
      
      // Clear cached location data to force refresh
      await AsyncStorage.removeItem('organizationData');
      
      // Trigger app refresh
      await this.triggerAppRefresh('location_updated');
    } catch (error) {
      console.error('Error handling location update notification:', error);
    }
  }

  private async handleLocationAssigned(data: PushNotificationData): Promise<void> {
    try {
      console.log('Handling location assigned notification:', data);
      
      // Update current location cache with detailed information
      if (data.locationId && data.locationName && data.coordinates) {
        const locationData = {
          locationId: data.locationId,
          locationName: data.locationName,
          geofenceRadius: data.geofenceRadius || 150,
          coordinates: data.coordinates,
          lastUpdated: data.timestamp,
          source: 'admin_assignment'
        };
        
        await AsyncStorage.setItem('currentLocation', JSON.stringify(locationData));
        console.log('Current location updated from notification:', locationData);
      }
      
      // Clear cached organization data to force refresh
      await AsyncStorage.removeItem('organizationData');
      await AsyncStorage.removeItem('studentData');
      
      // Store location refresh trigger with detailed data for immediate distance calculation
      await AsyncStorage.setItem('pendingLocationRefresh', JSON.stringify({
        reason: 'location_assigned',
        timestamp: new Date().toISOString(),
        data: {
          locationId: data.locationId,
          locationName: data.locationName,
          geofenceRadius: data.geofenceRadius,
          coordinates: data.coordinates
        }
      }));
      
      console.log('Location assignment notification processed with coordinates for immediate distance calculation');
    } catch (error) {
      console.error('Error handling location assigned notification:', error);
    }
  }

  private async handleLocationRequestApproved(data: PushNotificationData): Promise<void> {
    try {
      console.log('Handling location request approved notification:', data);
      
      // Update current location cache with detailed information
      if (data.locationId && data.locationName && data.coordinates) {
        const locationData = {
          locationId: data.locationId,
          locationName: data.locationName,
          geofenceRadius: data.geofenceRadius || 150,
          coordinates: data.coordinates,
          lastUpdated: data.timestamp,
          source: 'request_approved'
        };
        
        await AsyncStorage.setItem('currentLocation', JSON.stringify(locationData));
        console.log('Current location updated from approved request:', locationData);
      }
      
      // Clear cached organization data to force refresh
      await AsyncStorage.removeItem('organizationData');
      await AsyncStorage.removeItem('studentData');
      
      // Store location refresh trigger with detailed data for immediate distance calculation
      await AsyncStorage.setItem('pendingLocationRefresh', JSON.stringify({
        reason: 'location_request_approved',
        timestamp: new Date().toISOString(),
        data: {
          locationId: data.locationId,
          locationName: data.locationName,
          geofenceRadius: data.geofenceRadius,
          coordinates: data.coordinates
        }
      }));
      
      console.log('Location request approved notification processed with coordinates for immediate distance calculation');
    } catch (error) {
      console.error('Error handling location request approved notification:', error);
    }
  }

  private async handleLocationRequestRejected(data: PushNotificationData): Promise<void> {
    try {
      console.log('Handling location request rejected notification:', data);
      
      // Store rejection details for user to see
      const rejectionData = {
        locationName: data.locationName,
        rejectionReason: data.rejectionReason,
        rejectedAt: data.timestamp
      };
      
      await AsyncStorage.setItem('locationRequestRejection', JSON.stringify(rejectionData));
      
      // Trigger app refresh to show rejection message
      await this.triggerAppRefresh('location_request_rejected');
    } catch (error) {
      console.error('Error handling location request rejected notification:', error);
    }
  }

  private async triggerAppRefresh(reason: string, data?: any): Promise<void> {
    try {
      // Store refresh trigger for app to pick up
      await AsyncStorage.setItem('pendingRefresh', JSON.stringify({
        reason,
        timestamp: new Date().toISOString(),
        data: data || null
      }));

      console.log(`App refresh triggered: ${reason}`, data ? 'with data' : 'without data');
    } catch (error) {
      console.error('Error triggering app refresh:', error);
    }
  }

  private async storeNotificationHistory(
    data: PushNotificationData,
    notification?: any
  ): Promise<void> {
    try {
      const historyKey = 'notificationHistory';
      const existingHistory = await AsyncStorage.getItem(historyKey);
      const history = existingHistory ? JSON.parse(existingHistory) : [];

      const notificationRecord = {
        id: Date.now().toString(),
        title: notification?.title,
        body: notification?.body,
        data,
        receivedAt: new Date().toISOString(),
        read: false
      };

      // Keep only last 50 notifications
      history.unshift(notificationRecord);
      if (history.length > 50) {
        history.splice(50);
      }

      await AsyncStorage.setItem(historyKey, JSON.stringify(history));
    } catch (error) {
      console.error('Error storing notification history:', error);
    }
  }

  async getNotificationHistory(): Promise<any[]> {
    try {
      const history = await AsyncStorage.getItem('notificationHistory');
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Error getting notification history:', error);
      return [];
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      const historyKey = 'notificationHistory';
      const existingHistory = await AsyncStorage.getItem(historyKey);
      if (existingHistory) {
        const history = JSON.parse(existingHistory);
        const notification = history.find((n: any) => n.id === notificationId);
        if (notification) {
          notification.read = true;
          await AsyncStorage.setItem(historyKey, JSON.stringify(history));
        }
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async clearNotificationHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem('notificationHistory');
    } catch (error) {
      console.error('Error clearing notification history:', error);
    }
  }

  async checkPendingRefresh(): Promise<{ reason: string; timestamp: string } | null> {
    try {
      const pendingRefresh = await AsyncStorage.getItem('pendingRefresh');
      if (pendingRefresh) {
        await AsyncStorage.removeItem('pendingRefresh');
        return JSON.parse(pendingRefresh);
      }
      return null;
    } catch (error) {
      console.error('Error checking pending refresh:', error);
      return null;
    }
  }

  async getBackgroundNotifications(): Promise<any[]> {
    try {
      const notifications = await AsyncStorage.getItem('backgroundNotifications');
      if (notifications) {
        const parsed = JSON.parse(notifications);
        return parsed;
      }
      return [];
    } catch (error) {
      console.error('Error getting background notifications:', error);
      return [];
    }
  }

  async clearBackgroundNotifications(): Promise<void> {
    try {
      await AsyncStorage.removeItem('backgroundNotifications');
      console.log('Background notifications cleared');
    } catch (error) {
      console.error('Error clearing background notifications:', error);
    }
  }

  async checkPendingWFHRefresh(): Promise<{ reason: string; timestamp: string; data?: any } | null> {
    try {
      const pendingRefresh = await AsyncStorage.getItem('pendingWFHRefresh');
      if (pendingRefresh) {
        return JSON.parse(pendingRefresh);
      }
      return null;
    } catch (error) {
      console.error('Error checking pending WFH refresh:', error);
      return null;
    }
  }

  async clearPendingWFHRefresh(): Promise<void> {
    try {
      await AsyncStorage.removeItem('pendingWFHRefresh');
      console.log('Pending WFH refresh cleared');
    } catch (error) {
      console.error('Error clearing pending WFH refresh:', error);
    }
  }

  async checkPendingLocationRefresh(): Promise<{ reason: string; timestamp: string; data?: any } | null> {
    try {
      const pendingRefresh = await AsyncStorage.getItem('pendingLocationRefresh');
      if (pendingRefresh) {
        return JSON.parse(pendingRefresh);
      }
      return null;
    } catch (error) {
      console.error('Error checking pending location refresh:', error);
      return null;
    }
  }

  async clearPendingLocationRefresh(): Promise<void> {
    try {
      await AsyncStorage.removeItem('pendingLocationRefresh');
      console.log('Pending location refresh cleared');
    } catch (error) {
      console.error('Error clearing pending location refresh:', error);
    }
  }

  async getLocationRequestRejection(): Promise<{ locationName: string; rejectionReason: string; rejectedAt: string } | null> {
    try {
      const rejection = await AsyncStorage.getItem('locationRequestRejection');
      if (rejection) {
        await AsyncStorage.removeItem('locationRequestRejection'); // Clear after reading
        return JSON.parse(rejection);
      }
      return null;
    } catch (error) {
      console.error('Error getting location request rejection:', error);
      return null;
    }
  }

  setOnWFHUpdateCallback(callback: (data: PushNotificationData) => void): void {
    this.onWFHUpdateCallback = callback;
  }

  async cleanup(removeToken: boolean = false): Promise<void> {
    try {
      if (removeToken) {
        // Remove FCM token from server
        await apiService.removeFCMToken();
        // Clear local token
        await AsyncStorage.removeItem('fcmToken');
      }
      
      console.log('Push notification service cleaned up');
    } catch (error) {
      console.error('Error cleaning up push notification service:', error);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const firebasePushService = new FirebasePushService();
export default firebasePushService;