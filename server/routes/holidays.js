const express = require('express');
const auth = require('../middleware/auth');
const Holiday = require('../models/Holiday');
const resolveOrgId = require('../utils/resolveOrg');

const router = express.Router();

// Default gazetted-holiday seed (verify against the official list each year).
const DEFAULT_HOLIDAYS = [
  ['2025-08-15', 'Independence Day'],
  ['2025-10-02', 'Gandhi Jayanti'],
  ['2025-10-20', 'Diwali'],
  ['2025-12-25', 'Christmas Day'],
  ['2026-01-26', 'Republic Day'],
  ['2026-03-04', 'Holi'],
  ['2026-03-21', 'Id-ul-Fitr'],
  ['2026-04-03', 'Good Friday'],
  ['2026-04-14', 'Ambedkar Jayanti'],
  ['2026-05-01', 'Buddha Purnima'],
  ['2026-05-27', 'Id-ul-Zuha (Bakrid)'],
  ['2026-06-26', 'Muharram'],
  ['2026-08-15', 'Independence Day'],
  ['2026-08-25', 'Milad-un-Nabi'],
  ['2026-09-04', 'Janmashtami'],
  ['2026-10-02', 'Gandhi Jayanti'],
  ['2026-10-20', 'Dussehra'],
  ['2026-11-08', 'Diwali'],
  ['2026-11-24', 'Guru Nanak Jayanti'],
  ['2026-12-25', 'Christmas Day'],
  ['2027-01-26', 'Republic Day'],
];

async function seedIfEmpty() {
  const count = await Holiday.estimatedDocumentCount();
  if (count > 0) return;
  await Holiday.insertMany(
    DEFAULT_HOLIDAYS.map(([date, name]) => ({ date, name, organization: null })),
    { ordered: false }
  ).catch(() => {});
}

// @route   GET /api/holidays
// @desc    Government holidays (global + this organization's own)
router.get('/', auth, async (req, res) => {
  try {
    await seedIfEmpty();
    const organization = resolveOrgId(req);
    const holidays = await Holiday.find({
      $or: [{ organization: null }, { organization }],
    })
      .sort({ date: 1 })
      .lean();
    return res.json({ success: true, holidays });
  } catch (err) {
    console.error('[Holidays] list error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/holidays
// @desc    Organization adds its own holiday
router.post('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    const { date, name } = req.body;
    if (!date || !name) {
      return res.status(400).json({ success: false, error: 'date and name are required' });
    }
    const holiday = await Holiday.create({ date, name, organization });
    return res.status(201).json({ success: true, holiday });
  } catch (err) {
    console.error('[Holidays] create error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
