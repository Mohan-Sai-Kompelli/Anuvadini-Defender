const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/attendance_anuvadini').then(async () => {
  const db = mongoose.connection.db;
  const result = await db.collection('students').updateOne(
    { uid: '7206823720' },
    { $set: { faceImages: [
      'uploads/WhatsApp Image 2026-07-13 at 15.15.27.jpeg',
      'uploads/WhatsApp Image 2026-07-13 at 15.26.30 (1).jpeg',
      'uploads/WhatsApp Image 2026-07-13 at 15.26.30.jpeg'
    ] } }
  );
  console.log('Update result:', result);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
