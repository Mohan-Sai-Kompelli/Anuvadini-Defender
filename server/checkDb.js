const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('SUCCESS: Connected to database');

    const uids = ['7052214376', '8750853678'];
    for (const uid of uids) {
      const user = await mongoose.connection.db.collection('students').findOne({ uid });
      if (user) {
        console.log(`FOUND: UID ${uid} -> Name: ${user.fullName}, Role: ${user.role}, Dept: ${user.department}, IsActive: ${user.isActive}`);
      } else {
        console.log(`NOT FOUND: UID ${uid}`);
      }
    }

    // Also check if Admin organization exists
    const org = await mongoose.connection.db.collection('organizations').findOne({ email: 'admin@example.org' });
    if (org) {
      console.log(`FOUND Admin: admin@example.org -> Name: ${org.name}`);
    } else {
      console.log(`NOT FOUND Admin: admin@example.org`);
    }

  } catch (err) {
    console.error('Error during query:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

run();
