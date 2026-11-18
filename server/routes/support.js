const express = require('express');
const auth = require('../middleware/auth');
const TrainingSession = require('../models/TrainingSession');

const router = express.Router();

const MANUALS = [
  { id: 'm1', title: 'Admin Web Dashboard — User Manual', size: '4.2 MB', updated: 'May 2026' },
  { id: 'm2', title: 'Faculty Mobile App — Quick Start Guide', size: '2.8 MB', updated: 'May 2026' },
  { id: 'm3', title: 'Anuvadini Admin Panel Guide', size: '3.1 MB', updated: 'Apr 2026' },
  { id: 'm4', title: 'Timetable — How-To', size: '1.9 MB', updated: 'Jun 2026' },
];

function iso(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return d.toISOString().slice(0, 10);
}

async function seedIfEmpty() {
  const count = await TrainingSession.estimatedDocumentCount();
  if (count > 0) return;
  await TrainingSession.insertMany([
    { title: 'Admin onboarding — dashboard & approvals', date: iso(4), mode: 'Online (Meet)', seatsTotal: 30, seatsTaken: 18 },
    { title: 'Train-the-trainer — faculty app rollout', date: iso(7), mode: 'On-campus', seatsTotal: 25, seatsTaken: 25 },
    { title: 'Anuvadini admins — compliance analytics', date: iso(18), mode: 'Online (Meet)', seatsTotal: 20, seatsTaken: 4 },
  ]);
}

// @route   GET /api/support
// @desc    Manuals + upcoming training sessions
router.get('/', auth, async (req, res) => {
  try {
    await seedIfEmpty();
    const sessions = await TrainingSession.find().sort({ date: 1 }).lean();
    return res.json({ success: true, manuals: MANUALS, sessions });
  } catch (err) {
    console.error('[Support] error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/support/sessions/:id/register
// @desc    Reserve a seat in a training session
router.post('/sessions/:id/register', auth, async (req, res) => {
  try {
    const session = await TrainingSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    if (session.seatsTaken >= session.seatsTotal) {
      return res.status(400).json({ success: false, error: 'Session is full' });
    }
    session.seatsTaken += 1;
    await session.save();
    return res.json({ success: true, session });
  } catch (err) {
    console.error('[Support] register error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
