const mongoose = require('mongoose');
const Student = require('./models/Student');
const pushNotificationService = require('./services/pushNotificationService');
require('dotenv').config();

async function testKillStateWFH() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find student with real FCM token
    const student = await Student.findOne({
      fcmToken: { $exists: true, $ne: null, $ne: '' },
      fullName: 'ankush'
    }).select('_id fullName fcmToken');

    if (!student) {
      console.log('Student "ankush" not found');
      return;
    }

    const action = process.argv[2] || 'assign';

    console.log(`\n🔥 KILL STATE TEST for: ${student.fullName}`);
    console.log('📱 IMPORTANT: Close your mobile app completely (kill it from recent apps)');
    console.log('⏳ Waiting 5 seconds for you to close the app...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (action === 'assign') {
      console.log('\n📋 ASSIGNING WFH WHILE APP IS KILLED...');
      
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 2);
      endDate.setHours(23, 59, 59, 999);

      // Create WFH request
      const WFHRequest = require('./models/WFHRequest');
      const wfhRequest = new WFHRequest({
        student: student._id,
        startDate,
        endDate,
        reason: 'Kill state test - WFH assigned while app closed',
        status: 'approved',
        reviewedBy: student._id,
        reviewedAt: new Date(),
        organization: '68c8a93ddb3311885cdb983f'
      });

      await wfhRequest.save();

      // Add legacy assignment
      const wfhAssignment = {
        startDate,
        endDate,
        reason: 'Kill state test - WFH assigned while app closed',
        assignedBy: student._id,
        assignedAt: new Date(),
        isActive: true
      };

      await Student.findByIdAndUpdate(student._id, {
        $push: { wfhAssignments: wfhAssignment },
        $set: { WFH: 'WFH allowed' }
      });

      // Send notification to killed app
      const result = await pushNotificationService.sendWFHAssignedNotification(
        [student._id], 
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reason: wfhAssignment.reason
        }
      );

      if (result.success) {
        console.log('✅ WFH ASSIGNED to killed app successfully');
        console.log('📱 Now open your mobile app and check:');
        console.log('   1. App should detect background notification');
        console.log('   2. WFH status should be active immediately');
        console.log('   3. No manual refresh needed');
      }

    } else if (action === 'remove') {
      console.log('\n🗑️ REMOVING WFH WHILE APP IS KILLED...');
      
      // Remove from both systems
      await Student.updateOne(
        { _id: student._id },
        { 
          $set: { 
            'wfhAssignments.$[elem].isActive': false,
            WFH: 'NO'
          }
        },
        { arrayFilters: [{ 'elem.isActive': true }] }
      );

      const WFHRequest = require('./models/WFHRequest');
      await WFHRequest.updateMany(
        {
          student: student._id,
          status: 'approved',
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() }
        },
        { $set: { status: 'cancelled', reson: 'Kill state test removal' } }
      );

      // Send notification to killed app
      const result = await pushNotificationService.sendWFHRemovedNotification(
        [student._id], 
        'Kill state test - WFH removed while app closed'
      );

      if (result.success) {
        console.log('✅ WFH REMOVED from killed app successfully');
        console.log('📱 Now open your mobile app and check:');
        console.log('   1. App should detect background notification');
        console.log('   2. WFH status should be cleared immediately');
        console.log('   3. Location checking should start automatically');
      }
    }

    console.log('\n🔍 KILL STATE RECOVERY FEATURES:');
    console.log('• Background message handler processes notifications when app is killed');
    console.log('• App initialization detects and processes background notifications');
    console.log('• Pending refresh flags ensure status is updated on app open');
    console.log('• Cache is properly managed across app kill/restart cycles');

  } catch (error) {
    console.error('Kill state test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

console.log('Kill State WFH Test');
console.log('Usage:');
console.log('  node test-kill-state-wfh.js assign   # Assign WFH while app is killed');
console.log('  node test-kill-state-wfh.js remove   # Remove WFH while app is killed');
console.log('');

testKillStateWFH();