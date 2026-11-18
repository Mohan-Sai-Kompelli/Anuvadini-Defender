import { NativeModules, Platform } from 'react-native';

/**
 * Thin wrapper over the native `LiveLocation` foreground service (Android only).
 *
 * This service keeps POSTing location fixes even after the app is swiped from
 * recents, because it runs natively (FusedLocationProvider + HttpURLConnection)
 * independent of the React JS engine. The JS side only starts/stops it and
 * hands over the backend URL + auth token. Everything is a safe no-op if the
 * native module isn't in the build (iOS, or a JS-only reload).
 */
const LL = (NativeModules as any).LiveLocation as
  | {
      start(url: string, token: string, intervalMs: number, expiresAt: number): void;
      stop(): void;
      isIgnoringBatteryOptimizations(): Promise<boolean>;
      requestIgnoreBatteryOptimizations(): void;
    }
  | undefined;

export const nativeLiveLocation = {
  /** True when the native service is available (Android release/native build). */
  available: Platform.OS === 'android' && !!LL,

  /**
   * @param expiresAtMs epoch millis (end of the working-hours window) — the
   *   service self-stops once this passes instead of running indefinitely.
   *   Always pass the real value; 0 disables the expiry check natively.
   */
  start(url: string, token: string, intervalMs = 60000, expiresAtMs = 0): void {
    if (!nativeLiveLocation.available || !LL) return;
    try {
      LL.start(url, token, intervalMs, expiresAtMs);
    } catch (e) {
      console.warn('[nativeLiveLocation] start failed:', e);
    }
  },

  stop(): void {
    if (!nativeLiveLocation.available || !LL) return;
    try {
      LL.stop();
    } catch (e) {
      console.warn('[nativeLiveLocation] stop failed:', e);
    }
  },

  async isIgnoringBatteryOptimizations(): Promise<boolean> {
    if (!nativeLiveLocation.available || !LL) return true;
    try {
      return await LL.isIgnoringBatteryOptimizations();
    } catch {
      return true;
    }
  },

  /** Opens the system "ignore battery optimisation" prompt for this app. */
  requestIgnoreBatteryOptimizations(): void {
    if (!nativeLiveLocation.available || !LL) return;
    try {
      LL.requestIgnoreBatteryOptimizations();
    } catch {
      /* some OEMs don't expose this screen */
    }
  },
};

export default nativeLiveLocation;
