const express = require('express');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const IrisImage = require('../models/IrisImage');
const PalmImage = require('../models/PalmImage');
const FaceImage = require('../models/FaceImage'); // <-- Add FaceImage model
const auth = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const FormData = require('form-data');
const axios = require('axios');
const path = require('path'); // Added path for file path operations


const multer = require('multer'); // Added multer for file uploads
const fs = require('fs'); // Added fs for file operations

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

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1000 * 1024 * 1024,
    fieldSize: 100 * 1024 * 1024
  }
});



// Helper function to convert image file to base64
const imageToBase64 = (imagePath) => {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64String = imageBuffer.toString('base64');
    const mimeType = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64String}`;
  } catch (error) {
    console.log(error,"erro")
    throw new Error('Failed to convert image to base64',error);
  }
};

// @route   GET /api/students
// @desc    Get all students for organization
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, class: className, department, bureau, search, isActive } = req.query;
    
    const query = { organization: "68c8a93ddb3311885cdb983f" };
    console.log("Query params:", req.query);
    
    if (className) {
      query.class = className;
    }
    
    if (department) {
      query.department = department;
    }
    
    if (bureau) {
      query.bureau = bureau;
    }
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { uid: { $regex: search, $options: 'i' } }
      ];
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const students = await Student.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Student.countDocuments(query);
    
    res.json({
      success: true,
      students,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/students
// @desc    Create new student
// @access  Private
router.post('/', upload.fields([
  { name: 'faceImages', maxCount: 20 },
  { name: 'voiceSample', maxCount: 1 },
  { name: 'fingerprintImage', maxCount: 1 },
  { name: 'irisImage', maxCount: 1 },
  { name: 'palmImage', maxCount: 1 }
]), [
  body('fullName').notEmpty().withMessage('Full name is required'),
  body('age').isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
  body('uid').notEmpty().withMessage('UID is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
], async (req, res) => {
  try {
    console.log('Received student creation request:', {
      body: req.body,
      files: req.files ? Object.keys(req.files) : 'No files',
      organization: "68c8a93ddb3311885cdb983f",
      organizationType: "Government"
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      fullName, age, gender, uid, address, class: className, department, bureau, password, email,organization:organizationId
    } = req.body;

    // if organizationId is 1 then "68c8a93ddb3311885cdb983f" if its 2 then "68c8e27190cbe91ff1811795" else "68c8e1d890cbe91ff181171b"
    const orgId = organizationId === '1' ? "68c8a93ddb3311885cdb983f" : organizationId === '2' ? "68c8e27190cbe91ff1811795" : "68c8e1d890cbe91ff181171b";

    // Parse selectedBiometrics from form data
    let selectedBiometrics = {
      face: true,
      fingerprint: true,
      iris: true,
      palm: true,
      voice: true
    };

    if (req.body.selectedBiometrics) {
      try {
        selectedBiometrics = typeof req.body.selectedBiometrics === 'string' 
          ? JSON.parse(req.body.selectedBiometrics) 
          : req.body.selectedBiometrics;
      } catch (error) {
        console.error('Error parsing selectedBiometrics:', error);
        // Fallback to individual fields
        selectedBiometrics = {
          face: req.body['selectedBiometrics[face]'] === 'true',
          fingerprint: req.body['selectedBiometrics[fingerprint]'] === 'true',
          iris: req.body['selectedBiometrics[iris]'] === 'true',
          palm: req.body['selectedBiometrics[palm]'] === 'true',
          voice: req.body['selectedBiometrics[voice]'] === 'true'
        };
      }
    } else {
      // Fallback to individual fields
      selectedBiometrics = {
        face: req.body['selectedBiometrics[face]'] === 'true',
        fingerprint: req.body['selectedBiometrics[fingerprint]'] === 'true',
        iris: req.body['selectedBiometrics[iris]'] === 'true',
        palm: req.body['selectedBiometrics[palm]'] === 'true',
        voice: req.body['selectedBiometrics[voice]'] === 'true'
      };
    }

    console.log('Parsed selectedBiometrics:', selectedBiometrics);

    // Check if UID already exists
    const existingStudent = await Student.findOne({ uid });
    if (existingStudent) {
      return res.status(400).json({ message: 'Student with this UID already exists' });
    }

    // Validate organization type specific fields
    const orgType = "Government";
    if ((orgType === 'school' || orgType === 'institute') && !className) {
      return res.status(400).json({ message: 'Class is required for schools/institutes' });
    }

    if (orgType === 'private_company' && !department) {
      return res.status(400).json({ message: 'Department is required for private companies' });
    }

    if (orgType === 'government_office' && !bureau) {
      return res.status(400).json({ message: 'Bureau is required for government offices' });
    }

    // Prepare file paths
    const filePaths = {};
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        if (fieldName === 'faceImages') {
          filePaths.faceImages = [];
          req.files.faceImages.forEach((f, idx) => {
            // Add date and time to filename for uniqueness
            const ext = path.extname(f.originalname);
            const now = new Date();
            const timestamp = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
            const newName = `${fullName.replace(/\s+/g, '_')}_${uid}_${idx + 1}_${timestamp}${ext}`;
            const newPath = path.join('uploads', newName);
            fs.renameSync(f.path, newPath);
            f.path = newPath;
            filePaths.faceImages.push(newPath.replace(/\\/g, '/'));
          });
        } else if (req.files[fieldName] && req.files[fieldName][0]) {
          filePaths[fieldName] = req.files[fieldName][0].path.replace(/\\/g, '/');
        }
      });
    }

    // Only set file path fields if files were uploaded
    const studentData = {
      organization: orgId,
      fullName,
      age: parseInt(age),
      gender,
      email: email || undefined,
      uid,
      password: password || undefined,
      address: address || {},
      selectedBiometrics,
      // --- Ensure faceImage is set to first faceImages path if available ---
      faceImage: (filePaths.faceImages && filePaths.faceImages.length > 0) ? filePaths.faceImages : null,
      ...(filePaths.faceImages ? { faceImages: filePaths.faceImages } : {}),
      ...(filePaths.voiceSample ? { voiceSample: filePaths.voiceSample } : {}),
      ...(filePaths.fingerprintImage ? { fingerprintImage: filePaths.fingerprintImage } : {}),
      ...(filePaths.irisImage ? { irisImage: filePaths.irisImage } : {}),
      ...(filePaths.palmImage ? { palmImage: filePaths.palmImage } : {})
    };

    // Remove keys with undefined values to avoid nulls in MongoDB
    Object.keys(studentData).forEach(key => {
      if (studentData[key] === undefined) delete studentData[key];
    });

    const student = new Student(studentData);
    await student.save();

    // Store each face image in FaceImage collection
    if (filePaths.faceImages && filePaths.faceImages.length > 0) {
      for (let i = 0; i < filePaths.faceImages.length; i++) {
        const facePath = filePaths.faceImages[i];
        const base64 = imageToBase64(facePath);
        const faceImageDoc = new FaceImage({
          uid,
          name: fullName,
          email: email || uid,
          imageBase64: base64,
          originalFilename: path.basename(facePath)
        });
        await faceImageDoc.save();
      }
    }

    // Store iris image in separate collection if provided
    if (req.files && req.files.irisImage) {
      try {
        const irisImagePath = req.files.irisImage[0].path;
        const irisBase64 = imageToBase64(irisImagePath);
        
        if (irisBase64) {
          const irisImageDoc = new IrisImage({
            student: student._id,
            studentUid: student.uid,
            studentName: student.fullName,
            organization: orgId,
            imageBase64: 'data:image/jpeg;base64,' + irisBase64,
            originalFilename: req.files.irisImage[0].originalname
          });
          
          await irisImageDoc.save();
          console.log('Iris image stored in collection:', irisImageDoc._id);
        }
      } catch (error) {
        console.error('Error storing iris image:', error);
      }
    }

    // Store palm image in separate collection if provided
    if (req.files && req.files.palmImage) {
      try {

        console.log("palm imahge is fetched sucessfully")

        const palmImagePath = req.files.palmImage[0].path;
        const palmBase64 = imageToBase64(palmImagePath);
        console.log(palmBase64)
        
        if (palmBase64) {
          const palmImageDoc = new PalmImage({
            student: student._id,
            studentUid: student.uid,
            studentName: student.fullName,
            organization: "orgId",
            imageBase64: 'data:image/jpeg;base64,' + palmBase64,
            originalFilename: req.files.palmImage[0].originalname
          });
          
          await palmImageDoc.save();
          console.log('Palm image stored in collection:', palmImageDoc._id);
        }
      } catch (error) {
        console.error('Error storing palm image:', error);
      }
    }

    // Create embedding for all face images together
    if (filePaths.faceImages && filePaths.faceImages.length > 0) {
      try {
        const embeddingForm = new FormData();
        embeddingForm.append('user_id', uid);
        embeddingForm.append('name', fullName);
        embeddingForm.append('email', email || uid);
        // Use renamed file paths for embeddings
        filePaths.faceImages.forEach(facePath => {
          embeddingForm.append('face_images', fs.createReadStream(facePath));
        });
        const headers = embeddingForm.getHeaders();

        const embeddingRes = await axios.post(
          'http://localhost:50011/create-embedding',
          embeddingForm,
          { headers }
        );
        const embeddingData = embeddingRes.data;
        if (!embeddingData.status || embeddingData.status !== 'success') {
          return res.status(500).json({
            success: false,
            message: 'Failed to generate face embedding',
            embeddingError: embeddingData.error,
          });
        }
        // Optionally, you can store embeddingData in the student document
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to generate face embedding',
          embeddingError: err.message,
        });
      }
    }


          // Save the voice sample if provided
          if (req.files && req.files.voiceSample) {
            const voiceSample = req.files.voiceSample[0].path; // Get the path of the uploaded voice sample
            const uid = studentData.uid; // Assuming uid is available in studentData
            const voiceSamplePath = `voice_samples/${student._id}/original.wav`;
            console.log('Voice sample path:', voiceSamplePath);
    
            // Ensure the directory exists
            fs.mkdirSync(`voice_samples/${student._id}`, { recursive: true });
    
            // Move the uploaded file to the structured folder
            fs.renameSync(voiceSample, voiceSamplePath);
    
            // Optionally, store metadata in MongoDB
            // You can create a VoiceSample model if needed
            // const voiceSampleData = new VoiceSample({ uid, path: voiceSamplePath });
            // await voiceSampleData.save();
          }

    // Respond with success (remove faceEmbeddingsResults)
    res.status(201).json({
      success: true,
      student
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add student',
    });
  }
});

// @route   GET /api/students/debug/organization
// @desc    Debug organization biometric settings
// @access  Private
router.get('/debug/organization', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      organization: {
        id: "68c8a93ddb3311885cdb983f",
        name: req.organization.name,
        organizationType: "Government",
        selectedBiometrics: req.organization.selectedBiometrics,
        classes: req.organization.classes,
        departments: req.organization.departments,
        bureaus: req.organization.bureaus
      }
    });
  } catch (error) {
    console.error('Debug organization error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/students/test
// @desc    Test student creation with minimal data
// @access  Private
router.post('/test', auth, async (req, res) => {
  try {
    console.log('Test endpoint - Organization:', {
      id: "68c8a93ddb3311885cdb983f",
      type: "Government",
      biometrics: req.organization.selectedBiometrics
    });

    // Create a minimal test student
    const testStudentData = {
      organization: "68c8a93ddb3311885cdb983f",
      fullName: 'Test Student',
      age: 25,
      gender: 'male',
      uid: 'TEST-' + Date.now(),
      selectedBiometrics: {
        face: true,
        fingerprint: false,
        iris: false,
        palm: false,
        voice: false
      }
    };

    // Add class or department based on organization type
    if ("Government" === 'school' || "Government" === 'institute') {
      testStudentData.class = req.organization.classes?.[0] || 'Test Class';
    } else {
      testStudentData.department = req.organization.departments?.[0] || 'Test Department';
    }

    console.log('Test student data:', testStudentData);

    const student = new Student(testStudentData);
    await student.save();

    res.json({
      success: true,
      message: 'Test student created successfully',
      student
    });
  } catch (error) {
    console.error('Test student creation error:', error);
    res.status(500).json({ 
      message: 'Test failed', 
      error: error.message,
      stack: error.stack 
    });
  }
});

// @route   GET /api/students/:id
// @desc    Get student by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      organization: "68c8a93ddb3311885cdb983f"
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({
      success: true,
      student
    });
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/students/:id
// @desc    Update student
// @access  Private
router.put('/:id', auth, uploadMultiple([
  { name: 'faceImage', maxCount: 1 },
  { name: 'voiceSample', maxCount: 1 },
  { name: 'fingerprintImage', maxCount: 1 },
  { name: 'irisImage', maxCount: 1 },
  { name: 'palmImage', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Update student request:')
    const student = await Student.findOne({
      _id: req.params.id,
      organization: "68c8a93ddb3311885cdb983f"
    });
    console.log('Found student:', student);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const updateData = { ...req.body };
    
    // Handle file uploads
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        if (fieldName === 'faceImage') {
          // Rename face image to name_uid_1.ext
          const ext = path.extname(req.files.faceImage[0].originalname);
          const newName = `${student.fullName.replace(/\s+/g, '_')}_${student.uid}_1${ext}`;
          const newPath = path.join('uploads', newName);
          fs.renameSync(req.files.faceImage[0].path, newPath);
          updateData.faceImage = newPath.replace(/\\/g, '/');

          // Store in FaceImage collection
          const base64 = imageToBase64(newPath);
          const faceImageDoc = new FaceImage({
            uid: student.uid,
            name: student.fullName,
            email: student.email || student.uid,
            imageBase64: base64,
            originalFilename: path.basename(newPath)
          });
          faceImageDoc.save();
        } else if (req.files[fieldName] && req.files[fieldName][0]) {
          updateData[fieldName] = req.files[fieldName][0].path.replace(/\\/g, '/');
        }
      });
    }

    // Parse address if it's a string
    if (updateData.address && typeof updateData.address === 'string') {
      try {
        updateData.address = JSON.parse(updateData.address);
      } catch (error) {
        console.error('Address parsing error:', error);
        updateData.address = {};
      }
    }

    // Parse selectedBiometrics from form data if provided
    if (req.body['selectedBiometrics[face]'] !== undefined) {
      updateData.selectedBiometrics = {
        face: req.body['selectedBiometrics[face]'] === 'true',
        fingerprint: req.body['selectedBiometrics[fingerprint]'] === 'true',
        iris: req.body['selectedBiometrics[iris]'] === 'true',
        palm: req.body['selectedBiometrics[palm]'] === 'true',
        voice: req.body['selectedBiometrics[voice]'] === 'true'
      };
    }

    // Validate selected biometrics if provided
    

    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    console.log('Updated student:', updatedStudent);

    // Store iris image in separate collection if provided (for updates)
    if (req.files && req.files.irisImage) {
      try {
        const irisImagePath = req.files.irisImage[0].path;
        const irisBase64 = imageToBase64(irisImagePath);
        
        if (irisBase64) {
          // Remove old iris image for this student if exists
          await IrisImage.deleteMany({ student: updatedStudent._id });
          
          const irisImageDoc = new IrisImage({
            student: updatedStudent._id,
            studentUid: updatedStudent.uid,
            studentName: updatedStudent.fullName,
            organization: "68c8a93ddb3311885cdb983f",
            imageBase64: irisBase64,
            originalFilename: req.files.irisImage[0].originalname
          });
          
          await irisImageDoc.save();
          console.log('Iris image updated in collection:', irisImageDoc._id);
        }
      } catch (error) {
        console.error('Error updating iris image:', error);
      }
    }
    

    // Store palm image in separate collection if provided (for updates)
    if (req.files && req.files.palmImage) {
      try {
        const palmImagePath = req.files.palmImage[0].path;
        const palmBase64 = imageToBase64(palmImagePath);
        
        if (palmBase64) {
          // Remove old palm image for this student if exists
          await PalmImage.deleteMany({ student: updatedStudent._id });
          
          const palmImageDoc = new PalmImage({
            student: updatedStudent._id,
            studentUid: updatedStudent.uid,
            studentName: updatedStudent.fullName,
            organization: "68c8a93ddb3311885cdb983f",
            imageBase64: palmBase64,
            originalFilename: req.files.palmImage[0].originalname
          });
          
          await palmImageDoc.save();
          console.log('Palm image updated in collection:', palmImageDoc._id);
        }
      } catch (error) {
        console.error('Error updating palm image:', error);
      }
    }

    // --- Add this block for face image embedding ---
    if (req.files && req.files.faceImage) {
      try {
        const faceImage = req.files.faceImage[0].path;
        const embeddingForm = new FormData();
        embeddingForm.append('user_id', updatedStudent.uid);
        embeddingForm.append('name', updatedStudent.fullName);
        embeddingForm.append('email', updatedStudent.uid);
        embeddingForm.append('face_image', fs.createReadStream(faceImage));
        const headers = embeddingForm.getHeaders();

        const embeddingRes = await axios.post(
          'http://localhost:50011/create-embedding',
          embeddingForm,
          { headers }
        );

        const embeddingData = embeddingRes.data;
        if (!embeddingData.status || embeddingData.status !== 'success') {
          return res.status(500).json({
            success: false,
            message: 'Failed to generate face embedding',
            embeddingError: embeddingData.error,
          });
        }
        console.log('Face embedding updated for student:', updatedStudent._id);
      } catch (error) {
        console.error('Error updating face embedding:', error);
      }
    }

    // --- Add this block for voice sample update ---
    if (req.files && req.files.voiceSample) {
      try {
        const voiceSample = req.files.voiceSample[0].path;
        const voiceSamplePath = `voice_samples/${updatedStudent._id}/original.wav`;
        fs.mkdirSync(`voice_samples/${updatedStudent._id}`, { recursive: true });
        fs.renameSync(voiceSample, voiceSamplePath);

        // Optionally, update the student document with the new path
        updatedStudent.voiceSample = voiceSamplePath;
        await updatedStudent.save();
        console.log('Voice sample updated for student:', updatedStudent._id);
      } catch (error) {
        console.error('Error updating voice sample:', error);
      }
    }

    res.json({
      success: true,
      student: updatedStudent
    });
  } catch (error) {
    console.error('Update student error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/students/:id
// @desc    Delete student
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      organization: "68c8a93ddb3311885cdb983f"
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    await Student.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/students/:id/status
// @desc    Toggle student active status
// @access  Private
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      organization: "68c8a93ddb3311885cdb983f"
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.isActive = !student.isActive;
    await student.save();

    res.json({
      success: true,
      student,
      message: `Student ${student.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Toggle student status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/students/stats/overview
// @desc    Get student statistics
// @access  Private
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments({ organization: "68c8a93ddb3311885cdb983f" });
    const activeStudents = await Student.countDocuments({ 
      organization: "68c8a93ddb3311885cdb983f", 
      isActive: true 
    });
    
    let groupStats = [];
    const orgType = "Government";

    if (orgType === 'school' || orgType === 'institute') {
      groupStats = await Student.aggregate([
        { $match: { organization: "68c8a93ddb3311885cdb983f" } },
        { $group: { _id: '$class', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
    } else {
      groupStats = await Student.aggregate([
        { $match: { organization: "68c8a93ddb3311885cdb983f" } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
    }

    const genderStats = await Student.aggregate([
      { $match: { organization: "68c8a93ddb3311885cdb983f" } },
      { $group: { _id: '$gender', count: { $sum: 1 } } }
    ]);

    // Biometric usage stats
    const biometricStats = await Student.aggregate([
      { $match: { organization: "68c8a93ddb3311885cdb983f" } },
      {
        $group: {
          _id: null,
          faceCount: { $sum: { $cond: ['$selectedBiometrics.face', 1, 0] } },
          fingerprintCount: { $sum: { $cond: ['$selectedBiometrics.fingerprint', 1, 0] } },
          irisCount: { $sum: { $cond: ['$selectedBiometrics.iris', 1, 0] } },
          palmCount: { $sum: { $cond: ['$selectedBiometrics.palm', 1, 0] } },
          voiceCount: { $sum: { $cond: ['$selectedBiometrics.voice', 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        totalStudents,
        activeStudents,
        inactiveStudents: totalStudents - activeStudents,
        groupStats,
        genderStats,
        biometricStats: biometricStats[0] || {}
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/students/:id/iris-image
// @desc    Get iris image for student
// @access  Private
router.get('/:id/iris-image', auth, async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      organization: "68c8a93ddb3311885cdb983f"
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const irisImage = await IrisImage.findOne({ student: req.params.id });
    
    if (!irisImage) {
      return res.status(404).json({ message: 'Iris image not found for this student' });
    }

    res.json({
      success: true,
      irisImage: {
        id: irisImage._id,
        studentUid: irisImage.studentUid,
        studentName: irisImage.studentName,
        imageBase64: irisImage.imageBase64,
        originalFilename: irisImage.originalFilename,
        uploadedAt: irisImage.uploadedAt
      }
    });
  } catch (error) {
    console.error('Get iris image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/students/:id/palm-image
// @desc    Get palm image for student
// @access  Private
router.get('/:id/palm-image', auth, async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      organization: "68c8a93ddb3311885cdb983f"
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const palmImage = await PalmImage.findOne({ student: req.params.id });
    
    if (!palmImage) {
      return res.status(404).json({ message: 'Palm image not found for this student' });
    }

    res.json({
      success: true,
      palmImage: {
        id: palmImage._id,
        studentUid: palmImage.studentUid,
        studentName: palmImage.studentName,
        imageBase64: palmImage.imageBase64,
        originalFilename: palmImage.originalFilename,
        uploadedAt: palmImage.uploadedAt
      }
    });
  } catch (error) {
    console.error('Get palm image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/students/iris-images/all
// @desc    Get all iris images for organization
// @access  Private
router.get('/iris-images/all', auth, async (req, res) => {
  try {
    const irisImages = await IrisImage.find({ organization: "68c8a93ddb3311885cdb983f" })
      .populate('student', 'fullName uid')
      .sort({ uploadedAt: -1 });

    res.json({
      success: true,
      irisImages: irisImages.map(img => ({
        id: img._id,
        student: img.student,
        studentUid: img.studentUid,
        studentName: img.studentName,
        imageBase64: img.imageBase64,
        originalFilename: img.originalFilename,
        uploadedAt: img.uploadedAt
      }))
    });
  } catch (error) {
    console.error('Get all iris images error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/students/palm-images/all
// @desc    Get all palm images for organization
// @access  Private
router.get('/palm-images/all', auth, async (req, res) => {
  try {
    const palmImages = await PalmImage.find({ organization: "68c8a93ddb3311885cdb983f" })
      .populate('student', 'fullName uid')
      .sort({ uploadedAt: -1 });

    res.json({
      success: true,
      palmImages: palmImages.map(img => ({
        id: img._id,
        student: img.student,
        studentUid: img.studentUid,
        studentName: img.studentName,
        imageBase64: img.imageBase64,
        originalFilename: img.originalFilename,
        uploadedAt: img.uploadedAt
      }))
    });
  } catch (error) {
    console.error('Get all palm images error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;