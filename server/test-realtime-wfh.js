const mongoose = require('mongoose');
const Student = require('./models/Student');
const pushNotificationService = require('./services/pushNotificationService');
require('dotenv').config();

async function testRealtimeWFH() {
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

    console.log(`\n🧪 REAL-TIME WFH TEST for: ${student.fullName}`);
    console.log('📱 Make sure your mobile app is open on the Attendance screen');
    
    // Get user input for which action to perform
    const args = process.argv.slice(2);
    const action = args[0] || 'remove';

    if (action === 'clean') {
      console.log('\n🧹 CLEANING ALL WFH DATA...');
      
      // Remove all legacy assignments
      await Student.findByIdAndUpdate(student._id, {
        $set: { 
          wfhAssignments: [],
          WFH: 'NO'
        }
      });

      // Cancel all WFH requests
      const WFHRequest = require('./models/WFHRequest');
      await WFHRequest.updateMany(
        { student: student._id },
        { $set: { status: 'cancelled', reson: 'Cleaned by test script' } }
      );

      console.log('✅ All WFH data cleaned');
      console.log('📱 Student should have no active WFH from any system');
      
    } else if (action === 'assign') {
      console.log('\n📋 ASSIGNING WFH...');
      
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0); // Start of today
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 2); // 2 days from now
      endDate.setHours(23, 59, 59, 999); // End of day

      // Method 1: Create a new WFH request (recommended)
      const WFHRequest = require('./models/WFHRequest');
      
      // First, check if there's already an active WFH request for today
      const existingRequest = await WFHRequest.findOne({
        student: student._id,
        status: 'approved',
        startDate: { $lte: endDate },
        endDate: { $gte: startDate }
      });

      if (existingRequest) {
        console.log('⚠️ Student already has active WFH request:', {
          start: existingRequest.startDate.toDateString(),
          end: existingRequest.endDate.toDateString(),
          reason: existingRequest.reason
        });
        console.log('📱 This explains why refresh shows WFH active');
        return;
      }

      // Create new WFH request
      const wfhRequest = new WFHRequest({
        student: student._id,
        startDate,
        endDate,
        reason: 'Real-time test WFH assignment via API',
        status: 'approved',
        reviewedBy: student._id, // Using student ID for test
        reviewedAt: new Date(),
        organization: '68c8a93ddb3311885cdb983f' // Default org ID
      });

      await wfhRequest.save();
      console.log('✅ Created new WFH request:', {
        id: wfhRequest._id,
        start: startDate.toDateString(),
        end: endDate.toDateString()
      });

      // Method 2: Also add legacy assignment for compatibility
      const wfhAssignment = {
        startDate,
        endDate,
        reason: 'Real-time test WFH assignment',
        assignedBy: student._id,
        assignedAt: new Date(),
        isActive: true
      };

      await Student.findByIdAndUpdate(student._id, {
        $push: { wfhAssignments: wfhAssignment },
        $set: { WFH: 'WFH allowed' }
      });

      console.log('✅ Added legacy WFH assignment for compatibility');

      const result = await pushNotificationService.sendWFHAssignedNotification(
        [student._id], 
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reason: wfhAssignment.reason
        }
      );

      if (result.success) {
        console.log('✅ WFH ASSIGNED successfully');
        console.log('📱 Check mobile app - should show "Work from home is enabled"');
        console.log('🔄 Refresh should maintain WFH status (not lose it)');
      } else {
        console.log('❌ Failed to assign WFH');
      }

    } else if (action === 'remove') {
      console.log('\n🗑️ REMOVING WFH...');
      
      // Method 1: Deactivate all legacy WFH assignments
      const legacyUpdate = await Student.updateOne(
        { _id: student._id },
        { 
          $set: { 
            'wfhAssignments.$[elem].isActive': false,
            WFH: 'NO'
          }
        },
        {
          arrayFilters: [{ 'elem.isActive': true }]
        }
      );

      console.log('Legacy assignments deactivated:', legacyUpdate.modifiedCount > 0 ? '✅' : '⚠️ None found');

      // Method 2: Cancel active WFH requests from new system
      const WFHRequest = require('./models/WFHRequest');
      const now = new Date();
      
      const requestUpdate = await WFHRequest.updateMany(
        {
          student: student._id,
          status: 'approved',
          startDate: { $lte: now },
          endDate: { $gte: now }
        },
        {
          $set: { 
            status: 'cancelled',
            reson: 'Cancelled by admin - real-time test'
          }
        }
      );

      console.log('WFH requests cancelled:', requestUpdate.modifiedCount, 'requests');

      const result = await pushNotificationService.sendWFHRemovedNotification(
        [student._id], 
        'WFH removed by admin - real-time test (both systems cleared)'
      );

      if (result.success) {
        console.log('✅ WFH REMOVED successfully from both systems');
        console.log('📱 Check mobile app - should immediately show location checking');
        console.log('🔄 Refresh should now maintain "no WFH" status');
      } else {
        console.log('❌ Failed to remove WFH');
      }
    }

    console.log('\n📋 DEBUGGING TIPS:');
    console.log('1. Check mobile app logs for "WFH status changed via listener"');
    console.log('2. Use "Refresh Status" button to force update');
    console.log('3. Use "Check Notifications" button to see pending notifications');
    console.log('4. Ensure app is in foreground when notification is sent');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

console.log('Usage:');
console.log('  node test-realtime-wfh.js clean    # Clean all WFH data');
console.log('  node test-realtime-wfh.js assign   # Assign WFH');
console.log('  node test-realtime-wfh.js remove   # Remove WFH (default)');
console.log('');

testRealtimeWFH();