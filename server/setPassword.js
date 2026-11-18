const mongoose = require('mongoose');
require('dotenv').config();
const Organization = require('./models/Organization');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    let org = await Organization.findOne({ email: 'admin@example.org' });
    if (!org) {
      console.log('Creating organization admin@example.org...');
      org = new Organization({
        name: 'Anuvadini AICTE',
        email: 'admin@example.org',
        organizationType: 'institute',
        isActive: true,
      });
    }
    org.password = 'Test@123';
    await org.save();
    console.log('✅ Successfully set password for admin@example.org to: Test@123');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit(0);
  }
})();
