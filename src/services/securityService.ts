import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '../config';

/**
 * securityService — enterprise device-integrity policy (Feature 12).
 *
 * The NATIVE SecurityModule only reports raw signals; the POLICY (which signals
 * block, how they score, what to tell the user) lives here so it's maintainable
 * without a native rebuild. Fails CLOSED for the defined enterprise policies
 * (any critical signal → block) but fails OPEN when the checks themselves are
 * unavailable (no native module / empty result) so a platform/build hiccup can't
 * lock every user out of a production app.
 */

const { SecurityModule } = NativeModules as {
  SecurityModule?: {
    runChecks(): Promise<Record<string, any>>;
    requestIntegrityToken(nonce: string): Promise<{ available: boolean; token?: string; reason?: string }>;
  };
};

export type SecurityIssueKey =
  | 'developerOptionsEnabled'
  | 'usbDebuggingEnabled'
  | 'adbEnabled'
  | 'rootDetected'
  | 'emulatorDetected'
  | 'hookingDetected'
  | 'appCloningDetected'
  | 'integrityFailed';

export interface SecurityIssue {
  key: SecurityIssueKey;
  label: string;      // short line for the warning list
  message: string;    // specific remediation guidance
  weight: number;     // contribution to the risk score (0-100 scale overall)
}

export interface SecurityStatus {
  blocked: boolean;
  checksAvailable: boolean;   // false → native checks couldn't run (fail-open)
  riskScore: number;          // 0-100
  issues: SecurityIssue[];
  reasons: SecurityIssueKey[];
  deviceId: string;
  deviceName: string;
  osVersion: string;
  raw: Record<string, any>;
}

// Policy table: each critical condition, its user-facing copy and risk weight.
// Every entry here is a BLOCKING condition per the enterprise policy.
const POLICY: Record<SecurityIssueKey, { label: string; message: string; weight: number }> = {
  rootDetected: {
    label: 'Root access detected.',
    message: 'Root access was detected on this device. Rooted devices are not permitted. Use a non-rooted device to continue.',
    weight: 40,
  },
  integrityFailed: {
    label: 'Device integrity verification failed.',
    message: 'This device failed Google Play integrity verification. Ensure the app was installed from an authorised source on a genuine, uncompromised device.',
    weight: 35,
  },
  emulatorDetected: {
    label: 'Emulator detected.',
    message: 'This app cannot run on an emulator or virtual device. Use a physical Android phone.',
    weight: 35,
  },
  hookingDetected: {
    label: 'A hooking/instrumentation framework was detected.',
    message: 'A hooking framework (e.g. Frida/Xposed) was detected. Remove it and restart the application.',
    weight: 35,
  },
  appCloningDetected: {
    label: 'App cloning detected.',
    message: 'This app appears to be running as a cloned/parallel instance. Open the original app installed from the store.',
    weight: 30,
  },
  usbDebuggingEnabled: {
    label: 'USB Debugging is enabled.',
    message: 'USB Debugging is currently enabled. Please turn off USB Debugging from Developer Options and reopen the application.',
    weight: 25,
  },
  adbEnabled: {
    label: 'ADB (Android Debug Bridge) is enabled.',
    message: 'Android Debug Bridge (ADB) is enabled. Turn it off from Developer Options and reopen the application.',
    weight: 25,
  },
  developerOptionsEnabled: {
    label: 'Developer Options is enabled.',
    message: 'Developer Options is currently enabled. Please disable Developer Options from your Android Settings before using this application.',
    weight: 20,
  },
};

// Order issues by severity (weight desc) for a stable, sensible warning list.
const ISSUE_ORDER: SecurityIssueKey[] = (Object.keys(POLICY) as SecurityIssueKey[])
  .sort((a, b) => POLICY[b].weight - POLICY[a].weight);

const DEVICE_ID_KEY = 'securityDeviceId';

/** Persist the native device id so it survives even before checks run again. */
async function rememberDeviceId(id: string): Promise<void> {
  if (id && id !== 'unknown') {
    try { await AsyncStorage.setItem(DEVICE_ID_KEY, id); } catch { /* best-effort */ }
  }
}

/**
 * Run all checks and evaluate the policy. iOS (no SecurityModule) and any
 * platform where the native module is missing resolve as "not blocked, checks
 * unavailable" (fail-open on availability, per the documented limitation).
 */
