const express = require('express');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const IrisImage = require('../models/IrisImage');
const PalmImage = require('../models/PalmImage');
const auth = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const FormData = require('form-data');
const axios = require('axios');
const path = require('path'); // Added path for file path operations


const multer = require('multer'); // Added multer for file uploads
const fs = require('fs'); // Added fs for file operations

const router = express.Router();


// @route   GET /api/students
// @desc    Get all students for organization
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(id,"id")
    const student = await Student.findById(id).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;