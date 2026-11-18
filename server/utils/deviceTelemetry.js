// Validation for the device/network telemetry the mobile app sends alongside
// `publicIp` on login and attendance requests (utils/deviceTelemetry.ts on the
// app side). Everything is client-reported, so nothing here is trusted raw:
// each field is type-checked, trimmed, length-capped and (where possible)
// whitelist- or format-validated before it is stored or compared. Missing or
// invalid fields become null — old app builds that don't send telemetry keep
// working unchanged.

const net = require('net');
const { normalizeIp } = require('./clientIp');

const NETWORK_TYPES = new Set(['wifi', 'mobile', 'unknown']);

/** Trim + cap a client string; anything non-string/empty becomes null. */
function cleanString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Extract the validated device/network telemetry from a request body.
 * Always returns the full shape (nulls for absent/invalid fields):
 * { localIp, networkType, deviceId, deviceModel, manufacturer, androidVersion }
 */
function sanitizeDeviceTelemetry(body = {}) {
  const localIpRaw = normalizeIp(typeof body.localIp === 'string' ? body.localIp : null);
  const localIp = localIpRaw && net.isIP(localIpRaw) !== 0 ? localIpRaw : null;

  const networkTypeRaw = cleanString(body.networkType, 16);
  const networkType =
    networkTypeRaw && NETWORK_TYPES.has(networkTypeRaw.toLowerCase())
      ? networkTypeRaw.toLowerCase()
      : null;

  return {
    localIp,
    networkType,
    deviceId: cleanString(body.deviceId, 64),
    deviceModel: cleanString(body.deviceModel, 80),
    manufacturer: cleanString(body.manufacturer, 80),
    androidVersion: cleanString(body.androidVersion, 32),
  };
}

module.exports = { sanitizeDeviceTelemetry };
