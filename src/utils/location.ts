import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

// checkLocation() (AttendanceScreen) calls requestLocationPermission() on every
// location refresh — focus, pull-to-refresh, and a 30s poll — not just once at
// startup. Calling PermissionsAndroid.request() every single time meant that
// while permission stayed denied, the OS's own native "Location Permission"
// dialog kept re-popping on top of the app's own LocationPermissionModal every
// ~30s (double-popup/flicker). The native prompt is a real one-time OS ask —
// once the user has answered it (in either direction) this session, further
// checks must fall back to the silent check() and let the in-app modal (with
// its "Open App Settings" / "Retry" actions) own the rest of the flow.
let nativePromptAttempted = false;

export const requestLocationPermission = async () => {
  if (Platform.OS === 'android') {
    try {
      // check() is a pure, side-effect-free read of the current OS state with
      // nothing to race, so try that FIRST and only fall through to request()
      // (the real one-time prompt) when it's actually not granted yet.
      const alreadyGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (alreadyGranted) return true;

      if (nativePromptAttempted) {
        // Already asked once this session — don't re-trigger the native
        // dialog on every poll; the custom modal handles it from here.
        return false;
      }
      nativePromptAttempted = true;

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'App needs access to your location.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn(err);
      return false;
    }
  } else {
    // iOS: react-native-geolocation-service does NOT prompt automatically — you
    // must explicitly request authorization, or every getCurrentPosition/
    // watchPosition call fails. Uses NSLocationWhenInUseUsageDescription.
    try {
      const status = await Geolocation.requestAuthorization('whenInUse');
      return status === 'granted';
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
};

export const requestBackgroundLocationPermission = async () => {
  if (Platform.OS !== 'android') return true;

  const fineGranted = await requestLocationPermission();
  if (!fineGranted) return false;

  if (Platform.Version < 29) {
    return true;
  }

  try {
    // Already "Allow all the time"? Nothing to ask.
    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    );
    if (alreadyGranted) return true;

    // Android 10 (API 29) shows a real dialog here. On Android 11+ (API 30+)
    // the OS NEVER shows a dialog for background location — this resolves
    // "never_ask_again" immediately and the user must choose "Allow all the
    // time" in Settings themselves. Callers must therefore treat false as a
    // SOFT failure: start foreground tracking anyway and point to Settings.
    const backgroundGranted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      {
        title: 'Background Location Permission',
        message: 'App needs access to your location in the background for live tracking.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    return backgroundGranted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn(err);
    return false;
  }
};

export const requestNotificationPermission = async () => {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Notification Permission',
        message: 'App needs notification permission for background tracking.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn(err);
    return false;
  }
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// react-native-geolocation-service error codes (see its LocationError.java):
// 5 = SETTINGS_NOT_SATISFIED is a reliable "Location Services are off" signal.
// 2 = POSITION_UNAVAILABLE is NOT — it also fires routinely when the user
// picked Android's "Keep approximate location" (only ACCESS_COARSE_LOCATION
// granted) and enableHighAccuracy:true can't be satisfied, or plain indoors
// GPS unavailability. Treating code 2 as "location off" wrongly showed the
// "turn on location" prompt and, in checkLocation()/startWatch(), stopped
// retrying — permanently stuck on a stale "Location error" even though the
// device kept producing perfectly usable (if coarse, ~1-2km accuracy) fixes.
// Only 5 is specific enough to trust.
export const isLocationServicesDisabledError = (error: any): boolean => {
  return error?.code === 5;
};

export const getCurrentLocation = (): Promise<{ latitude: number; longitude: number }> => {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve({ latitude, longitude });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0, // Always get fresh location, no caching
        // showLocationDialog:false — the alternative (true) makes this library
        // call into Play Services' native "turn on location" resolution flow,
        // which needs a ready foreground Activity and throws a non-JS
        // exception (uncatchable here) if it fires too early or GPS is off.
        // That flow crashed the app outright instead of failing into the
        // error callback below. Now a disabled/unavailable location just
        // rejects normally, and callers show their own polite in-app prompt.
        forceRequestLocation: true,
        showLocationDialog: false,
      }
    );
  });
};

