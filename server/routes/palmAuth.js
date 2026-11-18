const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const Attendance = require('../models/Attendance');
const PalmImage = require('../models/PalmImage');
const Student = require('../models/Student');
const { type } = require('os');

const router = express.Router();

// Configure multer for palm image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/palm');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `palm-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Convert image to base64
const imageToBase64 = (imagePath) => {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64String = imageBuffer.toString('base64');
    const mimeType = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64String}`;
  } catch (error) {
    throw new Error('Failed to convert image to base64');
  }
};

// Palm authentication route
router.post('/verify-palm', upload.single('palm_image'), async (req, res) => {
  try {
    const { user_id, latitude, longitude } = req.body;
    console.log(req.body);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Palm image is required'
      });
    }

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Convert uploaded image to base64
    const uploadedImageBase64 = imageToBase64(req.file.path);
    console.log("working fine till here")
    
    // Find stored palm image for the user
    const storedPalmImage = await PalmImage.findOne({ student: user_id });
    console.log(storedPalmImage)
    // console.log('Stored Palm Image:', String(storedPalmImage.imageBase64));
    // console.log(typeof(storedPalmImage.imageBase64));
    
    if (!storedPalmImage) {
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(404).json({
        success: false,
        message: 'No palm image found for this user. Please register first.'
      });
    }

    // Prepare payload for KBY-AI API - compare uploaded image with stored image
    const payload = {
      "data": [uploadedImageBase64,storedPalmImage.imageBase64],
      "event_data": null,
      "fn_index": 13,
      "session_hash": ""
    };
    
    console.log('Payload for KBY-AI API: Comparing uploaded palm with stored palm');
    const payloadPath = path.join(__dirname, './payload3_log.txt');
fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');


    // Call KBY-AI palm detection API
    const response = await fetch("https://web.kby-ai.com/run/predict", {
      method: "POST",
      headers: {
        "accept": "*/*",
        "content-type": "application/json",
        "origin": "https://web.kby-ai.com",
        "referer": "https://web.kby-ai.com/",
        "user-agent": "Mozilla/5.0"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`KBY-AI API responded with status: ${response.status}`);
    }

    const apiResult = await response.json();
    console.log('KBY-AI API Response:', apiResult);

    // Check if the response indicates successful palm matching
    let isValidPalm = false;
    let similarity = 0;

    if (apiResult.data && apiResult.data.length > 0) {
      const resultHtml = apiResult.data[0][0];
      
      // Parse the HTML table response to extract result and similarity
      if (resultHtml.includes('Same hand') || resultHtml.includes('match') || resultHtml.includes('Match')) {
        isValidPalm = true;
        
        // Extract similarity value from the HTML
        const similarityMatch = resultHtml.match(/<td>(\d+\.?\d*)<\/td>/);
        if (similarityMatch) {
          similarity = parseFloat(similarityMatch[1]);
        }
      }
      
      // Also check for similarity score in the response
      
    }

    // Set minimum similarity threshold for palm verification
    const minSimilarityThreshold = 0.70; // 70% similarity threshold
    const student = await Student.findById(user_id);
          if (!student) {
            return res.status(404).json({ message: 'Student not found' });
          }
          console.log(student,"student")
    
    if (isValidPalm) {
      // Mark attendance if palm is verified
      const attendanceData = {
         student: student._id,
        organization: student.organization,
        userId: user_id,
        authMethod: 'palm',
        timestamp: new Date(),
        location: {
          latitude: latitude || 0,
          longitude: longitude || 0
        },
        palmImagePath: req.file.path,
        verificationScore: similarity
      };

      const attendance = new Attendance(attendanceData);
      await attendance.save();
      console.log('Attendance marked successfully:', attendance);

      // Clean up uploaded file after processing
      setTimeout(() => {
        try {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (error) {
          console.error('Error cleaning up file:', error);
        }
      }, 5000);

      res.json({
        success: true,
        message: 'Palm authentication successful',
        data: {
          userId: user_id,
          authMethod: 'palm',
          timestamp: attendanceData.timestamp,
          similarity: similarity,
          attendanceId: attendance._id
        }
      });
    } else {
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(401).json({
        success: false,
        message: `Palm authentication failed - palm does not match (similarity: ${(similarity * 100).toFixed(1)}%)`,
        data: {
          similarity: similarity,
          threshold: minSimilarityThreshold,
          studentUid: user_id
        }
      });
    }

  } catch (error) {
    console.error('Palm authentication error:', error);

    // Clean up uploaded file in case of error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during palm authentication',
      error: error.message
    });
  }
});

// Health check for palm auth service
router.get('/palm-health', (req, res) => {
  console.log('Palm authentication service health check');
  res.json({
    success: true,
    message: 'Palm authentication service is running',
    timestamp: new Date().toISOString()
  });
});

// Get stored palm image for a user (for debugging)
router.get('/palm-image/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const palmImage = await PalmImage.findOne({ studentUid: userId });
    
    if (!palmImage) {
      return res.status(404).json({
        success: false,
        message: 'No palm image found for this user'
      });
    }
    console.log(palmImage.imageBase64);

    res.json({
      success: true,
      data: {
        studentUid: palmImage.studentUid,
        studentName: palmImage.studentName,
        uploadedAt: palmImage.uploadedAt,
        hasImage: !!palmImage.imageBase64,
        imageBase64: palmImage.imageBase64
      }
    });
  } catch (error) {
    console.error('Error fetching palm image:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
