import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from './api';
import { pushNotificationService } from './pushNotificationService';

// Import the PushNotificationData type
export interface PushNotificationData {
  type: 'wfh_assigned' | 'wfh_removed' | 'wfh_expiring' | 'wfh_expired' | 'location_update' | 'location_assigned' | 'location_request_approved' | 'location_request_rejected' | 'custom';
  action: string;
  wfhStatus?: 'active' | 'inactive' | 'expiring';
  startDate?: string;
  endDate?: string;
  reason?: string;
  locationId?: string;
  locationName?: string;
  geofenceRadius?: number;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  rejectionReason?: string;
  timestamp: string;
}

export interface WFHStatus {
  hasActiveWFH: boolean;
  startDate?: string;
  endDate?: string;
  reason?: string;
  lastUpdated: string;
  source: 'server' | 'push' | 'cache';
}

class WFHStatusManager {
  private currentStatus: WFHStatus | null = null;
  private listeners: ((status: WFHStatus) => void)[] = [];
  private refreshInterval: NodeJS.Timeout | null = null;
  private lastServerCheck: Date | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Listen for push notification updates
    pushNotificationService.setOnWFHUpdateCallback((data: PushNotificationData) => {
      this.handlePushUpdate(data);
    });
  }

  async initialize(): Promise<void> {
    try {
      console.log('Initializing WFH Status Manager...');
      
      // Load cached status first
      await this.loadCachedStatus();
      
      // Check for force refresh flag from background processing
      const forceRefreshFlag = await AsyncStorage.getItem('forceWFHRefresh');
      if (forceRefreshFlag) {
        const refreshData = JSON.parse(forceRefreshFlag);
        console.log('Force refresh flag detected:', refreshData.reason);
        
        // Clear the flag
        await AsyncStorage.removeItem('forceWFHRefresh');
        
        // Force refresh from server to ensure consistency
        await this.refreshFromServer(true);
        
        // Also notify listeners of the current status
        if (this.currentStatus) {
          console.log('Notifying listeners of current status after background processing');
          this.notifyListeners(this.currentStatus);
        }
      }
      
      // Check for pending WFH refresh from kill state
      const pendingWFHRefresh = await pushNotificationService.checkPendingWFHRefresh();
      if (pendingWFHRefresh) {
        console.log('Pending WFH refresh detected from kill state:', pendingWFHRefresh.reason);
        
        // If WFH was removed while app was killed, clear cache immediately
        if (pendingWFHRefresh.reason.includes('wfh_removed')) {
          console.log('WFH removal detected from kill state - clearing cache');
          await this.clearCache();
        }
        
        // Force refresh from server to get current state
        await this.refreshFromServer(true);
        
        // Clear the pending refresh flag
        await pushNotificationService.clearPendingWFHRefresh();
      }
      
      // Check for pending refresh from push notifications (foreground/background)
      const pendingRefresh = await pushNotificationService.checkPendingRefresh();
      if (pendingRefresh) {
        console.log('Pending refresh detected:', pendingRefresh.reason);
        
        // If WFH was removed, clear cache immediately
        if (pendingRefresh.reason.includes('wfh_removed')) {
          console.log('WFH removal detected - clearing cache');
          await this.clearCache();
        }
        
        // Force refresh from server
        await this.refreshFromServer(true);
      }
      
      // Start periodic refresh
      this.startPeriodicRefresh();
      
      console.log('WFH Status Manager initialized');
    } catch (error) {
      console.error('Error initializing WFH Status Manager:', error);
    }
  }

  async getCurrentStatus(forceRefresh = false): Promise<WFHStatus | null> {
    try {
      // Return cached status if recent and not forcing refresh
      if (!forceRefresh && this.currentStatus && this.isCacheValid()) {
        console.log('Returning cached WFH status');
        return this.currentStatus;
      }

      // Refresh from server
      await this.refreshFromServer();
      return this.currentStatus;
    } catch (error) {
      console.error('Error getting current WFH status:', error);
      return this.currentStatus; // Return cached status on error
    }
  }

  private async refreshFromServer(skipCacheCheck = false): Promise<void> {
    try {
      // Skip if recently checked (unless forced)
      if (!skipCacheCheck && this.lastServerCheck) {
        const timeSinceLastCheck = Date.now() - this.lastServerCheck.getTime();
        if (timeSinceLastCheck < this.CACHE_DURATION) {
          console.log('Skipping server refresh - recently checked');
          return;
        }
      }

      console.log('Refreshing WFH status from server via auth endpoint...');
      
      // Use auth endpoint instead of separate WFH status endpoint
      const response = await apiService.checkAuthStatus();
      
      if (response.success && response.data) {
        const newStatus: WFHStatus = {
          hasActiveWFH: response.data.hasActiveWFH || false,
          startDate: response.data.currentWFHAssignment?.startDate,
          endDate: response.data.currentWFHAssignment?.endDate,
          reason: response.data.currentWFHAssignment?.reason,
          lastUpdated: new Date().toISOString(),
          source: 'server'
        };

        await this.updateStatus(newStatus);
        this.lastServerCheck = new Date();
        console.log('WFH status refreshed from auth endpoint:', newStatus);
      } else {
        console.error('Failed to refresh WFH status from auth endpoint:', response.error || 'Unknown error');
        
        // If server returns error and we have no cached status, set to inactive
        if (!this.currentStatus) {
          const fallbackStatus: WFHStatus = {
            hasActiveWFH: false,
            lastUpdated: new Date().toISOString(),
            source: 'server'
          };
          await this.updateStatus(fallbackStatus);
          console.log('Set fallback inactive WFH status due to server error');
        }
      }
    } catch (error) {
      console.error('Error refreshing WFH status from auth endpoint:', error);
      
      // If server is unreachable and we have no cached status, set to inactive
      if (!this.currentStatus) {
        const fallbackStatus: WFHStatus = {
          hasActiveWFH: false,
          lastUpdated: new Date().toISOString(),
          source: 'server'
        };
        await this.updateStatus(fallbackStatus);
        console.log('Set fallback inactive WFH status due to network error');
      }
    }
  }

  private async handlePushUpdate(data: PushNotificationData): Promise<void> {
    try {
      console.log('Handling WFH push update:', data);
      
      // Handle WFH removal - clear cache and force refresh
      if (data.type === 'wfh_removed' || data.wfhStatus === 'inactive') {
        console.log('WFH removed via push notification - clearing cache');
        await this.clearCache();
        
        // Set status to inactive
        const newStatus: WFHStatus = {
          hasActiveWFH: false,
          lastUpdated: data.timestamp,
          source: 'push'
        };
        
        await this.updateStatus(newStatus);
        console.log('WFH status cleared due to removal');
        return;
      }
      
      // Handle active WFH assignment
      const newStatus: WFHStatus = {
        hasActiveWFH: data.wfhStatus === 'active',
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        lastUpdated: data.timestamp,
        source: 'push'
      };

      await this.updateStatus(newStatus);
      console.log('WFH status updated from push notification:', newStatus);
    } catch (error) {
      console.error('Error handling WFH push update:', error);
    }
  }

  private async updateStatus(newStatus: WFHStatus): Promise<void> {
    try {
      // Check if status actually changed
      const statusChanged = !this.currentStatus || 
        this.currentStatus.hasActiveWFH !== newStatus.hasActiveWFH ||
        this.currentStatus.startDate !== newStatus.startDate ||
        this.currentStatus.endDate !== newStatus.endDate;

      this.currentStatus = newStatus;
      
      // Save to cache
      await AsyncStorage.setItem('wfhStatus', JSON.stringify(newStatus));
      
      // Notify listeners if status changed
      if (statusChanged) {
        console.log('WFH status changed, notifying listeners');
        this.notifyListeners(newStatus);
      }
    } catch (error) {
      console.error('Error updating WFH status:', error);
    }
  }

  private async loadCachedStatus(): Promise<void> {
    try {
      const cachedStatus = await AsyncStorage.getItem('wfhStatus');
      if (cachedStatus) {
        this.currentStatus = {
          ...JSON.parse(cachedStatus),
          source: 'cache'
        };
        console.log('Loaded cached WFH status:', this.currentStatus);
      }
    } catch (error) {
      console.error('Error loading cached WFH status:', error);
    }
  }

  private isCacheValid(): boolean {
    if (!this.currentStatus) return false;
    
    const lastUpdated = new Date(this.currentStatus.lastUpdated);
    const now = new Date();
    const age = now.getTime() - lastUpdated.getTime();
    
    return age < this.CACHE_DURATION;
  }

  private startPeriodicRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(async () => {
      console.log('Periodic WFH status refresh');
      await this.refreshFromServer();
    }, this.REFRESH_INTERVAL);
  }

  private notifyListeners(status: WFHStatus): void {
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in WFH status listener:', error);
      }
    });
  }

  // Public methods
  addListener(listener: (status: WFHStatus) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Method to update WFH status from auth data (used by AttendanceScreen)
  async updateFromAuthData(authData: any): Promise<void> {
    try {
      if (authData.hasActiveWFH !== undefined) {
        const newStatus: WFHStatus = {
          hasActiveWFH: authData.hasActiveWFH,
          startDate: authData.currentWFHAssignment?.startDate,
          endDate: authData.currentWFHAssignment?.endDate,
          reason: authData.currentWFHAssignment?.reason,
          lastUpdated: new Date().toISOString(),
          source: 'server'
        };

        await this.updateStatus(newStatus);
        console.log('WFH status updated from auth data:', newStatus);
      }
    } catch (error) {
      console.error('Error updating WFH status from auth data:', error);
    }
  }

  async forceRefresh(): Promise<WFHStatus | null> {
    console.log('Force refreshing WFH status - clearing cache');
    
    // Clear cache to force fresh data
    this.currentStatus = null;
    this.lastServerCheck = null;
    await AsyncStorage.removeItem('wfhStatus');
    
    return this.getCurrentStatus(true);
  }

  async clearCache(): Promise<void> {
    console.log('Clearing WFH status cache');
    this.currentStatus = null;
    this.lastServerCheck = null;
    await AsyncStorage.removeItem('wfhStatus');
  }

  async checkWFHExpiration(): Promise<boolean> {
    try {
      const status = await this.getCurrentStatus();
      if (!status || !status.hasActiveWFH || !status.endDate) {
        return false;
      }

      const endDate = new Date(status.endDate);
      const now = new Date();
      
      // Check if WFH has expired
      if (now > endDate) {
        console.log('WFH has expired, refreshing status');
        await this.refreshFromServer(true);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking WFH expiration:', error);
      return false;
    }
  }

  async isWFHActive(): Promise<boolean> {
    const status = await this.getCurrentStatus();
    return status?.hasActiveWFH || false;
  }

  async getWFHDetails(): Promise<{
    startDate?: string;
    endDate?: string;
    reason?: string;
    daysRemaining?: number;
  } | null> {
    const status = await this.getCurrentStatus();
    if (!status || !status.hasActiveWFH) {
      return null;
    }

    let daysRemaining: number | undefined;
    if (status.endDate) {
      const endDate = new Date(status.endDate);
      const now = new Date();
      
      // Set both dates to start of day for accurate comparison
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      // Calculate days remaining including today
      const diffTime = endOfDay.getTime() - startOfToday.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Ensure minimum of 0 days remaining
      daysRemaining = Math.max(0, daysRemaining);
      
      console.log('Days remaining calculation:', {
        endDate: endDate.toDateString(),
        endOfDay: endOfDay.toISOString(),
        startOfToday: startOfToday.toISOString(),
        diffTime,
        daysRemaining
      });
    }

    return {
      startDate: status.startDate,
      endDate: status.endDate,
      reason: status.reason,
      daysRemaining
    };
  }

  cleanup(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.listeners = [];
    console.log('WFH Status Manager cleaned up');
  }
}

export const wfhStatusManager = new WFHStatusManager();
export default wfhStatusManager;