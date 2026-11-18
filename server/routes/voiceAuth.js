// server/routes/voiceAuth.js

const axios = require('axios');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator'); // Import validation
const Attendance = require('../models/Attendance'); // Import your Attendance model
const Student = require('../models/Student'); // Import your Student model
const Organization = require('../models/Organization'); // Import your Organization model

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

const convertToWav = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of the Earth in meters
  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance; // in meters
}

router.post('/voice-auth', upload.single('audioFile'), async (req, res) => {
  console.log('Received voice auth request:', req.body);
  try {
    const { textSpoken, recordingDuration, userId, latitude, longitude } = req.body;

    if (!req.file) return res.status(400).json({ success: false, message: 'Audio file missing' });

    const uploadedPath = req.file.path;
    const wavPath = uploadedPath.replace(path.extname(uploadedPath), '.wav');

    // Convert to .wav
    await convertToWav(uploadedPath, wavPath);
    console.log('converted', uploadedPath, "wave", wavPath);

    const storedVoicePath = path.join(__dirname, '..', 'voice_samples', userId, 'original.wav');
    console.log(storedVoicePath, "storedvoicepath");

    if (!fs.existsSync(storedVoicePath)) {
      return res.status(404).json({ success: false, message: 'Enrolled voice sample not found' });
    }
    console.log("storedVoicePath", storedVoicePath);

    // Prepare request to Python API
    const form = new FormData();
    form.append('voice1', fs.createReadStream(storedVoicePath));
    form.append('voice2', fs.createReadStream(wavPath));

    const response = await axios.post('http://localhost:5002/verify-voice', form, {
      headers: form.getHeaders()
    });

    const { match, score } = response.data;
    console.log("match", match);
    console.log("score", score);

    if (match) {
      // Directly mark attendance here
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get student data from userId (assuming userId is the student ID)
      const student = await Student.findById(userId);
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
      console.log(student,"student")

      // Get organization details to get location
      const organization = await Organization.findById(student.organization);
      if (!organization || !organization.location) {
        return res.status(400).json({ message: 'Organization location not set' });
      }
      console.log(organization,"organization")

      const distance = calculateDistance(
        latitude,
        longitude,
        organization.location.latitude,
        organization.location.longitude
      );

      // Check if within allowed distance (100 meters)
      if (distance > 100) {
        return res.status(400).json({
          message: 'You must be within 100 meters of the organization to mark attendance',
          distance: distance
        });
      }

      // Create attendance record
      const attendance = new Attendance({
        student: student._id,
        organization: student.organization,
        type: 'in', // or 'out', depending on your logic
        latitude: organization.location.latitude,
        longitude: organization.location.longitude,
        distance: 0,
        faceVerified: false, // Set to true if face verification is done
        status: 'success',
        authMethod: 'voice', // Set the authentication method
        timestamp: new Date()
      });

      console.log('Saving attendance:');
      await attendance.save();

      console.log('Attendance marked successfully:');
      return res.status(201).json({
        success: true,
        attendance: {
          id: attendance._id,
          type: attendance.type,
          timestamp: attendance.timestamp,
          latitude: attendance.latitude,
          longitude: attendance.longitude,
          distance: attendance.distance,
          faceVerified: attendance.faceVerified,
          status: attendance.status
        }
      });
    } else {
      return res.json({
        success: false,
        message: 'Voice does not match',
        confidence: score
      });
    }

  } catch (error) {
    console.error('Voice auth error:', error);
    return res.status(500).json({ success: false, message: 'Voice authentication failed' });
  }
});

module.exports = router;