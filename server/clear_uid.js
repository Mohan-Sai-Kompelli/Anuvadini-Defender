const mongoose = require('mongoose');
const path = require('path');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');
const ClassCheckin = require('./models/ClassCheckin');
const LiveLocation = require('./models/LiveLocation');
const CheckoutRequest = require('./models/Model_cheakoutRequest');

require('dotenv').config({ path: path.join(__dirname, '.env') });

async function clearUidData() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
    await mongoose.connect(uri);
    console.log(`Connected to database: ${uri}`);

    const uid = '9716272321';
    console.log(`Looking for student with UID: ${uid}`);
    
    const student = await Student.findOne({ uid: uid });
    if (!student) {
      console.log(`Error: No student found with UID: ${uid}`);
      process.exit(1);
    }
    
    console.log(`Found student: ${student.fullName} (ID: ${student._id})`);
    
    const studentId = student._id;

    const resAttendance = await Attendance.deleteMany({ student: studentId });
    const resClass = await ClassCheckin.deleteMany({ student: studentId });
    const resLocation = await LiveLocation.deleteMany({ student: studentId });
    const resCheckout = await CheckoutRequest.deleteMany({ student: studentId });

    console.log('--- Deleted Records ---');
    console.log(`Attendance: ${resAttendance.deletedCount}`);
    console.log(`ClassCheckin: ${resClass.deletedCount}`);
    console.log(`LiveLocation: ${resLocation.deletedCount}`);
    console.log(`CheckoutRequest: ${resCheckout.deletedCount}`);
    console.log('-----------------------');
    console.log('Successfully cleared all check-in/checkout data for this user!');

  } catch (error) {
    console.error('Error clearing data:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

clearUidData();
