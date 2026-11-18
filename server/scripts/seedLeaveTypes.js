/**
 * Seed the 13 canonical, GLOBAL leave types (organization: null) so every
 * institution has a sensible default catalogue out of the box. Idempotent —
 * upserts by { organization: null, code }, so re-running only fills gaps and
 * never duplicates. Institutions can override any of these per-org from the
 * admin dashboard.
 *
 * Run:  node server/scripts/seedLeaveTypes.js
 * (also safe to call programmatically from server boot — see module export)
 */
const mongoose = require('mongoose');
const LeaveType = require('../models/LeaveType');

const DEFAULTS = [
  {
    code: 'CL', name: 'Casual Leave', description: 'Short personal leave for casual needs.',
    yearlyQuota: 12, maxDays: 5, maxConsecutiveDays: 5, minAdvanceNoticeDays: 1,
    paid: true, requiresDocument: false, halfDayAllowed: true, allowEmergency: true,
    color: '#2563EB', icon: 'Coffee', sortOrder: 10,
  },
  {
    code: 'SL', name: 'Sick Leave', description: 'Leave due to illness. Medical certificate required for 3+ days.',
    yearlyQuota: 12, maxDays: 15, maxConsecutiveDays: 15, minAdvanceNoticeDays: 0,
    paid: true, requiresDocument: true, halfDayAllowed: true, allowEmergency: true,
    color: '#DC2626', icon: 'Stethoscope', sortOrder: 20,
  },
  {
    code: 'EM', name: 'Emergency Leave', description: 'Urgent, unforeseen situations. Bypasses advance notice.',
    yearlyQuota: 6, maxDays: 5, maxConsecutiveDays: 5, minAdvanceNoticeDays: 0,
    paid: true, requiresDocument: false, halfDayAllowed: true, allowEmergency: true,
    color: '#EA580C', icon: 'Siren', sortOrder: 30,
  },
  {
    code: 'EL', name: 'Earned / Privilege Leave', description: 'Accrued leave that can be carried forward.',
    yearlyQuota: 15, maxDays: 20, maxConsecutiveDays: 20, minAdvanceNoticeDays: 3,
    paid: true, carryForward: true, carryForwardMax: 30, requiresDocument: false,
    halfDayAllowed: true, color: '#16A34A', icon: 'CalendarCheck', sortOrder: 40,
  },
  {
    code: 'AL', name: 'Annual Leave', description: 'Standard annual vacation leave.',
    yearlyQuota: 18, maxDays: 20, maxConsecutiveDays: 20, minAdvanceNoticeDays: 7,
    paid: true, carryForward: true, carryForwardMax: 10, requiresDocument: false,
    halfDayAllowed: true, color: '#0891B2', icon: 'Palmtree', sortOrder: 50,
  },
  {
    code: 'ML', name: 'Marriage Leave', description: 'Leave for the employee’s own marriage.',
    yearlyQuota: 5, maxDays: 5, maxConsecutiveDays: 5, minAdvanceNoticeDays: 15,
    paid: true, requiresDocument: true, halfDayAllowed: false,
    color: '#DB2777', icon: 'HeartHandshake', sortOrder: 60,
  },
  {
    code: 'BL', name: 'Bereavement Leave', description: 'Leave following the death of a close family member.',
    yearlyQuota: 5, maxDays: 5, maxConsecutiveDays: 5, minAdvanceNoticeDays: 0,
    paid: true, requiresDocument: false, halfDayAllowed: false, allowEmergency: true,
    color: '#64748B', icon: 'Flower2', sortOrder: 70,
  },
  {
    code: 'MTL', name: 'Maternity Leave', description: 'Leave for childbirth and recovery (female employees).',
    yearlyQuota: 182, maxDays: 182, maxConsecutiveDays: 182, minAdvanceNoticeDays: 30,
    paid: true, requiresDocument: true, halfDayAllowed: false,
    genderEligibility: 'female', color: '#C026D3', icon: 'Baby', sortOrder: 80,
  },
  {
    code: 'PTL', name: 'Paternity Leave', description: 'Leave for a new father (male employees).',
    yearlyQuota: 15, maxDays: 15, maxConsecutiveDays: 15, minAdvanceNoticeDays: 15,
    paid: true, requiresDocument: false, halfDayAllowed: false,
    genderEligibility: 'male', color: '#7C3AED', icon: 'Baby', sortOrder: 90,
  },
  {
    code: 'CO', name: 'Comp Off', description: 'Compensatory leave for working on a holiday/weekend.',
    yearlyQuota: 12, maxDays: 3, maxConsecutiveDays: 3, minAdvanceNoticeDays: 1,
    paid: true, requiresDocument: false, halfDayAllowed: true,
    color: '#0D9488', icon: 'Repeat', sortOrder: 100,
  },
  {
    code: 'LWP', name: 'Leave Without Pay', description: 'Unpaid leave when paid balance is exhausted.',
    yearlyQuota: 30, maxDays: 30, maxConsecutiveDays: 30, minAdvanceNoticeDays: 3,
    paid: false, requiresDocument: false, halfDayAllowed: true,
    color: '#78716C', icon: 'WalletMinimal', sortOrder: 110,
  },
  {
    code: 'HD', name: 'Half-Day Leave', description: 'A single half-day (first or second half).',
    yearlyQuota: 24, minDays: 0.5, maxDays: 0.5, maxConsecutiveDays: 1, minAdvanceNoticeDays: 0,
    paid: true, requiresDocument: false, halfDayAllowed: true, allowEmergency: true,
    color: '#F59E0B', icon: 'Clock', sortOrder: 120,
  },
  {
    code: 'STL', name: 'Study Leave', description: 'Leave for approved study/examinations.',
    yearlyQuota: 15, maxDays: 15, maxConsecutiveDays: 15, minAdvanceNoticeDays: 15,
    paid: true, requiresDocument: true, halfDayAllowed: false,
    color: '#4F46E5', icon: 'GraduationCap', sortOrder: 130,
  },
];

async function seedLeaveTypes() {
  let created = 0;
  let existing = 0;
  for (const t of DEFAULTS) {
    const res = await LeaveType.updateOne(
      { organization: null, code: t.code },
      { $setOnInsert: { ...t, organization: null, active: true, isDeleted: false } },
      { upsert: true }
    );
    if (res.upsertedCount) created += 1;
    else existing += 1;
  }
  return { created, existing, total: DEFAULTS.length };
}

module.exports = { seedLeaveTypes, DEFAULTS };

// Allow running directly from the CLI.
if (require.main === module) {
  (async () => {
    try {
      const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/test';
      await mongoose.connect(uri);
      const r = await seedLeaveTypes();
      console.log(`[seedLeaveTypes] done — created ${r.created}, already present ${r.existing}, total ${r.total}`);
      await mongoose.disconnect();
      process.exit(0);
    } catch (e) {
      console.error('[seedLeaveTypes] failed:', e.message);
      process.exit(1);
    }
  })();
}
