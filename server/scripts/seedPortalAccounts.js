/**
 * Seed role-based portal test accounts.
 *
 * Picks EXISTING Anuvadini employees that already have the most attendance
 * history (so the Faculty/Staff and HOD dashboards render real, dynamic data),
 * assigns them into 3 departments, designates one HOD per department, gives
 * everyone a known password, and prints the credentials + the months that
 * actually contain data (so you know which month to view).
 *
 * Only the handful of selected records are touched (role/designation/
 * department/password). Every other employee record is left untouched.
 *
 * Run:  node scripts/seedPortalAccounts.js
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');

const Student = require('../models/Student');
const Organization = require('../models/Organization');
const Attendance = require('../models/Attendance');

const ORG_EMAIL = 'admin@example.org'; // Anuvadini
const PASSWORD = 'Test@123';
const PER_DEPT = 4; // 1 HOD + 3 members

const DEPARTMENTS = [
  { name: 'Administration', hodTitle: 'Professor & HOD', titles: ['Associate Professor', 'Assistant Professor', 'Lab Technician'] },
  { name: 'Engineering', hodTitle: 'Professor & HOD', titles: ['Associate Professor', 'Assistant Professor', 'Technician'] },
  { name: 'Operations', hodTitle: 'Professor & HOD', titles: ['Associate Professor', 'Assistant Professor', 'Assistant'] },
];

// Staff (non-teaching) designations → role 'staff'; everything else 'faculty'.
const STAFF_TITLES = new Set(['Lab Technician', 'Technician', 'Assistant']);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const org = await Organization.findOne({ email: ORG_EMAIL });
    if (!org) throw new Error(`Organization not found: ${ORG_EMAIL}`);
    console.log(`Organization: ${org.name} (${org._id})`);

    // Rank employees by attendance volume so dashboards look populated.
    const ranked = await Attendance.aggregate([
      { $match: { organization: org._id, type: 'in' } },
      { $group: { _id: '$student', records: { $sum: 1 }, lastSeen: { $max: '$timestamp' } } },
      { $sort: { records: -1 } },
      { $limit: DEPARTMENTS.length * PER_DEPT * 2 },
    ]);

    // Keep only those that resolve to a real, active student in this org.
    const picked = [];
    for (const r of ranked) {
      const s = await Student.findOne({ _id: r._id, organization: org._id, isActive: true });
      if (s) picked.push({ student: s, records: r.records, lastSeen: r.lastSeen });
      if (picked.length >= DEPARTMENTS.length * PER_DEPT) break;
    }
    if (picked.length < DEPARTMENTS.length * PER_DEPT) {
      console.warn(`Only ${picked.length} suitable employees found; seeding what we can.`);
    }

    // Ensure org.departments contains our department names.
    const deptNames = DEPARTMENTS.map((d) => d.name);
    const existingDepts = new Set(org.departments || []);
    deptNames.forEach((d) => existingDepts.add(d));
    org.departments = Array.from(existingDepts);
    await org.save();

    const credentials = [];
    let idx = 0;
    for (const dept of DEPARTMENTS) {
      for (let i = 0; i < PER_DEPT; i++) {
        if (idx >= picked.length) break;
        const { student, records, lastSeen } = picked[idx++];
        const isHod = i === 0;
        const designation = isHod ? dept.hodTitle : dept.titles[i - 1];
        const role = isHod ? 'hod' : STAFF_TITLES.has(designation) ? 'staff' : 'faculty';

        student.department = dept.name;
        student.role = role;
        student.designation = designation;
        student.password = PASSWORD; // hashed? No — Student model stores plain; mobile login compares plain.
        await student.save();

        credentials.push({
          department: dept.name,
          role,
          designation,
          name: student.fullName,
          uid: student.uid,
          password: PASSWORD,
          attendanceRecords: records,
          lastSeen: lastSeen ? new Date(lastSeen).toISOString().slice(0, 10) : 'n/a',
        });
      }
    }

    // Report: month distribution of data for the seeded cohort.
    const seededIds = credentials.length
      ? (await Student.find({ uid: { $in: credentials.map((c) => c.uid) }, organization: org._id }).select('_id')).map((s) => s._id)
      : [];
    const monthDist = await Attendance.aggregate([
      { $match: { student: { $in: seededIds }, type: 'in' } },
      { $group: { _id: { y: { $year: '$timestamp' }, m: { $month: '$timestamp' } }, n: { $sum: 1 } } },
      { $sort: { '_id.y': -1, '_id.m': -1 } },
    ]);

    console.log('\n========== PORTAL TEST CREDENTIALS ==========');
    console.log(`Login identifier = UID, password = ${PASSWORD}\n`);
    const byDept = {};
    credentials.forEach((c) => {
      byDept[c.department] = byDept[c.department] || [];
      byDept[c.department].push(c);
    });
    Object.entries(byDept).forEach(([dept, list]) => {
      console.log(`── Department: ${dept} ──`);
      list.forEach((c) => {
        console.log(
          `  [${c.role.toUpperCase().padEnd(7)}] ${c.name.padEnd(22)} UID=${c.uid}  ` +
            `(${c.designation}; ${c.attendanceRecords} check-ins, last ${c.lastSeen})`
        );
      });
      console.log('');
    });

    console.log('Months with attendance data for these accounts (view these months on the dashboards):');
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    monthDist.slice(0, 12).forEach((d) => console.log(`  ${monthNames[d._id.m]} ${d._id.y}  →  ${d.n} check-ins`));
    console.log('=============================================\n');
  } catch (err) {
    console.error('Seed error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
