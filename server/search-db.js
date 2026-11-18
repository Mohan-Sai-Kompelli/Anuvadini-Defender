const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/attendance_anuvadini').then(async () => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  for (let c of collections) {
    const col = db.collection(c.name);
    const docs = await col.find().toArray();
    for (let d of docs) {
      if (JSON.stringify(d).includes('7206823720')) {
        console.log('Found 7206823720 in collection: ' + c.name);
        console.log(d);
      }
    }
  }
  console.log('Done searching.');
  process.exit(0);
});
