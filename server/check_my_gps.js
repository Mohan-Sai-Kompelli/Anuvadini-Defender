require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;

  // find user (anuvadini or current logged-in user)
  const users = await db.collection('users').find({
    $or: [
      { name: { $regex: 'anuvad', $options: 'i' } },
      { email: { $regex: 'anuvad', $options: 'i' } },
      { name: { $regex: 'ankush', $options: 'i' } },
    ]
  }).toArray();

  console.log('\n=== USERS ===');
  users.forEach(u => console.log(` _id=${u._id}  name=${u.name}  uid=${u.UID}`));

  if (users.length === 0) { await mongoose.disconnect(); return; }

  for (const user of users) {
    const live = await db.collection('livelocations').findOne({ student: user._id });
    console.log(`\n=== LiveLocation for ${user.name} ===`);
    if (!live) { console.log('  No LiveLocation doc'); continue; }
    console.log(`  lat=${live.latitude}  lon=${live.longitude}`);
    console.log(`  accuracy=${live.accuracy}  insidePremises=${live.insidePremises}`);
    console.log(`  distanceM=${live.distanceM}  exitVerifyCount=${live.exitVerifyCount}`);
    console.log(`  lastFixAt=${live.lastFixAt}  updatedAt=${live.updatedAt}`);

    // recent trail
    const trail = await db.collection('locationtrails')
      .find({ student: user._id })
      .sort({ at: -1 })
      .limit(5)
      .toArray();
    console.log(`\n  Last ${trail.length} trail pings:`);
    trail.forEach(t => console.log(`    at=${t.at}  lat=${t.latitude}  lon=${t.longitude}  acc=${t.accuracy}  speed=${t.speed}`));
  }

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
