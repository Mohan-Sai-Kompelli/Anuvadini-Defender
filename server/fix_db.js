
const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');
const Student = require('./models/Student');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/attendance-anuvadini-local');
  
  const student = await Student.findOne({ uid: '6100000027' });
  
  // Clean up any broken records from previous tests
  await Attendance.deleteMany({ checkOut: { $exists: false }, timestamp: { $exists: false } });
  
  // Also delete the bad ones that had timestamp: undefined (which gets stored as null or missing)
  await mongoose.connection.db.collection('attendances').deleteMany({ timestamp: null });

  const targetDate = new Date('2026-07-10T09:00:00Z');
  
  const newAtt = new Attendance({
    student: student._id,
    organization: student.organization,
    type: 'present',
    date: new Date('2026-07-10T00:00:00Z'),
    timestamp: targetDate,
    checkIn: {
      time: targetDate,
      imageUrl: 'test',
      latitude: 0,
      longitude: 0,
      faceVerified: true
    }
  });
  
  await newAtt.save();
  console.log('Saved proper Mongoose attendance record for July 10!');
  process.exit(0);
}
run();

