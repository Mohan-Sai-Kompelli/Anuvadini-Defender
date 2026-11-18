const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');
const Organization = require('./models/Organization');
require('dotenv').config();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || '', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

(async () => {
  try {
    console.log('Seeding time-wise attendance data for September 1st, 2nd, and 3rd...');

    // Resolve organization: use SEED_ORG_ID if provided, else provided default ID
    const defaultOrgId = '688c527839a95b0e1e411f11';
    const orgIdStr = process.env.SEED_ORG_ID || defaultOrgId;
    const organizationId = new mongoose.Types.ObjectId(orgIdStr);

    const primaryStudentId = new mongoose.Types.ObjectId('688b1b49859f04f6454127dd');

    // Define the dates we want to seed data for
    const dates = [
      new Date('2025-09-01T00:00:00.000Z'), // September 1st
      new Date('2025-09-02T00:00:00.000Z'), // September 2nd
      new Date('2025-09-03T00:00:00.000Z')  // September 3rd
    ];

    const allDocs = [];

    // Process each date
    for (const targetDate of dates) {
      console.log(`Generating data for ${targetDate.toISOString().split('T')[0]}...`);
      
      const docs = [];
      
      // Create a sample record for this specific date
      const sampleTimestamp = new Date(targetDate);
      sampleTimestamp.setHours(6, 31, 54, 172); // 06:31:54.172Z

      const baseSample = {
        student: primaryStudentId,
        organization: organizationId,
        type: 'in',
        timestamp: sampleTimestamp,
        latitude: 28.536161654802573,
        longitude: 77.15406687094891,
        distance: 0.7261566091291867,
        faceVerified: true,
        faceImage: null,
        authMethod: 'thumb',
        status: 'success',
      };

      docs.push(baseSample);

    // Time slots for the /reports/time-wise buckets
    // Buckets (minutes-from-midnight):
    // - Before 9:00   (< 540)
    // - 9:00-9:29    (540-569)
    // - 9:30-9:59    (570-599)
    // - 10:00-10:59  (600-659)
    // - After 11:00  (>= 660)

      const makeTime = (h, m) => {
        const d = new Date(targetDate);
        d.setHours(h, m, Math.floor(Math.random() * 50), Math.floor(Math.random() * 1000));
        return d;
      };

      const randomNearby = () => ({
        lat: 28.536161654802573 + (Math.random() - 0.5) * 0.0008,
        lng: 77.15406687094891 + (Math.random() - 0.5) * 0.0008,
        distance: Math.random() * 1.8,
        faceVerified: Math.random() > 0.2,
        authMethod: ['face', 'voice', 'iris', 'thumb', 'palm'][Math.floor(Math.random() * 5)],
      });

      const students = [
        primaryStudentId,
        new mongoose.Types.ObjectId('688b1b49859f04f6454127dc'),
        new mongoose.Types.ObjectId('688b1b49859f04f6454127de'),
        new mongoose.Types.ObjectId('688b1b49859f04f6454127df'),
        new mongoose.Types.ObjectId('688b1b49859f04f6454127e0'),
      ];

      const addRecords = (times) => {
        times.forEach((t, idx) => {
          const meta = randomNearby();
          docs.push({
            student: students[idx % students.length],
            organization: organizationId,
            type: 'in',
            timestamp: t,
            latitude: meta.lat,
            longitude: meta.lng,
            distance: meta.distance,
            faceVerified: meta.faceVerified,
            faceImage: null,
            authMethod: meta.authMethod,
            status: 'success',
          });
        });
      };

      // Populate each bucket with a few records
      // Before 9:00 (examples: 08:05, 08:37)
      addRecords([
        makeTime(8, 5),
        makeTime(8, 37),
        makeTime(7, 52),
      ]);

      // 9:00-9:29 (09:07, 09:21)
      addRecords([
        makeTime(9, 7),
        makeTime(9, 21),
        makeTime(9, 12),
      ]);

      // 9:30-9:59 (09:33, 09:48)
      addRecords([
        makeTime(9, 33),
        makeTime(9, 48),
        makeTime(9, 55),
      ]);

      // 10:00-10:59 (10:10, 10:44)
      addRecords([
        makeTime(10, 10),
        makeTime(10, 44),
        makeTime(10, 3),
      ]);

      // After 11:00 (11:05, 11:27, 12:11)
      addRecords([
        makeTime(11, 5),
        makeTime(11, 27),
        makeTime(12, 11),
        makeTime(13, 2),
      ]);

      // Add all documents for this date to the main collection
      allDocs.push(...docs);
    }

    // Insert all documents at once
    const result = await Attendance.insertMany(allDocs);
    console.log(`Inserted ${result.length} attendance records for all dates`);

    // Summarize by report buckets for all dates
    const counts = {
      'Before 9:00': 0,
      '9:00-9:29': 0,
      '9:30-9:59': 0,
      '10:00-10:59': 0,
      'After 11:00': 0,
    };

    result.forEach(r => {
      const dt = new Date(r.timestamp);
      const total = dt.getHours() * 60 + dt.getMinutes();
      if (total < 540) counts['Before 9:00']++;
      else if (total >= 540 && total < 570) counts['9:00-9:29']++;
      else if (total >= 570 && total < 600) counts['9:30-9:59']++;
      else if (total >= 600 && total < 660) counts['10:00-10:59']++;
      else counts['After 11:00']++;
    });

    console.log('Total bucket counts across all dates:', counts);
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
})();
