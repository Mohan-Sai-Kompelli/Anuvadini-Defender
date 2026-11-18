import Geolocation from 'react-native-geolocation-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestLocationPermission } from '../utils/location';
import { apiService } from './api';

const STORAGE_LAST_SENT = 'liveLocationLastSentAt';
const MIN_SEND_INTERVAL_MS = 15000;

// How long to wait between hard-refresh verification pings (ms).
// 5 s is enough to let the GPS chip settle on a fresh fix.
const VERIFICATION_INTERVAL_MS = 5000;

// Maximum number of verification attempts to send. Matches EXIT_CONFIRM_COUNT
// on the server — once the server has received this many outside fixes it will
// confirm the exit on its own; we stop early if the server says inside again.
const MAX_VERIFICATION_PINGS = 3;

class LiveLocationService {
  private watchId: number | null = null;
  // Epoch millis end of the working-hours window — 0 means "no expiry
  // known". Previously nothing checked this, so a forgotten checkout (or
  // the app never being reopened) left this watcher (and the other two
  // tracking channels) running indefinitely. Checked on every fix.
  private expiresAtMs = 0;
  private sending = false;
  private lastSentAt = 0;
  // True while we are in the hard-refresh verification loop so the normal
  // watchPosition handler doesn't fire concurrently.
  private verifying = false;
  // Set by stop() and checked at every point the exit-verification loop is
  // about to send another ping. Privacy fix: stop() only cleared the
  // watchPosition subscription, but the verification loop (below) doesn't
  // read from that subscription at all — it drives itself with its own
  // getCurrentPosition calls across up to MAX_VERIFICATION_PINGS attempts
  // 5s apart. If a checkout happened WHILE that loop was mid-flight (started
  // by an earlier outside-fence ping, before checkout), stop() left it
  // running: it kept sending the person's live location for several more
  // seconds AFTER they'd already checked out. This flag lets it notice and
  // bail immediately instead.
  private stopped = false;

  async start(expiresAtMs = 0): Promise<void> {
    this.stopped = false;
    this.expiresAtMs = expiresAtMs;
    if (this.watchId !== null) {
      return;
    }

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      console.warn('LiveLocationService: location permission denied');
      return;
    }

    const storedLastSent = await AsyncStorage.getItem(STORAGE_LAST_SENT);
    if (storedLastSent) {
      this.lastSentAt = Number(storedLastSent) || 0;
    }

    // A previous explicit stop marks the server record as stopped.  Re-assert
    // the live state before the first GPS fix so stop -> start works even when
    // the first fix is delayed by Android.
    try {
      await apiService.updateLocationStatus({ status: 'live' });
    } catch (error) {
      console.warn('LiveLocationService start status update failed:', error);
    }

    this.watchId = Geolocation.watchPosition(
      (position) => {
        this.handlePosition(position).catch((error) => {
          console.warn('LiveLocationService position handling error:', error);
        });
      },
      (error) => {
        console.warn('LiveLocationService watchPosition error:', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 10,
        interval: 10000,
        fastestInterval: 5000,
        // showLocationDialog:false — true triggers Play Services' native
        // "turn on location" resolution flow, which needs a ready foreground
        // Activity and can throw a non-JS (uncatchable) exception if it fires
        // before one exists — exactly the case here, since this watch is
        // started from app boot/background restore. A disabled location now
        // just errors into the callback below instead of crashing the app.
        forceRequestLocation: true,
        showLocationDialog: false,
        maximumAge: 0,
      }
    );
  }

  async stop(explicit: boolean = false): Promise<void> {
    this.stopped = true;
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (explicit) {
      try {
        await apiService.updateLocationStatus({ status: 'stopped', reason: 'user_stopped' });
      } catch (error) {
        console.warn('LiveLocationService stop status update failed:', error);
      }
    }
  }

