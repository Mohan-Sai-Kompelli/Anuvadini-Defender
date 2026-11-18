/**
 * Local test fixture: allow the seeded test accounts to mark attendance from
 * anywhere by turning on the legacy WFH bypass for them.
 *
 * WHY: /api/attendance/mark hard-blocks every org that is not named
 * Anuvadini / NETF / IUAC (and then enforces a campus geofence). The seeded
 * "Test Institute" org is intentionally outside that pool, so without this the
 * mobile check-in can never reach the face + liveness gates.
 *
 * Run: node scripts/setTestWfh.js on|off
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');

const UIDS = ['7206823720', '7052214376', '7287284306', '6100000012'];
const mode = (process.argv[2] || 'on').toLowerCase();
const value = mode === 'off' ? null : 'Allowed';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const r = await Student.updateMany({ uid: { $in: UIDS } }, { $set: { WFH: value } });
  console.log(`WFH ${mode === 'off' ? 'cleared' : 'enabled'} for ${r.modifiedCount} test account(s)`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
