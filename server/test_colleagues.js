
const mongoose = require('mongoose');
const Student = require('./models/Student');
async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/attendance-anuvadini-local');
  const user = await Student.findOne({ uid: '6100000027' });
  console.log('User org:', user.organization);
  console.log('User dept:', user.department);
  
  const colleagues = await Student.find({
    _id: { $ne: user._id },
    organization: user.organization,
    department: user.department,
    isActive: true,
  }).select('fullName uid designation role').sort({ fullName: 1 });
  
  console.log('Found colleagues:', colleagues.length);
  process.exit(0);
}
run();

