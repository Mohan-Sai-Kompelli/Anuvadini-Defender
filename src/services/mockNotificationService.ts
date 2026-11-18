import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from './api';

export interface PushNotificationData {
  type: 'wfh_assigned' | 'wfh_removed' | 'wfh_expiring' | 'wfh_expired' | 'location_update' | 'custom';
  action: string;
  wfhStatus?: 'active' | 'inactive' | 'expiring';
  startDate?: string;
  endDate?: string;
  reason?: string;
  timestamp: string;
}

class MockNotificationService {
  private initialized = false;
  private onWFHUpdateCallback?: (data: PushNotificationData) => void;

  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing mock notification service (Firebase not available)...');
      
      // Simulate FCM token
      const mockToken = `mock_fcm_token_${Date.now()}`;
      await this.updateServerToken(mockToken);
      
      this.initialized = true;
      console.log('Mock notification service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize mock notification service:', error);
      return false;
    }
  }

  private async updateServerToken(token: string): Promise<void> {
    try {
      const response = await apiService.updateFCMToken(token);
      if (response.success) {
        console.log('Mock FCM token updated on server');
        await AsyncStorage.setItem('fcmToken', token);
      } else {
        console.error('Failed to update mock FCM token on server:', response.error);
      }
    } catch (error) {
      console.error('Error updating mock FCM token on server:', error);
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
      
      console.log('Mock notification service cleaned up');
    } catch (error) {
      console.error('Error cleaning up mock notification service:', error);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // Mock method to simulate receiving notifications (for testing)
  async simulateNotification(data: PushNotificationData): Promise<void> {
    console.log('Simulating notification:', data);
    
    if (this.onWFHUpdateCallback) {
      this.onWFHUpdateCallback(data);
    }
    
    // Store in notification history
    const historyKey = 'notificationHistory';
    const existingHistory = await AsyncStorage.getItem(historyKey);
    const history = existingHistory ? JSON.parse(existingHistory) : [];

    const notificationRecord = {
      id: Date.now().toString(),
      title: `Mock ${data.type}`,
      body: `Mock notification: ${data.action}`,
      data,
      receivedAt: new Date().toISOString(),
      read: false
    };

    history.unshift(notificationRecord);
    if (history.length > 50) {
      history.splice(50);
    }

    await AsyncStorage.setItem(historyKey, JSON.stringify(history));
  }
}

export const mockNotificationService = new MockNotificationService();
export default mockNotificationService;