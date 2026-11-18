/**
 * Seed SAACMS module data (timetable, class check-ins with evidence, duty
 * outreach) for every organization, using its REAL
 * active staff. Idempotent: each section is skipped if the org already has
 * data in that collection.
 *
 * Run:  node scripts/seedSaacms.js
 */
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Organization = require('../models/Organization');
const Student = require('../models/Student');
const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const OutreachActivity = require('../models/OutreachActivity');

const SUBJECTS = [
  'Administration', 'Finance', 'Human Resources', 'IT', 'Engineering',
  'Operations', 'Legal', 'Research', 'Quality', 'Training',
];
const ROOMS = ['Lecture Hall 1', 'Lecture Hall 2', 'Computer Lab', 'Training Room', 'Auditorium', 'Open Lawn'];
const CLINIC_ROOMS = ['Lab-1', 'Lab-2', 'Lab-3', 'Workshop-1', 'Workshop-2'];
const TYPES = ['lecture', 'lecture', 'practical', 'clinical'];
const SHIFTS = ['Morning (09:00 – 13:00)', 'Evening (14:00 – 18:00)'];
const NOTES = {
  lecture: [
    'Covered the scheduled unit as per syllabus; concluded with a short Q&A.',
    'Lecture completed with case-based discussion. Assignment topics shared.',
    'Revision lecture conducted; doubts session held in the last 15 minutes.',
  ],
  practical: [
    'Demonstration completed; students performed supervised hands-on practice.',
    'Practical conducted as scheduled. Hands-on exercise completed.',
  ],
  clinical: [
    'Field session completed; case discussion with interns.',
    'Site visit completed; records reviewed and updated.',
  ],
};
const CAMPUS = { lat: 26.8718, lng: 75.7906, place: 'Anuvadini Campus' };

const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => d.toISOString().slice(0, 10);
const todayISO = () => iso(new Date());
const weekdayIndex = (d) => (d.getDay() + 6) % 7;
const addMin = (hhmm, delta) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + delta;
  return `${pad2(Math.floor(t / 60) % 24)}:${pad2(t % 60)}`;
};
const pick = (arr, i) => arr[i % arr.length];
const sha = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');