// Force fresh location — waits for an accurate fix (accuracy ≤ GOOD_ACCURACY_M).
// Uses watchPosition so the GPS chip can warm up; resolves on the first fix that
// meets the threshold, or on the best fix seen after TOTAL_TIMEOUT_MS.
//
// Layered fallback (added after real-device reports of hard "timed out with no
// fix" failures indoors, where high-accuracy GPS gets zero satellite fixes
// within budget even though the phone has full WiFi/LTE signal — GPS sky
// visibility is independent of cellular/WiFi signal strength):
//   1. High-accuracy GPS watch — the PRIMARY source, unchanged. If it lands a
//      good fix, nothing else matters.
//   2. In parallel, a single low-accuracy (network/WiFi-assisted) fix is
//      requested immediately as a BACKUP CANDIDATE ONLY — it resolves in
//      seconds even indoors, but is never preferred over a real GPS fix.
//   3. If the deadline hits with NO GPS fix at all (today's failure mode),
//      use the network backup instead of rejecting outright — its own
//      (worse) accuracy value is preserved unchanged, so the existing
//      distance-vs-geofence-radius comparison downstream is exactly as
//      strict as it already is for any other low-accuracy fix; this does not
//      loosen the geofence, it only avoids a hard dead-end when GPS itself
//      is genuinely unavailable.
const GOOD_ACCURACY_M = 60;   // accept fixes at least this accurate
const TOTAL_TIMEOUT_MS = 30000; // give up and use best available after this

export const getFreshLocation = (): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
  return new Promise((resolve, reject) => {
    console.log('getFreshLocation: waiting for accurate GPS fix...');

    let best: { latitude: number; longitude: number; accuracy: number } | null = null;
    let networkBackup: { latitude: number; longitude: number; accuracy: number } | null = null;
    let watchId: number | null = null;
    let settled = false;

    // Backup candidate: low-accuracy (network/WiFi) fix, requested once,
    // up-front, purely as a fallback for step 3 above. Never used if the
    // high-accuracy watch produces anything at all.
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        networkBackup = { latitude, longitude, accuracy: accuracy ?? 999 };
        console.log(`getFreshLocation: network backup fix acc=${networkBackup.accuracy}m`);
      },
      (error) => {
        console.log('getFreshLocation: network backup fix unavailable:', error?.message || error);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 } as any,
    );

    const finish = (result: { latitude: number; longitude: number; accuracy: number }) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) Geolocation.clearWatch(watchId);
      console.log(`getFreshLocation: resolved lat=${result.latitude} lon=${result.longitude} acc=${result.accuracy}m`);
      resolve(result);
    };

    const deadline = setTimeout(() => {
      if (best) {
        console.log(`getFreshLocation: timeout — using best GPS fix so far (acc=${best.accuracy}m)`);
        finish(best);
      } else if (networkBackup) {
        console.log(`getFreshLocation: timeout, no GPS fix at all — falling back to network fix (acc=${networkBackup.accuracy}m)`);
        finish(networkBackup);
      } else {
        if (!settled) {
          settled = true;
          if (watchId !== null) Geolocation.clearWatch(watchId);
          reject(new Error('getFreshLocation: timed out with no fix'));
        }
      }
    }, TOTAL_TIMEOUT_MS);

    watchId = Geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const acc = accuracy ?? 999;
        console.log(`getFreshLocation: fix acc=${acc}m`);

        if (!best || acc < best.accuracy) {
          best = { latitude, longitude, accuracy: acc };
        }

        if (acc <= GOOD_ACCURACY_M) {
          clearTimeout(deadline);
          finish(best);
        }
      },
      (error) => {
        console.error('getFreshLocation watch error:', error);
        if (best) {
          clearTimeout(deadline);
          finish(best);
        } else if (networkBackup) {
          console.log('getFreshLocation: GPS watch errored with no fix — falling back to network fix');
          clearTimeout(deadline);
          finish(networkBackup);
        } else if (!settled) {
          settled = true;
          if (watchId !== null) Geolocation.clearWatch(watchId);
          clearTimeout(deadline);
          reject(error);
        }
      },
      {
        enableHighAccuracy: true,
        interval: 2000,
        fastestInterval: 1000,
        maximumAge: 0,
        // showLocationDialog:false — see getCurrentLocation() above for why.
        forceRequestLocation: true,
        showLocationDialog: false,
      } as any,
    );
  });
};

// Like getCurrentLocation but also returns GPS accuracy (meters). Used by the
// SAACMS evidence flows (class check-in, outreach) which send
// {latitude, longitude, accuracy} to the backend.
export const getCurrentPositionDetailed = (): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
}> => {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        resolve({ latitude, longitude, accuracy: accuracy ?? 0 });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
        // showLocationDialog:false — the alternative (true) makes this library
        // call into Play Services' native "turn on location" resolution flow,
        // which needs a ready foreground Activity and throws a non-JS
        // exception (uncatchable here) if it fires too early or GPS is off.
        // That flow crashed the app outright instead of failing into the
        // error callback below. Now a disabled/unavailable location just
        // rejects normally, and callers show their own polite in-app prompt.
        forceRequestLocation: true,
        showLocationDialog: false,
      }
    );
  });
}; 