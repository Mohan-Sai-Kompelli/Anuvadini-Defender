const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const Student = require('./models/Student');
    const Attendance = require('./models/Attendance');

    const student = await Student.findOne({ uid: '9310790241' }).select('_id fullName organization uid');
    if (!student) { console.log('Student not found'); process.exit(1); }
    console.log('Found:', student.fullName, student.uid);

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const existing = await Attendance.findOne({ student: student._id, type: 'in', timestamp: { $gte: startOfDay } });
    if (existing) { console.log('Already checked in today at', existing.timestamp); process.exit(0); }

    const record = await Attendance.create({
      student: student._id,
      organization: student.organization,
      type: 'in',
      timestamp: now,
      latitude: 28.5244,
      longitude: 77.1855,
      location: { latitude: 28.5244, longitude: 77.1855 },
      distance: 5,
      markedOffice: { name: 'Anuvadini', officeName: 'Anuvadini Foundation', withinRange: true },
      faceVerified: true,
      verificationScore: 0.99,
    });
    console.log('CHECK-IN MARKED:', record._id.toString(), 'at', record.timestamp);
    process.exit(0);
  })
  .catch(e => { console.error('Error:', e.message); process.exit(1); });