function photoUri({ kind, hue, title, stamp1, stamp2 }) {
  let scene = '';
  if (kind === 'selfie') {
    scene =
      `<circle cx='320' cy='168' r='64' fill='hsl(${hue},32%,40%)'/>` +
      `<path d='M196 340 Q320 232 444 340 Z' fill='hsl(${hue},32%,40%)'/>`;
  } else if (kind === 'room') {
    scene = [200, 258, 316]
      .map((y) => [70, 220, 370, 500]
        .map((x) => `<rect x='${x}' y='${y}' width='92' height='30' rx='5' fill='hsl(${hue},28%,48%)'/>`)
        .join(''))
      .join('');
  } else {
    scene =
      `<rect x='150' y='86' width='340' height='200' rx='8' fill='hsl(${hue},20%,92%)' stroke='hsl(${hue},25%,45%)' stroke-width='5'/>` +
      [126, 162, 198, 234]
        .map((y) => `<rect x='180' y='${y}' width='${280 - (y % 70)}' height='10' rx='5' fill='hsl(${hue},22%,62%)'/>`)
        .join('');
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='420'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},45%,82%)'/><stop offset='1' stop-color='hsl(${hue + 28},42%,64%)'/>` +
    `</linearGradient></defs><rect width='640' height='420' fill='url(#g)'/>` + scene +
    `<text x='320' y='56' text-anchor='middle' font-family='sans-serif' font-size='25' font-weight='600' fill='rgba(15,23,42,0.55)'>${title}</text>` +
    `<rect x='0' y='344' width='640' height='76' fill='rgba(15,23,42,0.62)'/>` +
    `<text x='18' y='376' font-family='sans-serif' font-size='17' fill='white'>📍 ${stamp1}</text>` +
    `<text x='18' y='402' font-family='sans-serif' font-size='15' fill='rgba(255,255,255,0.85)'>${stamp2}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function evidencePhotos(seedIdx, type, room, dateLabel, startedAt) {
  const lat = (CAMPUS.lat + (seedIdx % 9) * 0.0001).toFixed(5);
  const lng = (CAMPUS.lng + (seedIdx % 7) * 0.0001).toFixed(5);
  const stamp1 = `${lat}, ${lng} ±${5 + (seedIdx % 8)}m · ${room}`;
  const stamp2 = `${dateLabel} · ${startedAt} · SAACMS geo-tag verified`;
  const hue = 150 + (seedIdx * 37) % 140;
  return {
    geo: {
      latitude: Number(lat),
      longitude: Number(lng),
      accuracy: 5 + (seedIdx % 8),
      distanceM: 8 + (seedIdx % 35),
      verified: true,
      place: CAMPUS.place,
    },
    photos: [
      { label: 'Geo-tagged selfie — start of class', image: photoUri({ kind: 'selfie', hue, title: `Selfie · ${room}`, stamp1, stamp2 }) },
      { label: type === 'clinical' ? 'Consultation area photo' : 'Classroom wide shot', image: photoUri({ kind: 'room', hue: hue + 40, title: `${type === 'clinical' ? 'Consultation area' : 'Classroom'} · ${room}`, stamp1, stamp2 }) },
      { label: 'Board / register photo', image: photoUri({ kind: 'board', hue: hue + 80, title: 'Board work', stamp1, stamp2 }) },
    ],
  };
}

async function seedOrg(org) {
  const staff = await Student.find({ organization: org._id, isActive: true })
    .select('fullName department')
    .limit(8)
    .lean();
  if (staff.length === 0) {
    console.log(`  – ${org.name}: no active staff, skipped`);
    return;
  }
  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // 1) Timetable (weekly recurring)
  let slots = await Timetable.find({ organization: org._id, deletedAt: null }).lean();
  if (slots.length === 0) {
    const docs = [];
    const startHours = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00'];
    staff.forEach((fac, fi) => {
      for (let k = 0; k < 2; k += 1) {
        const day = (fi + k * 3) % 6;
        const type = pick(TYPES, fi + k);
        const start = pick(startHours, fi * 2 + k);
        const durH = type === 'lecture' ? 1 : 2;
        docs.push({
          organization: org._id,
          faculty: fac._id,
          subject: pick(SUBJECTS, fi + k),
          type,
          day,
          start,
          end: addMin(start, durH * 60),
          room: type === 'clinical' ? pick(CLINIC_ROOMS, fi) : pick(ROOMS, fi + k),
        });
      }
    });
    slots = await Timetable.insertMany(docs);
    console.log(`  ✓ ${org.name}: ${docs.length} timetable slots`);
  } else {
    console.log(`  – ${org.name}: timetable exists (${slots.length})`);
  }

  // 2) Class check-ins (evidence) for today + the last 3 days
  const checkinCount = await ClassCheckin.countDocuments({ organization: org._id });
  if (checkinCount === 0) {
    const docs = [];
    for (let back = 0; back <= 3; back += 1) {
      const d = new Date(today.getTime() - back * 86400000);
      if (d.getDay() === 0) continue; // Sunday
      const dIso = iso(d);
      const dLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const wd = weekdayIndex(d);
      const daySlots = slots.filter((s) => s.day === wd);
      daySlots.forEach((slot, si) => {
        const ended = new Date(`${dIso}T${slot.end}:00`) < new Date();
        if (!ended) return;
        if ((si + back) % 5 === 4) return; // leave ~20% as "missed"
        const startedAt = addMin(slot.start, 1 + (si % 6));
        const endedAt = addMin(slot.end, (si % 5) - 2);
        const ev = evidencePhotos(si + back * 3, slot.type, slot.room, dLabel, startedAt);
        docs.push({
          organization: org._id,
          timetable: slot._id,
          faculty: slot.faculty,
          date: dIso,
          actualStart: startedAt,
          actualEnd: endedAt,
          status: 'conducted',
          note: pick(NOTES[slot.type] || NOTES.lecture, si + back),
          headcount: slot.type === 'clinical' ? 6 + (si % 20) : 28 + (si % 22),
          geo: ev.geo,
          faceVerified: true,
          photos: ev.photos,
          evidenceHash: sha({ t: String(slot._id), dIso }),
        });
      });
    }
    if (docs.length) await ClassCheckin.insertMany(docs);
    console.log(`  ✓ ${org.name}: ${docs.length} class check-ins (with evidence)`);
  } else {
    console.log(`  – ${org.name}: class check-ins exist (${checkinCount})`);
  }


  // 4) Outreach activities
  const outreachCount = await OutreachActivity.countDocuments({ organization: org._id });
  if (outreachCount === 0) {
    const lead = (i) => staff[i % staff.length]._id;
    const docs = [
      { title: 'Free Health Camp — Rampur Village', type: 'Health Camp', lead: lead(0), date: iso(new Date(today.getTime() - 2 * 86400000)), location: 'Rampur Primary School', status: 'completed', gpsPoints: 310, photoCount: 14, participants: 212, evidenceHash: sha({ o: 1 }) },
      { title: 'Wellness Session', type: 'Awareness', lead: lead(1), date: iso(new Date(today.getTime() - 6 * 86400000)), location: 'Community Hall, Ward 7', status: 'completed', gpsPoints: 95, photoCount: 6, participants: 64, evidenceHash: sha({ o: 2 }) },
      { title: 'School Health Screening Drive', type: 'Screening', lead: lead(2), date: todayISO(), location: 'Govt. Sr. Sec. School, Block B', status: 'in_progress', gpsPoints: 88, photoCount: 4, participants: 51 },
      { title: 'Community Awareness — Gram Panchayat', type: 'Awareness', lead: lead(3), date: iso(new Date(today.getTime() + 3 * 86400000)), location: 'Panchayat Bhavan, Kheri', status: 'pending' },
      { title: 'Mobile Outreach — Village Visit', type: 'Health Camp', lead: lead(4), date: iso(new Date(today.getTime() + 5 * 86400000)), location: 'Anganwadi Centre, Devgarh', status: 'pending' },
    ].map((d) => ({ ...d, organization: org._id }));
    await OutreachActivity.insertMany(docs);
    console.log(`  ✓ ${org.name}: ${docs.length} outreach activities`);
  } else {
    console.log(`  – ${org.name}: outreach exists (${outreachCount})`);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set (server/.env) — aborting');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected. Seeding SAACMS data…');
  const orgs = await Organization.find({ isActive: { $ne: false } }).select('name').lean();
  for (const org of orgs) {
    await seedOrg(org);
  }
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