export async function evaluateSecurity(): Promise<SecurityStatus> {
  // DEV bypass — skip all security checks during development/testing
  if (__DEV__) {
    return {
      blocked: false,
      checksAvailable: false,
      riskScore: 0,
      issues: [],
      reasons: [],
      deviceId: 'dev',
      deviceName: 'dev',
      osVersion: String((Platform as any).Version ?? ''),
    } as SecurityStatus;
  }
  const empty: SecurityStatus = {
    blocked: false,
    checksAvailable: false,
    riskScore: 0,
    issues: [],
    reasons: [],
    deviceId: (await AsyncStorage.getItem(DEVICE_ID_KEY)) || 'unknown',
    deviceName: '',
    osVersion: String((Platform as any).Version ?? ''),
    raw: {},
  };

  if (Platform.OS !== 'android' || !SecurityModule?.runChecks) {
    return empty;
  }

  let raw: Record<string, any> = {};
  try {
    raw = (await SecurityModule.runChecks()) || {};
  } catch {
    return empty; // reporting layer failed → fail open (documented)
  }

  // No signals at all → the native check couldn't produce a result. Fail open.
  if (!raw || Object.keys(raw).length === 0) return empty;

  await rememberDeviceId(raw.deviceId);

  // Play Integrity: PRIMARY signal, but only blocks when it returns a
  // conclusive negative verdict AND the token is verified server-side. On-device
  // we only mark integrityFailed when the library is present and explicitly says
  // the verdict is bad; "unavailable" is treated as unknown (never blocks).
  // (Server-side verification of the token flips this to a hard block; see the
  // backend /api/device-security route.) Here we keep it best-effort.
  let integrityFailed = false;
  if (SecurityModule.requestIntegrityToken) {
    try {
      const nonce = `${raw.deviceId || 'dev'}-${Date.now()}`;
      const res = await SecurityModule.requestIntegrityToken(nonce);
      // Only a present-but-failed verdict blocks; absence/misconfig does not.
      if (res && res.available === false && res.reason === 'integrity_verdict_failed') {
        integrityFailed = true;
      }
      raw.integrity = res;
    } catch {
      /* integrity unavailable → unknown, not a block */
    }
  }

  const flags: Record<SecurityIssueKey, boolean> = {
    developerOptionsEnabled: raw.developerOptionsEnabled === true,
    usbDebuggingEnabled: raw.usbDebuggingEnabled === true,
    adbEnabled: raw.adbEnabled === true,
    rootDetected: raw.rootDetected === true,
    emulatorDetected: raw.emulatorDetected === true,
    hookingDetected: raw.hookingDetected === true,
    appCloningDetected: raw.appCloningDetected === true,
    integrityFailed,
  };

  const issues: SecurityIssue[] = [];
  for (const key of ISSUE_ORDER) {
    if (flags[key]) issues.push({ key, ...POLICY[key] });
  }

  const riskScore = Math.min(100, issues.reduce((sum, i) => sum + i.weight, 0));

  return {
    blocked: issues.length > 0,
    checksAvailable: true,
    riskScore,
    issues,
    reasons: issues.map((i) => i.key),
    deviceId: raw.deviceId || empty.deviceId,
    deviceName: raw.deviceName || '',
    osVersion: raw.osVersion || empty.osVersion,
    raw,
  };
}

/**
 * Report a block event to the backend so a super-admin sees it under "Blocked
 * Devices". Best-effort and fire-and-forget: never throws, never blocks the UI.
 * Sends the auth token if the user had logged in previously (Employee ID is
 * derived server-side from the token); the public IP is taken server-side from
 * the request (most reliable) with the client value as a fallback hint.
 */
export async function reportBlockEvent(status: SecurityStatus): Promise<void> {
  try {
    const token = await AsyncStorage.getItem('authToken');
    const body = {
      deviceId: status.deviceId,
      deviceName: status.deviceName,
      osVersion: status.osVersion,
      reasons: status.reasons,
      blockedBecause: status.issues.map((i) => i.label),
      riskScore: status.riskScore,
      platform: Platform.OS,
      timestamp: new Date().toISOString(),
      signals: status.raw,
    };
    await fetch(`${getApiBaseUrl()}/device-security/blocked`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    /* best-effort telemetry — a blocked device with no network still gets blocked */
  }
}
