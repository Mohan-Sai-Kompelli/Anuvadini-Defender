# Push Notification Setup Guide

This guide will help you set up end-to-end push notifications for real-time WFH status updates.

## Prerequisites

1. **Firebase Project**: Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. **Node.js**: Version 18 or higher
3. **React Native**: Version 0.74.1 or higher

## Backend Setup

### 1. Install Dependencies

```bash
cd server
npm install firebase-admin node-cron
```

### 2. Firebase Service Account Setup

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Save it as `server/config/firebase-service-account.json`
5. Or set the `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable with the JSON content

### 3. Environment Variables

Create `server/.env` file:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...} # Optional if using file

# MongoDB and other existing configs
MONGODB_URI=your-mongodb-uri
PORT=5001
```

### 4. Start the Server

```bash
cd server
npm start
```

The server will automatically:
- Initialize Firebase Admin SDK
- Start cron jobs for WFH expiration checks
- Enable push notification endpoints

## Mobile App Setup

### 1. Install Dependencies

```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
```

### 2. Android Configuration

1. Download `google-services.json` from Firebase Console:
   - Go to Project Settings → General
   - Select your Android app
   - Download `google-services.json`
   - Place it in `android/app/google-services.json`

2. Update `android/build.gradle`:

```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.3.15'
    }
}
```

3. Update `android/app/build.gradle`:

```gradle
apply plugin: 'com.google.gms.google-services'

dependencies {
    implementation 'com.google.firebase:firebase-messaging:23.1.2'
}
```

4. Update `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />

<application>
    <!-- Firebase Messaging Service -->
    <service
        android:name="io.invertase.firebase.messaging.RNFirebaseMessagingService"
        android:exported="false">
        <intent-filter>
            <action android:name="com.google.firebase.MESSAGING_EVENT" />
        </intent-filter>
    </service>

    <!-- Notification Channel -->
    <meta-data
        android:name="com.google.firebase.messaging.default_notification_channel_id"
        android:value="wfh_updates" />
</application>
```

### 3. iOS Configuration (if needed)

1. Download `GoogleService-Info.plist` from Firebase Console
2. Add it to your iOS project in Xcode
3. Update `ios/Podfile`:

```ruby
pod 'Firebase/Messaging'
```

4. Run `cd ios && pod install`

### 4. Build and Run

```bash
# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

## Testing the Implementation

### 1. Test Push Notification Registration

1. Login to the mobile app
2. Check server logs for FCM token registration:
   ```
   FCM token updated for student [studentId]
   ```

### 2. Test Manual Notification

Use the test endpoint:

```bash
curl -X POST https://nats-biometric.aicte-india.org1/api/fcm/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Test WFH Assignment Notifications

1. Go to admin dashboard
2. Assign WFH to a student
3. Student should receive push notification immediately
4. Check mobile app - WFH status should update without logout/login

### 4. Test WFH Expiration

1. Create a WFH assignment that expires today
2. Wait for midnight (or trigger manually):
   ```bash
   curl -X POST https://nats-biometric.aicte-india.org1/api/fcm/admin/cron/trigger \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"job": "expired"}'
   ```
3. Student should receive expiration notification

## API Endpoints

### Student Endpoints

- `POST /api/fcm/token` - Update FCM token
- `DELETE /api/fcm/token` - Remove FCM token
- `POST /api/fcm/test` - Send test notification
- `GET /api/wfh/status` - Get current WFH status

### Admin Endpoints

- `POST /api/fcm/admin/broadcast` - Send broadcast notification
- `POST /api/fcm/admin/cron/trigger` - Trigger cron jobs manually
- `GET /api/fcm/admin/stats` - Get FCM statistics

## Cron Jobs

The system runs these automated jobs:

1. **Daily at 8 AM**: Check for WFH assignments expiring tomorrow
2. **Daily at midnight**: Check for expired WFH assignments
3. **Weekly on Sunday 2 AM**: Clean up invalid FCM tokens

## Troubleshooting

### Common Issues

1. **Push notifications not received**:
   - Check Firebase project configuration
   - Verify `google-services.json` is correct
   - Check device notification permissions
   - Verify FCM token is registered on server

2. **Firebase initialization failed**:
   - Check service account key is valid
   - Verify project ID matches
   - Check environment variables

3. **WFH status not updating**:
   - Check push notification service initialization
   - Verify WFH status manager is running
   - Check for JavaScript errors in mobile app

### Debug Commands

```bash
# Check FCM token registration
curl -X GET https://nats-biometric.aicte-india.org1/api/fcm/admin/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Trigger manual WFH expiration check
curl -X POST https://nats-biometric.aicte-india.org1/api/fcm/admin/cron/trigger \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"job": "expired"}'

# Send test broadcast
curl -X POST https://nats-biometric.aicte-india.org1/api/fcm/admin/broadcast \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "body": "This is a test notification"}'
```

## Security Considerations

1. **Firebase Service Account**: Keep the service account key secure
2. **FCM Tokens**: Tokens are automatically cleaned up when invalid
3. **Authentication**: All endpoints require proper JWT authentication
4. **Rate Limiting**: Consider implementing rate limiting for notification endpoints

## Performance Optimization

1. **Batch Notifications**: Use batch sending for multiple students
2. **Token Cleanup**: Invalid tokens are automatically removed weekly
3. **Caching**: WFH status is cached for 5 minutes to reduce server load
4. **Background Processing**: Cron jobs run in background without blocking requests

## Monitoring

Monitor these metrics:

1. **FCM Token Coverage**: Percentage of students with valid tokens
2. **Notification Success Rate**: Successful vs failed notifications
3. **WFH Status Accuracy**: Real-time vs cached status consistency
4. **Cron Job Performance**: Execution time and success rate

## Next Steps

1. **Enhanced Notifications**: Add location-based notifications
2. **Analytics**: Track notification engagement
3. **Personalization**: Customize notification timing per user
4. **Integration**: Connect with calendar systems for automatic WFH scheduling