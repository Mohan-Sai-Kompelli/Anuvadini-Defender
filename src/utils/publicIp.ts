/**
 * Public-IP lookup for login / attendance tracking.
 *
 * The device's own view of its public address (via ipify, with a fallback
 * provider) is sent as `publicIp` alongside login and attendance requests so
 * the super-admin IP report shows where each action came from. Best-effort by
 * design: on timeout/failure we return null and the request goes out WITHOUT
 * the field — the server then falls back to the connection's address, so the
 * existing login/attendance flow is never delayed beyond the short timeout
 * here and never blocked.
 */

const PROVIDERS = [
  'https://api.ipify.org?format=text',
  'https://checkip.amazonaws.com',
];

const FETCH_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 60 * 1000; // same network for a minute — skip refetching

let cachedIp: string | null = null;
let cachedAt = 0;

/** Loose IPv4/IPv6 shape check — the server re-validates strictly. */
const looksLikeIp = (s: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(s) || /^[0-9a-fA-F:]+$/.test(s);

async function fetchWithTimeout(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return looksLikeIp(text) ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The device's current public IP, or null when it can't be determined quickly
 * (offline, providers unreachable). Cached for a minute.
 */
export async function getPublicIp(): Promise<string | null> {
  if (cachedIp && Date.now() - cachedAt < CACHE_TTL_MS) return cachedIp;
  for (const url of PROVIDERS) {
    const ip = await fetchWithTimeout(url);
    if (ip) {
      cachedIp = ip;
      cachedAt = Date.now();
      return ip;
    }
  }
  return null;
}

/** Drop the cached address (e.g. after a connectivity change). */
export function clearPublicIpCache(): void {
  cachedIp = null;
  cachedAt = 0;
}
