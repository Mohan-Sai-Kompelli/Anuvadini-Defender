import AsyncStorage from '@react-native-async-storage/async-storage';

console.log('Background message handler loading...');

// Only set up background handler if Firebase is available
try {
  const messaging = require('@react-native-firebase/messaging').default;
  
  // Register background message handler
  const backgroundMessageHandler = async (remoteMessage: any) => {
    console.log('Message handled in the background (app killed/closed)!', remoteMessage);
    
    try {
      const { notification, data } = remoteMessage;
      
      // Store notification for when app opens
      const notificationRecord = {
        id: Date.now().toString(),
        title: notification?.title,
        body: notification?.body,
        data: data,
        receivedAt: new Date().toISOString(),
        read: false,
        receivedInBackground: true,
        processed: false
      };

      // Get existing notifications
      const existingNotifications = await AsyncStorage.getItem('backgroundNotifications');
      const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];
      
      // Add new notification
      notifications.unshift(notificationRecord);
      
      // Keep only last 20 notifications
      if (notifications.length > 20) {
        notifications.splice(20);
      }
      
      // Save back to storage
      await AsyncStorage.setItem('backgroundNotifications', JSON.stringify(notifications));
      
      // Handle specific notification types immediately for critical updates
      if (data && data.type) {
        console.log('Processing critical background notification:', data.type);
        
        switch (data.type) {
          case 'wfh_assigned':
            await handleWFHAssignedBackground(data);
            break;
          case 'wfh_removed':
          case 'wfh_expired':
            await handleWFHRemovedBackground(data);
            break;
          case 'location_update':
            await handleLocationUpdateBackground(data);
            break;
          case 'location_assigned':
            await handleLocationAssignedBackground(data);
            break;
          case 'location_request_approved':
            await handleLocationRequestApprovedBackground(data);
            break;
          case 'location_request_rejected':
            await handleLocationRequestRejectedBackground(data);
            break;
          default:
            console.log('Background notification type not handled:', data.type);
        }
      }
      
      console.log('Background notification stored and processed successfully');
    } catch (error: any) {
      console.error('Error handling background message:', error);
    }
  };

  // Handle WFH assignment when app is killed
  async function handleWFHAssignedBackground(data: any) {
    try {
      console.log('Handling WFH assigned in background:', data);
      
      // Update WFH cache with new assignment
      const wfhStatus = {
        hasActiveWFH: true,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        lastUpdated: data.timestamp || new Date().toISOString(),
        source: 'background_push'
      };
      
      await AsyncStorage.setItem('wfhStatus', JSON.stringify(wfhStatus));
      console.log('WFH status updated in background:', wfhStatus);
      
      // Set flag for app to process when it opens
      await AsyncStorage.setItem('pendingWFHRefresh', JSON.stringify({
        reason: 'wfh_assigned_background',
        timestamp: new Date().toISOString(),
        data: data
      }));
      
      console.log('WFH assignment processed in background');
    } catch (error: any) {
      console.error('Error handling WFH assigned in background:', error);
    }
  }

  // Handle WFH removal when app is killed
  async function handleWFHRemovedBackground(data: any) {
    try {
      console.log('Handling WFH removed in background:', data);
      
      // Clear WFH cache immediately
      await AsyncStorage.removeItem('wfhStatus');
      console.log('WFH cache cleared in background');
      
      // Set flag for app to process when it opens
      await AsyncStorage.setItem('pendingWFHRefresh', JSON.stringify({
        reason: 'wfh_removed_background',
        timestamp: new Date().toISOString(),
        data: data
      }));
      
      console.log('WFH removal processed in background');
    } catch (error: any) {
      console.error('Error handling WFH removed in background:', error);
    }
  }

  // Handle location updates when app is killed
  async function handleLocationUpdateBackground(data: any) {
    try {
      console.log('Handling location update in background:', data);
      
      // Clear cached location data to force refresh
      await AsyncStorage.removeItem('organizationData');
      
      // Set flag for app to refresh location when it opens
      await AsyncStorage.setItem('pendingLocationRefresh', JSON.stringify({
        reason: 'location_updated_background',
        timestamp: new Date().toISOString(),
        data: data
      }));
      
      console.log('Location update processed in background');
    } catch (error: any) {
      console.error('Error handling location update in background:', error);
    }
  }

  // Handle location assignment when app is killed
  async function handleLocationAssignedBackground(data: any) {
    try {
      console.log('Handling location assigned in background:', data);
      
      // Update current location cache
      const locationData = {
        locationId: data.locationId,
        locationName: data.locationName,
        geofenceRadius: data.geofenceRadius,
        coordinates: data.coordinates,
        lastUpdated: data.timestamp || new Date().toISOString(),
        source: 'admin_assignment'
      };
      
      await AsyncStorage.setItem('currentLocation', JSON.stringify(locationData));
      
      // Clear cached organization data to force refresh
      await AsyncStorage.removeItem('organizationData');
      
      // Set flag for app to refresh location when it opens
      await AsyncStorage.setItem('pendingLocationRefresh', JSON.stringify({
        reason: 'location_assigned_background',
        timestamp: new Date().toISOString(),
        data: data
      }));
      
      console.log('Location assignment processed in background');
    } catch (error: any) {
      console.error('Error handling location assigned in background:', error);
    }
  }

  // Handle location request approval when app is killed
  async function handleLocationRequestApprovedBackground(data: any) {
    try {
      console.log('Handling location request approved in background:', data);
      
      // Update current location cache
      const locationData = {
        locationId: data.locationId,
        locationName: data.locationName,
        geofenceRadius: data.geofenceRadius,
        coordinates: data.coordinates,
        lastUpdated: data.timestamp || new Date().toISOString(),
        source: 'request_approved'
      };
      
      await AsyncStorage.setItem('currentLocation', JSON.stringify(locationData));
      
      // Clear cached organization data to force refresh
      await AsyncStorage.removeItem('organizationData');
      
      // Set flag for app to refresh location when it opens
      await AsyncStorage.setItem('pendingLocationRefresh', JSON.stringify({
        reason: 'location_request_approved_background',
        timestamp: new Date().toISOString(),
        data: data
      }));
      
      console.log('Location request approval processed in background');
    } catch (error: any) {
      console.error('Error handling location request approved in background:', error);
    }
  }

  // Handle location request rejection when app is killed
  async function handleLocationRequestRejectedBackground(data: any) {
    try {
      console.log('Handling location request rejected in background:', data);
      
      // Set flag for app to show rejection message when it opens
      await AsyncStorage.setItem('pendingLocationRefresh', JSON.stringify({
        reason: 'location_request_rejected_background',
        timestamp: new Date().toISOString(),
        data: data
      }));
      
      console.log('Location request rejection processed in background');
    } catch (error: any) {
      console.error('Error handling location request rejected in background:', error);
    }
  }

  // Set the background message handler
  messaging().setBackgroundMessageHandler(backgroundMessageHandler);
  console.log('Background message handler registered successfully');

} catch (error: any) {
  console.warn('Firebase not available - background message handler not registered:', error?.message || error);
}

export default null;