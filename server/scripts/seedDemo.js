/**
 * MASTER DEMO SEED — populates EVERY module across all 3 departments with
 * recent data (including TODAY) so no sidebar on any login shows 0.
 *
 *  • Timetables
 *    (3 academic years, real subjects + doctors), with an academicYear tag.
 *  • Creates the printed faculty as department staff.
 *  • Recent attendance (last ~40 days incl today) + audit logs for everyone.
 *  • Teaching-log check-ins, outreach, spot-checks.
 *  • Leave / WFH / check-out / location-change requests.
 *  • Broad org check-ins TODAY so the Admin/superadmin numbers look healthy.
 *
 * Run:  node scripts/seedDemo.js
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

const Organization = require('../models/Organization');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Timetable = require('../models/Timetable');
const ClassCheckin = require('../models/ClassCheckin');
const OutreachActivity = require('../models/OutreachActivity');
const SpotCheck = require('../models/SpotCheck');
const AuditLog = require('../models/AuditLog');
const LeaveRequest = require('../models/Model_LeaveRequest');
const WFHRequest = require('../models/WFHRequest');
const CheckoutRequest = require('../models/Model_cheakoutRequest');

const ORG_EMAIL = 'admin@example.org';
const PASSWORD = 'Test@123';
// UIDs whose LIVE records must be preserved across a re-seed (their attendance,
// spot-checks, leave and location are left exactly as-is — never deleted or
// overwritten). Dr Varnit Yadav is the live demo persona.
const PRESERVE_UIDS = ['7287284306'];
const isPreserved = (m) => PRESERVE_UIDS.includes(String(m.uid));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekdayIndex = (date) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7; // Mon=0..Sun=6
// Face is the ONLY supported biometric — every check-in is face-verified.
const AUTH = ['face'];
// Start from a high, run-unique base so re-runs never collide with UIDs that
// earlier seed runs already inserted (the students collection persists).
let UID = 7000000000 + (Date.now() % 900000000);
const nextUid = () => String(++UID);

// ── Timetable transcriptions (day 0=Mon..5=Sat) ──
const TT = {
  Administration: {
    year: '2024-2025',
    slots: [
      [0, '09:00', '10:00', 'AyUG-AT', 'practical', 'Dr Gajanan C'], [0, '10:00', '11:00', 'AyUG-DG', 'lecture', 'Dr Dharmendra J'], [0, '11:00', '12:00', 'AyUG-SA2', 'lecture', 'Dr Abdeli B'], [0, '14:00', '15:00', 'AyUG-RB', 'lecture', 'Dr Kruti V'], [0, '15:00', '16:00', 'AyUG-SA2', 'lecture', 'Dr Dinesh T'], [0, '16:00', '17:00', 'AyUG-RN', 'lecture', 'Dr Ketki A'],
      [1, '09:00', '10:00', 'AyUG-RN', 'practical', 'Dr Varnit Yadav'], [1, '10:00', '11:00', 'AyUG-SW', 'lecture', 'Dr Rajiv A'], [1, '11:00', '12:00', 'AyUG-DG', 'lecture', 'Dr Suman S'], [1, '14:00', '15:00', 'AyUG-SA2', 'lecture', 'Dr Dinesh T'], [1, '15:00', '16:00', 'AyUG-DG', 'practical', 'Dr Dharmendra J'], [1, '16:00', '17:00', 'AyUG-RB', 'practical', 'Dr Krushnakumar T'],
      [2, '09:00', '10:00', 'AyUG-RN', 'practical', 'Dr Varnit Yadav'], [2, '11:00', '12:00', 'AyUG-AT', 'lecture', 'Dr Gajanan C'], [2, '12:00', '13:00', 'AyUG-SW', 'lecture', 'Dr Rajiv A'], [2, '14:00', '15:00', 'AyUG-RN', 'lecture', 'Dr Varnit Yadav'], [2, '15:00', '16:00', 'AyUG-DG', 'practical', 'Dr Dharmendra J'], [2, '16:00', '17:00', 'AyUG-RB', 'practical', 'Dr Krushnakumar T'],
      [3, '09:00', '10:00', 'AyUG-RN', 'lecture', 'Dr Varnit Yadav'], [3, '10:00', '11:00', 'AyUG-SA2', 'lecture', 'Dr Abdeli B'], [3, '11:00', '12:00', 'AyUG-DG', 'lecture', 'Dr Dilip J'], [3, '14:00', '15:00', 'AyUG-AT', 'lecture', 'Dr Gajanan C'], [3, '15:00', '16:00', 'AyUG-DG', 'practical', 'Dr Suman S'], [3, '16:00', '17:00', 'AyUG-RB', 'practical', 'Dr Kruti V'],
      [4, '09:00', '10:00', 'AyUG-SA2', 'lecture', 'Dr Dinesh T'], [4, '10:00', '11:00', 'AyUG-SW', 'lecture', 'Dr Satish P'], [4, '11:00', '12:00', 'AyUG-RN', 'lecture', 'Dr Ketki A'], [4, '12:00', '13:00', 'AyUG-RB', 'lecture', 'Dr Krushnakumar T'], [4, '14:00', '15:00', 'AyUG-DG', 'lecture', 'Dr Suman S'], [4, '15:00', '16:00', 'AyUG-DG', 'practical', 'Dr Suman S'],
      [5, '09:00', '10:00', 'AyUG-RB', 'lecture', 'Dr Bharti U'], [5, '10:00', '11:00', 'AyUG-AT', 'practical', 'Dr Gajanan C'], [5, '12:00', '13:00', 'S.S.I.P.', 'lecture', 'Dr Dilip J'],
    ],
  },
  Engineering: {
    year: '2023-2024',
    slots: [
      [0, '09:00', '10:00', 'AyUG-DG', 'lecture', 'Dr Dharmendra J'], [0, '10:00', '11:00', 'AyUG-RB', 'lecture', 'Dr Bharti U'], [0, '11:00', '12:00', 'AyUG-RN', 'practical', 'Dr Anand P'], [0, '14:00', '15:00', 'AyUG-SA2', 'lecture', 'Dr Abdeli B'], [0, '15:00', '16:00', 'AyUG-AT', 'practical', 'Dr Gajanan C'],
      [1, '09:00', '10:00', 'AyUG-SA2', 'lecture', 'Dr Kishor S'], [1, '10:00', '11:00', 'AyUG-DG', 'lecture', 'Dr Suman S'], [1, '11:00', '12:00', 'AyUG-RN', 'lecture', 'Dr Ketki A'], [1, '12:00', '13:00', 'AyUG-RB', 'lecture', 'Dr Kruti V'], [1, '14:00', '15:00', 'AyUG-SW', 'lecture', 'Dr Satish P'], [1, '15:00', '16:00', 'AyUG-DG', 'practical', 'Dr Suman S'],
      [2, '09:00', '10:00', 'AyUG-AT', 'practical', 'Dr Gajanan C'], [2, '11:00', '12:00', 'AyUG-RB', 'lecture', 'Dr Kruti V'], [2, '12:00', '13:00', 'AyUG-DG', 'lecture', 'Dr Dilip J'], [2, '14:00', '15:00', 'AyUG-AT', 'lecture', 'Dr Gajanan C'], [2, '15:00', '16:00', 'AyUG-DG', 'practical', 'Dr Suman S'],
      [3, '09:00', '10:00', 'AyUG-SW', 'lecture', 'Dr Rajiv A'], [3, '10:00', '11:00', 'AyUG-AT', 'lecture', 'Dr Gajanan C'], [3, '11:00', '12:00', 'AyUG-RN', 'lecture', 'Dr Anand P'], [3, '12:00', '13:00', 'AyUG-SW', 'practical', 'Dr Rajiv A'], [3, '14:00', '15:00', 'AyUG-DG', 'lecture', 'Dr Suman S'], [3, '15:00', '16:00', 'AyUG-RB', 'practical', 'Dr Bharti U'],
      [4, '09:00', '10:00', 'AyUG-RN', 'lecture', 'Dr Anand P'], [4, '11:00', '12:00', 'AyUG-SW', 'lecture', 'Dr Satish P'], [4, '12:00', '13:00', 'AyUG-SA2', 'lecture', 'Dr Kishor S'], [4, '14:00', '15:00', 'AyUG-RN', 'practical', 'Dr Ketki A'], [4, '15:00', '16:00', 'AyUG-DG', 'practical', 'Dr Dilip J'],
      [5, '09:00', '10:00', 'AyUG-AT', 'lecture', 'Dr Gajanan C'], [5, '10:00', '11:00', 'AyUG-SA2', 'lecture', 'Dr Abdeli B'], [5, '11:00', '12:00', 'AyUG-RB', 'lecture', 'Dr Krushnakumar T'], [5, '12:00', '13:00', 'S.S.I.P.', 'lecture', 'Dr Dilip J'],
    ],
  },
  'Operations': {
    year: '2025-2026',
    slots: [
      [0, '09:00', '10:00', 'SANSKRIT', 'lecture', 'Dr Babubhai V'], [0, '10:00', '11:00', 'SA', 'lecture', 'Dr M.R. Gupta'], [0, '11:00', '12:00', 'RS', 'lecture', 'Dr Dipak S'], [0, '12:00', '13:00', 'KS', 'lecture', 'Dr Deepika C'], [0, '14:00', '15:00', 'SA', 'lecture', 'Dr M.R. Gupta'], [0, '15:00', '17:00', 'KS', 'practical', 'Dr Niraj M'],
      [1, '09:00', '10:00', 'PV', 'lecture', 'Dr Abdeli B'], [1, '10:00', '11:00', 'RS', 'lecture', 'Dr Dipak S'], [1, '11:00', '12:00', 'KS', 'lecture', 'Dr Rakesh P'], [1, '12:00', '13:00', 'SA', 'lecture', 'Dr M.R. Gupta'], [1, '14:00', '15:00', 'SANSKRIT', 'lecture', 'Dr Babubhai V'], [1, '15:00', '17:00', 'RS', 'practical', 'Dr Umesh Y'],
      [2, '09:00', '10:00', 'PV', 'lecture', 'Dr Abdeli B'], [2, '10:00', '11:00', 'SA', 'lecture', 'Dr Babubhai V'], [2, '11:00', '12:00', 'RS', 'lecture', 'Dr Umesh Y'], [2, '12:00', '13:00', 'SANSKRIT', 'lecture', 'Dr Babubhai V'], [2, '14:00', '15:00', 'KS', 'lecture', 'Dr Niraj M'], [2, '15:00', '17:00', 'KS', 'practical', 'Dr Deepika C'],
      [3, '09:00', '10:00', 'PV', 'lecture', 'Dr Abdeli B'], [3, '10:00', '11:00', 'SANSKRIT', 'lecture', 'Dr Babubhai V'], [3, '11:00', '12:00', 'RS', 'lecture', 'Dr Umesh Y'], [3, '12:00', '13:00', 'SA', 'lecture', 'Dr Dinesh T'], [3, '15:00', '17:00', 'RS', 'practical', 'Dr Dipak S'],
      [4, '09:00', '10:00', 'KS', 'lecture', 'Dr Rakesh P'], [4, '10:00', '11:00', 'SANSKRIT', 'lecture', 'Dr Babubhai V'], [4, '11:00', '12:00', 'RS', 'lecture', 'Dr Umesh Y'], [4, '12:00', '13:00', 'PV', 'lecture', 'Dr Abdeli B'], [4, '14:00', '15:00', 'SA', 'lecture', 'Dr Dinesh T'], [4, '15:00', '17:00', 'KS', 'practical', 'Dr Deepika C'],
      [5, '09:00', '10:00', 'SA', 'lecture', 'Dr Dinesh T'], [5, '10:00', '11:00', 'SANSKRIT', 'lecture', 'Dr Babubhai V'], [5, '11:00', '12:00', 'RS', 'lecture', 'Dr Dipak S'],
    ],
  },
};

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const org = await Organization.findOne({ email: ORG_EMAIL });
    if (!org) throw new Error('Anuvadini org not found');
    console.log('Org:', org.name, org._id.toString());

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const auditDocs = [];
    const attDocs = [];

    // Build a check-in + check-out (+ audit) for one student on a date.
    const pushAttendance = (studentId, name, uid, date, present) => {
      if (!present) return;
      const inH = 9, inM = Math.floor(Math.random() * 35);
      const inTs = new Date(date); inTs.setHours(inH, inM, 0, 0);
      const outTs = new Date(date); outTs.setHours(17, Math.floor(Math.random() * 40), 0, 0);
      const method = AUTH[Math.floor(Math.random() * AUTH.length)];
      attDocs.push({ student: studentId, organization: org._id, type: 'in', timestamp: inTs, authMethod: method, faceVerified: method === 'face', status: 'success', distance: Math.floor(Math.random() * 60) });
      attDocs.push({ student: studentId, organization: org._id, type: 'out', timestamp: outTs, authMethod: method, status: 'success' });
      auditDocs.push({ organization: org._id, actorType: 'student', actor: studentId, actorLabel: `${name} (${uid})`, action: 'attendance.marked', outcome: 'success', targetType: 'attendance', at: inTs, metadata: { type: 'in', authMethod: method, faceVerified: method === 'face', distance: 12 } });
      auditDocs.push({ organization: org._id, actorType: 'student', actor: studentId, actorLabel: `${name} (${uid})`, action: 'attendance.face_verify', outcome: method === 'face' ? 'success' : 'info', targetType: 'attendance', at: inTs, metadata: { mode: 'shadow', match: method === 'face', score: 0.6 + Math.random() * 0.39 } });
    };

    let totalFaculty = 0;
    for (const [dept, cfg] of Object.entries(TT)) {
      // Existing dept members.
      const existing = await Student.find({ organization: org._id, department: dept }).select('_id fullName uid');
      const byName = new Map();

      // Create the printed doctors as department faculty (idempotent by name+dept).
      const doctorNames = [...new Set(cfg.slots.map((s) => s[5]))];
      for (const dn of doctorNames) {
        let doc = await Student.findOne({ organization: org._id, department: dept, fullName: dn });
        if (!doc) {
          doc = await Student.create({
            uid: nextUid(), fullName: dn, email: `${dn.replace(/[^a-z]/gi, '').toLowerCase()}@gac.edu`,
            organization: org._id, department: dept, role: 'faculty',
            designation: ['Professor', 'Reader', 'Lecturer'][Math.floor(Math.random() * 3)],
            gender: ['male', 'female'][Math.floor(Math.random() * 2)], age: 35 + Math.floor(Math.random() * 20),
            password: PASSWORD, isActive: true,
          });
        }
        byName.set(dn, doc);
        if (dn === 'Dr Varnit Yadav') {
          console.log(`>>> FACULTY DEMO LOGIN → Dr Varnit Yadav  ·  UID: ${doc.uid}  ·  Password: ${PASSWORD}  ·  Dept: ${dept}`);
        }
      }
      const allMembers = [...existing, ...byName.values()].reduce((acc, m) => { acc.set(String(m._id), m); return acc; }, new Map());
      const members = [...allMembers.values()];
      totalFaculty += members.length;

      // Members eligible for delete + re-seed of LIVE data (attendance / spot-checks
      // / leave / location). Preserved personas are excluded so their hand-made
      // records survive the re-seed untouched. Schedule scaffolding (timetable,
      // teaching log, duty, outreach) is still rebuilt for everyone — it is not
      // "live" data and rebuilding avoids duplicates.
      const keepMembers = members.filter((m) => !isPreserved(m));
      const keepIds = keepMembers.map((m) => m._id);

      // ── Timetable ──
      await Timetable.deleteMany({ organization: org._id, faculty: { $in: members.map((m) => m._id) } });
      const ttDocs = cfg.slots.map(([day, start, end, subject, type, doctor]) => ({
        organization: org._id, faculty: byName.get(doctor)._id, facultyLabel: doctor,
        academicYear: cfg.year, subject, type, day, start, end,
        room: type === 'practical' ? 'Practical Lab' : `Lecture Hall ${1 + (day % 3)}`,
      }));
      // Put the dept's own NAMED staff (incl the HOD) on the timetable too — at
      // the free 08:00 slot — so they show in Admin/HOD views AND see their own
      // classes when THEY log in (cross-role sync demo).
      const subjPool = [...new Set(cfg.slots.map((s) => s[3]))];
      existing.forEach((m, i) => {
        ttDocs.push({ organization: org._id, faculty: m._id, facultyLabel: m.fullName, academicYear: cfg.year, subject: subjPool[i % subjPool.length], type: 'lecture', day: i % 6, start: '08:00', end: '09:00', room: 'Lecture Hall 1' });
        ttDocs.push({ organization: org._id, faculty: m._id, facultyLabel: m.fullName, academicYear: cfg.year, subject: subjPool[(i + 2) % subjPool.length], type: 'practical', day: (i + 3) % 6, start: '08:00', end: '09:00', room: 'Practical Lab' });
      });
      const tts = await Timetable.insertMany(ttDocs);

      // ── Teaching-log check-ins for last 8 days (incl today) ──
      await ClassCheckin.deleteMany({ organization: org._id, faculty: { $in: members.map((m) => m._id) } });
      const ccDocs = [];
      const photoSet = (slot, ds, n) => Array.from({ length: n }, (_, i) => ({
        label: ['Check-in selfie (geo-tagged)', 'Classroom — students present', 'Whiteboard / topic covered', 'Group activity'][i] || `Evidence ${i + 1}`,
        image: `https://picsum.photos/seed/${String(slot._id).slice(-6)}${ds.replace(/-/g, '')}${i}/640/420`,
      }));
      for (let d = 0; d < 8; d++) {
        const date = new Date(today); date.setDate(date.getDate() - d);
        const ds = ymd(date); const widx = weekdayIndex(ds);
        let madeOngoing = false;
        tts.filter((t) => t.day === widx).forEach((slot, i) => {
          const conducted = (i + d) % 5 !== 0;
          // On TODAY, make the FIRST conducted class "ongoing" (mid-process):
          // started, not ended, partial evidence.
          const ongoing = d === 0 && conducted && !madeOngoing;
          if (ongoing) madeOngoing = true;
          const status = ongoing ? 'ongoing' : conducted ? 'conducted' : 'missed';
          ccDocs.push({
            organization: org._id, timetable: slot._id, faculty: slot.faculty, date: ds,
            actualStart: conducted ? slot.start : undefined,
            actualEnd: ongoing ? undefined : (conducted ? slot.end : undefined),
            status,
            headcount: conducted ? 18 + ((i + d) % 20) : undefined,
            note: conducted ? (ongoing ? 'Class in progress — students checked in, lecture underway.' : 'Class conducted as scheduled. Syllabus topic covered; good student participation in Q&A.') : undefined,
            geo: conducted ? { verified: true, place: 'Lecture Hall, Campus Block A', latitude: 22.3 + Math.random() * 0.01, longitude: 73.18 + Math.random() * 0.01, accuracy: 6, distanceM: 4 + (i % 12) } : undefined,
            faceVerified: conducted,
            photos: conducted ? photoSet(slot, ds, ongoing ? 1 : 3) : [],
            evidenceHash: crypto.createHash('sha256').update(`${slot._id}-${ds}`).digest('hex'),
          });
        });
      }
      await ClassCheckin.insertMany(ccDocs);

      // ── Outreach ── (first 3 members + Varnit, so the named demo faculty has
      // their own outreach history to show on the portal page).
      await OutreachActivity.deleteMany({ organization: org._id, lead: { $in: members.map((m) => m._id) } });
      const varnit = members.find((m) => m.fullName === 'Dr Varnit Yadav');
      const outreachLeads = members.slice(0, 3);
      if (varnit && !outreachLeads.some((m) => String(m._id) === String(varnit._id))) outreachLeads.push(varnit);
      const OUT_TITLES = ['Free Health Camp', 'Rural Wellness Drive', 'Diabetes Awareness Camp', 'School Awareness Drive', 'Lifestyle Workshop'];
      const OUT_TYPES = ['Health Camp', 'Health Camp', 'Awareness Drive', 'Awareness Drive', 'Workshop'];
      const OUT_LOC = ['Village Rampur', 'District Hospital', 'Community Center', 'Govt. School, Sokhada', 'Community Hall'];
      const OUT_STATUS = ['completed', 'in_progress', 'completed', 'completed', 'completed'];
      await OutreachActivity.insertMany(
        outreachLeads.map((m, i) => {
          const date = new Date(today); date.setDate(date.getDate() - i * 4);
          return {
            organization: org._id, lead: m._id, title: OUT_TITLES[i % OUT_TITLES.length],
            type: OUT_TYPES[i % OUT_TYPES.length], date: ymd(date), location: OUT_LOC[i % OUT_LOC.length],
            status: OUT_STATUS[i % OUT_STATUS.length], gpsPoints: 12 + i * 4, photoCount: 8 + i * 3, participants: 50 + i * 20,
            evidenceHash: crypto.createHash('sha256').update(`out-${m._id}-${i}`).digest('hex'),
          };
        })
      );

      // ── Spot-checks last 30 days ──
      // Only delete previously SEEDED rounds (roundId starts with "seed-") and
      // never touch preserved personas — so any live/manually-issued spot-checks
      // survive the re-seed.
      await SpotCheck.deleteMany({ organization: org._id, student: { $in: keepIds }, roundId: { $regex: '^seed-' } });
      const scDocs = [];
      for (let d = 0; d < 30; d += 3) {
        const issued = new Date(today); issued.setDate(issued.getDate() - d); issued.setHours(11, 0, 0, 0);
        if (issued.getDay() === 0) continue; // skip Sunday
        const roundId = `seed-${dept}-${ymd(issued)}`;
        keepMembers.slice(0, 10).forEach((m, mi) => {
          const status = (mi + d) % 3 === 1 ? 'missed' : 'responded';
          scDocs.push({ organization: org._id, student: m._id, roundId, issuedAt: issued,
            expiresAt: new Date(issued.getTime() + 15 * 60000), windowMinutes: 15, status,
            respondedAt: status === 'responded' ? new Date(issued.getTime() + (2 + mi) * 60000) : undefined,
            responseLatencyMs: status === 'responded' ? (2 + mi) * 60000 : undefined, faceVerified: status === 'responded',
            hadAttendanceThatDay: true, markedAfterMiss: status === 'missed' && mi % 4 === 1, triggeredBy: 'auto' });
        });
      }
      await SpotCheck.insertMany(scDocs);

      // ── Attendance + audit for all dept faculty, last 40 days (skip Sun); 1 absent today ──
      // Preserved personas are excluded from both the wipe and the rebuild, so
      // their live check-ins remain exactly as they are.
      await Attendance.deleteMany({ organization: org._id, student: { $in: keepIds } });
      for (let d = 0; d < 40; d++) {
        const date = new Date(today); date.setDate(date.getDate() - d);
        if (date.getDay() === 0) continue; // skip Sunday
        keepMembers.forEach((m, mi) => {
          // ~90% present; force a few CLEAN members (no leave/WFH) absent TODAY
          // so the Absences page shows real unapproved absentees.
          let present = Math.random() > 0.1;
          if (d === 0 && (mi === 3 || mi === 4 || mi === 5)) present = false;
          pushAttendance(m._id, m.fullName, m.uid, date, present);
        });
      }

      // ── Requests for the dept's NAMED staff (so any of them logging in as
      //    faculty sees their own leave / WFH / check-out data). ──
      const named = (existing.length ? existing : members.slice(0, 4)).filter((m) => !isPreserved(m));
      const namedIds = named.map((m) => m._id);
      await LeaveRequest.deleteMany({ student: { $in: namedIds } });
      await CheckoutRequest.deleteMany({ student: { $in: namedIds } });
      await WFHRequest.deleteMany({ student: { $in: namedIds } });
      const leaveKinds = ['Medical leave', 'Family function', 'Personal work', '[WFH] Research work'];
      for (let i = 0; i < named.length; i++) {
        const m = named[i];
        const future = i % 2 === 0;
        await LeaveRequest.create({
          student: m._id, leaveDetails: leaveKinds[i % 4], reason: leaveKinds[i % 4],
          leaveDates: future
            ? { start: new Date(today.getTime() + (i + 1) * 864e5), end: new Date(today.getTime() + (i + 2) * 864e5) }
            : { start: new Date(today.getTime() - (i + 2) * 864e5), end: new Date(today.getTime() - (i + 1) * 864e5) },
          status: ['pending', 'approved', 'approved', 'pending'][i % 4],
        });
        await CheckoutRequest.create({
          student: m._id, date: new Date(today.getTime() - i * 864e5),
          details: ['Early checkout — medical appointment', 'Early checkout — conference', 'Early checkout — family emergency', 'Early checkout — official duty'][i % 4],
          reson: 'Early checkout', status: i % 2 === 0 ? 'pending' : 'approved',
        });
      }
      // WFH — new system (request) + legacy (embedded assignment) so BOTH the
      // WFH-request page and the WFH-Assignments page show data.
      await WFHRequest.create({ student: named[Math.min(2, named.length - 1)]._id, organization: org._id, startDate: today, endDate: new Date(today.getTime() + 2 * 864e5), reason: 'Online consultation duty', status: 'approved' });
      await Student.updateOne(
        { _id: named[Math.min(1, named.length - 1)]._id },
        { $set: { wfhAssignments: [{ startDate: today, endDate: new Date(today.getTime() + 5 * 864e5), reason: 'Field research / data collection', assignedBy: org._id, assignedAt: today, isActive: true }] } }
      );
      // Location-change request (Staff Locations page).
      await Student.updateOne(
        { _id: named[Math.min(3, named.length - 1)]._id },
        { $set: { locationChangeRequests: [{ requestedLocation: new mongoose.Types.ObjectId(), reason: 'Shifted to new campus block', status: 'pending', requestedAt: today }] } }
      );

      console.log(`  ${dept} (${cfg.year}): ${members.length} faculty, ${tts.length} TT slots, ${ccDocs.length} teaching logs, ${scDocs.length} spot-checks`);
    }

    // Flush dept attendance + audit.
    await Attendance.insertMany(attDocs);
    await AuditLog.insertMany(auditDocs);
    console.log(`Dept attendance records: ${attDocs.length}, audit logs: ${auditDocs.length}`);

    // ── Broad org check-ins TODAY (so Admin/superadmin "present today" is healthy) ──
    const deptIds = (await Student.find({ organization: org._id, department: { $in: Object.keys(TT) } }).select('_id')).map((s) => String(s._id));
    const others = await Student.find({ organization: org._id, isActive: true, _id: { $nin: deptIds.map((i) => new mongoose.Types.ObjectId(i)) } }).select('_id fullName uid').limit(90);
    await Attendance.deleteMany({ organization: org._id, student: { $in: others.map((o) => o._id) }, timestamp: { $gte: today } });
    const orgAtt = [];
    const orgAudit = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(today); date.setDate(date.getDate() - d);
      if (date.getDay() === 0) continue;
      others.forEach((o, i) => {
        if (Math.random() > 0.18) {
          const inTs = new Date(date); inTs.setHours(9, Math.floor(Math.random() * 40), 0, 0);
          const outTs = new Date(date); outTs.setHours(17, Math.floor(Math.random() * 40), 0, 0);
          const method = AUTH[i % AUTH.length];
          orgAtt.push({ student: o._id, organization: org._id, type: 'in', timestamp: inTs, authMethod: method, faceVerified: method === 'face', status: 'success', distance: 20 });
          orgAtt.push({ student: o._id, organization: org._id, type: 'out', timestamp: outTs, authMethod: method, status: 'success' });
          orgAudit.push({ organization: org._id, actorType: 'student', actor: o._id, actorLabel: `${o.fullName} (${o.uid})`, action: 'attendance.marked', outcome: 'success', targetType: 'attendance', at: inTs, metadata: { type: 'in', authMethod: method } });
        }
      });
    }
    await Attendance.insertMany(orgAtt);
    await AuditLog.insertMany(orgAudit);
    console.log(`Broad-org recent attendance: ${orgAtt.length} records across ${others.length} staff`);

    // Run unapproved-absence detection for today so the Absences page (which
    // reads stored AbsenceFlag records) is populated.
    const absenceService = require('../services/absenceService');
    const absRes = await absenceService.detectForOrg(org._id, { date: today, source: 'manual' });
    console.log(`Absence detection (today): ${absRes.absentCount} flagged`);

    console.log(`\n✅ DEMO SEED COMPLETE. ${totalFaculty} dept faculty total. Today = ${ymd(today)} populated everywhere.`);
  } catch (err) {
    console.error('Seed error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
