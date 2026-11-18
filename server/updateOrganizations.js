const mongoose = require('mongoose');
const Organization = require('./models/Organization');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/biometric', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function updateOrganizations() {
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
    const orgs = await Organization.find({}, 'name selectedBiometrics');
    console.log('Current organization biometric settings:');
    orgs.forEach(org => {
      console.log(`${org.name}:`, org.selectedBiometrics);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error updating organizations:', error);
    process.exit(1);
  }
}

updateOrganizations();
