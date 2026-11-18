const crypto = require('crypto');
const PartnerApiKey = require('../models/PartnerApiKey');

/**
 * Partner key guard. It only acts when a request carries the X-Partner-Key header:
 *   - no header            -> the request goes on exactly as before (everyone else is unaffected)
 *   - header present       -> the key must be valid and not revoked, the path must be on its allow-list
 *                             (pairing and check-in status only), and it may make a limited number of requests
 */

const ALLOWED = [
  { method: 'POST', path: /^\/api\/defender-pair\/create$/ },
  { method: 'GET', path: /^\/api\/defender-pair\/[A-Za-z0-9_-]+$/ },
  { method: 'POST', path: /^\/api\/defender-pair\/claim$/ },
  { method: 'GET', path: /^\/api\/defender-pair\/my-status$/ },
  { method: 'GET', path: /^\/api\/partner\/attendance-status$/ },
];

const DEFAULT_LIMIT = 300; // requests per minute per key (allowed range 200-500)
const hits = new Map(); // key id -> timestamps of recent requests

function hashKey(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function underLimit(keyId, limit) {
  const cutoff = Date.now() - 60 * 1000;
  const recent = (hits.get(keyId) || []).filter((t) => t > cutoff);
  if (recent.length >= limit) {
    hits.set(keyId, recent);
    return false;
  }
  recent.push(Date.now());
  hits.set(keyId, recent);
  return true;
}

async function partnerKeyGuard(req, res, next) {
  const raw = req.header('X-Partner-Key');
  if (!raw) return next();
  try {
    const key = await PartnerApiKey.findOne({ keyHash: hashKey(raw), revokedAt: null }).lean();
    if (!key) {
      return res.status(401).json({ success: false, code: 'partner_key_invalid', message: 'Partner key is not valid.' });
    }
    const allowed = ALLOWED.some((r) => r.method === req.method && r.path.test(req.path));
    if (!allowed) {
      return res.status(403).json({ success: false, code: 'partner_key_scope', message: 'This partner key cannot use that endpoint.' });
    }
    if (!underLimit(String(key._id), key.rateLimitPerMin || DEFAULT_LIMIT)) {
      return res.status(429).json({ success: false, code: 'partner_rate_limited', message: 'Too many requests for this partner key. Try again shortly.' });
    }
    PartnerApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    req.partner = { id: String(key._id), name: key.name };
    return next();
  } catch (e) {
    return res.status(500).json({ success: false, code: 'partner_key_error' });
  }
}

module.exports = partnerKeyGuard;
module.exports.hashKey = hashKey;
