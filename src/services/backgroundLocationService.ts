import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import BackgroundService from 'react-native-background-actions';
import { apiService } from './api';
import { requestBackgroundLocationPermission, requestLocationPermission, requestNotificationPermission } from '../utils/location';

const sleep = (timeMs: number) => new Promise(resolve => setTimeout(resolve, timeMs));

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (check-in → check-out tracking)
// Persisted so a kill/relaunch (or the headless task) knows tracking should be on.
const ACTIVE_KEY = 'liveTrackingActive';

class BackgroundLocationService {
  private starting = false;
  private watchdogId: ReturnType<typeof setInterval> | null = null;
  private watchdogIntervalMs = 30000;

  // expiresAtMs: epoch millis end of the working-hours window — the task
  // loop below stops itself once this passes, instead of running forever
  // (this JS-fallback channel had the same "never stops" gap as the native
  // one and the foreground watcher; see attendanceTracking.ts).
  async start(intervalMs: number = DEFAULT_INTERVAL_MS, expiresAtMs = 0): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (this.starting || BackgroundService.isRunning()) return;

    this.starting = true;
    try {
      // Only foreground (fine) location is a hard requirement. Notification
      // permission and background ("Allow all the time") location are best-
      // effort: on Android 11+ the background request never shows a dialog, so
      // hard-failing here silently disabled live tracking on real devices. The
      // foreground service started below keeps location flowing even with
      // while-in-use permission.
      const hasFineLocation = await requestLocationPermission();
      if (!hasFineLocation) {
        console.warn('BackgroundLocationService: fine location permission denied — cannot track');
        return;
      }

      const hasNotificationPermission = await requestNotificationPermission();
      if (!hasNotificationPermission) {
        console.warn('BackgroundLocationService: notification permission denied — tracking notification will be hidden');
      }

      const hasBackgroundPermission = await requestBackgroundLocationPermission();
      if (!hasBackgroundPermission) {
        console.warn('BackgroundLocationService: background location not granted — tracking runs via foreground service only');
      }

      await BackgroundService.start(this.task, {
        taskName: 'LiveTracking',
        taskTitle: 'Live Tracking active',
        taskDesc: 'Sharing live location for attendance',
        taskIcon: {
          name: 'ic_launcher',
          type: 'mipmap'
        },
        color: '#3bca02',
        // Must match android:foregroundServiceType="location" in AndroidManifest.xml —
        // Android 14+ (targetSdk 34+) crashes with InvalidForegroundServiceTypeException
        // if the running type (default: none) doesn't match the manifest-declared type.
        foregroundServiceType: ['location'],
        parameters: {
          intervalMs,
          expiresAtMs
        }
      });

      this.startWatchdog();
    } catch (error) {
      console.warn('BackgroundLocationService start error:', error);
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    if (Platform.OS !== 'android') return;
    // Always disarm the watchdog.  The native task may already have stopped
    // itself while the watchdog is still alive; leaving it armed can race with
    // a later manual restart.
    this.stopWatchdog();
    if (!BackgroundService.isRunning()) return;
    try {
      await BackgroundService.stop();
    } catch (error) {
      console.warn('BackgroundLocationService stop error:', error);
    }
  }

  // Begin tracking at CHECK-IN: persist the active flag (survives kill/relaunch)
  // and start the foreground service that pings every 5 min until check-out.
  async onCheckIn(): Promise<void> {
    try {
      await AsyncStorage.setItem(ACTIVE_KEY, '1');
    } catch { /* best-effort */ }
    await this.start(DEFAULT_INTERVAL_MS);
  }

  // End tracking at CHECK-OUT: clear the flag, stop the service, and tell the
  // server this person is no longer being tracked.
  async onCheckOut(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ACTIVE_KEY);
    } catch { /* best-effort */ }
    await this.stop();
    try {
      await apiService.stopLiveLocationShare();
    } catch { /* best-effort */ }
  }

  // Called on app launch: if the user checked in but never checked out (e.g. the
  // app was killed), restart tracking so the trail continues uninterrupted.
  async resumeIfActive(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      const active = await AsyncStorage.getItem(ACTIVE_KEY);
      if (active === '1' && !BackgroundService.isRunning()) {
        await this.start(DEFAULT_INTERVAL_MS);
      }
    } catch { /* best-effort */ }
  }

  private task = async (taskData: { intervalMs?: number; expiresAtMs?: number }): Promise<void> => {
    const intervalMs = taskData?.intervalMs || DEFAULT_INTERVAL_MS;
    const expiresAtMs = taskData?.expiresAtMs || 0;
    while (BackgroundService.isRunning()) {
      if (expiresAtMs > 0 && Date.now() >= expiresAtMs) {
        console.log('BackgroundLocationService: tracking window expired, stopping');
        await this.stop();
        break;
      }
      await this.captureAndSend();
      await sleep(intervalMs);
    }
  };

  private async captureAndSend(): Promise<void> {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude, accuracy, heading, speed } = position.coords;
            await apiService.updateLiveLocation({
              latitude,
              longitude,
              accuracy,
              heading,
              speed,
              timestamp: position.timestamp
            });
          } catch (error) {
            console.warn('BackgroundLocationService update failed:', error);
          } finally {
            resolve();
          }
        },
        (error) => {
          console.warn('BackgroundLocationService location error:', error);
          resolve();
        },
        {
          // Was enableHighAccuracy:true (raw GPS chip) for a channel that
          // only fires every 5 minutes in the background — network/Wi-Fi
          // positioning is more than precise enough for "still roughly
          // on-site" confirmation at that cadence, at a fraction of the
          // battery cost. The foreground exit-verification watcher (which
          // genuinely needs GPS-grade precision) is untouched.
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 0,
          forceRequestLocation: true,
          showLocationDialog: false
        }
      );
    });
  }

  private startWatchdog(): void {
    if (this.watchdogId) return;
    this.watchdogId = setInterval(() => {
      this.ensureRunning().catch((error) => {
        console.warn('BackgroundLocationService watchdog error:', error);
      });
    }, this.watchdogIntervalMs);
  }

  private stopWatchdog(): void {
    if (this.watchdogId) {
      clearInterval(this.watchdogId);
      this.watchdogId = null;
    }
  }

  private async ensureRunning(): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (this.starting) return;
    if (!BackgroundService.isRunning()) {
      console.log('BackgroundLocationService watchdog restarting service');
      await this.start();
    }
  }
}

export const backgroundLocationService = new BackgroundLocationService();
export default backgroundLocationService;
