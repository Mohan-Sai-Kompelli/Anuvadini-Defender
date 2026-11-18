const mongoose = require('mongoose');

const irisImageSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    studentUid: { type: String },
    studentName: { type: String },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    imageBase64: { type: String },
    originalFilename: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('IrisImage', irisImageSchema);
