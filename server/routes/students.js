const express = require('express');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const IrisImage = require('../models/IrisImage');
const PalmImage = require('../models/PalmImage');
const FaceImage = require('../models/FaceImage');
const faceStorageService = require('../services/faceStorageService');
const securityEventService = require('../services/securityEventService');
const auth = require('../middleware/auth');
const { deptScopeIds } = require('../utils/deptScope');
const { uploadMultiple } = require('../middleware/upload');
const FormData = require('form-data');
const axios = require('axios');
const path = require('path'); // Added path for file path operations


const multer = require('multer'); // Added multer for file uploads
const fs = require('fs'); // Added fs for file operations

// Base URL of the Python face-back embedding service. MUST be configurable:
// the service binds to a different port per environment (e.g. 9092 in prod,
// 50011 locally). Hardcoding localhost:50011 meant enrollment silently failed
// in any env where the service isn't on 50011, while /verify-face (which goes
// through faceVerifyService and honours this same env var) kept working — so
// editing a student "succeeded" but the embedding was never stored.
const FACE_API_URL = process.env.FACE_API_URL || 'http://localhost:50011';

// Face is the only supported attendance biometric, so a thin enrollment (1-2
// photos) has no redundancy: one bad crop/angle failing the quality or PAD
// gate in face-back leaves zero usable images and the whole embedding call
// fails. Requiring a handful of images up front means enrollment survives a
// couple of rejected shots and still produces a solid multi-view reference.
const MIN_FACE_ENROLL_IMAGES = parseInt(process.env.MIN_FACE_ENROLL_IMAGES || '5', 10);

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



// Persist uploaded registration face images into the durable FaceImage store —
// the collection the Admin/HOD "Registration Images" page and the super-admin
// gallery read. The multer files under uploads/ are machine-local and don't
// survive redeploys, so without this the galleries go blank for anyone
// registered here. Also files a copy under face_storage/<user>/registered/
// (same as the portal upload/re-enroll flow). Best-effort: never fails the
// request it hooks into.
async function persistRegistrationFaces(student, faceFiles, { replace = false } = {}) {
  try {
    if (!faceFiles || faceFiles.length === 0) return;
    if (replace) await FaceImage.deleteMany({ student: student._id });

    const docs = [];
    for (const f of faceFiles) {
      try {
        const b64 = imageToBase64(f.path);
        docs.push({
          uid: student.uid,
          name: student.fullName,
          email: student.email || student.uid,
          student: student._id,
          organization: student.organization,
          imageBase64: b64,
          originalFilename: f.originalname,
        });
        faceStorageService.saveRegistered(student, b64);
      } catch (err) {
        console.error('Skipping unreadable face image', f.path, '-', err.message);
      }
    }
    if (docs.length) {
      await FaceImage.insertMany(docs);
      console.log(`Stored ${docs.length} registration face image(s) for student ${student._id}`);
    }
  } catch (err) {
    console.error('Error persisting registration face images:', err);
  }
}

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

// Pick the actual flagged photo (as a base64 data URI) for a security-alert
// email attachment. `security.perImage` comes back from face-back/check.py in
// the SAME ORDER the images were uploaded in, so index into `faceFiles`
// (req.files.faceImages) by the first 'spoof_suspected' entry's position.
// Without this, recordEnrollmentScreening() gets no evidenceImage and the
// alert email that DOES get sent has no image attached — email arrives, but
// the flagged photo the admin needs to see is missing.
const flaggedEvidenceImage = (security, faceFiles) => {
  try {
    const perImage = Array.isArray(security?.perImage) ? security.perImage : [];
    const idx = perImage.findIndex((p) => p?.status === 'spoof_suspected');
    if (idx < 0 || !faceFiles || !faceFiles[idx]) return null;
    return imageToBase64(faceFiles[idx].path);
  } catch (_e) {
    return null;
  }
};

