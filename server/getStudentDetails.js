const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Student = require('./models/Student'); // adjust path as needed
const FaceImage = require('./models/FaceImage');

// Is `img` actually renderable by the client (data URI / http(s) URL / a real
// base64 blob), as opposed to a bare local disk path like
// "uploads/faceImages/xxx.jpg" (multer's upload dir — machine-local, doesn't
// survive a redeploy, and was never meant to be served directly to a client)?
function isDisplayableFaceImage(img) {
  if (typeof img !== 'string' || !img) return false;
  if (img.startsWith('data:')) return true;
  if (/^https?:\/\//i.test(img)) return true;
  return img.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(img);
}

router.get('/api/get-student-details/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const student = await Student.findById(id).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const faceImagesDocs = await FaceImage.find({ student: id }).lean();
    const extraImages = faceImagesDocs.map(doc => doc.imageBase64).filter(Boolean);

    // FaceImage docs (durable, inline base64) FIRST, then any ALREADY-
    // displayable entry from the student's own faceImages field. Raw local
    // multer disk paths are dropped — they don't survive a redeploy and would
    // otherwise render as a dead/blank image in the app (this is exactly why
    // the profile photo can go blank after the server is redeployed).
    const legacy = (Array.isArray(student.faceImages) ? student.faceImages : []).filter(
      isDisplayableFaceImage
    );
    student.faceImages = extraImages.concat(legacy);

    res.json(student);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
