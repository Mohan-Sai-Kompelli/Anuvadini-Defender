/**
 * Minimal in-memory fixed-window rate limiter (no external dependency).
 *
 * Protects the sensitive endpoints (attendance mark, liveness challenge,
 * spot-check response) from brute-forcing thresholds. For a multi-node
 * deployment move this to a shared Redis store — same interface.
 *
 * Usage: router.post('/mark', rateLimit({ windowMs, max, key }), auth, handler)
 */
function rateLimit(opts = {}) {
  const windowMs = opts.windowMs || 60 * 1000;
  const max = opts.max || 60;
  const buckets = new Map(); // key -> { count, resetAt }

  // Periodic cleanup so the map doesn't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
  }, windowMs);
  if (sweep.unref) sweep.unref();

  const keyFn =
    opts.key ||
    ((req) => {
      // Prefer the authenticated identity; fall back to IP.
      const id =
        (req.student && req.student._id) ||
        (req.organization && req.organization._id) ||
        (req.user && req.user.id);
      return `${req.path}:${id || req.ip || req.connection?.remoteAddress || 'anon'}`;
    });

  return function (req, res, next) {
    const now = Date.now();
    const key = keyFn(req);
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;

    const remaining = Math.max(0, max - b.count);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));

    if (b.count > max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: 'rate_limited',
        message: `Too many requests. Try again in ${retryAfter}s.`,
      });
    }
    next();
  };
}

module.exports = rateLimit;
