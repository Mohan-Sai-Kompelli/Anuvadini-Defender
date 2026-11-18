require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;

  // All live locations updated in last 2 hours
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const lives = await db.collection('livelocations')
    .find({ updatedAt: { $gte: since } })
    .sort({ updatedAt: -1 })
    .limit(10)
    .toArray();

  console.log(`\nLive locations updated since ${since.toISOString()} — ${lives.length} found`);
  for (const l of lives) {
    // lookup user
    const user = await db.collection('users').findOne({ _id: l.student });
    console.log(`\n  student=${l.student}  name=${user?.name || 'unknown'}  uid=${user?.UID}`);
    console.log(`  lat=${l.latitude}  lon=${l.longitude}  accuracy=${l.accuracy}`);
    console.log(`  insidePremises=${l.insidePremises}  distanceM=${l.distanceM}`);
    console.log(`  lastFixAt=${l.lastFixAt}  updatedAt=${l.updatedAt}`);
    console.log(`  isSharing=${l.isSharing}  exitVerifyCount=${l.exitVerifyCount}`);
  }

  // Also check org location
  const orgs = await db.collection('organizations').find({}).limit(5).toArray();
  console.log('\n=== ORG LOCATIONS ===');
  orgs.forEach(o => console.log(`  org=${o.name || o._id}  lat=${o.location?.latitude}  lon=${o.location?.longitude}  radius=${o.Area_radius}`));

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
