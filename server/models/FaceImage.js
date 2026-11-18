const mongoose = require('mongoose');

const faceImageSchema = new mongoose.Schema(
  {
    uid: { type: String, index: true },
    name: { type: String },
    email: { type: String },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    imageBase64: { type: String },
    originalFilename: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FaceImage', faceImageSchema);
