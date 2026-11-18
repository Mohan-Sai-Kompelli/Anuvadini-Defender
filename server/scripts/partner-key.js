// Create, list or revoke partner keys. Run on the server from the saacms/server folder.
//   node scripts/partner-key.js create "Friend server"   -> prints the key ONCE; store it safely
//   node scripts/partner-key.js list
//   node scripts/partner-key.js revoke <id>
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PartnerApiKey = require('../models/PartnerApiKey');
const { hashKey } = require('../middleware/partnerKey');

// Read MONGODB_URI from the server's .env when it is not already in the environment.
const envFile = path.join(__dirname, '..', '.env');
if (!process.env.MONGODB_URI && fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    if (cmd === 'create') {
      const raw = crypto.randomBytes(32).toString('base64url');
      const doc = await PartnerApiKey.create({
        name: (arg || 'Partner server').slice(0, 80),
        keyHash: hashKey(raw),
        scopes: ['pairing', 'attendance_status'],
        rateLimitPerMin: 300,
      });
      console.log(`KEY ID:      ${doc._id}`);
      console.log(`PARTNER KEY: ${raw}`);
      console.log('Save the partner key now. It is not stored and cannot be shown again.');
    } else if (cmd === 'list') {
      const rows = await PartnerApiKey.find({}, { keyHash: 0 }).sort({ createdAt: -1 }).lean();
      rows.forEach((r) => console.log(`${r._id}  ${r.name}  ${r.revokedAt ? 'REVOKED' : 'active'}  last used: ${r.lastUsedAt || '-'}`));
    } else if (cmd === 'revoke' && arg) {
      await PartnerApiKey.updateOne({ _id: arg }, { $set: { revokedAt: new Date() } });
      console.log(`Revoked ${arg}`);
    } else {
      console.log('Usage: node scripts/partner-key.js create "<name>" | list | revoke <id>');
    }
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
