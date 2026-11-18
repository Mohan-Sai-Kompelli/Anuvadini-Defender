import { pushNotificationService } from './pushNotificationService';
import { wfhStatusManager } from './wfhStatusManager';
import { liveLocationService } from './liveLocationService';
import { backgroundLocationService } from './backgroundLocationService';
import { apiService } from './api';
import { AppState, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import { loadApiHostOverride, getApiBaseUrl } from '../config';
import { nativeLiveLocation } from './nativeLiveLocation';

class AppInitService {
  private initialized = false;
  private appStateSubscription: any = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('Initializing app services...');

      // Resolve the backend host first (picks up any persisted host override)
      // so every subsequent network call uses the right base URL.
      await loadApiHostOverride();

      // iOS: request location authorization once up front. Without this,
      // react-native-geolocation-service never prompts the user and every
      // position read fails with a permission error ("Location error").
      if (Platform.OS === 'ios') {
        try {
          const status = await Geolocation.requestAuthorization('whenInUse');
          console.log('iOS location authorization status:', status);
        } catch (e) {
          console.warn('iOS location authorization request failed:', e);
        }
      }

      // Process background notifications first (critical for kill state recovery)
      await this.processBackgroundNotifications();

      // Initialize push notifications
      const pushInitialized = await pushNotificationService.initialize();
      if (pushInitialized) {
        console.log('Push notifications initialized successfully');
      } else {
        console.warn('Push notifications failed to initialize');
      }

      // Initialize WFH status manager
      await wfhStatusManager.initialize();
      console.log('WFH status manager initialized');

      // Start live tracking only if user explicitly shared
      await this.restoreLiveTrackingFromStorage();

      // Process pending refreshes from background notifications
      await this.processPendingRefreshes();

      // Set up app state change listener
      this.setupAppStateListener();

      this.initialized = true;
      console.log('App services initialized successfully');
    } catch (error) {
      console.error('Error initializing app services:', error);
    }
  }

  private async processBackgroundNotifications(): Promise<void> {
    try {
      console.log('Processing background notifications from kill state...');
      
      const backgroundNotifications = await AsyncStorage.getItem('backgroundNotifications');
      if (backgroundNotifications) {
        const notifications = JSON.parse(backgroundNotifications);
        const unprocessedNotifications = notifications.filter((n: any) => !n.processed);
        
        console.log(`Found ${unprocessedNotifications.length} unprocessed background notifications`);
        
        for (const notification of unprocessedNotifications) {
          if (notification.data && notification.data.type) {
            console.log('Processing background notification:', notification.data.type, notification.data);
            
            switch (notification.data.type) {
              case 'wfh_assigned':
                console.log('Processing WFH assigned from background');
                // Force update WFH cache with background data
                const wfhStatus = {
                  hasActiveWFH: true,
                  startDate: notification.data.startDate,
                  endDate: notification.data.endDate,
                  reason: notification.data.reason,
                  lastUpdated: notification.data.timestamp || notification.receivedAt,
                  source: 'background_recovery'
                };
                await AsyncStorage.setItem('wfhStatus', JSON.stringify(wfhStatus));
                console.log('WFH status updated from background notification:', wfhStatus);
                break;
                
              case 'wfh_removed':
              case 'wfh_expired':
                console.log('Processing WFH removed from background');
                // Clear WFH cache
                await AsyncStorage.removeItem('wfhStatus');
                console.log('WFH status cleared from background notification');
                break;
                
              case 'location_update':
                console.log('Processing location update from background');
                // Clear organization cache
                await AsyncStorage.removeItem('organizationData');
                break;
            }
            
            // Mark as processed
            notification.processed = true;
          }
        }
        
        // Save updated notifications
        await AsyncStorage.setItem('backgroundNotifications', JSON.stringify(notifications));
        console.log('Background notifications marked as processed');
        
        // If we processed any WFH notifications, set a flag to force refresh
        const wfhNotifications = unprocessedNotifications.filter((n: any) =>
          n.data && (n.data.type === 'wfh_assigned' || n.data.type === 'wfh_removed' || n.data.type === 'wfh_expired')
        );
        
        if (wfhNotifications.length > 0) {
          console.log(`Processed ${wfhNotifications.length} WFH background notifications, setting refresh flag`);
          await AsyncStorage.setItem('forceWFHRefresh', JSON.stringify({
            reason: 'background_notifications_processed',
            timestamp: new Date().toISOString(),
            count: wfhNotifications.length
          }));
        }
      } else {
        console.log('No background notifications found');
      }
    } catch (error) {
      console.error('Error processing background notifications:', error);
    }
  }

  private async processPendingRefreshes(): Promise<void> {
    try {
      // Check for pending WFH refresh
      const pendingWFHRefresh = await AsyncStorage.getItem('pendingWFHRefresh');
      if (pendingWFHRefresh) {
        const refreshData = JSON.parse(pendingWFHRefresh);
        console.log('Processing pending WFH refresh from kill state:', refreshData.reason);
        
        // Force refresh WFH status to get latest from server
        await wfhStatusManager.forceRefresh();
        
        // Clear the pending refresh flag
        await AsyncStorage.removeItem('pendingWFHRefresh');
        console.log('Pending WFH refresh processed and cleared');
      }

      // Check for pending location refresh
      const pendingLocationRefresh = await AsyncStorage.getItem('pendingLocationRefresh');
      if (pendingLocationRefresh) {
        const refreshData = JSON.parse(pendingLocationRefresh);
        console.log('Processing pending location refresh from kill state:', refreshData.reason);
        
        // Clear cached organization data to force refresh
        await AsyncStorage.removeItem('organizationData');
        
        // Clear the pending refresh flag
        await AsyncStorage.removeItem('pendingLocationRefresh');
        console.log('Pending location refresh processed and cleared');
      }
    } catch (error) {
      console.error('Error processing pending refreshes:', error);
    }
  }

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    try {
      console.log('App state changed to:', nextAppState);

      if (nextAppState === 'active') {
        // App came to foreground
        console.log('App became active, checking for updates...');
        
        // Process any new background notifications
        await this.processBackgroundNotifications();
        
        // Process any pending refreshes
        await this.processPendingRefreshes();
        
        // Check for pending refresh from push notifications
        const pendingRefresh = await pushNotificationService.checkPendingRefresh();
        if (pendingRefresh) {
          console.log('Processing pending refresh:', pendingRefresh.reason);
          
          if (pendingRefresh.reason.includes('wfh')) {
            // Force refresh WFH status
            await wfhStatusManager.forceRefresh();
          }
        }

        // Check if WFH has expired
        await wfhStatusManager.checkWFHExpiration();

        // Resume live tracking if a share session is still active
        await this.restoreLiveTrackingFromStorage();
      }
    } catch (error) {
      console.error('Error handling app state change:', error);
    }
  };

  // expiresAtMs: epoch millis end of the working-hours window, when known —
  // restoreLiveTrackingFromStorage() below already validates the window
  // hasn't expired before calling this, but previously never actually
  // PASSED that expiry into the channels themselves, so once started they'd
  // run with no self-stop until the app was reopened again (or killed).
  private async startGpsTracking(expiresAtMs = 0): Promise<void> {
    await liveLocationService.start(expiresAtMs);
    if (nativeLiveLocation.available) {
      const token = await AsyncStorage.getItem('authToken');
      if (token) nativeLiveLocation.start(`${getApiBaseUrl()}/student/live-location`, token, 60000, expiresAtMs);
    } else {
      await backgroundLocationService.start(undefined, expiresAtMs);
    }
  }

  private async stopGpsTracking(): Promise<void> {
    liveLocationService.pause();
    nativeLiveLocation.stop();
    await backgroundLocationService.stop();
    // Leave an EXPLICIT {active:false} record rather than deleting the key.
    // restoreLiveTrackingFromStorage() (below) treats a MISSING key as
    // ambiguous — "no local record, maybe app data was cleared — check if the
    // server still has an active window" — and that check calls
    // /live-location/share, which unconditionally REACTIVATES the window
    // (active:true) regardless of prior state. Deleting the key here used to
    // recreate exactly that ambiguity on every stop, so the very next app
    // foreground after a stop (checkout, WFH expiry, etc.) silently restarted
    // live tracking. An explicit false record instead keeps hitting the
    // early-return "not active" branch below, with no server call at all.
    await AsyncStorage.setItem('liveTrackingShare', JSON.stringify({ active: false }));
  }

  private async restoreLiveTrackingFromStorage(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem('liveTrackingShare');

      if (!raw) {
        // AsyncStorage is empty — this happens after app reinstall, data clear,
        // or when old code wiped it on expiry. Check if the server still has an
        // active window. If so, save it locally WITHOUT calling /share (which
        // would reset startedAt on the server) — just start the GPS watcher.
        // We use /live-location/share with a zero-minute duration to get the
        // current trackUntil without actually opening a new window; the server
        // always reuses the existing active doc.
        try {
          const serverShare = await apiService.startLiveLocationShare({} as any);
          // makeRequest wraps the full server JSON in .data, so the actual
          // server payload is at .data (which itself is { success, data: { trackUntil } })
          const trackUntilStr: string | undefined =
            (serverShare.data as any)?.data?.trackUntil  // nested: makeRequest.data = server JSON
            ?? (serverShare.data as any)?.trackUntil;    // flat fallback
          if (serverShare.success && trackUntilStr) {
            const newEndsAt = new Date(trackUntilStr);
            if (newEndsAt > new Date()) {
              await AsyncStorage.setItem(
                'liveTrackingShare',
                JSON.stringify({ active: true, endsAt: trackUntilStr, source: 'server-restore' })
              );
              console.log('[AppInit] no local record — restored from server until', trackUntilStr);
              await this.startGpsTracking(newEndsAt.getTime());
            }
          }
        } catch (_) { /* network error — no tracking to restore */ }
        return;
      }

      const share = JSON.parse(raw);
      const endsAt = share?.endsAt ? new Date(share.endsAt) : null;
      const isActive = Boolean(share?.active);
      let finalEndsAtMs = endsAt ? endsAt.getTime() : 0;

      if (!isActive) {
        await this.stopGpsTracking();
        await AsyncStorage.removeItem('liveTrackingAuthToken');
        return;
      }

      // If the locally-stored window has expired, call /share to open a fresh
      // one (this correctly resets startedAt for a new day's session).
      if (endsAt && endsAt <= new Date()) {
        try {
          const refreshed = await apiService.startLiveLocationShare({} as any);
          const refreshedTrackUntil: string | undefined =
            (refreshed.data as any)?.data?.trackUntil
            ?? (refreshed.data as any)?.trackUntil;
          if (refreshed.success && refreshedTrackUntil) {
            const newEndsAt = new Date(refreshedTrackUntil);
            if (newEndsAt > new Date()) {
              await AsyncStorage.setItem(
                'liveTrackingShare',
                JSON.stringify({ active: true, endsAt: refreshedTrackUntil, source: 'refreshed' })
              );
              console.log('[AppInit] tracking window refreshed from server until', refreshedTrackUntil);
              finalEndsAtMs = newEndsAt.getTime();
              // Fall through to start normally below.
            } else {
              console.log('[AppInit] server says tracking expired — stopping');
              await this.stopGpsTracking();
              return;
            }
          } else {
            console.log('[AppInit] could not refresh tracking window — stopping');
            await this.stopGpsTracking();
            return;
          }
        } catch (_refreshErr) {
          console.warn('[AppInit] network error refreshing tracking window — stopping');
          await this.stopGpsTracking();
          return;
        }
      }

      console.log('[AppInit] live tracking restored from storage, starting GPS');
      await this.startGpsTracking(finalEndsAtMs);
    } catch (error) {
      console.warn('Failed to restore live tracking:', error);
    }
  }

  async cleanup(): Promise<void> {
    try {
      console.log('Cleaning up app services...');

      // Remove app state listener
      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
        this.appStateSubscription = null;
      }

      // Cleanup services - pause location tracking without updating server status
      await pushNotificationService.cleanup();
      wfhStatusManager.cleanup();
      liveLocationService.pause();
      await backgroundLocationService.stop();

      this.initialized = false;
      console.log('App services cleaned up');
    } catch (error) {
      console.error('Error cleaning up app services:', error);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const appInitService = new AppInitService();
export default appInitService;