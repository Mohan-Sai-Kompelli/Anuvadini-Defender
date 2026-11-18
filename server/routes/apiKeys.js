const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const ApiKey = require('../models/ApiKey');
const resolveOrgId = require('../utils/resolveOrg');

const router = express.Router();

const generateKey = () => `anuvadini_live_${crypto.randomBytes(12).toString('hex')}`;

const mask = (key) => `${key.slice(0, 15)}…${key.slice(-4)}`;

const toRow = (doc) => ({
  id: doc._id,
  name: doc.name,
  key: mask(doc.key),
  scope: doc.scope,
  rateLimit: doc.rateLimit,
  status: doc.status,
  lastUsedAt: doc.lastUsedAt,
});

async function seedIfEmpty(organization) {
  const count = await ApiKey.countDocuments({ organization });
  if (count > 0) return;
  await ApiKey.create([
    {
      organization,
      name: 'Anuvadini Board — national dashboard',
      key: generateKey(),
      scope: 'aggregate:read',
      rateLimit: '600 req/h',
    },
    {
      organization,
      name: 'Rating system',
      key: generateKey(),
      scope: 'colleges:read, ratings:read',
      rateLimit: '300 req/h',
    },
  ]);
}

// @route   GET /api/api-keys
router.get('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    await seedIfEmpty(organization);
    const keys = await ApiKey.find({ organization }).sort({ createdAt: 1 }).lean();
    return res.json({ success: true, keys: keys.map(toRow) });
  } catch (err) {
    console.error('[ApiKeys] list error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/api-keys
// @desc    Issue a new scoped key — the full key is returned only once
router.post('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    const { name, scope, rateLimit } = req.body;
    const fullKey = generateKey();
    const doc = await ApiKey.create({
      organization,
      name: name || 'Partner integration key',
      key: fullKey,
      scope: scope || 'aggregate:read',
      rateLimit: rateLimit || '300 req/h',
    });
    return res.status(201).json({ success: true, key: toRow(doc), fullKey });
  } catch (err) {
    console.error('[ApiKeys] create error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   PUT /api/api-keys/:id/revoke
router.put('/:id/revoke', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    const doc = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, organization },
      { status: 'revoked' },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }
    return res.json({ success: true, key: toRow(doc) });
  } catch (err) {
    console.error('[ApiKeys] revoke error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
