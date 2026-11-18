/**
 * Reset every organization's (Admin) login password to a new, unique value.
 *
 * Does NOT touch the super admin — that's SUPER_ADMIN_KEY in the server's
 * .env, not a DB record, and is out of scope here (set manually already).
 *
 * Password scheme: <CleanOrgName><last4OfOrgId>@Nc2026
 *   e.g. "Anuvadini" (_id ...ab12cd34) -> "Anuvadinicd34@Nc2026"
 * Unique per org (org name can repeat, the _id suffix can't), easy to read
 * off the printed table, meets typical password-strength rules.
 *
 * Run:  node server/scripts/resetOrgPasswords.js
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');

const Organization = require('../models/Organization');

function slugify(name) {
  return String(name || 'Org')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12) || 'Org';
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const orgs = await Organization.find({});
    if (!orgs.length) {
      console.log('No organizations found.');
      return;
    }

    const rows = [];
    for (const org of orgs) {
      const suffix = String(org._id).slice(-4);
      const newPassword = `${slugify(org.name)}${suffix}@Nc2026`;
      org.password = newPassword; // pre-save hook bcrypt-hashes this
      await org.save();
      rows.push({ name: org.name, email: org.email, password: newPassword });
    }

    console.log('\n========== NEW ORGANIZATION (Admin) PASSWORDS ==========');
    rows.forEach((r) => {
      console.log(`${r.name.padEnd(28)} | ${r.email.padEnd(35)} | ${r.password}`);
    });
    console.log(`=======================================================`);
    console.log(`${rows.length} organization password(s) updated.\n`);
  } catch (err) {
    console.error('Reset error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
