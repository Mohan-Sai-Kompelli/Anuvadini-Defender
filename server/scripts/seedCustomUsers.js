require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Student = require('../models/Student');

async function seed() {
  try {
    console.log('Connecting to MongoDB:', process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    // 1. Create Admin (Organization)
    let org = await Organization.findOne({ email: 'admin@example.org' });
    if (!org) {
      org = new Organization({
        name: 'Test Institute',
        email: 'admin@example.org',
        password: 'Test@123',
        organizationType: 'institute',
        organizationSize: 'medium',
        isActive: true,
      });
      await org.save();
      console.log('Created Admin (Organization): admin@example.org');
    } else {
      console.log('Admin already exists.');
    }

    // 2. Create HOD / Department Login
    let hod = await Student.findOne({ uid: '7052214376' });
    if (!hod) {
      hod = new Student({
        uid: '7052214376',
        fullName: 'HOD Test',
        password: 'Test@123',
        role: 'hod',
        department: 'Computer Science',
        organization: org._id,
        isActive: true,
      });
      await hod.save();
      console.log('Created HOD: 7052214376');
    } else {
      console.log('HOD already exists.');
    }

    // 3. Create Faculty/Staff
    let faculty = await Student.findOne({ uid: '7287284306' });
    if (!faculty) {
      faculty = new Student({
        uid: '7287284306',
        fullName: 'Faculty Test',
        password: 'Test@123',
        role: 'faculty',
        department: 'Computer Science',
        organization: org._id,
        isActive: true,
      });
      await faculty.save();
      console.log('Created Faculty: 7287284306');
    } else {
      console.log('Faculty already exists.');
    }

    // 4. Create Student/UID
    let student = await Student.findOne({ uid: '6100000012' });
    if (!student) {
      student = new Student({
        uid: '6100000012',
        fullName: 'Student Test',
        password: 'Test@123',
        role: 'faculty', // the schema enum is ['faculty', 'staff', 'hod'], so 'faculty' is the default for normal users
        organization: org._id,
        isActive: true,
      });
      await student.save();
      console.log('Created Student UID: 6100000012');
    } else {
      console.log('Student UID already exists.');
    }

    // 5. Create Custom User from prompt
    let customUser = await Student.findOne({ uid: '7206823720' });
    if (!customUser) {
      customUser = new Student({
        uid: '7206823720',
        fullName: 'Test User',
        password: '7206823720', // Password matches UID initially or as requested
        role: 'faculty',
        organization: org._id,
        isActive: true,
      });
      await customUser.save();
      console.log('Created Custom User: 7206823720');
    } else {
      console.log('Custom User 7206823720 already exists.');
    }

    console.log('\nSeed successful!');
    console.log('Note: Superadmin uses SUPER_ADMIN_KEY from .env (Username: superadmin, Password: Super@123)');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding data:', err);
    process.exit(1);
  }
}

seed();
