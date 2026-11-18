const mongoose = require('mongoose');
const Organization = require('./models/Organization');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/biometric_attendance', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function updateAllOrganizations() {
  try {
    console.log('Updating all organizations to enable all biometric methods...');
    
    const result = await Organization.updateMany(
      {}, // Update all organizations
      {
        $set: {
          'selectedBiometrics.face': true,
          'selectedBiometrics.fingerprint': true,
          'selectedBiometrics.iris': true,
          'selectedBiometrics.palm': true,
          'selectedBiometrics.voice': true
        }
      }
    );
    
    console.log(`Updated ${result.modifiedCount} organizations`);
    
    // Verify the update
    const organizations = await Organization.find({}, 'name selectedBiometrics');
    console.log('\nOrganizations after update:');
    organizations.forEach(org => {
      console.log(`${org.name}: ${JSON.stringify(org.selectedBiometrics)}`);
    });
    
  } catch (error) {
    console.error('Error updating organizations:', error);
  } finally {
    mongoose.disconnect();
  }
}

updateAllOrganizations();
