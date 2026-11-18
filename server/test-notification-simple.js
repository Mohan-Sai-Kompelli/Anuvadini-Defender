#!/usr/bin/env node

/**
 * Simple test to send a notification to verify FCM is working
 * Usage: node test-notification-simple.js
 */

const firebaseService = require('./services/firebaseService');
const Student = require('./models/Student');
const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function testNotification() {
  try {
    console.log('\n🚀 Testing FCM Notification...\n');

    // Initialize Firebase
    firebaseService.initialize();
    console.log('✅ Firebase initialized');

    // Find a student with FCM token
    const student = await Student.findOne({
      fcmToken: { $exists: true, $ne: null, $ne: '' }
    }).select('_id fullName fcmToken');

    if (!student) {
      console.log('❌ No student found with FCM token');
      console.log('💡 Please register an FCM token from the mobile app first');
      return;
    }

    console.log(`📱 Found student: ${student.fullName}`);
    console.log(`🎫 Token: ${student.fcmToken.substring(0, 30)}...`);

    // Send test notification
    const notification = {
      title: '🔔 Test Notification',
      body: 'This is a test to verify FCM is working correctly!'
    };

    const data = {
      type: 'test',
      action: 'test_notification',
      timestamp: new Date().toISOString()
    };

    console.log('\n📤 Sending notification...');
    const result = await firebaseService.sendNotification(student.fcmToken, notification, data);

    if (result.success) {
      console.log(`✅ Notification sent successfully!`);
      console.log(`📨 Message ID: ${result.messageId}`);
      console.log('\n📱 Check your mobile device for the notification');
    } else {
      console.log(`❌ Failed to send notification: ${result.error}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function main() {
  try {
    await connectDB();
    await testNotification();
  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the test
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});