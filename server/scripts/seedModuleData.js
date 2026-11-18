/**
 * Seed sample module data for the Administration department (Anuvadini) so the
 * HOD's Timetable / Teaching Log / Outreach / Spot-Checks pages
 * show real, department-scoped, dynamic data.
 *
 * Idempotent-ish: clears previously-seeded rows for these members first.
 *
 * Run:  node scripts/seedModuleData.js
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

const Organization = require('../models/Organization');
const Student = require('../models/Student');
const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const OutreachActivity = require('../models/OutreachActivity');
const SpotCheck = require('../models/SpotCheck');

const DEPT = 'Administration';
const ORG_EMAIL = 'admin@example.org';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekdayIndex = (date) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7; // Mon=0..Sun=6

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const org = await Organization.findOne({ email: ORG_EMAIL });
    const members = await Student.find({ organization: org._id, department: DEPT }).select('_id fullName');
    if (members.length < 2) throw new Error('Need seeded Administration members first (run seedPortalAccounts.js)');
    const ids = members.map((m) => m._id);
    console.log(`Org ${org.name}, ${DEPT} members: ${members.length}`);

    // Wipe prior seeded rows for these members.
    await Promise.all([
      Timetable.deleteMany({ organization: org._id, faculty: { $in: ids } }),
      ClassCheckin.deleteMany({ organization: org._id, faculty: { $in: ids } }),
      OutreachActivity.deleteMany({ organization: org._id, lead: { $in: ids } }),
      SpotCheck.deleteMany({ organization: org._id, student: { $in: ids } }),
    ]);

    const today = new Date();
    const todayStr = ymd(today);
    const subjects = ['Administration Theory', 'Basics', 'Clinical Practical', 'Engineering Basics'];

    // ── Timetable: 1 slot per weekday per member (so every weekday has classes) ──
    const ttDocs = [];
    members.forEach((m, mi) => {
      for (let day = 0; day < 5; day++) {
        ttDocs.push({
          organization: org._id,
          faculty: m._id,
          subject: subjects[(mi + day) % subjects.length],
          type: ['lecture', 'practical', 'clinical'][(mi + day) % 3],
          day,
          start: `${9 + (day % 3)}:00`,
          end: `${10 + (day % 3)}:00`,
          room: `Room ${101 + mi}`,
        });
      }
    });
    const tts = await Timetable.insertMany(ttDocs);
    console.log(`Timetable slots: ${tts.length}`);

    // ── Teaching Log: check-ins for the last 7 days against each day's slots ──
    const ccDocs = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const ds = ymd(date);
      const widx = weekdayIndex(ds);
      const daySlots = tts.filter((t) => t.day === widx);
      daySlots.forEach((slot, i) => {
        const conducted = (i + d) % 4 !== 0; // most conducted, some missed
        ccDocs.push({
          organization: org._id,
          timetable: slot._id,
          faculty: slot.faculty,
          date: ds,
          actualStart: conducted ? slot.start : undefined,
          actualEnd: conducted ? slot.end : undefined,
          status: conducted ? 'conducted' : 'missed',
          headcount: conducted ? 20 + ((i + d) % 15) : undefined,
          geo: conducted ? { verified: true, place: 'Campus Block A' } : undefined,
          faceVerified: conducted,
          evidenceHash: crypto.createHash('sha256').update(`${slot._id}-${ds}`).digest('hex'),
        });
      });
    }
    const ccs = await ClassCheckin.insertMany(ccDocs);
    console.log(`Teaching-log check-ins: ${ccs.length}`);


    // ── Outreach: 3 activities led by members ──
    const outDocs = members.slice(0, 3).map((m, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - i * 3);
      return {
        organization: org._id,
        lead: m._id,
        title: ['Free Health Camp', 'Rural Wellness Drive', 'Diabetes Awareness Camp'][i],
        type: 'Health Camp',
        date: ymd(date),
        location: ['Village Rampur', 'District Hospital', 'Community Center'][i],
        status: ['completed', 'in_progress', 'completed'][i],
        gpsPoints: 12 + i * 4,
        photoCount: 8 + i * 3,
        participants: 50 + i * 20,
        evidenceHash: crypto.createHash('sha256').update(`outreach-${m._id}-${i}`).digest('hex'),
      };
    });
    const outs = await OutreachActivity.insertMany(outDocs);
    console.log(`Outreach activities: ${outs.length}`);

    // ── Spot-Checks: ~8 per member across the last 30 days (mix responded/missed) ──
    const scDocs = [];
    for (let d = 0; d < 30; d += 3) {
      const issued = new Date(today);
      issued.setDate(issued.getDate() - d);
      issued.setHours(11, 0, 0, 0);
      if (issued.getDay() === 0) continue; // skip Sunday
      const roundId = `seed-round-${ymd(issued)}`;
      members.forEach((m, mi) => {
        const r = (mi + d) % 3; // 0 responded, 1 missed, 2 responded
        const status = r === 1 ? 'missed' : 'responded';
        const expiresAt = new Date(issued.getTime() + 15 * 60000);
        scDocs.push({
          organization: org._id,
          student: m._id,
          roundId,
          issuedAt: issued,
          expiresAt,
          windowMinutes: 15,
          status,
          respondedAt: status === 'responded' ? new Date(issued.getTime() + (2 + mi) * 60000) : undefined,
          responseLatencyMs: status === 'responded' ? (2 + mi) * 60000 : undefined,
          faceVerified: status === 'responded',
          hadAttendanceThatDay: true,
          markedAfterMiss: status === 'missed' && mi === 1, // member #1 = proxy suspect
          triggeredBy: 'auto',
        });
      });
    }
    const scs = await SpotCheck.insertMany(scDocs);
    console.log(`Spot-checks: ${scs.length}`);

    console.log('\n✅ Module data seeded for', DEPT, '— Timetable / Teaching Log / Outreach / Spot-Checks now populated.');
    console.log('Note: Teaching Log defaults to TODAY ('+ todayStr +') and have data; Outreach/Spot-Checks span recent days.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
