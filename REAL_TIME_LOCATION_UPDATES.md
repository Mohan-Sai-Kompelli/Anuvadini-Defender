# Real-Time Location Updates Feature

This document explains the implementation of real-time location updates for students when their assigned location is changed by administrators.

## Overview

When an administrator changes a student's location assignment, the system now:

1. **Instantly notifies** the student via push notification
2. **Automatically recalculates** distance based on the new location coordinates
3. **Updates attendance eligibility** in real-time
4. **Works similar to WFH** - no app restart or manual refresh required

## How It Works

### 1. Admin Changes Student Location

When an admin changes a student's location through the web interface:

```javascript
// Server: server/routes/studentLocation.js
router.put('/organizations/:orgId/students/:studentId/location', organizerAuth, async (req, res) => {
  // ... update student location in database
  
  // Send real-time push notification
  await pushNotificationService.sendLocationAssignedNotification(studentId, locationDetails);
});
```

### 2. Push Notification with Location Data

The push notification includes complete location information:

```javascript
// Server: server/services/pushNotificationService.js
const data = {
  type: 'location_assigned',
  locationId: locationDetails._id.toString(),
  locationName: locationDetails.name,
  geofenceRadius: locationDetails.geofenceRadius.toString(),
  coordinates: JSON.stringify(locationDetails.coordinates),
  latitude: locationDetails.coordinates.latitude.toString(),
  longitude: locationDetails.coordinates.longitude.toString(),
  timestamp: new Date().toISOString()
};
```

### 3. Mobile App Processes Notification

The mobile app receives and processes the notification:

```typescript
// Mobile: src/services/firebasePushService.ts
private async handleLocationAssigned(data: PushNotificationData): Promise<void> {
  // Store location data with coordinates for immediate processing
  await AsyncStorage.setItem('pendingLocationRefresh', JSON.stringify({
    reason: 'location_assigned',
    timestamp: new Date().toISOString(),
    data: {
      locationId: data.locationId,
      locationName: data.locationName,
      geofenceRadius: data.geofenceRadius,
      coordinates: data.coordinates // Complete coordinates included
    }
  }));
}
```

### 4. Automatic Distance Recalculation

The AttendanceScreen automatically recalculates distance when it detects a location update:

```typescript
// Mobile: src/AttendanceScreen.tsx
useEffect(() => {
  const checkLocationRefresh = async () => {
    const pendingLocationRefresh = await pushNotificationService.checkPendingLocationRefresh();
    if (pendingLocationRefresh && pendingLocationRefresh.data.coordinates) {
      // Immediately recalculate distance with new location
      if (currentLocation) {
        const newDistance = getDistanceFromLatLonInMeters(
          currentLocation.latitude,
          currentLocation.longitude,
          pendingLocationRefresh.data.coordinates.latitude,
          pendingLocationRefresh.data.coordinates.longitude
        );
        
        setDistance(newDistance);
        
        // Update attendance eligibility
        const newAreaRadius = pendingLocationRefresh.data.geofenceRadius || areaRadius;
        if (newDistance <= newAreaRadius) {
          setCanMarkAttendance(true);
          setLocationStatus('within');
        } else {
          setCanMarkAttendance(false);
          setLocationStatus('outside');
        }
      }
    }
  };
}, [user, organizationData, currentLocation, areaRadius]);
```

## Key Features

### ✅ Instant Updates
- No app restart required
- No manual refresh needed
- Works even when app is in background

### ✅ Automatic Distance Calculation
- Uses coordinates from push notification
- Recalculates distance immediately
- Updates attendance eligibility in real-time

### ✅ User Notifications
- Shows clear message about location change
- Indicates distance has been recalculated
- Provides context about the change

### ✅ Fallback Mechanisms
- If coordinates missing, falls back to server refresh
- Handles network failures gracefully
- Maintains data consistency

## Implementation Details

### Server-Side Changes

1. **Enhanced Location Assignment Route**
   - Sends push notification after location update
   - Includes complete location details in notification

2. **Enhanced Location Request Approval**
   - Sends notification with coordinates when request approved
   - Includes rejection notifications with reasons

3. **Improved Push Notification Service**
   - Includes coordinates in notification payload
   - Properly formats data for mobile consumption

### Mobile-Side Changes

1. **Enhanced Push Notification Handling**
   - Parses coordinates from notification data
   - Stores detailed location information for processing

2. **Real-Time Distance Calculation**
   - Monitors for location updates continuously
   - Recalculates distance using Haversine formula
   - Updates UI immediately

3. **Improved User Experience**
   - Shows contextual notifications
   - Updates location status in real-time
   - Maintains smooth app experience

## Testing

Use the test script to verify the functionality:

```bash
cd server
node test-location-update.js
```

This will:
1. Find a student with FCM token
2. Change their location assignment
3. Send push notification with coordinates
4. Verify the notification is sent successfully

## Flow Diagram

```
Admin Changes Location
        ↓
Database Updated
        ↓
Push Notification Sent (with coordinates)
        ↓
Mobile App Receives Notification
        ↓
Coordinates Parsed & Stored
        ↓
Distance Recalculated Automatically
        ↓
Attendance Eligibility Updated
        ↓
User Notified of Change
```

## Benefits

1. **Real-Time Experience**: Students see location changes instantly
2. **Automatic Processing**: No manual intervention required
3. **Accurate Distance**: Uses exact coordinates for calculation
4. **Better UX**: Seamless experience similar to WFH feature
5. **Reliable**: Multiple fallback mechanisms ensure consistency

## Similar to WFH Feature

This implementation follows the same pattern as the WFH (Work From Home) feature:

- **Push notifications** for instant updates
- **Local caching** for performance
- **Automatic refresh** of relevant data
- **Real-time UI updates** without user action
- **Background processing** when app not active

The location update system provides the same level of real-time responsiveness that users expect from modern mobile applications.