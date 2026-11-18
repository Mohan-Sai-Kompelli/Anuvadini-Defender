// Service selector - uses Firebase if available, otherwise mock service
let notificationService: any = null;
let serviceType = 'unknown';

try {
  // Try to import Firebase service
  const firebaseService = require('./firebasePushService');
  notificationService = firebaseService.firebasePushService;
  serviceType = 'firebase';
  console.log('Using Firebase notification service');
} catch (error: any) {
  console.warn('Firebase not available, using mock notification service:', error?.message || error);
  // Fallback to mock service
  const mockService = require('./mockNotificationService');
  notificationService = mockService.mockNotificationService;
  serviceType = 'mock';
}

// Export the PushNotificationData interface
export interface PushNotificationData {
  type: 'wfh_assigned' | 'wfh_removed' | 'wfh_expiring' | 'wfh_expired' | 'location_update' | 'location_assigned' | 'location_request_approved' | 'location_request_rejected' | 'custom';
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

console.log(`Notification service initialized: ${serviceType}`);

export const pushNotificationService = notificationService;
export default notificationService;