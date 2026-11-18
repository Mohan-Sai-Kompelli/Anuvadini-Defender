/**
 * restoreMongo.js — backupMongo.js ke banaye backup folder se restore.
 *
 * Usage:
 *   node server/scripts/restoreMongo.js                      // latest backup
 *   node server/scripts/restoreMongo.js 2026-07-14_2100      // specific folder
 *
 * Har document _id se UPSERT hota hai — existing data overwrite nahi khota,
 * missing wapas aa jata hai. (Collection drop nahi karta.)
 */
const fs = require('fs');
const path = require('path');
const { MongoClient, BSON } = require('mongodb');

const MONGODB_URI = 'mongodb://127.0.0.1:27017';
const BACKUP_ROOT = 'C:\\Users\\aakas\\mongo_backups';

(async () => {
  let folder = process.argv[2];
  if (!folder) {
    const all = fs
      .readdirSync(BACKUP_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    folder = all[all.length - 1];
    if (!folder) {
      console.error('Koi backup folder nahi mila in', BACKUP_ROOT);
      process.exit(1);
    }
  }
  const dir = path.join(BACKUP_ROOT, folder);
  console.log('Restoring from:', dir, '\n');

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const [dbName, collName] = file.replace(/\.json$/, '').split('__');
    const docs = BSON.EJSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'), { relaxed: false });
    if (!docs.length) continue;
    const coll = client.db(dbName).collection(collName);
    let upserted = 0;
    for (const doc of docs) {
      const r = await coll.replaceOne({ _id: doc._id }, doc, { upsert: true });
      if (r.upsertedCount || r.modifiedCount) upserted++;
    }
    console.log(`${dbName}.${collName}: ${docs.length} docs (${upserted} restored/updated)`);
  }
  await client.close();
  console.log('\nRestore complete.');
})().catch((e) => {
  console.error('RESTORE FAILED:', e.message);
  process.exit(1);
});
