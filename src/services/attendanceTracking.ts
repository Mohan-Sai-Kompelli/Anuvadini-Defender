import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { liveLocationService } from './liveLocationService';
import { backgroundLocationService } from './backgroundLocationService';
import { nativeLiveLocation } from './nativeLiveLocation';
import { getApiBaseUrl } from '../config';

// How often the native background service captures + uploads a fix while the app
// is closed. 60s balances "track every activity" against battery.
const NATIVE_INTERVAL_MS = 60000;

// Reuses the same AsyncStorage session key that appInitService already restores
// on app launch / foreground (so a check-in tracking window survives the app
// being backgrounded or killed, and auto-stops at `endsAt` = end of work hours).
const SHARE_KEY = 'liveTrackingShare';

export interface CheckInTracking {
  shouldTrack?: boolean;
  trackUntil?: string; // ISO — end of the working-hours window
}

// Exactly ONE location channel runs at a time, switched by app foreground
// state — NOT both simultaneously (that was the bug: liveLocationService's
// 15s foreground pings and nativeLiveLocation's 60s pings were both hitting
// POST /student/live-location the whole time the app was open, doubling
// calls for no benefit). Foreground always uses the JS watcher because it's
// the only one that inspects the server's response and can run the
// exit-verification hard-refresh loop (see liveLocationService.ts) — the
// native service is fire-and-forget and can't do that. Background/killed
// always uses native (or the JS background-actions fallback), because only
// those survive the app being swiped from recents.
let appStateSub: { remove: () => void } | null = null;
let usingNative = false;
let nativeUrl: string | null = null;
let nativeToken: string | null = null;
// Epoch millis end of the working-hours window. Previously NOTHING enforced
// this client-side — all three tracking channels just ran forever until the
// user reopened the app (appInitService's restore check) or manually
// checked out. A forgotten checkout, or the app never being reopened that
// day, meant GPS tracking ran all night — exactly what shows up as "app is
// draining battery in the background". Every channel below is now handed
// this expiry and stops itself once it passes.
let expiresAtMs = 0;

function handleAppStateChange(state: AppStateStatus): void {
  if (state === 'active') {
    if (usingNative) {
      nativeLiveLocation.stop();
    } else {
      backgroundLocationService.stop().catch(() => {});
    }
    liveLocationService.start(expiresAtMs).catch((e) => console.warn('[attendanceTracking] resume foreground watcher failed:', e));
  } else {
    // 'background' or 'inactive' — hand off to whichever channel survives
    // the app being backgrounded/killed.
    liveLocationService.pause();
    if (usingNative && nativeUrl && nativeToken) {
      nativeLiveLocation.start(nativeUrl, nativeToken, NATIVE_INTERVAL_MS, expiresAtMs);
    } else if (!usingNative) {
      backgroundLocationService.start(undefined, expiresAtMs).catch((e) => console.warn('[attendanceTracking] background fallback start failed:', e));
    }
  }
}

/**
 * Begin streaming live location after a successful check-in. Driven by the
 * `tracking` directive the /attendance/mark response returns. No-op when the
 * server didn't ask us to track (e.g. WFH check-in).
 */
export async function startCheckInTracking(tracking?: CheckInTracking | null): Promise<void> {
  if (!tracking || !tracking.shouldTrack) return;
  try {
    await AsyncStorage.setItem(
      SHARE_KEY,
      JSON.stringify({ active: true, endsAt: tracking.trackUntil || null, source: 'checkin' })
    );

    expiresAtMs = tracking.trackUntil ? new Date(tracking.trackUntil).getTime() : 0;

    usingNative = nativeLiveLocation.available;
    nativeUrl = null;
    nativeToken = null;

    if (usingNative) {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        nativeUrl = `${getApiBaseUrl()}/student/live-location`;
        nativeToken = token;
        // One-time nudge to whitelist the app from battery optimisation (the main
        // reason OEMs like Vivo kill the service on swipe). No-op once granted.
        const exempt = await nativeLiveLocation.isIgnoringBatteryOptimizations();
        if (!exempt) nativeLiveLocation.requestIgnoreBatteryOptimizations();
      } else {
        usingNative = false; // no token to hand the native service — fall back to JS
      }
    }

    // We just checked in, so the app is foreground right now — start with
    // the JS watcher regardless of which channel owns "background".
    await liveLocationService.start(expiresAtMs);

    appStateSub?.remove();
    appStateSub = AppState.addEventListener('change', handleAppStateChange);

    console.log('[attendanceTracking] live tracking started until', tracking.trackUntil, '— background channel:', usingNative ? 'native' : 'js-fallback');
  } catch (e) {
    console.warn('[attendanceTracking] start failed:', e);
  }
}

/**
 * Stop streaming live location (called on checkout). Marks the server status
 * 'stopped' so the person drops off the Admin/HOD map immediately.
 */
export async function stopCheckInTracking(): Promise<void> {
  try {
    appStateSub?.remove();
    appStateSub = null;
    nativeUrl = null;
    nativeToken = null;
    expiresAtMs = 0;

    // Record an EXPLICIT "stopped", not an absent key. appInitService's
    // restoreLiveTrackingFromStorage() treats a MISSING key as "no local
    // record — check whether the server still has an active window" and
    // calls /live-location/share to find out — but that endpoint doesn't just
    // read the window, it unconditionally reactivates it
    // (active:true, stoppedAt:null) regardless of prior state. Removing the
    // key here (as before) meant the very next app foreground/resume after
    // checkout silently restarted live tracking — the privacy leak this is
    // fixing. An explicit `active:false` record hits
    // restoreLiveTrackingFromStorage's OTHER branch instead (stop and return,
    // no server call at all), which is what checkout actually needs.
    await AsyncStorage.setItem(SHARE_KEY, JSON.stringify({ active: false }));
    await liveLocationService.stop(true); // explicit → server status 'stopped'
    nativeLiveLocation.stop();
    await backgroundLocationService.stop();
    console.log('[attendanceTracking] live tracking stopped');
  } catch (e) {
    console.warn('[attendanceTracking] stop failed:', e);
  }
}