  pause(): void {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private async handlePosition(position: any): Promise<void> {
    // Checkout may have raced this callback (a fix was already in flight when
    // stop() ran) — never send a location update after we've been told to stop.
    if (this.stopped) return;
    // Skip regular pings while verification loop is running to avoid races.
    if (this.sending || this.verifying) return;

    const now = Date.now();
    if (this.expiresAtMs > 0 && now >= this.expiresAtMs) {
      // Working-hours window is over — stop instead of pinging forever.
      // Non-explicit: checkout wasn't actually pressed, so don't tell the
      // server "stopped" (that's still whatever the server itself decides
      // for an un-checked-out day) — just stop THIS device's own polling.
      console.log('LiveLocationService: tracking window expired, stopping');
      this.stop(false).catch(() => {});
      return;
    }
    if (now - this.lastSentAt < MIN_SEND_INTERVAL_MS) {
      return;
    }

    this.sending = true;
    try {
      const { latitude, longitude, accuracy, heading, speed } = position.coords;
      const response = await apiService.updateLiveLocation({
        latitude,
        longitude,
        accuracy,
        heading,
        speed,
        timestamp: position.timestamp,
      });

      if (!response.success) {
        console.warn('LiveLocationService update failed:', response.error);
      }

      this.lastSentAt = now;
      await AsyncStorage.setItem(STORAGE_LAST_SENT, String(now));

      // Server flagged this fix as suspicious — start hard-refresh verification.
      if (response.success && response.data?.needsVerification) {
        console.log('LiveLocationService: server requested exit verification, starting hard-refresh loop');
        // Release sending lock before entering the verification loop so it
        // can use the same lock internally.
        this.sending = false;
        await this.runExitVerification();
        return;
      }
    } catch (error) {
      console.warn('LiveLocationService update error:', error);
    } finally {
      this.sending = false;
    }
  }

  /**
   * Hard-refresh verification loop.
   *
   * When the server says needsVerification:true it means one outside ping
   * arrived but we are not sure whether it was GPS jitter or a real exit.
   * We obtain MAX_VERIFICATION_PINGS fresh GPS fixes (maximumAge:0 — strictly
   * no cache), post each one as isVerification:true, and stop as soon as the
   * server says we are inside again OR after MAX_VERIFICATION_PINGS pings
   * (at which point the server will have confirmed the exit itself).
   */
  private async runExitVerification(): Promise<void> {
    if (this.verifying) return;
    this.verifying = true;

    try {
      for (let attempt = 1; attempt <= MAX_VERIFICATION_PINGS; attempt++) {
        // Checked out mid-loop (this loop can run for 10+ seconds across its
        // attempts) — stop sending immediately, don't wait for the next
        // scheduled attempt or finish the remaining pings.
        if (this.stopped) {
          console.log('LiveLocationService: stopped mid-verification (checked out) — aborting remaining pings');
          break;
        }

        // Wait between attempts to let GPS chip produce a genuinely fresh fix.
        if (attempt > 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, VERIFICATION_INTERVAL_MS));
        }
        if (this.stopped) break;

        const position = await this.getFreshPosition();
        if (!position) {
          console.warn(`LiveLocationService: verification attempt ${attempt} — could not get GPS fix, aborting`);
          break;
        }
        // The fresh-fix request itself can take up to 10s (timeout below) —
        // re-check right before actually transmitting anything.
        if (this.stopped) break;

        const { latitude, longitude, accuracy, heading, speed } = position.coords;
        console.log(`LiveLocationService: verification ping ${attempt}/${MAX_VERIFICATION_PINGS} — accuracy ${accuracy?.toFixed(0)} m, sending`);

        const response = await apiService.updateLiveLocation({
          latitude,
          longitude,
          accuracy,
          heading,
          speed,
          timestamp: position.timestamp,
          isVerification: true,
        } as any);

        if (!response.success) {
          console.warn(`LiveLocationService: verification ping ${attempt} failed:`, response.error);
          break;
        }

        const data = response.data || {};
        console.log(`LiveLocationService: verification ping ${attempt} result — insidePremises: ${data.insidePremises}, needsVerification: ${data.needsVerification}`);

        // If server says we are inside (GPS jitter confirmed), stop immediately.
        if (data.insidePremises === true) {
          console.log('LiveLocationService: inside confirmed during verification — exit was GPS jitter, stopping');
          break;
        }

        // If server no longer asks for verification, it has already made its
        // decision (confirmed exit) — nothing more to do.
        if (!data.needsVerification) {
          break;
        }
      }
    } catch (err) {
      console.warn('LiveLocationService: exit verification loop error:', err);
    } finally {
      this.verifying = false;
    }
  }

  // Returns a single fresh GPS fix with no caching allowed (maximumAge: 0).
  private getFreshPosition(): Promise<any> {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => {
          console.warn('LiveLocationService: getFreshPosition error:', err);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
          forceRequestLocation: true,
          // showLocationDialog:false — this can fire from the automatic exit-
          // verification loop after boot-restored live tracking, with no
          // foreground Activity guaranteed ready. See start() above.
          showLocationDialog: false,
        }
      );
    });
  }
}

export const liveLocationService = new LiveLocationService();
export default liveLocationService;
