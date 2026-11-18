const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Attendance = require('./models/Attendance');
const ClassCheckin = require('./models/ClassCheckin');
const LiveLocation = require('./models/LiveLocation');
const CheckoutRequest = require('./models/Model_cheakoutRequest');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    const att = await Attendance.deleteMany({});
    const cls = await ClassCheckin.deleteMany({});
    const loc = await LiveLocation.deleteMany({});
    const chk = await CheckoutRequest.deleteMany({});
    console.log(`Deleted:\n- Attendance: ${att.deletedCount}\n- ClassCheckin: ${cls.deletedCount}\n- LiveLocation: ${loc.deletedCount}\n- CheckoutRequest: ${chk.deletedCount}`);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
