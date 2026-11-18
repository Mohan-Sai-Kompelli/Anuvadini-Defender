// Public-IP resolution for login / attendance tracking (super-admin IP report).
//
// The mobile app looks up its own public IP (api.ipify.org) and sends it as
// `publicIp` in the request body. Older app builds don't send it — we then fall
// back to what the connection itself tells us (x-forwarded-for when behind the
// nginx proxy, else the socket address), which for a phone on mobile data IS its
// public IP. Either way every request resolves to SOME address, so the feature
// is backward compatible with clients that predate it.

const net = require('net');

/** Strip the IPv4-mapped-IPv6 prefix Node reports for v4 sockets. */
function normalizeIp(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let ip = raw.trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip || null;
}

/** True for a syntactically valid IPv4/IPv6 address. */
function isValidIp(value) {
  const ip = normalizeIp(value);
  return !!ip && net.isIP(ip) !== 0;
}

/** First hop of an x-forwarded-for chain (the original client). */
function firstForwarded(header) {
  if (!header || typeof header !== 'string') return null;
  return normalizeIp(header.split(',')[0]);
}

/**
 * Resolve the public IP for a request:
 *  1. client-reported `publicIp` in the body (the phone's own lookup) if valid;
 *  2. x-forwarded-for (proxy deployments);
 *  3. the socket address.
 * Returns a string or null — callers must treat null as "unknown", never block.
 */
function resolveClientIp(req) {
  const reported = req.body && req.body.publicIp;
  if (isValidIp(reported)) return normalizeIp(reported);

  const forwarded = firstForwarded(req.headers && req.headers['x-forwarded-for']);
  if (forwarded && net.isIP(forwarded) !== 0) return forwarded;

  return normalizeIp(req.ip || req.connection?.remoteAddress || null);
}

module.exports = { resolveClientIp, isValidIp, normalizeIp };