// @route   GET /api/students
// @desc    Get all students for organization
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, class: className, department, bureau, search, isActive } = req.query;

    const query = { organization: req.organization._id };

    // HOD: restrict the roster to their own department members.
    const scope = await deptScopeIds(req);
    if (scope) query._id = { $in: scope };

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
router.post('/', auth, upload.fields([
  { name: 'faceImages', maxCount: 20 }, // <-- Accept up to 20 face images
  { name: 'voiceSample', maxCount: 1 },
  { name: 'fingerprintImage', maxCount: 1 },
  { name: 'irisImage', maxCount: 1 },
  { name: 'palmImage', maxCount: 1 }
]), [
  body('fullName').notEmpty().withMessage('Full name is required'),
  body('age').isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
  body('uid').notEmpty().withMessage('UID is required'),
  body('role').optional({ checkFalsy: true }).isIn(['faculty', 'staff', 'hod']).withMessage('Invalid role'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format')
], async (req, res) => {
  try {
    console.log('Received student creation request:', {
      body: req.body,
      files: req.files ? Object.keys(req.files) : 'No files',
      organization: req.organization._id,
      organizationType: req.organization.organizationType
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      fullName, age, gender, uid, address, class: className, department, bureau, password, role, designation, email
    } = req.body;

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
    const orgType = req.organization.organizationType;
    if ((orgType === 'school' || orgType === 'institute') && !className) {
      return res.status(400).json({ message: 'Class is required for schools/institutes' });
    }

    if (orgType === 'private_company' && !department) {
      return res.status(400).json({ message: 'Department is required for private companies' });
    }

    // SAACMS is department-centric (dashboards scope by department). Accept a
    // department in place of the legacy bureau for government offices.
    if (orgType === 'government_office' && !bureau && !department) {
      return res.status(400).json({ message: 'Department is required' });
    }

    // Reject a too-thin face enrollment before touching the database at all.
    const faceImagesUploaded = req.files && req.files.faceImages ? req.files.faceImages.length : 0;
    if (faceImagesUploaded > 0 && faceImagesUploaded < MIN_FACE_ENROLL_IMAGES) {
      return res.status(400).json({
        success: false,
        message: `Please upload at least ${MIN_FACE_ENROLL_IMAGES} face images for reliable recognition (received ${faceImagesUploaded}).`
      });
    }

    // Generate the face embedding BEFORE creating the student record. Doing
    // this AFTER student.save() (the old order) meant any embedding failure —
    // face-back down, or every uploaded photo rejected by the quality/PAD
    // gate — still left a faculty record behind with no working face auth:
    // "add" appeared to succeed while attendance silently never worked for
    // that person. Failing here instead means nothing is half-saved — the
    // admin gets a clear error and can retry with better photos.
    let embeddingSecurity = null;
    if (faceImagesUploaded > 0) {
      try {
        const embeddingForm = new FormData();
        embeddingForm.append('user_id', uid);
        embeddingForm.append('name', fullName);
        embeddingForm.append('email', uid);
        req.files.faceImages.forEach(faceFile => {
          embeddingForm.append('face_images', fs.createReadStream(faceFile.path));
        });
        const headers = embeddingForm.getHeaders();

        const embeddingRes = await axios.post(
          `${FACE_API_URL}/create-embedding`,
          embeddingForm,
          { headers }
        );
        const embeddingData = embeddingRes.data;
        if (!embeddingData.status || embeddingData.status !== 'success') {
          return res.status(400).json({
            success: false,
            message: embeddingData.error || 'Failed to generate face embedding',
            embeddingError: embeddingData.error,
          });
        }
        embeddingSecurity = embeddingData.security;
      } catch (err) {
        const embeddingError = err.response?.data?.error || err.message;
        const security = err.response?.data?.security || null;
        return res.status(err.response?.status === 400 ? 400 : 502).json({
          success: false,
          message: embeddingError || 'Face embedding service unreachable',
          embeddingError,
          security
        });
      }
    }

    // Prepare file paths
    const filePaths = {};
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        if (fieldName === 'faceImages') {
          // Store all face image paths as array
          filePaths.faceImages = req.files.faceImages.map(f => f.path.replace(/\\/g, '/'));
        } else if (req.files[fieldName] && req.files[fieldName][0]) {
          filePaths[fieldName] = req.files[fieldName][0].path.replace(/\\/g, '/');
        }
      });
    }

    const studentData = {
      organization: req.organization._id,
      fullName,
      age: parseInt(age),
      gender,
      uid,
      email: email || undefined,
      password: password || null, // Don't set password by default for first-time login
      address: address || {},
      class: className,
      department,
      bureau,
      // SAACMS: persist role + designation so HOD department-scoping and portal
      // routing work for users created here (role defaults to 'faculty').
      role,
      designation,
      selectedBiometrics,
      ...filePaths
    };

    const student = new Student(studentData);
    await student.save();

    console.log('Student created successfully:', student._id);

    // Store registration face images in the FaceImage collection so the
    // Admin/HOD and super-admin registration galleries can show them.
    if (req.files && req.files.faceImages && req.files.faceImages.length > 0) {
      await persistRegistrationFaces(student, req.files.faceImages);
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
            organization: req.organization._id,
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
            organization: req.organization._id,
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

    // Enrollment security screening (face-back/check.py runs the same
    // fine-tuned anti-spoof model used at attendance time on every uploaded
    // image, before the embedding above was generated). Any image confidently
    // flagged as a spoof was already excluded from the embedding server-side
    // — this just makes it visible to the super admin, it does not undo the
    // enrollment.
    if (embeddingSecurity) {
      try {
        await securityEventService.recordEnrollmentScreening({
          student: student._id,
          organization: req.organization._id,
          uid: student.uid,
          studentName: student.fullName,
          security: embeddingSecurity,
          evidenceImage: flaggedEvidenceImage(embeddingSecurity, req.files && req.files.faceImages),
        });
      } catch (secErr) {
        console.error('[students] enrollment security event failed:', secErr.message);
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
        id: req.organization._id,
        name: req.organization.name,
        organizationType: req.organization.organizationType,
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
      id: req.organization._id,
      type: req.organization.organizationType,
      biometrics: req.organization.selectedBiometrics
    });

    // Create a minimal test student
    const testStudentData = {
      organization: req.organization._id,
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
    if (req.organization.organizationType === 'school' || req.organization.organizationType === 'institute') {
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
      organization: req.organization._id
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
router.put('/:id', auth, upload.fields([
  { name: 'faceImages', maxCount: 20 }, // <-- match the create route (plural, multi-image)
  { name: 'voiceSample', maxCount: 1 },
  { name: 'fingerprintImage', maxCount: 1 },
  { name: 'irisImage', maxCount: 1 },
  { name: 'palmImage', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Update student request:')
    const student = await Student.findOne({
      _id: req.params.id,
      organization: req.organization._id
    });
    console.log('Found student:', student);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Same redundancy requirement as new enrollment — reject a too-thin
    // re-enroll before touching anything, rather than overwriting a good
    // reference embedding with one built from 1-2 photos.
    const faceImagesForUpdate = req.files && req.files.faceImages ? req.files.faceImages.length : 0;
    if (faceImagesForUpdate > 0 && faceImagesForUpdate < MIN_FACE_ENROLL_IMAGES) {
      return res.status(400).json({
        success: false,
        message: `Please upload at least ${MIN_FACE_ENROLL_IMAGES} face images for reliable recognition (received ${faceImagesForUpdate}).`
      });
    }

    const updateData = { ...req.body };
    
    // Handle file uploads
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        if (fieldName === 'faceImages') {
          // Store all face image paths as an array (mirrors the create route)
          updateData.faceImages = req.files.faceImages.map(f => f.path.replace(/\\/g, '/'));
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

    // Parse selectedBiometrics: the client sends it as a JSON string (mirrors
    // the create route). Without this, the raw string from {...req.body} reaches
    // Mongoose and fails to cast to the nested object. Bracket-notation is a fallback.
    if (req.body.selectedBiometrics !== undefined) {
      try {
        updateData.selectedBiometrics = typeof req.body.selectedBiometrics === 'string'
          ? JSON.parse(req.body.selectedBiometrics)
          : req.body.selectedBiometrics;
      } catch (error) {
        console.error('Error parsing selectedBiometrics:', error);
        delete updateData.selectedBiometrics;
      }
    } else if (req.body['selectedBiometrics[face]'] !== undefined) {
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
            organization: req.organization._id,
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
            organization: req.organization._id,
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

    // Replace the stored registration face images (FaceImage collection) so the
    // Admin/HOD and super-admin galleries show the new enrollment, not the old one.
    if (req.files && req.files.faceImages && req.files.faceImages.length > 0) {
      await persistRegistrationFaces(updatedStudent, req.files.faceImages, { replace: true });
    }

    // --- Regenerate the face embedding from all uploaded images ---
    // check.py keys on user_id (uid) and upserts, so this overwrites the
    // student's existing embedding. Field name must be 'face_images' (plural).
    let embeddingWarning = null;
    if (req.files && req.files.faceImages && req.files.faceImages.length > 0) {
      try {
        const embeddingForm = new FormData();
        embeddingForm.append('user_id', updatedStudent.uid);
        embeddingForm.append('name', updatedStudent.fullName);
        embeddingForm.append('email', updatedStudent.uid);
        req.files.faceImages.forEach(faceFile => {
          embeddingForm.append('face_images', fs.createReadStream(faceFile.path));
        });
        const headers = embeddingForm.getHeaders();

        const embeddingRes = await axios.post(
          `${FACE_API_URL}/create-embedding`,
          embeddingForm,
          { headers }
        );

        const embeddingData = embeddingRes.data;
        if (!embeddingData.status || embeddingData.status !== 'success') {
          // Don't fail the whole update (the student's other fields were saved),
          // but surface it so the failure isn't silent like before.
          embeddingWarning = embeddingData.error || 'Failed to generate face embedding';
          console.error('Face embedding NOT stored for student', updatedStudent._id, '-', embeddingWarning);
        } else {
          console.log('Face embedding updated for student:', updatedStudent._id);
          // Re-enrollment security screening — same PAD gate as new enrollment
          // (see the /students POST handler above). A re-enroll silently
          // overwriting the trusted reference is the highest-leverage insider
          // vector identified in the security assessment, so it gets the same
          // scrutiny as first-time enrollment, not less.
          try {
            await securityEventService.recordEnrollmentScreening({
              student: updatedStudent._id,
              organization: updatedStudent.organization,
              uid: updatedStudent.uid,
              studentName: updatedStudent.fullName,
              security: embeddingData.security,
              evidenceImage: flaggedEvidenceImage(embeddingData.security, req.files && req.files.faceImages),
            });
          } catch (secErr) {
            console.error('[students] re-enrollment security event failed:', secErr.message);
          }
        }
      } catch (error) {
        embeddingWarning = error.message || 'Face embedding service unreachable';
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
      student: updatedStudent,
      ...(embeddingWarning ? { embeddingWarning } : {})
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
      organization: req.organization._id
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
      organization: req.organization._id
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
    // HOD: scope all counts/aggregations to their department members.
    const scope = await deptScopeIds(req);
    const baseMatch = { organization: req.organization._id, ...(scope ? { _id: { $in: scope } } : {}) };

    const totalStudents = await Student.countDocuments(baseMatch);
    const activeStudents = await Student.countDocuments({ ...baseMatch, isActive: true });

    let groupStats = [];
    const orgType = req.organization.organizationType;

    if (orgType === 'school' || orgType === 'institute') {
      groupStats = await Student.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$class', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
    } else {
      groupStats = await Student.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
    }

    const genderStats = await Student.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$gender', count: { $sum: 1 } } }
    ]);

    // Biometric usage stats
    const biometricStats = await Student.aggregate([
      { $match: baseMatch },
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
      organization: req.organization._id
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
      organization: req.organization._id
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
    const irisImages = await IrisImage.find({ organization: req.organization._id })
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
    const palmImages = await PalmImage.find({ organization: req.organization._id })
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
// Shared with the public self-registration route (routes/publicRegistration.js)
// so it can reuse the SAME enrollment logic (face embedding + gallery
// persistence) instead of forking a second copy that drifts out of sync.
module.exports.helpers = {
  persistRegistrationFaces,
  imageToBase64,
  flaggedEvidenceImage,
  MIN_FACE_ENROLL_IMAGES,
  FACE_API_URL,
};