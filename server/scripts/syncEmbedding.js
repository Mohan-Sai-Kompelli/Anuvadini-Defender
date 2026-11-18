const mongoose = require('mongoose');
const Student = require('../models/Student');
const faceVerifyService = require('../services/faceVerifyService');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function sync() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const student = await Student.findOne({ uid: '7206823720' }).lean();
  if (!student) {
    console.log('Student not found');
    process.exit(1);
  }
  
  if (!student.faceImages || student.faceImages.length === 0) {
    console.log('No face images found in Student doc');
    process.exit(1);
  }
  
  const faceImagesBuf = student.faceImages.map(imgPath => {
    const absPath = path.join(__dirname, '..', imgPath);
    if (fs.existsSync(absPath)) {
      return fs.readFileSync(absPath);
    } else {
      console.log('Missing file:', absPath);
      return null;
    }
  }).filter(Boolean);
  
  if (faceImagesBuf.length === 0) {
    console.log('No valid image files found on disk');
    process.exit(1);
  }
  
  console.log('Enrolling user with', faceImagesBuf.length, 'images...');
  const result = await faceVerifyService.enroll({
    uid: student.uid,
    name: student.fullName || student.name,
    email: student.email,
    faceImages: faceImagesBuf
  });
  
  console.log('Enroll result:', result);
  process.exit(0);
}
sync().catch(console.error);
