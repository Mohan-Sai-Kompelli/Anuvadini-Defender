/**
 * Device + network telemetry for login / attendance tracking.
 *
 * Complements the public-IP lookup (utils/publicIp.ts): the public IP alone
 * can't tell two phones apart on the same WiFi, so every login and mark also
 * carries WHICH physical device it came from. The server compares the device
 * id against the employee's previous one and flags a change — informational
 * and audited, never blocking.
 *
 * Sources everything from react-native-device-info (already installed and
 * autolinked — no new native dependency):
 *   • deviceId        getUniqueId()      — ANDROID_ID-based, stable per device
 *   • deviceModel     getModel()
 *   • manufacturer    getManufacturer()
 *   • androidVersion  getSystemVersion()
 *   • localIp         getIpAddress()     — the WiFi interface address
 *   • networkType     derived: getIpAddress() reads WifiManager, so a real
 *     address means the phone is on WiFi; '0.0.0.0'/'unknown' while the
 *     request still goes through means mobile data.
 *
 * Best-effort by design: every read is guarded, missing values are simply
 * omitted, and the static identity fields are cached after the first
 * successful read (they can't change without a reboot anyway). The existing
 * login/attendance flow is never delayed beyond these local native calls and
 * never blocked.
 */
import DeviceInfo from 'react-native-device-info';

export interface DeviceTelemetry {
  localIp?: string;
  networkType?: 'wifi' | 'mobile' | 'unknown';
  deviceId?: string;
  deviceModel?: string;
  manufacturer?: string;
  androidVersion?: string;
}

// Static identity fields — read once, reused for the session.
let cachedIdentity: Pick<
  DeviceTelemetry,
  'deviceId' | 'deviceModel' | 'manufacturer' | 'androidVersion'
> | null = null;

const NO_WIFI_VALUES = new Set(['', '0.0.0.0', 'unknown']);

async function readIdentity(): Promise<NonNullable<typeof cachedIdentity>> {
  if (cachedIdentity && cachedIdentity.deviceId) return cachedIdentity;
  const identity: NonNullable<typeof cachedIdentity> = {};
  try {
    const id = await DeviceInfo.getUniqueId();
    if (id && id !== 'unknown') identity.deviceId = id;
  } catch { /* omit */ }
  try {
    const model = DeviceInfo.getModel();
    if (model && model !== 'unknown') identity.deviceModel = model;
  } catch { /* omit */ }
  try {
    const manufacturer = await DeviceInfo.getManufacturer();
    if (manufacturer && manufacturer !== 'unknown') identity.manufacturer = manufacturer;
  } catch { /* omit */ }
  try {
    const version = DeviceInfo.getSystemVersion();
    if (version && version !== 'unknown') identity.androidVersion = version;
  } catch { /* omit */ }
  cachedIdentity = identity;
  return identity;
}

/**
 * Current device + network telemetry. Identity fields are cached; the network
 * fields (localIp / networkType) are read fresh on every call so switching
 * between WiFi and mobile data is reflected immediately.
 */
export async function collectDeviceTelemetry(): Promise<DeviceTelemetry> {
  const telemetry: DeviceTelemetry = { ...(await readIdentity()) };
  try {
    const ip = (await DeviceInfo.getIpAddress())?.trim();
    if (ip && !NO_WIFI_VALUES.has(ip)) {
      telemetry.localIp = ip;
      telemetry.networkType = 'wifi';
    } else {
      // WifiManager reports no address but this request is still reaching the
      // server — the phone is online over cellular.
      telemetry.networkType = 'mobile';
    }
  } catch {
    telemetry.networkType = 'unknown';
  }
  return telemetry;
}
