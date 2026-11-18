// Configuration for the SAACMS mobile app.
//
// SINGLE SOURCE OF TRUTH for the backend host. Resolution order (highest first):
//   1. Runtime override set in-app via setApiHost() and persisted to AsyncStorage.
//   2. Build-time env var API_HOST (when the bundler injects process.env).
//   3. Default host below — the production backend domain. For local dev, set a
//      runtime override in-app via setApiHost() (e.g. "localhost:5001", reached
//      on Android through `adb reverse tcp:5001 tcp:5001`) or build with API_HOST.
//
// Everything that talks to the backend MUST resolve the URL through
// getApiBaseUrl() so a runtime host override takes effect immediately.
import AsyncStorage from '@react-native-async-storage/async-storage';

// Local dev backend by default.
const PLATFORM_DEFAULT_HOST = 'http://localhost:5001';

const ENV_HOST =
  (typeof process !== 'undefined' && (process as any)?.env?.API_HOST) || '';

// In-memory resolved host (e.g. "http://localhost:5001"). Seeded from env/default and
// may be replaced by a persisted override (loadApiHostOverride) or setApiHost().
let apiHost: string = String(ENV_HOST || PLATFORM_DEFAULT_HOST).trim();

const HOST_STORAGE_KEY = 'apiHostOverride';

/** Current backend host, e.g. "http://localhost:5001". */
export const getApiHost = (): string => apiHost;

/**
 * Full API base URL, e.g. "http://localhost:5001/api". The ONE source of truth.
 */
export const getApiBaseUrl = (): string => {
  const h = apiHost.replace(/\/+$/, '');
  const origin = /^https?:\/\//i.test(h) ? h : `http://${h}`;
  return `${origin}/api`;
};

// The local face-recognition microservice (face-back/check.py) runs on the SAME
// host as the backend, port 50011. Deriving the URL from apiHost means any host
// override (adb reverse / LAN IP / runtime override) applies to face recognition
// too — so the phone hits the LOCAL check.py instead of the remote prod service.
const FACE_RECOGNITION_PORT = '50011';

/** Full verify-face URL, e.g. "http://localhost:50011/verify-face". */
export const getFaceRecognitionApiUrl = (): string => {
  // Strip any scheme and path/port so we get the bare hostname.
  const host = apiHost.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0] || 'localhost';
  return `http://${host}:${FACE_RECOGNITION_PORT}/verify-face`;
};

/**
 * Load a persisted host override (if any) into memory. Call as early as possible 
 * at app startup so the first network request uses the right host.
 */
export const loadApiHostOverride = async (): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(HOST_STORAGE_KEY);
    if (stored && stored.trim()) {
      apiHost = stored.trim();
      console.log('[config] Loaded API host override:', apiHost);
    }
  } catch (e) {
    console.warn('[config] Failed to load API host override:', e);
  }
};

/**
 * Override the backend host at runtime and persist it. Pass an empty string to
 * clear the override and fall back to the env/platform default.
 */
export const setApiHost = async (host: string): Promise<void> => {
  const next = (host || '').trim();
  apiHost = next || String(ENV_HOST || PLATFORM_DEFAULT_HOST).trim();
  try {
    if (next) {
      await AsyncStorage.setItem(HOST_STORAGE_KEY, next);
    } else {
      await AsyncStorage.removeItem(HOST_STORAGE_KEY);
    }
    console.log('[config] API host set to:', apiHost);
  } catch (e) {
    console.warn('[config] Failed to persist API host:', e);
  }
};

// Fire-and-forget load on import so the override is usually ready before the
// first (cold-start login) request; appInitService also awaits it explicitly.
void loadApiHostOverride();

/**
 * @deprecated Use getApiHost()/getApiBaseUrl() — those reflect runtime overrides.
 * Kept for backward compatibility; equals the env/platform default at import time.
 */
export const DEV_HOST = apiHost;

export const config = {
  // Remote/prod face-recognition microservice. NOTE: the app now uses
  // getFaceRecognitionApiUrl() (local check.py, derived from apiHost) for
  // verification; this stays as  // Default to production API
  // faceRecognitionApiUrl: 'https://biometric.aicte-india.org/api3/verify-face',
  faceRecognitionApiUrl: 'http://127.0.0.1:50011/verify-face',

  // Demo mode - set to true to simulate successful recognition
  demoMode: false,

  // Default user ID for testing - in real app, get this from authentication
  defaultUserId: '1234',
  backgroundGeolocationLicenseKey: '',
};
