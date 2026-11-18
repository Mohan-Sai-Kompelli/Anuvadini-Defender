import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  ScrollView,
  Modal as RNModal,
  AppState,
  Platform,
  NativeModules,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import {
  Building2,
  CircleCheck,
  CircleX,
  QrCode,
  RefreshCw,
  X,
} from 'lucide-react-native';
import type { RootTabParamList } from './navigation';
import { useAuth } from './AuthContext';
import { apiService, type Attendance } from './services/api';
import Geolocation from 'react-native-geolocation-service';
import { CameraStream } from './CameraStream';
import { LivenessChallenge } from './components/LivenessChallenge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cacheTodayRecords,
  getCachedTodayRecords,
  mergedTodayRecords,
  enqueueMark,
  flushQueue,
  isNetworkError,
  clearOfflineAttendanceCache,
} from './services/offlineAttendance';
import { getCachedAttendanceRecords } from './db/cache/attendanceCache';
import {
  requestLocationPermission as requestLocationPermissionUtil,
  getFreshLocation,
  isLocationServicesDisabledError,
} from './utils/location';
import { LocationServicesModal } from './components/LocationServicesModal';
import { LocationPermissionModal } from './components/LocationPermissionModal';
import { wfhStatusManager, type WFHStatus } from './services/wfhStatusManager';
import { pushNotificationService } from './services/pushNotificationService';
import { appInitService } from './services/appInitService';
import { startCheckInTracking, stopCheckInTracking } from './services/attendanceTracking';
import { showToast } from './utils/toast';
import { collectAttestation } from './utils/attestation';
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  GlassBackdrop,
  Screen,
  SkeletonCard,
  useTheme,
} from './components/ui';
import { useTabBarScrollY } from './components/ui/tabBarScroll';
import { AttendanceHero } from './components/AttendanceHero';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { LocationStatusCard } from './components/attendance/LocationStatusCard';
import { CheckInOutButtons } from './components/attendance/CheckInOutButtons';
import { TodaySummary } from './components/attendance/TodaySummary';
import { QuickActions } from './components/attendance/QuickActions';
import { AttendanceHistoryList } from './components/attendance/AttendanceHistoryList';

// CameraStream is typed as a tab screen; it is also used embedded in the face
// verification modal (legacy behavior preserved).
const CameraStreamView = CameraStream as unknown as React.ComponentType<any>;

/** Was a /attendance/mark failure caused by the campus geofence (user outside
 *  the allowed range), as opposed to a face/liveness/other failure? Detect via
 *  the server's `code`/structured fields, falling back to the message text. */
const isOutsideCampusError = (resp: any): boolean =>
  resp?.code === 'outside_geofence' ||
  !!resp?.details?.nearestOffice ||
  /campus office|within\s+\d+\s*m\b|outside.*(range|location|campus)/i.test(resp?.error || '');

/** Was the mark rejected by ANY part of the biometric security pipeline —
 *  identity mismatch, a confident anti-spoof verdict, a failed liveness
 *  challenge, or a camera/device-integrity check? All of these come back as a
 *  401 from /attendance/mark with a `code`. They are DELIBERATELY handled with
 *  ONE shared, neutral message: the employee must never learn WHICH defense
 *  caught them (spoof vs. mismatch vs. liveness vs. device integrity) — that
 *  is exactly the adaptive-attack oracle a scripted attacker would use to
 *  iterate against this specific pipeline. Full forensic detail (spoof
 *  confidence, liveness failure reasons, device signals) is recorded
 *  server-side (SecurityEvent) and visible only on the super-admin dashboard. */
const isFaceMismatchError = (resp: any): boolean =>
  [
    'face_verification_failed',
    'spoof_detected',
    'spoof_verification_required',
    'liveness_failed',
    'camera_integrity_failed',
    'verification_unavailable',
  ].includes(resp?.code);

/** Build the "you're outside the allowed location" message. Deliberately GENERIC
 *  — we do NOT reveal the nearest office name or the distance (privacy: the user
 *  shouldn't learn how far they are or which office is closest). The server still
 *  returns those fields for logs/admin; they're just never shown here. When
 *  `faceOk` is true (came here AFTER a successful face check) we lead with that so
 *  the user understands their face was fine — only the location is the issue. */
const buildOutsideCampusMessage = (_resp: any, faceOk: boolean): string => {
  const core =
    "You're outside the allowed location to mark attendance. " +
    'Please go to your designated office/campus and try again.';
  return faceOk ? `✅ Face verified — but ${core}` : core;
};

export const AttendanceScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootTabParamList, 'Attendance'>>();
  const selectedMethod = route.params?.method ?? 'face';
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;
  const [isLoading, setIsLoading] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [canMarkAttendance, setCanMarkAttendance] = useState(false);
  const [wfhAllowed, setWfhAllowed] = useState(false);
  const [areaRadius, setAreaRadius] = useState(150);
  // Shared campus offices (Anuvadini / NETF / IUAC) the staff may mark at. The
  // app checks distance to the NEAREST of these so a staff sent to a sister
  // branch shows "in range" there — mirroring the server's findNearestOffice.
  // Empty until fetched → falls back to the org's single location.
  const campusOfficesRef = useRef<Array<{ campus?: string; latitude: number; longitude: number; radius: number }>>([]);
  // Allowed radius for the CURRENT nearest office (max of that office's radius
  // and the staff's own floor) — drives every in-range gate so IUAC's wider
  // 300 m isn't clipped to the 150 m default, and a mark is offered exactly
  // where the server will accept it.
  const [effectiveRadius, setEffectiveRadius] = useState(150);

  const [showFaceModal, setShowFaceModal] = useState(false);
  const [showLivenessChallenge, setShowLivenessChallenge] = useState(false);
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  // Parallax + collapse for the hero on scroll, plus pull-to-stretch. Hooks must
  // run before any early return below.
  const scrollY = useSharedValue(0);
  const tabScrollY = useTabBarScrollY();
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    // Also feed the FloatingTabBar so it collapses on scroll-down.
    if (tabScrollY) tabScrollY.value = e.contentOffset.y;
  });
  const heroAnim = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0, 220], [0, -64], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-160, 0], [1.16, 1], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrollY.value, [0, 170], [1, 0.72], Extrapolation.CLAMP),
  }));

  // Resilience: hydrate from the cached profile on mount so the screen renders
  // instantly and never gets stuck on the loading skeleton when the network (or
  // the adb-reverse tunnel) is flaky — cached studentData/org is enough to render.
  useEffect(() => {
    (async () => {
      try {
        const [s, o] = await Promise.all([
          AsyncStorage.getItem('studentData'),
          AsyncStorage.getItem('organizationData'),
        ]);
        if (s) setStudentData((prev: any) => prev || JSON.parse(s));
        if (o) setOrganizationData((prev: any) => prev || JSON.parse(o));
      } catch {
        // best-effort
      }
    })();
  }, []);

  const [livenessToken, setLivenessToken] = useState<string | null>(null);
  const [attendanceType, setAttendanceType] = useState<'in' | 'out' | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<Attendance[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Same instant-paint-from-cache pattern as the studentData/organizationData
  // hydration above, but for the "Recent History" list — WatermelonDB persists
  // attendance records across app restarts (unlike offlineAttendance.ts's
  // cache, which only covers today), so a returning user sees their history
  // immediately instead of a skeleton while loadAttendanceHistory() below hits
  // the network. That network call still runs and overwrites this with fresh
  // data (and re-caches it) as normal.
  useEffect(() => {
    (async () => {
      try {
        const cached = await getCachedAttendanceRecords(30);
        if (cached.length > 0) {
          setAttendanceHistory((prev) => (prev.length > 0 ? prev : cached));
          setHistoryLoading(false);
        }
      } catch (e) {
        console.warn('[db] AttendanceScreen history cache hydration failed:', e);
      }
    })();
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'within' | 'borderline' | 'outside' | 'error'>('checking');
  // Device Location Services (GPS) toggled OFF — shows a polite in-app prompt
  // instead of ever letting the native "turn on location" dialog fire itself.
  const [showLocationServicesModal, setShowLocationServicesModal] = useState(false);
  const [showLocationPermissionModal, setShowLocationPermissionModal] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);
  const [organizationData, setOrganizationData] = useState<any>(null);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [wfhStatus, setWfhStatus] = useState<WFHStatus | null>(null);
  const [wfhDetails, setWfhDetails] = useState<any>(null);
  const [isWorkPCConnected, setIsWorkPCConnected] = useState(false);
  const [connectedDeviceName, setConnectedDeviceName] = useState('');

  // Re-check defender pairing status every time this screen comes into focus
  // (catches the return from PairWorkPCScreen after a successful scan).
  useFocusEffect(
    React.useCallback(() => {
      apiService.getDefenderPairingStatus().then((res) => {
        const data = res.data as any;
        setIsWorkPCConnected(!!(res.success && data?.paired));
        if (res.success && data?.paired) {
          setConnectedDeviceName(data.device?.deviceName || data.device?.hostname || 'Work PC');
        }
      }).catch(() => {});
    }, [])
  );

  // After a successful check-in, re-read the pairing state so the screen shows
  // "connected" again without needing a tab switch (server resumes monitoring).
  const refreshDefenderPairing = async () => {
    try {
      const res = await apiService.getDefenderPairingStatus();
      const data = res.data as any;
      const paired = !!(res.success && data?.paired);
      setIsWorkPCConnected(paired);
      setConnectedDeviceName(
        paired ? (data.device?.deviceName || data.device?.hostname || 'Work PC') : ''
      );
    } catch {
      /* best-effort */
    }
  };

  // forceRefresh: true from an explicit user action (pull-to-refresh, the
  // "Refresh status" button) — bypasses the TTL cache in api.ts so the
  // button actually hits the network instead of silently handing back
  // whatever was already cached within the last couple of minutes.
  const loadAttendanceHistory = async (forceRefresh = false) => {
    try {
      setHistoryLoading(true);
      console.log('Loading attendance history for user:', user?.id);

      // Debug: Check if we have a valid auth token
      const token = await AsyncStorage.getItem('authToken');
      console.log('Auth token exists:', !!token);

      // Test the API service directly
      console.log('Testing API service...');
      await apiService.testTokenFlow();

      const response = await apiService.getAttendanceHistory({
        studentId: user?.id,
        forceRefresh,
      });
      console.log('Attendance history response:', response);

      let historyData: any[] = [];
      const responseData: any = response.data;
      if (response.success && responseData) {
        // Extract attendance array from possible nesting
        if (Array.isArray(responseData)) {
          historyData = responseData;
        } else if (Array.isArray(responseData.attendance)) {
          historyData = responseData.attendance;
        } else if (responseData.data && Array.isArray(responseData.data.attendance)) {
          historyData = responseData.data.attendance;
        }
        console.log('Processed attendance history:', historyData);
        // Online: cache today's server records, show server + any still-pending
        // offline marks, and replay the offline queue in the background.
        await cacheTodayRecords(historyData);
        setAttendanceHistory(await mergedTodayRecords(historyData));
        flushQueue()
          .then((r) => { if (r.synced > 0) loadAttendanceHistory(); })
          .catch(() => {});
      } else {
        // Fetch failed (usually offline). Do NOT wipe state — that made the
        // check-in vanish and re-show "Check in" after a failed checkout. Fall
        // back to the local cache + any pending marks.
        console.error('Attendance history API error:', response.error);
        setAttendanceHistory(await mergedTodayRecords(await getCachedTodayRecords()));
      }
    } catch (error) {
      console.error('Error loading attendance history:', error);
      try {
        setAttendanceHistory(await mergedTodayRecords(await getCachedTodayRecords()));
      } catch {
        /* keep whatever we already have rather than clearing */
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadStudentAndOrganizationData = async (forceRefresh: boolean = false) => {
    try {
      setStudentError(null);

      // If force refresh is requested, skip cached data and fetch from server
      if (forceRefresh) {
        console.log('Force refreshing student and organization data from server...');

        try {
          const authResponse = await apiService.checkAuthStatus();
          const authData: any = authResponse.data;
          if (authResponse.success && authData) {
            // Update student data
            setStudentData(authData);
            await AsyncStorage.setItem('studentData', JSON.stringify(authData));

            // Update organization data if available
            if (authData.organization) {
              setOrganizationData(authData.organization);
              await AsyncStorage.setItem('organizationData', JSON.stringify(authData.organization));
              console.log('Organization data force refreshed:', authData.organization);
            }

            // Handle WFH assignment data from auth response
            if (authData.hasActiveWFH !== undefined) {
              console.log('WFH status from auth response:', {
                hasActiveWFH: authData.hasActiveWFH,
                assignment: authData.currentWFHAssignment
              });

              // Update WFH status manager with fresh data from auth response
              await wfhStatusManager.updateFromAuthData(authData);

              // Update local WFH state
              const newWfhStatus = {
                hasActiveWFH: authData.hasActiveWFH,
                startDate: authData.currentWFHAssignment?.startDate,
                endDate: authData.currentWFHAssignment?.endDate,
                reason: authData.currentWFHAssignment?.reason,
                lastUpdated: new Date().toISOString(),
                source: 'server' as const
              };

              console.log('Setting WFH status from auth response:', newWfhStatus);
              setWfhStatus(newWfhStatus);
              setWfhAllowed(authData.hasActiveWFH);

              if (authData.hasActiveWFH && authData.currentWFHAssignment) {
                setWfhDetails({
                  startDate: authData.currentWFHAssignment.startDate,
                  endDate: authData.currentWFHAssignment.endDate,
                  reason: authData.currentWFHAssignment.reason,
                  daysRemaining: authData.currentWFHAssignment.daysRemaining
                });
              } else {
                setWfhDetails(null);
              }

              console.log('WFH status updated from auth response');
            }

            console.log('Student and organization data force refreshed from server');
            return { success: true, data: authData };
          } else {
            setStudentError('Student or organization data not found. Please login again.');
            setLocationStatus('error');
            return { success: false, error: 'No data from server' };
          }
        } catch (serverError: any) {
          console.error('Failed to force refresh data from server:', serverError);
          setStudentError('Failed to load student data from server. Please login again.');
          setLocationStatus('error');
          return { success: false, error: serverError.message };
        }
      }

      // Load student data from AsyncStorage first (normal flow). Both reads
      // are independent — running them in parallel instead of one-after-
      // another shaves a redundant AsyncStorage round-trip off every app
      // foreground/mount, when this path is on the critical path to the
      // screen becoming interactive.
      const [storedStudentData, storedOrgData] = await Promise.all([
        AsyncStorage.getItem('studentData'),
        AsyncStorage.getItem('organizationData'),
      ]);

      if (storedStudentData) {
        const student = JSON.parse(storedStudentData);
        setStudentData(student);

        // Handle WFH data from cached student data
        if (student.hasActiveWFH !== undefined) {
          console.log('WFH status from cached data:', {
            hasActiveWFH: student.hasActiveWFH,
            assignment: student.currentWFHAssignment
          });

          setWfhAllowed(student.hasActiveWFH);

          if (student.hasActiveWFH && student.currentWFHAssignment) {
            setWfhDetails({
              startDate: student.currentWFHAssignment.startDate,
              endDate: student.currentWFHAssignment.endDate,
              reason: student.currentWFHAssignment.reason,
              daysRemaining: student.currentWFHAssignment.daysRemaining
            });
          } else {
            setWfhDetails(null);
          }
        }
      }

      if (storedOrgData) {
        const org = JSON.parse(storedOrgData);
        setOrganizationData(org);
      }

      // If cached data is missing, try to fetch from server
      if (!storedStudentData || !storedOrgData) {
        console.log('Cached student/organization data missing, fetching from server...');

        try {
          const authResponse = await apiService.checkAuthStatus();
          const authData: any = authResponse.data;
          if (authResponse.success && authData) {
            // Update student data
            setStudentData(authData);
            await AsyncStorage.setItem('studentData', JSON.stringify(authData));

            // Update organization data if available
            if (authData.organization) {
              setOrganizationData(authData.organization);
              await AsyncStorage.setItem('organizationData', JSON.stringify(authData.organization));
            }

            // Handle WFH assignment data from auth response
            if (authData.hasActiveWFH !== undefined) {
              console.log('WFH status from server fallback:', {
                hasActiveWFH: authData.hasActiveWFH,
                assignment: authData.currentWFHAssignment
              });

              // Update WFH status manager with fresh data from auth response
              await wfhStatusManager.updateFromAuthData(authData);

              console.log('Setting WFH status from server fallback:', {
                hasActiveWFH: authData.hasActiveWFH,
                assignment: authData.currentWFHAssignment
              });

              setWfhAllowed(authData.hasActiveWFH);

              if (authData.hasActiveWFH && authData.currentWFHAssignment) {
                setWfhDetails({
                  startDate: authData.currentWFHAssignment.startDate,
                  endDate: authData.currentWFHAssignment.endDate,
                  reason: authData.currentWFHAssignment.reason,
                  daysRemaining: authData.currentWFHAssignment.daysRemaining
                });
              } else {
                setWfhDetails(null);
              }
            }

            console.log('Student and organization data refreshed from server');
          } else {
            setStudentError('Student or organization data not found. Please login again.');
            setLocationStatus('error');
          }
        } catch (serverError: any) {
          console.error('Failed to fetch data from server:', serverError);
          setStudentError('Failed to load student data from server. Please login again.');
          setLocationStatus('error');
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error in loadStudentAndOrganizationData:', error);
      setStudentError(error?.message || 'Error loading student data');
      setLocationStatus('error');
      return { success: false, error: error.message };
    }
  };

  useEffect(() => {
    if (user?.role === 'student') {
      // Add a small delay to ensure app services are initialized first
      const initializeScreen = async () => {
        try {
          // Clear any cached location data on app start to ensure fresh location
          console.log('AttendanceScreen: Clearing cached location data on initialization');
          setCurrentLocation(null);
          setDistance(null);
          setLocationStatus('checking');

          // Wait for app services to be initialized
          let retries = 0;
          while (!appInitService.isInitialized() && retries < 10) {
            console.log('Waiting for app services to initialize...');
            await new Promise(resolve => setTimeout(resolve, 500));
            retries++;
          }

          if (!appInitService.isInitialized()) {
            console.warn('App services not initialized after waiting, proceeding anyway');
          }

          // Now initialize screen components
          console.log('AttendanceScreen: Initializing with user:', user);
          console.log('AttendanceScreen: User ID:', user?.id);
          console.log('AttendanceScreen: User UID:', user?.uid);

          loadAttendanceHistory();

          // Check for pending location refresh FIRST before loading cached data
          console.log('AttendanceScreen: Checking for pending location refresh on initialization');
          const pendingLocationRefresh = await pushNotificationService.checkPendingLocationRefresh();

          if (pendingLocationRefresh && pendingLocationRefresh.data && pendingLocationRefresh.data.coordinates) {
            console.log('Found pending location refresh on initialization:', pendingLocationRefresh);

            // Clear the pending refresh
            await pushNotificationService.clearPendingLocationRefresh();

            // Load student data normally but update organization location with fresh data
            await loadStudentAndOrganizationData(false);

            // Update organization data with new location from push notification
            const existingOrgData = await AsyncStorage.getItem('organizationData');
            if (existingOrgData) {
              const parsedOrgData = JSON.parse(existingOrgData);
              const updatedOrgData = {
                ...parsedOrgData,
                location: {
                  latitude: pendingLocationRefresh.data.coordinates.latitude,
                  longitude: pendingLocationRefresh.data.coordinates.longitude
                }
              };
              await AsyncStorage.setItem('organizationData', JSON.stringify(updatedOrgData));
              setOrganizationData(updatedOrgData);

              console.log('Organization data updated with pending location refresh on initialization');
            }

            // Update area radius if provided
            if (pendingLocationRefresh.data.geofenceRadius) {
              setAreaRadius(pendingLocationRefresh.data.geofenceRadius);
            }

            // Show notification to user
            if (pendingLocationRefresh.reason === 'location_assigned') {
              showToast({
                type: 'info',
                title: 'Location Updated',
                message: `Your attendance location has been changed to ${pendingLocationRefresh.data.locationName}. Distance will be recalculated.`,
              });
            } else if (pendingLocationRefresh.reason === 'location_request_approved') {
              showToast({
                type: 'success',
                title: 'Location Request Approved',
                message: `Your location change request has been approved. You can now mark attendance at ${pendingLocationRefresh.data.locationName}.`,
              });
            }
          } else {
            // No pending location refresh, force refresh organization data from server
            console.log('AttendanceScreen: No pending location refresh, force refreshing organization data on initialization');
            await loadStudentAndOrganizationData(true);
          }

          initializeWFHStatus();
        } catch (error) {
          console.error('Error initializing attendance screen:', error);
          // Fallback: initialize anyway with cached data
          loadAttendanceHistory();
          loadStudentAndOrganizationData(false); // Use cached data as fallback
          initializeWFHStatus();
        }
      };

      initializeScreen();
    }
  }, [user]);

  const initializeWFHStatus = async () => {
    try {
      console.log('Initializing WFH status...');

      // Check if push notifications are already initialized
      if (!pushNotificationService.isInitialized()) {
        console.log('Push notifications not initialized, initializing now...');
        await pushNotificationService.initialize();
      }

      // Check for background notifications from kill state
      const backgroundNotifications = await pushNotificationService.getBackgroundNotifications();
      if (backgroundNotifications.length > 0) {
        console.log(`Found ${backgroundNotifications.length} background notifications from kill state`);
        const wfhNotifications = backgroundNotifications.filter((n: any) =>
          n.data && (n.data.type === 'wfh_assigned' || n.data.type === 'wfh_removed' || n.data.type === 'wfh_expired')
        );
        if (wfhNotifications.length > 0) {
          console.log(`Found ${wfhNotifications.length} WFH-related background notifications`);
        }
      }

      // Skip WFH Status Manager initialization if we already have auth-based WFH data
      if (wfhStatus) {
        console.log('Auth-based WFH data already available, skipping WFH Status Manager initialization');
        console.log('Current WFH status from auth:', wfhStatus);

        // Just set up the listener for future changes
        const unsubscribe = wfhStatusManager.addListener((newStatus: WFHStatus) => {
          console.log('WFH status changed via listener:', newStatus);
          setWfhStatus(newStatus);
          setWfhAllowed(newStatus.hasActiveWFH);

          if (newStatus.hasActiveWFH) {
            console.log('WFH is now active');
            setCanMarkAttendance(true);
            setLocationStatus('within');
            wfhStatusManager.getWFHDetails().then(details => {
              console.log('Updated WFH details:', details);
              setWfhDetails(details);
            });
          } else {
            console.log('WFH is now inactive - clearing status');
            setCanMarkAttendance(false);
            setLocationStatus('checking');
            setWfhDetails(null);
            // Re-check location when WFH is removed
            if (organizationData) {
              console.log('WFH removed, checking location...');
              checkLocation();
            }
          }
        });

        console.log('WFH status listener set up successfully');
        return unsubscribe;
      }

      // Only use WFH Status Manager if no auth-based data is available
      console.log('No auth-based WFH data, using WFH Status Manager');

      // Get current WFH status from manager
      const status = await wfhStatusManager.getCurrentStatus(false); // Don't force refresh
      console.log('Initial WFH status from manager:', status);

      if (status) {
        setWfhStatus(status);

        if (status?.hasActiveWFH) {
          const details = await wfhStatusManager.getWFHDetails();
          console.log('WFH details:', details);
          setWfhDetails(details);
          setWfhAllowed(true);
          setCanMarkAttendance(true);
          setLocationStatus('within');
        } else {
          console.log('No active WFH found');
          setWfhAllowed(false);
          setWfhDetails(null);
        }
      }

      // Listen for WFH status changes
      const unsubscribe = wfhStatusManager.addListener((newStatus: WFHStatus) => {
        console.log('WFH status changed via listener:', newStatus);
        setWfhStatus(newStatus);
        setWfhAllowed(newStatus.hasActiveWFH);

        if (newStatus.hasActiveWFH) {
          console.log('WFH is now active');
          setWfhAllowed(true);
          setCanMarkAttendance(true);
          setLocationStatus('within');
          wfhStatusManager.getWFHDetails().then(details => {
            console.log('Updated WFH details:', details);
            setWfhDetails(details);
          });
        } else {
          console.log('WFH is now inactive - clearing status');
          setWfhAllowed(false);
          setWfhDetails(null);
          // Re-check location when WFH is removed
          if (organizationData) {
            console.log('WFH removed, checking location...');
            checkLocation();
          } else {
            setCanMarkAttendance(false);
            setLocationStatus('checking');
          }
        }
      });

      console.log('WFH status listener set up successfully');
      return unsubscribe;
    } catch (error) {
      console.error('Error initializing WFH status:', error);
      return undefined;
    }
  };

  // at component top:
  const watchIdRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  // checkLocation() runs from many places (focus, polling, pull-to-refresh —
  // not just once). Without this flag, dismissing the location-permission
  // modal with "Not now" only closed it for a moment: the very next
  // checkLocation() call (permission is still genuinely not granted) popped
  // it straight back open — sometimes fast enough to race the previous
  // modal's own close animation, which is the exact "BadTokenException"
  // native crash class already documented on the retry paths below. Once the
  // user explicitly dismisses, respect that for the rest of the session (they
  // can still explore the rest of the app) — only the manual "Retry" button
  // clears it and re-checks.
  const locationPermissionDismissedRef = useRef(false);
  // Hysteresis for the within/outside geofence decision — null until the
  // first fix. Typical GPS accuracy indoors/urban is 10-30m, so with a flat
  // "d <= allowed" comparison every ~2-5s fix (watchPosition's interval),
  // standing near the boundary made the computed distance bounce back and
  // forth across it, flipping canMarkAttendance/locationStatus every tick —
  // the check-in button and status card kept popping in/out ("screen
  // fluctuating"). Once WITHIN, a MARGIN of extra slack is required before
  // flipping back OUTSIDE (and vice versa is unchanged — entering still needs
  // to be genuinely inside), so ordinary GPS noise around the line no longer
  // toggles the UI.
  const wasWithinRef = useRef<boolean | null>(null);
  const GEOFENCE_HYSTERESIS_M = 15;
  // Display-only third band (yellow) for "just outside the radius, close
  // enough that it's ambiguous" — distinct from GEOFENCE_HYSTERESIS_M, which
  // only affects the binary canMarkAttendance decision. Being outside this
  // band is a confident red; canMarkAttendance/wasWithinRef are untouched by
  // this — it's purely what color/label the status card shows.
  const BORDERLINE_BAND_M = 30;
  // A GPS fix's own reported accuracy can be 100m+ indoors/urban — using such
  // a fix directly for the geofence distance made the in/out decision (and
  // the displayed distance) jump around independent of the hysteresis above,
  // since hysteresis only guards the boundary, not a wildly wrong single
  // reading. Fixes worse than this are shown (so the UI can say "refining
  // accuracy...") but never allowed to change the geofence decision — the
  // last good decision holds until a good-enough fix arrives.
  const ACCURACY_REJECT_THRESHOLD_M = 75;
  // Safety valve for the accuracy filter above: genuinely low-signal spots
  // (deep indoors, basements) may never produce a fix under the threshold. If
  // no good-enough fix has landed in a while, stop waiting and use whatever we
  // have — better a slightly-off decision than the check-in UI stuck on
  // "checking location" forever.
  const lastGoodFixAtRef = useRef(0);
  const ACCURACY_FALLBACK_MS = 20000;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (watchIdRef.current != null) Geolocation.clearWatch(watchIdRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, []);

  const isLocationMocked = (position: any): boolean => {
    // On Android, position.coords.mocked or position.mocked may be available
    if (Platform.OS === 'android') {
      if (position?.mocked !== undefined) return position.mocked;
      if (position?.coords?.mocked !== undefined) return position.coords.mocked;
      // Fallback: Use native module if available. Guarded — a missing/
      // misconfigured native module on some device/build must not crash the
      // app (this runs right after login, on the very first location fix).
      try {
        if (NativeModules?.DetectMockLocation?.isMockLocationEnabled) {
          return NativeModules.DetectMockLocation.isMockLocationEnabled();
        }
      } catch (e) {
        console.warn('isLocationMocked: DetectMockLocation native call failed:', e);
      }
    }
    return false;
  };

  function getDistanceFromLatLonInMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Radius of the Earth in meters
    const toRad = (value: number) => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance; // in meters
  }

  // Distance to the NEAREST allowed office + that office's allowed radius. Uses
  // the fetched campus offices (Anuvadini / NETF / IUAC) when available so a
  // staff standing at ANY campus office reads as in-range; otherwise falls back
  // to the single (orgLat, orgLon) passed in. Radius = max(office, own floor),
  // matching the server's findNearestOffice so the app never offers a mark the
  // server would reject, nor hides one it would accept.
  const nearestAllowed = (
    lat: number,
    lon: number,
    fallbackLat: number,
    fallbackLon: number
  ): { distance: number; radius: number } => {
    const offices = campusOfficesRef.current && campusOfficesRef.current.length
      ? campusOfficesRef.current
      : [{ latitude: fallbackLat, longitude: fallbackLon, radius: areaRadius }];
    let best: { distance: number; radius: number } | null = null;
    for (const o of offices) {
      if (typeof o.latitude !== 'number' || typeof o.longitude !== 'number') continue;
      const dd = getDistanceFromLatLonInMeters(lat, lon, o.latitude, o.longitude);
      // Use the office's own allowed radius (the server already folds the staff's
      // Area_radius floor into it), so the app matches /mark exactly. Only the
      // own-org fallback office carries no radius → use the local areaRadius.
      const radius = typeof o.radius === 'number' && o.radius > 0 ? o.radius : areaRadius;
      if (!best || dd < best.distance) best = { distance: dd, radius };
    }
    return best || { distance: Number.POSITIVE_INFINITY, radius: areaRadius };
  };

  const processPosition = async (position: any, orgLat: number, orgLon: number) => {
    if (!isMountedRef.current) return;

    if (isLocationMocked(position)) {
      setLocationStatus('error');
      showToast({
        type: 'error',
        title: 'Location Spoofing Detected',
        message: 'Mock location detected. Attendance cannot be marked.',
      });
      return;
    }

    const { latitude, longitude } = position.coords;
    const fixAccuracy = typeof position?.coords?.accuracy === 'number' ? position.coords.accuracy : null;
    setCurrentLocation({ latitude, longitude });
    setLocationAccuracy(fixAccuracy);

    const now = Date.now();
    const isGoodFix = fixAccuracy === null || fixAccuracy <= ACCURACY_REJECT_THRESHOLD_M;
    if (isGoodFix) {
      lastGoodFixAtRef.current = now;
    }
    // A noisy fix (accuracy worse than the threshold) never gets to change
    // the geofence decision or displayed distance on its own — unless nothing
    // better has arrived for a while (ACCURACY_FALLBACK_MS), in which case we
    // use it anyway rather than leaving the UI stuck.
    const forceThroughStaleWait = now - lastGoodFixAtRef.current > ACCURACY_FALLBACK_MS;
    if (!isGoodFix && !forceThroughStaleWait) {
      return;
    }

    const { distance: d, radius: allowed } = nearestAllowed(latitude, longitude, orgLat, orgLon);
    setDistance(d);
    setEffectiveRadius(allowed);

    // Don't override attendance status if WFH is active
    const hasActiveWFH = checkWFHStatus();
    if (hasActiveWFH) {
      console.log('processPosition: WFH is active, not overriding attendance status');
      wasWithinRef.current = true;
      setLocationStatus('within'); // Update location status but keep attendance allowed
      setCanMarkAttendance(true); // Ensure attendance is allowed for WFH
      return;
    }

    // Only apply location-based attendance rules if WFH is not active.
    // `allowed` is the nearest campus office's radius (Anuvadini/NETF/IUAC), so
    // a staff at a sister branch is correctly in-range. Hysteresis: once
    // WITHIN, ordinary GPS noise must push the reading past allowed + MARGIN
    // (not just past allowed) before we flip back OUTSIDE — otherwise a user
    // standing near the boundary sees the check-in button/status flicker
    // in and out on every ~2-5s fix.
    const nowWithin = wasWithinRef.current === true
      ? d <= allowed + GEOFENCE_HYSTERESIS_M
      : d <= allowed;
    wasWithinRef.current = nowWithin;

    if (nowWithin) {
      setCanMarkAttendance(true);
      setLocationStatus('within');
      console.log(`processPosition: Within range (${d}m <= ${allowed}m + hysteresis), attendance allowed`);
    } else {
      setCanMarkAttendance(false);
      // Yellow band: just past the radius, close enough that it could still
      // be GPS drift rather than a real move away — matches what the user
      // sees ("thoda bahar ki taraf dikh raha hoon"). Further than that band
      // is a confident red. canMarkAttendance stays false either way — this
      // only changes the displayed color/label, not whether check-in works.
      setLocationStatus(d <= allowed + BORDERLINE_BAND_M ? 'borderline' : 'outside');
      console.log(`processPosition: Outside range (${d}m > ${allowed}m), attendance not allowed`);
    }
  };

  const startWatch = (orgLat: number, orgLon: number) => {
    // clear previous
    if (watchIdRef.current != null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    watchIdRef.current = Geolocation.watchPosition(
      (position) => {
        // processPosition is async — an unhandled rejection here (e.g. a
        // downstream API/native call throwing) must not crash the app.
        processPosition(position, orgLat, orgLon).catch((e) => {
          console.warn('processPosition (watch) error:', e);
        });
      },
      (error) => {
        console.warn('watchPosition error:', error);
        setLocationStatus('error');
        if (isLocationServicesDisabledError(error)) setShowLocationServicesModal(true);
      },
      {
        enableHighAccuracy: true,
        // Use 0 so even if user is stationary you still may get updates
        distanceFilter: 0,
        // These work with react-native-geolocation-service (not the old community API)
        interval: 5000,
        fastestInterval: 2000,
        // showLocationDialog:false — see checkLocation() below for why.
        forceRequestLocation: true,
        showLocationDialog: false,
        maximumAge: 0, // CRITICAL: Always get fresh location, no caching
      } as any
    );
  };

  // WFH is not applicable to this app's clinical/doctor user base — disabled
  // app-wide at this single choke point (every WFH gate below reads through
  // this function) rather than removing the deeper WFH plumbing, which is
  // still intertwined with the server's geofence-bypass logic.
  const checkWFHStatus = (): boolean => {
    return false;
  };

  const checkLocation = async () => {
    try {
      // Don't check location if WFH is active
      const hasActiveWFH = checkWFHStatus();
      if (hasActiveWFH) {
        console.log('checkLocation: WFH is active, skipping location check');
        setCanMarkAttendance(true);
        setLocationStatus('within');
        return;
      }

      console.log('checkLocation: Starting location check');
      setLocationStatus('checking');

      const hasPermission = await requestLocationPermissionUtil();
      if (!hasPermission) {
        setLocationStatus('error');
        // Don't force the modal back open if the user already said "Not now"
        // this session — see locationPermissionDismissedRef's comment.
        if (!locationPermissionDismissedRef.current) {
          setShowLocationPermissionModal(true);
        }
        return;
      }

      const orgLat = organizationData?.location?.latitude;
      const orgLon = organizationData?.location?.longitude;
      if (!orgLat || !orgLon) {
        setLocationStatus('error');
        showToast({
          type: 'error',
          title: 'Organization location not set',
          message: 'Please contact your administrator.',
        });
        return;
      }

      // Safety timeout so UI never stays stuck on "checking"
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        // Only flip to error if still stuck in checking
        setLocationStatus((s) => (s === 'checking' ? 'error' : s));
      }, 15000);

      // 1) Get an immediate fix (even if stationary) - ALWAYS FRESH LOCATION
      Geolocation.getCurrentPosition(
        (pos) => {
          // processPosition is async — an unhandled rejection here must not
          // crash the app (this runs right after login/app open).
          processPosition(pos, orgLat, orgLon).catch((e) => {
            console.warn('processPosition (initial fix) error:', e);
          });
          // 2) Then start watching for automatic inside/outside updates
          startWatch(orgLat, orgLon);
        },
        (err) => {
          console.warn('getCurrentPosition error:', err);
          if (isLocationServicesDisabledError(err)) {
            setShowLocationServicesModal(true);
          }
          // Even if one-shot fails, still start watch — it may succeed shortly
          // after (e.g. a coarse/network fix lands even though this stricter
          // high-accuracy one-shot didn't). Never give up here: bailing out
          // left the screen permanently stuck on "Location error" with no way
          // to recover once a usable (even if coarse) fix did arrive.
          startWatch(orgLat, orgLon);
          // keep status as "checking"; the watch should update it soon
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0, // CRITICAL: Always get fresh location, no caching
          // showLocationDialog:false — showing this ourselves via
          // LocationServicesModal instead of letting the library trigger
          // Play Services' native resolution dialog, which needs a ready
          // foreground Activity and can crash the app with a non-JS
          // exception if it fires too early (e.g. right after login).
          forceRequestLocation: true,
          showLocationDialog: false,
        }
      );
    } catch (e) {
      console.error('Location check error:', e);
      setLocationStatus('error');
    }
  };

  // Load the shared campus offices (Anuvadini / NETF / IUAC) once so the app can
  // show "in range" at ANY of them — a staff sent to a sister branch marks there
  // without a DB location change. Stored in a ref; the location watch reads it on
  // its next tick, so the in-range state self-corrects within a few seconds.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiService.getCampusOffices();
        if (cancelled) return;
        const offs = (resp && resp.success && (resp.data as any)?.offices) || [];
        campusOfficesRef.current = Array.isArray(offs)
          ? offs.filter((o: any) => typeof o?.latitude === 'number' && typeof o?.longitude === 'number')
          : [];
        console.log(`[campus-offices] loaded ${campusOfficesRef.current.length} office(s)`);
      } catch (e) {
        console.warn('[campus-offices] fetch failed (falling back to own org location):', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    // Only check location if both student and organization data are loaded
    if (studentData && organizationData) {
      console.log('Student data loaded:', studentData);
      console.log('WFH status in useEffect:', wfhStatus);

      // Recompute Area_radius after fetching studentData
      const radius = studentData?.Area_radius;
      setAreaRadius(radius ? Number(radius) : 150);

      // Consolidated WFH status check
      const hasActiveWFH = checkWFHStatus();

      if (hasActiveWFH) {
        console.log('useEffect: WFH is active, setting attendance allowed');
        setWfhAllowed(true);
        setCanMarkAttendance(true);
        setLocationStatus('within');
        return; // Don't check location
      }

      // No WFH found, check location
      console.log('useEffect: No WFH found, checking location');
      setWfhAllowed(false);
      checkLocation();
    }
  }, [studentData, organizationData, wfhStatus]);

  // Add AppState listener to refresh location when app comes from background
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      console.log('App state changed to:', nextAppState);

      if (nextAppState === 'active') {
        console.log('App became active - checking for pending location updates and data refresh');

        // Only refresh if we have user data
        if (user?.role === 'student') {
          console.log('App came from background - checking for pending location updates first');

          // Clear any existing location data to force fresh fetch
          setCurrentLocation(null);
          setDistance(null);
          setLocationStatus('checking');

          // Add a small delay to ensure app is fully active
          setTimeout(async () => {
            try {
              // STEP 1: Check for pending location refresh from push notifications FIRST
              console.log('Step 1: Checking for pending location refresh...');
              const pendingLocationRefresh = await pushNotificationService.checkPendingLocationRefresh();

              let freshOrgData = null;

              if (pendingLocationRefresh && pendingLocationRefresh.data && pendingLocationRefresh.data.coordinates) {
                console.log('Found pending location refresh with coordinates:', pendingLocationRefresh);

                // Clear the pending refresh
                await pushNotificationService.clearPendingLocationRefresh();

                // Create fresh organization data with new location
                freshOrgData = {
                  name: pendingLocationRefresh.data.locationName,
                  location: {
                    latitude: pendingLocationRefresh.data.coordinates.latitude,
                    longitude: pendingLocationRefresh.data.coordinates.longitude
                  }
                };

                // Update area radius if provided
                if (pendingLocationRefresh.data.geofenceRadius) {
                  setAreaRadius(pendingLocationRefresh.data.geofenceRadius);
                }

                console.log('Using fresh organization data from push notification:', freshOrgData);

                // Update cached organization data
                const existingOrgData = await AsyncStorage.getItem('organizationData');
                if (existingOrgData) {
                  const parsedOrgData = JSON.parse(existingOrgData);
                  const updatedOrgData = {
                    ...parsedOrgData,
                    location: freshOrgData.location
                  };
                  await AsyncStorage.setItem('organizationData', JSON.stringify(updatedOrgData));
                  setOrganizationData(updatedOrgData);
                  freshOrgData = updatedOrgData;
                }

                // Show notification to user
                if (pendingLocationRefresh.reason === 'location_assigned') {
                  showToast({
                    type: 'info',
                    title: 'Location Updated',
                    message: `Your attendance location has been changed to ${pendingLocationRefresh.data.locationName}. Distance will be recalculated.`,
                  });
                } else if (pendingLocationRefresh.reason === 'location_request_approved') {
                  showToast({
                    type: 'success',
                    title: 'Location Request Approved',
                    message: `Your location change request has been approved. You can now mark attendance at ${pendingLocationRefresh.data.locationName}.`,
                  });
                }
              } else {
                // STEP 2: No pending location refresh, force refresh organization data from server
                console.log('Step 2: No pending location refresh, force refreshing organization data from server...');
                const refreshResult = await loadStudentAndOrganizationData(true);

                if (refreshResult.success && refreshResult.data?.organization) {
                  freshOrgData = refreshResult.data.organization;
                  console.log('Fresh organization data obtained from server:', {
                    name: freshOrgData.name,
                    location: freshOrgData.location
                  });

                  // Handle WFH assignment data from auth response
                  if (refreshResult.data.hasActiveWFH !== undefined) {
                    console.log('WFH status from app resume auth response:', {
                      hasActiveWFH: refreshResult.data.hasActiveWFH,
                      assignment: refreshResult.data.currentWFHAssignment
                    });

                    // Update WFH status manager with fresh data from auth response
                    await wfhStatusManager.updateFromAuthData(refreshResult.data);

                    console.log('App resume: Setting WFH status from auth response:', {
                      hasActiveWFH: refreshResult.data.hasActiveWFH,
                      assignment: refreshResult.data.currentWFHAssignment
                    });

                    if (refreshResult.data.hasActiveWFH) {
                      console.log('User has active WFH from app resume, skipping location check');
                      setWfhAllowed(true);
                      setCanMarkAttendance(true);
                      setLocationStatus('within');
                      return;
                    }
                  }
                } else {
                  console.error('Failed to refresh organization data from server');
                  // Fallback to cached data
                  const cachedOrgData = await AsyncStorage.getItem('organizationData');
                  if (cachedOrgData) {
                    freshOrgData = JSON.parse(cachedOrgData);
                    console.log('Using cached organization data as fallback');
                  }
                }
              }

              // STEP 3: Check WFH status (fallback check for cached WFH status)
              const hasActiveWFH = checkWFHStatus();
              if (hasActiveWFH) {
                console.log('User has active WFH (cached), skipping location check');
                setWfhAllowed(true);
                setCanMarkAttendance(true);
                setLocationStatus('within');
                return;
              }

              // STEP 4: Get fresh user location and calculate distance
              if (freshOrgData && freshOrgData.location) {
                console.log('Step 4: Getting fresh user location...');
                const orgLat = freshOrgData.location.latitude;
                const orgLon = freshOrgData.location.longitude;

                const freshLocation = await getFreshLocation();
                console.log('Fresh user location obtained after app activation:', freshLocation);

                // Distance to the NEAREST campus office (Anuvadini/NETF/IUAC),
                // falling back to this org's own location.
                const { distance, radius: allowed } = nearestAllowed(
                  freshLocation.latitude,
                  freshLocation.longitude,
                  orgLat,
                  orgLon
                );

                console.log(`Distance calculated with fresh data: ${distance}m (allowed ${allowed}m | user: ${freshLocation.latitude}, ${freshLocation.longitude})`);

                setCurrentLocation({ latitude: freshLocation.latitude, longitude: freshLocation.longitude });
                setLocationAccuracy(freshLocation.accuracy ?? null);
                setDistance(distance);
                setEffectiveRadius(allowed);

                if (distance <= allowed) {
                  setCanMarkAttendance(true);
                  setLocationStatus('within');
                  console.log(`App resume: Within range (${distance}m <= ${allowed}m) acc=${freshLocation.accuracy}m`);
                } else {
                  setCanMarkAttendance(false);
                  setLocationStatus('outside');
                  console.log(`App resume: Outside range (${distance}m > ${allowed}m) acc=${freshLocation.accuracy}m`);
                }

                // Start watching for future location changes
                startWatch(orgLat, orgLon);
              } else {
                console.error('No organization location available');
                setLocationStatus('error');
              }
            } catch (error) {
              console.error('Error during app resume location refresh:', error);
              // Final fallback to regular location check
              if (organizationData) {
                console.log('Error occurred, falling back to regular location check');
                checkLocation();
              } else {
                setLocationStatus('error');
              }
            }
          }, 500);
        }
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // This geofence watcher (distanceFilter:0, interval:5000 — the most
        // aggressive GPS config in the app) was previously only torn down on
        // component UNMOUNT, never on backgrounding. AttendanceScreen stays
        // mounted across a background/foreground cycle (it's a tab, not
        // unmounted), so it kept polling GPS every 2-5s the whole time the
        // app was backgrounded — a battery drain independent of, and on top
        // of, the check-in tracking channels. Resumed by the 'active' branch
        // above via startWatch()/checkLocation(), so nothing is lost.
        if (watchIdRef.current != null) {
          Geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [user, wfhStatus, areaRadius]);

  // Check for location refresh notifications
  useEffect(() => {
    const checkLocationRefresh = async () => {
      try {
        // Check for pending location refresh from push notifications
        const pendingLocationRefresh = await pushNotificationService.checkPendingLocationRefresh();
        if (pendingLocationRefresh) {
          console.log('Found pending location refresh:', pendingLocationRefresh);

          // Clear the pending refresh
          await pushNotificationService.clearPendingLocationRefresh();

          // Handle different types of location updates
          if (pendingLocationRefresh.data && pendingLocationRefresh.data.coordinates) {
            console.log('Processing location update with coordinates from push notification');

            // Update organization data with new location coordinates
            const newLocationData = {
              locationId: pendingLocationRefresh.data.locationId,
              locationName: pendingLocationRefresh.data.locationName,
              coordinates: pendingLocationRefresh.data.coordinates,
              geofenceRadius: pendingLocationRefresh.data.geofenceRadius || 150,
              lastUpdated: pendingLocationRefresh.timestamp,
              source: 'push_notification'
            };

            // Update cached organization data with new location
            if (organizationData) {
              const updatedOrgData = {
                ...organizationData,
                location: {
                  latitude: pendingLocationRefresh.data.coordinates.latitude,
                  longitude: pendingLocationRefresh.data.coordinates.longitude
                }
              };

              await AsyncStorage.setItem('organizationData', JSON.stringify(updatedOrgData));
              setOrganizationData(updatedOrgData);

              // Update area radius if provided
              if (pendingLocationRefresh.data.geofenceRadius) {
                setAreaRadius(pendingLocationRefresh.data.geofenceRadius);
              }

              console.log('Organization data updated with new location from push notification');

              // Immediately recalculate distance with new location
              if (currentLocation) {
                const newDistance = getDistanceFromLatLonInMeters(
                  currentLocation.latitude,
                  currentLocation.longitude,
                  pendingLocationRefresh.data.coordinates.latitude,
                  pendingLocationRefresh.data.coordinates.longitude
                );

                console.log(`Distance recalculated with new location: ${newDistance}m`);
                setDistance(newDistance);

                // Update attendance eligibility based on new distance
                const newAreaRadius = pendingLocationRefresh.data.geofenceRadius || areaRadius;
                if (newDistance <= newAreaRadius) {
                  setCanMarkAttendance(true);
                  setLocationStatus('within');
                  console.log('Student is now within range of new location');
                } else {
                  setCanMarkAttendance(false);
                  setLocationStatus('outside');
                  console.log('Student is outside range of new location');
                }
              } else {
                // If we don't have current location, trigger location check
                console.log('No current location available, triggering location check');
                checkLocation();
              }
            }

            // Show notification to user based on the reason
            if (pendingLocationRefresh.reason === 'location_assigned') {
              showToast({
                type: 'info',
                title: 'Location Updated',
                message: `Your attendance location has been changed to ${pendingLocationRefresh.data.locationName}. Distance has been recalculated based on the new location.`,
              });
            } else if (pendingLocationRefresh.reason === 'location_request_approved') {
              showToast({
                type: 'success',
                title: 'Location Request Approved',
                message: `Your location change request has been approved. You can now mark attendance at ${pendingLocationRefresh.data.locationName}.`,
              });
            }
          } else {
            // Fallback: refresh organization data from server if no coordinates in push data
            console.log('No coordinates in push notification, refreshing from server...');
            const refreshResponse = await apiService.refreshOrganizationData();

            if (refreshResponse.success) {
              console.log('Organization data refreshed successfully from server');
              await loadStudentAndOrganizationData();

              // Show generic notification
              showToast({
                type: 'info',
                title: 'Location Updated',
                message: 'Your attendance location has been updated. Please check your current location status.',
              });
            } else {
              console.error('Failed to refresh organization data:', refreshResponse.error);
            }
          }
        }

        // Check for location request rejection
        const rejection = await pushNotificationService.getLocationRequestRejection();
        if (rejection) {
          showToast({
            type: 'warning',
            title: 'Location Request Rejected',
            message: `Your request to change location to ${rejection.locationName} has been rejected. ${rejection.rejectionReason || 'Please contact your administrator for more details.'}`,
          });
        }
      } catch (error) {
        console.error('Error checking location refresh:', error);
      }
    };

    // Check on component mount and when user changes
    if (user?.role === 'student') {
      checkLocationRefresh();
    }

    // Set up interval to check periodically (every 30 seconds)
    const interval = setInterval(() => {
      if (user?.role === 'student') {
        checkLocationRefresh();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [user, organizationData, currentLocation, areaRadius]);

  const handleMarkAttendance = async (type: 'in' | 'out') => {
    let effLatitude = currentLocation?.latitude ?? null;
    let effLongitude = currentLocation?.longitude ?? null;
    let effDistance = distance;
    let effRadius = effectiveRadius;

    // The ambient watcher's last fix might be several seconds old, or exactly
    // the kind of noisy/rejected-by-the-accuracy-filter reading that got
    // frozen (see processPosition's ACCURACY_REJECT_THRESHOLD_M). Only when
    // we're NOT already confidently within range do we spend the time getting
    // one dedicated fresh, high-accuracy fix right at the moment that
    // actually decides whether check-in is allowed — the highest-stakes
    // moment for GPS accuracy in the whole flow. Capped at 6s so a
    // low-signal spot can't hang the button; falls back to ambient state.
    const ambientConfident =
      locationStatus === 'within' &&
      locationAccuracy != null &&
      locationAccuracy <= ACCURACY_REJECT_THRESHOLD_M;

    if (!ambientConfident && organizationData?.location) {
      try {
        const fresh = await Promise.race([
          getFreshLocation(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
        if (fresh) {
          effLatitude = fresh.latitude;
          effLongitude = fresh.longitude;
          setCurrentLocation({ latitude: fresh.latitude, longitude: fresh.longitude });
          setLocationAccuracy(fresh.accuracy ?? null);
          const { distance: freshD, radius: freshAllowed } = nearestAllowed(
            fresh.latitude,
            fresh.longitude,
            organizationData.location.latitude,
            organizationData.location.longitude,
          );
          effDistance = freshD;
          effRadius = freshAllowed;
          setDistance(freshD);
          setEffectiveRadius(freshAllowed);
        }
      } catch (e) {
        console.warn('handleMarkAttendance: fresh location fetch failed, using ambient state:', e);
      }
    }

    // Require a real measured distance instead of a possibly stale status flag.
    const measuredInsideOrganization =
      effLatitude !== null &&
      effLongitude !== null &&
      typeof effDistance === 'number' &&
      Number.isFinite(effDistance) &&
      typeof effRadius === 'number' &&
      Number.isFinite(effRadius) &&
      effDistance <= effRadius;
    const isInsideAllowedRange = measuredInsideOrganization;

    if (!isInsideAllowedRange) {
      Alert.alert(
        'Location out of range',
        `You can check in or check out only when you are within ${Math.round(effRadius)} metres of a campus office (Anuvadini, NETF or IUAC). Refresh your location after reaching the premises.`,
      );
      return;
    }

    console.log('Selected method:', selectedMethod);
    // Route to the selected authentication method
    if (selectedMethod === 'face') {
      setAttendanceType(type);
      // Run the liveness challenge FIRST (anti-video-spoof). On success its
      // onSuccess handler opens the face-recognition modal.
      setShowLivenessChallenge(true);
      return;
    }
    if (selectedMethod === 'iris') {
      (navigation as any).navigate('IrisAuth', { type });
      return;
    }
    if (selectedMethod === 'voice') {
      navigation.navigate('VoiceAuth' as never);
      return;
    }
    if (selectedMethod === 'thumb') {
      navigation.navigate('ThumbAuth' as never);
      return;
    }
    if (selectedMethod === 'palm') {
      navigation.navigate('PalmAuth' as never);
      return;
    }
    // Fallback: directly mark if method unknown
    markAttendanceDirectly(type);
  };

  // Persist a mark on-device when the live request can't reach the server, so it
  // syncs automatically later and the on-screen status updates immediately. The
  // attendance is ALWAYS attempted on the live server first; this is the fallback.
  const saveOfflineMark = async (
    type: 'in' | 'out',
    location: { latitude: number; longitude: number } | null,
    authMethod: string,
    faceImage?: any,
  ) => {
    try {
      await enqueueMark({
        type,
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        authMethod,
        faceImage,
        timestamp: new Date().toISOString(),
      });
      // Reflect the mark immediately (so hasInTime/hasOutTime update right away).
      setAttendanceHistory(await mergedTodayRecords(await getCachedTodayRecords()));
      if (type === 'out') {
        try { await stopCheckInTracking(); } catch {}
        apiService.disconnectDefenderPC().catch(() => {});
        setIsWorkPCConnected(false);
        setConnectedDeviceName('');
      }
      showToast({
        type: 'info',
        title: 'Saved offline',
        message: `Your check-${type === 'in' ? 'in' : 'out'} was saved on your device and will sync automatically when you're back online.`,
      });
      navigation.navigate('Attendance' as never);
    } catch (e) {
      showToast({ type: 'error', title: 'Error', message: 'Could not save attendance. Please try again.' });
    }
  };

  const markAttendanceDirectly = async (type: 'in' | 'out') => {
    if (!user || !currentLocation) return;

    try {
      setIsLoading(true);
      console.log('[AttendanceScreen] Marking attendance directly:', {
        userId: user.id,
        type,
        method: selectedMethod,
        hasLocation: !!currentLocation
      });

      // Map selectedMethod to the correct authMethod for API
      const authMethod = selectedMethod === 'palm' ? 'manual' : selectedMethod;

      const response = await apiService.markAttendance({
        type,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        authMethod, // Use the mapped authentication method
      });

      console.log('[AttendanceScreen] Direct attendance response:', response);

      if (response.success && response.data) {
        console.log('Attendance marked successfully, refreshing history...');
        await loadAttendanceHistory(true);

        // Start/stop live-location tracking for the working-hours window.
        if (type === 'in') {
          await startCheckInTracking((response.data as any).tracking);
          refreshDefenderPairing();
        } else {
          await stopCheckInTracking();
          // Disconnect defender monitoring on checkout (best-effort, never blocks).
          apiService.disconnectDefenderPC().catch(() => {});
          setIsWorkPCConnected(false);
          setConnectedDeviceName('');
        }

        // Show success message and navigate
        showToast({
          type: 'success',
          title: 'Attendance marked',
          // WFH is out of scope for this deployment — never show a WFH suffix.
          message: 'Attendance marked successfully!',
        });
        // Navigate to attendance tab to show updated records
        navigation.navigate('Attendance' as never);
      } else if (isNetworkError(response.error)) {
        // Couldn't reach the server → save locally and sync later (never lost).
        await saveOfflineMark(type, currentLocation, authMethod);
      } else if (isOutsideCampusError(response)) {
        showToast({
          type: 'error',
          title: 'Outside campus area',
          message: buildOutsideCampusMessage(response, false),
        });
      } else {
        console.log('Failed to mark attendance:', response.error);
        showToast({
          type: 'error',
          title: 'Error',
          message: response.error || 'Failed to mark attendance',
        });
      }
    } catch (error) {
      console.error('[AttendanceScreen] Error marking attendance:', error);
      // Network/unexpected failure → save offline rather than dropping the mark.
      await saveOfflineMark(type, currentLocation, selectedMethod === 'palm' ? 'manual' : selectedMethod);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaceVerificationSuccess = async (
    faceImage?: any,
    livenessEvidence?: { nonce: string | null; events: Array<Record<string, any>> },
    /** Other frames from the SAME liveness session — forwarded to /mark so its
     * independent re-verification isn't judging a single frame in isolation. */
    extraFrames?: string[],
  ) => {
    if (!attendanceType || !user) return;

    // For WFH users, location is not required
    const hasActiveWFH = checkWFHStatus();
    if (!hasActiveWFH && !currentLocation) {
      showToast({
        type: 'error',
        title: 'Location Error',
        message: 'Location is required for attendance marking',
      });
      return;
    }

    try {
      setIsLoading(true);
      console.log('[AttendanceScreen] Marking attendance after face verification:', {
        type: attendanceType,
        hasLocation: !!currentLocation,
        isWFH: wfhAllowed,
        latitude: currentLocation?.latitude || 0,
        longitude: currentLocation?.longitude || 0
      });

      // Injection / deepfake guard: attach a best-effort device+camera attestation
      // so the server can flag virtual-camera / emulator / replay captures.
      let attestation: Record<string, any> | undefined;
      try {
        attestation = await collectAttestation();
      } catch {
        /* non-fatal — never block a real mark on attestation */
      }

      const markPayload = {
        type: attendanceType,
        latitude: currentLocation?.latitude || 0,
        longitude: currentLocation?.longitude || 0,
        faceImage,
        authMethod: 'face', // Face authentication method
        attestation,
        // Liveness evidence (server-issued nonce + per-action sensor events).
        // The server re-adjudicates these in /attendance/mark; without them the
        // stored livenessVerdict is always {passed:false, nonce_invalid}.
        livenessNonce: livenessEvidence?.nonce || undefined,
        livenessEvents: livenessEvidence?.events,
        // The other frames from this same liveness session — lets /mark's
        // independent re-verification use the same multi-frame evidence
        // /verify-face already fused, instead of one isolated frame.
        frames: extraFrames,
      };

      let response = await apiService.markAttendance(markPayload);
      console.log('[AttendanceScreen] Attendance response:', response);

      // /verify-face (this same capture) ALREADY matched — that's the only way
      // we got here (see isFaceMismatchError's comment below). So a mismatch
      // from /mark's independent re-check is, in practice, almost always the
      // SAME face scored twice against slightly different image encodings
      // (see downscaleForUpload — /mark gets a recompressed copy) landing on
      // opposite sides of the match threshold, not a genuine identity failure.
      // Showing the user a scary "couldn't verify / bad lighting" alert right
      // after they just saw "Face verified" was the actual reported bug — one
      // silent, automatic retry resolves the transient disagreement in the
      // common case without ever surfacing it, while still going through the
      // exact same server-side check (nothing here weakens that check itself).
      if (isFaceMismatchError(response)) {
        console.log('[AttendanceScreen] /mark disagreed with prior /verify-face match — silently retrying once');
        response = await apiService.markAttendance(markPayload);
        console.log('[AttendanceScreen] Attendance response (retry):', response);
      }

      if (response.success && response.data) {
        await loadAttendanceHistory(true);

        // Start/stop live-location tracking for the working-hours window.
        if (attendanceType === 'in') {
          await startCheckInTracking((response.data as any).tracking);
          refreshDefenderPairing();
        } else {
          await stopCheckInTracking();
          apiService.disconnectDefenderPC().catch(() => {});
          setIsWorkPCConnected(false);
          setConnectedDeviceName('');
        }

        // Close modal and navigate immediately without showing alert
        setShowFaceModal(false);
        setAttendanceType(null);

        // Navigate to attendance tab to show updated records
        navigation.navigate('Attendance' as never);

        console.log('[AttendanceScreen] Attendance marked successfully and navigated to Attendance tab');
      } else if (isNetworkError(response.error)) {
        // Couldn't reach the server → save the mark (with the captured face) and
        // sync later; close the face modal exactly as on success.
        setShowFaceModal(false);
        await saveOfflineMark(attendanceType!, currentLocation, 'face', faceImage);
        setAttendanceType(null);
      } else if (isOutsideCampusError(response)) {
        // Face verification DID succeed (we only get here from onSuccess) — the
        // mark was rejected purely because the user is outside the campus
        // geofence. Use a persistent Alert (NOT a toast): the face modal had just
        // shown "Identity verified", so a 3.5s toast that fires as the modal
        // closes is easily missed — leaving the user thinking it succeeded.
        setShowFaceModal(false);
        setAttendanceType(null);
        Alert.alert(
          '⚠️ Attendance NOT marked',
          buildOutsideCampusMessage(response, true),
          [{ text: 'OK' }],
        );
      } else if (isFaceMismatchError(response)) {
        // Reached only if BOTH the original attempt and the silent retry
        // above got rejected by /attendance/mark's independent check.
        // /verify-face (this exact capture, full quality) already matched —
        // the overwhelmingly likely cause here is the recompressed copy
        // /mark re-checks (downscaleForUpload) landing just under the match
        // threshold in poor/uneven light, NOT a genuine different-person
        // mismatch (that would already have been caught at /verify-face,
        // before the user ever saw "Face verified"). So: never show a fake
        // "Verified" for this (that WAS the original bug — a contradictory
        // "verified" then "failed"), but never silently pretend success
        // either. Give a plain, ACTIONABLE message instead of the old vague/
        // alarming "bad lighting… contact your administrator" wording, and
        // let the user just retry — no attendance record is created here.
        setShowFaceModal(false);
        setAttendanceType(null);
        Alert.alert(
          'Please try again',
          'Your attendance could not be confirmed. Make sure your face is clearly and evenly lit, then try again.',
          [{ text: 'OK' }],
        );
      } else {
        // Any other reason the mark failed AFTER the face was verified — make it
        // unambiguous that the face passed but attendance did not record.
        setShowFaceModal(false);
        setAttendanceType(null);
        Alert.alert(
          '⚠️ Attendance NOT marked',
          `✅ Face verified — but attendance could not be marked.\n\n${response.error || 'Please try again.'}`,
          [{ text: 'OK' }],
        );
      }
    } catch (error) {
      console.error('[AttendanceScreen] Error marking attendance:', error);
      setShowFaceModal(false);
      await saveOfflineMark(attendanceType!, currentLocation, 'face', faceImage);
      setAttendanceType(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaceVerificationFailure = () => {
    setShowFaceModal(false);
    setAttendanceType(null);
    showToast({
      type: 'error',
      title: 'Verification Failed',
      message: 'Face verification failed. Please try again.',
    });
    // Redirect the user back to the attendance screen after a failed verify.
    navigation.navigate('Attendance' as never);
  };

  const getTodayAttendance = () => {
    if (!attendanceHistory || !Array.isArray(attendanceHistory)) {
      console.log('No attendance history or not an array:', attendanceHistory);
      return [];
    }
    const today = new Date().toDateString();
    const todayRecords = attendanceHistory.filter(record =>
      new Date(record.timestamp).toDateString() === today
    );
    console.log('Today\'s attendance records:', todayRecords);
    return todayRecords;
  };

  const todayRecords = getTodayAttendance();
  const hasInTime = todayRecords.some(record => record.type === 'in');
  const hasOutTime = todayRecords.some(record => record.type === 'out');
  // The current state is the latest event, not "any checkout today". A user
  // can check out and then check in again; in that case the Work PC card and
  // the hero status must reflect the new check-in.
  const latestTodayRecord = todayRecords.reduce((latest: any, record: any) => {
    if (!latest) return record;
    return new Date(record.timestamp).getTime() > new Date(latest.timestamp).getTime()
      ? record
      : latest;
  }, null);
  const isCurrentlyCheckedIn = latestTodayRecord?.type === 'in';

  console.log('Has in time:', hasInTime);
  console.log('Has out time:', hasOutTime);
  console.log('Latest today record:', latestTodayRecord);

  const getLastCheckoutTime = () => {
    const outRecords = todayRecords.filter(r => r.type === 'out');
    if (outRecords.length > 0) {
      // Sort by timestamp to get the most recent checkout
      const sortedOutRecords = outRecords.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const lastCheckout = sortedOutRecords[0];
      return new Date(lastCheckout.timestamp).toLocaleTimeString();
    }
    return '';
  };

  const checkInRecord = todayRecords
    .filter(r => r.type === 'in')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  const getLocationStatusText = () => {
    // const hasActiveWFH = checkWFHStatus();
    // if (hasActiveWFH) {
    //   const details = wfhDetails;
    //   if (details && details.daysRemaining !== undefined) {
    //     if (details.daysRemaining <= 0) {
    //       return 'Work from home expired - please check with admin';
    //     } else if (details.daysRemaining === 1) {
    //       return `Work from home (expires tomorrow)`;
    //     } else {
    //       return `Work from home (${details.daysRemaining} days remaining)`;
    //     }
    //   }
    //   return 'Work from home is enabled';
    // }
    switch (locationStatus) {
      case 'checking':
        return 'Checking location...';
      case 'within':
        return 'You are within Range';
      case 'outside':
        return 'You are outside Range';
      case 'error':
        return 'Location error';
      default:
        return 'Unknown status';
    }
  };

  // Manual refresh — same flow the legacy "Refresh Status" button used.
  const handleManualRefresh = async () => {
    console.log('Manual refresh triggered');

    // Clear cached location data first
    setCurrentLocation(null);
    setDistance(null);
    setLocationStatus('checking');

    // Always use auth-based refresh for consistency
    console.log('Manual refresh: Force refreshing data from auth endpoint...');

    try {
      // Force refresh organization and student data from server via auth endpoint
      const refreshResult = await loadStudentAndOrganizationData(true);

      if (refreshResult.success && refreshResult.data) {
        console.log('Manual refresh: Auth data refreshed successfully');

        // Check if user has WFH after refresh
        if (refreshResult.data.hasActiveWFH) {
          console.log('Manual refresh: User has active WFH, skipping location check');
          setWfhAllowed(true);
          setCanMarkAttendance(true);
          setLocationStatus('within');

          if (refreshResult.data.currentWFHAssignment) {
            setWfhDetails({
              startDate: refreshResult.data.currentWFHAssignment.startDate,
              endDate: refreshResult.data.currentWFHAssignment.endDate,
              reason: refreshResult.data.currentWFHAssignment.reason,
              daysRemaining: refreshResult.data.currentWFHAssignment.daysRemaining
            });
          }
          return;
        } else {
          console.log('Manual refresh: No active WFH, checking location...');
          setWfhAllowed(false);
          setWfhDetails(null);
        }

        // Get fresh organization data for location check
        const freshOrgData = refreshResult.data.organization;
        if (freshOrgData && freshOrgData.location) {
          console.log('Manual refresh: Fresh organization data obtained:', {
            name: freshOrgData.name,
            location: freshOrgData.location
          });

          // Get fresh user location
          console.log('Manual refresh: Getting fresh user location...');
          const orgLat = freshOrgData.location.latitude;
          const orgLon = freshOrgData.location.longitude;

          const freshLocation = await getFreshLocation();
          console.log('Manual refresh: Fresh user location obtained:', freshLocation);

          // Distance to the NEAREST campus office (Anuvadini/NETF/IUAC),
          // falling back to this org's own location.
          const { distance, radius: allowed } = nearestAllowed(
            freshLocation.latitude,
            freshLocation.longitude,
            orgLat,
            orgLon
          );

          console.log(`Manual refresh: Distance calculated with fresh data: ${distance}m (allowed ${allowed}m)`);

          setCurrentLocation({ latitude: freshLocation.latitude, longitude: freshLocation.longitude });
          setLocationAccuracy(freshLocation.accuracy ?? null);
          setDistance(distance);
          setEffectiveRadius(allowed);

          if (distance <= allowed) {
            setCanMarkAttendance(true);
            setLocationStatus('within');
            console.log(`Manual refresh: Within range (${distance}m <= ${allowed}m) acc=${freshLocation.accuracy}m`);
          } else {
            setCanMarkAttendance(false);
            setLocationStatus('outside');
            console.log(`Manual refresh: Outside range (${distance}m > ${allowed}m) acc=${freshLocation.accuracy}m`);
          }

          // Start watching for future location changes
          startWatch(orgLat, orgLon);
        } else {
          console.error('Manual refresh: Fresh organization location not available');
          setLocationStatus('error');
        }
      } else {
        console.error('Manual refresh: Failed to refresh data from auth endpoint');
        showToast({
          type: 'error',
          title: 'Refresh failed',
          message: 'Could not reach the server. Check your connection and try again.',
        });
        // Fallback to regular location check with cached data
        checkLocation();
      }
    } catch (error) {
      console.error('Error during manual refresh:', error);
      showToast({
        type: 'error',
        title: 'Refresh failed',
        message: 'Could not reach the server. Check your connection and try again.',
      });
      // Final fallback to regular location check
      checkLocation();
    }
  };

  // Full hard refresh: location + organization + WFH status + attendance
  // history, in one shot. Used by BOTH the visible "Refresh status" button
  // and pull-to-refresh, so tapping either always refreshes everything on
  // screen — previously the button only ran handleManualRefresh() (location/
  // org/WFH) and skipped reloading attendance history, so a tap could look
  // like it "did nothing" while pull-to-refresh (which also reloaded history)
  // worked. Both entry points now share this single full-refresh path, and
  // `refreshing` is set here so the button's own loading state is accurate
  // regardless of which one triggered it.
  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await handleManualRefresh();
      await loadAttendanceHistory(true);
    } finally {
      setRefreshing(false);
    }
  };

  const isOrganization = (user?.role as string | undefined) === 'organization';
  const wfhActive = checkWFHStatus();

  // Only let the user mark when the measured distance confirms they're in
  // range.
  // When outside range (or still locating / GPS error) we
  // HIDE the check-in/out buttons — the LocationStatusCard explains why. The
  // server geofence is still the authority; this is the UX guard on top of it.
  const measuredInsideOrganization =
    currentLocation !== null &&
    typeof distance === 'number' &&
    Number.isFinite(distance) &&
    typeof effectiveRadius === 'number' &&
    Number.isFinite(effectiveRadius) &&
    distance <= effectiveRadius;
  const canMarkHere = measuredInsideOrganization;

  // --- loading gate ----------------------------------------------------------
  if (user?.role === 'student' && (!studentData || !organizationData)) {
    return (
      <Screen testID="attendance-loading">
        <AppHeader title="Attendance" subtitle="Mark your attendance" />
        <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </View>
        <Text
          style={[
            typography.small,
            { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
          ]}
          accessibilityLiveRegion="polite"
        >
          Loading student info…
        </Text>
        {studentError && (
          <Text
            style={[
              typography.small,
              { color: colors.danger, textAlign: 'center', marginTop: spacing.sm },
            ]}
            accessibilityLiveRegion="polite"
          >
            {studentError}
          </Text>
        )}
        <Button
          title="Retry loading data"
          onPress={() => loadStudentAndOrganizationData(false)}
          variant="outline"
          icon={RefreshCw}
          accessibilityLabel="Retry loading data"
          style={{ marginTop: spacing.lg, alignSelf: 'center' }}
        />
      </Screen>
    );
  }

  const heroName = studentData?.fullName || organizationData?.name || 'Welcome';
  const heroStatusLabel = latestTodayRecord
    ? latestTodayRecord.type === 'out' ? 'Checked Out' : 'Checked In'
    : 'Not marked yet';
  const heroStatusColor = latestTodayRecord?.type === 'out'
    ? '#FBBF24'
    : latestTodayRecord?.type === 'in'
      ? '#4ADE80'
      : 'rgba(255,255,255,0.6)';
  const heroStatusTime = latestTodayRecord
    ? new Date(latestTodayRecord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : undefined;
  const heroLocationLabel = isOrganization
    ? undefined
    : locationStatus === 'within'
      ? 'In Range'
      : locationStatus === 'borderline'
        ? 'Near Boundary'
        : locationStatus === 'outside'
          ? 'Outside Range'
          : locationStatus === 'error'
            ? 'Location off'
            : 'Locating…';
  const heroLocationColor = isOrganization
    ? undefined
    : locationStatus === 'within'
      ? '#16A34A'
      : locationStatus === 'borderline'
        ? '#F59E0B'
        : locationStatus === 'outside' || locationStatus === 'error'
          ? '#EF4444'
        : undefined;

  return (
    <View style={styles.rootFlex}>
      {/* Soft cool page tint so the aurora hero + white cards pop */}
      <GlassBackdrop colors={['#EEF0FF', '#F3EEFF', '#EAF6FF']} glow={false} />
      <Animated.ScrollView
        style={styles.rootFlex}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xxl,
          gap: spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface}
          />
        }
        testID="attendance-screen"
      >
      <Animated.View style={heroAnim}>
        <AttendanceHero
          greeting={greeting}
          name={heroName}
          org={organizationData?.name}
          statusLabel={heroStatusLabel}
          statusColor={heroStatusColor}
          statusTime={heroStatusTime}
          locationLabel={heroLocationLabel}
          locationColor={heroLocationColor}
          onLogout={logout}
        />
      </Animated.View>

      {user?.role === 'student' ? (
        <>
          {/* Location / geofence status */}
          <LocationStatusCard
            status={locationStatus}
            statusText={getLocationStatusText()}
            distance={distance}
            areaRadius={areaRadius}
            accuracy={locationAccuracy}
            organizationName={typeof organizationData?.name === 'string' ? organizationData.name : undefined}
            organizationAddress={
              typeof organizationData?.address === 'string'
                ? organizationData.address
                : typeof organizationData?.location?.address === 'string'
                  ? organizationData.location.address
                  : undefined
            }
            wfhActive={wfhActive}
            wfhDetails={wfhDetails}
            onRefresh={onPullRefresh}
            refreshing={refreshing}
            enteringIndex={1}
          />

          {/* Check-in / check-out CTA — shown ONLY when the latest measured
              distance is in range.
              Hidden when outside range, still locating,
              or on a location error; the LocationStatusCard above explains why. */}
          {canMarkHere && (
            <CheckInOutButtons
              hasInTime={hasInTime}
              hasOutTime={hasOutTime}
              checkInTime={
                checkInRecord
                  ? new Date(checkInRecord.timestamp).toLocaleTimeString()
                  : undefined
              }
              checkOutTime={getLastCheckoutTime() || undefined}
              loading={isLoading}
              onCheckIn={() => {
                console.log('Check In button pressed. Has in time:', hasInTime);
                handleMarkAttendance('in');
              }}
              onCheckOut={() => {
                console.log('Check Out button pressed. Has in time:', hasInTime, 'Has out time:', hasOutTime);
                handleMarkAttendance('out');
              }}
              enteringIndex={2}
            />
          )}

          {/* Work PC monitoring button — visible while the latest event is a check-in */}
          {isCurrentlyCheckedIn && (
            isWorkPCConnected ? (
              <View style={styles.workPCConnectedBtn}>
                <View style={styles.workPCConnectedDot} />
                <Text style={styles.workPCConnectedText}>
                  Connected — {connectedDeviceName}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.scanWorkPCBtn}
                onPress={() => (navigation as any).navigate('PairWorkPC')}
                activeOpacity={0.8}
              >
                <QrCode size={20} color="#fff" />
                <Text style={styles.scanWorkPCText}>Scan Work PC</Text>
              </TouchableOpacity>
            )
          )}

          {/* Today's marks */}
          <TodaySummary
            records={todayRecords}
            loading={historyLoading}
            enteringIndex={3}
          />

          {/* Quick actions — shortcuts to reports, calendar, leave, schedule… */}
          <QuickActions
            onNavigate={(r) => navigation.navigate(r as never)}
            enteringIndex={4}
          />

          {/* Recent history */}
          <AttendanceHistoryList
            records={attendanceHistory}
            loading={historyLoading}
            enteringIndex={5}
          />
        </>
      ) : (
        // Organization Interface
        <Card elevation={2} enteringIndex={0}>
          <Text
            style={[
              typography.body,
              {
                color: colors.textMuted,
                textAlign: 'center',
                marginBottom: spacing.lg,
              },
            ]}
          >
            View and manage attendance records for all students.
          </Text>
          <OrganizationAttendanceView />
        </Card>
      )}

      {/* Combined liveness + face-recognition modal. Liveness and identity are
          verified in ONE live camera session (anti video-replay): the face that
          performs the random actions is the one recognized — no separate step to
          swap a video into. onVerified fires only after BOTH pass; we mark once. */}
      <LivenessChallenge
        visible={showLivenessChallenge}
        attendanceType={attendanceType}
        currentLocation={currentLocation}
        onVerified={(faceImage, evidence) => {
          setShowLivenessChallenge(false);
          handleFaceVerificationSuccess(faceImage, evidence);
        }}
        onCancel={() => {
          setShowLivenessChallenge(false);
          setAttendanceType(null);
        }}
      />

      {/* Face Verification Modal */}
      <Modal
        visible={showFaceModal}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View
            style={[
              styles.modalHeader,
              { padding: spacing.xl, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[typography.h3, { color: colors.text }]}>
              Face Verification - {attendanceType?.toUpperCase()}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowFaceModal(false);
                setAttendanceType(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Close face verification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.modalClose}
            >
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <CameraStreamView
              onVerificationSuccess={handleFaceVerificationSuccess}
              onVerificationFailure={handleFaceVerificationFailure}
              attendanceType={attendanceType}
              currentLocation={currentLocation}
            />
          </View>
        </SafeAreaView>
      </Modal>
      </Animated.ScrollView>

      <LocationServicesModal
        visible={showLocationServicesModal}
        onDismiss={() => setShowLocationServicesModal(false)}
        onRetry={() => {
          setShowLocationServicesModal(false);
          // Closing this RN <Modal> and firing straight into checkLocation()
          // (which can itself pop the PermissionsAndroid system dialog, or
          // re-open THIS same modal on failure) in the same tick raced the
          // Modal's own close animation on Android — attaching a new window
          // before the old one finished tearing down threw a native
          // WindowManager "BadTokenException" and crashed the whole app.
          // Let the close animation finish first.
          setTimeout(() => {
            if (isMountedRef.current) checkLocation();
          }, 300);
        }}
      />

      <LocationPermissionModal
        visible={showLocationPermissionModal}
        onDismiss={() => {
          // Remember this for the rest of the session so the next
          // checkLocation() (focus/poll/refresh) doesn't force it straight
          // back open — the user can keep exploring the rest of the app.
          locationPermissionDismissedRef.current = true;
          setShowLocationPermissionModal(false);
        }}
        onRetry={() => {
          locationPermissionDismissedRef.current = false;
          setShowLocationPermissionModal(false);
          // Same fix as LocationServicesModal above — never fire the retry
          // synchronously with the modal's own close.
          setTimeout(() => {
            if (isMountedRef.current) checkLocation();
          }, 300);
        }}
      />
    </View>
  );
};

const OrganizationAttendanceViewImpl: React.FC = () => {
  const { theme } = useTheme();
  const { colors, spacing, typography, radii, shadows } = theme;
  const [attendanceData, setAttendanceData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [selectedStudent, setSelectedStudent] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiService.getOrganizationAttendance({ limit: 1000 });
        const responseData: any = response.data;
        let attendanceArr = [];
        if (
          response.success &&
          responseData &&
          responseData.data &&
          Array.isArray(responseData.data.attendance)
        ) {
          attendanceArr = responseData.data.attendance;
          setAttendanceData(attendanceArr);
        } else {
          setAttendanceData([]);
          setError(response.error || 'No attendance data or error from backend');
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load organization attendance');
        console.error('OrganizationAttendanceView error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Group by studentId
  const grouped = React.useMemo(() => {
    const map: { [studentId: string]: any[] } = {};
    attendanceData.forEach(record => {
      if (!map[record.studentId?._id || record.studentId]) map[record.studentId?._id || record.studentId] = [];
      map[record.studentId?._id || record.studentId].push(record);
    });
    return map;
  }, [attendanceData]);

  // Get current month records for a student
  const getMonthlyRecords = (records: any[]) => {
    const now = new Date();
    return records.filter(rec => {
      const recDate = new Date(rec.timestamp);
      return recDate.getFullYear() === now.getFullYear() && recDate.getMonth() === now.getMonth();
    });
  };

  const renderRecordRow = (rec: any) => (
    <View
      key={rec._id || rec.id}
      style={[
        orgStyles.recordRow,
        {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.border,
          borderRadius: radii.sm,
          padding: spacing.sm,
          marginBottom: spacing.sm,
        },
      ]}
    >
      <Text style={[typography.small, { color: colors.text, flex: 1 }]}>
        {rec.type?.toUpperCase() || 'TYPE'} - {rec.timestamp ? new Date(rec.timestamp).toLocaleDateString() : 'NO DATE'} {rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString() : ''}
        {rec.location?.distance !== undefined ? ` | ${rec.location.distance}m` : ''}
        {rec.status ? ` | ${rec.status}` : ''}
      </Text>
      {rec.faceVerification?.verified ? (
        <CircleCheck size={18} color={colors.success} />
      ) : (
        <CircleX size={18} color={colors.danger} />
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={{ gap: spacing.lg }}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </View>
    );
  }
  if (error) {
    return (
      <Text
        style={[typography.body, { color: colors.danger }]}
        accessibilityLiveRegion="polite"
      >
        {error}
      </Text>
    );
  }
  if (attendanceData.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No attendance records found"
        message="Records from your students will appear here."
      />
    );
  }

  return (
    <View>
      <ScrollView style={{ maxHeight: 500 }}>
        {Object.entries(grouped).map(([studentId, records], idx) => {
          const student = records[0]?.studentId || {};
          const studentName = student.name || studentId;
          const studentEmail = student.email || '';
          const studentAddress = student.address || student.location || student.officeLocation || '';
          const monthlyRecords = getMonthlyRecords(records);
          return (
            <View
              key={studentId}
              style={[
                {
                  marginBottom: spacing.xl,
                  borderRadius: radii.md,
                  padding: spacing.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
                shadows.e1,
              ]}
            >
              <View style={[orgStyles.studentHeader, { marginBottom: spacing.sm }]}>
                <View style={orgStyles.studentIdentity}>
                  <Text
                    style={[
                      typography.h3,
                      { color: colors.text, marginRight: spacing.md },
                    ]}
                  >
                    {idx + 1}.
                  </Text>
                  <View style={orgStyles.studentMeta}>
                    <Text style={[typography.bodyBold, { color: colors.text }]}>
                      {studentName}
                    </Text>
                    {studentEmail ? (
                      <Text style={[typography.small, { color: colors.textMuted }]}>
                        {studentEmail}
                      </Text>
                    ) : null}
                    {studentAddress && typeof studentAddress === 'string' ? (
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        {studentAddress}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Button
                  title="Monthly report"
                  onPress={() => { setSelectedStudent(studentId); setModalVisible(true); }}
                  variant="ghost"
                  size="sm"
                  accessibilityLabel={`View monthly report for ${studentName}`}
                />
              </View>
              {/* Show a preview of the latest 3 records */}
              {monthlyRecords.slice(0, 3).map(renderRecordRow)}
              {monthlyRecords.length > 3 && (
                <Text
                  style={[
                    typography.small,
                    { color: colors.brand, marginTop: spacing.xs },
                  ]}
                >
                  +{monthlyRecords.length - 3} more this month
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
      {/* Modal for monthly report */}
      <RNModal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[orgStyles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              orgStyles.modalCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderColor: colors.border,
              },
              shadows.e3,
            ]}
          >
            <View
              style={{
                backgroundColor: colors.brand,
                borderTopLeftRadius: radii.lg,
                borderTopRightRadius: radii.lg,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
              }}
            >
              <Text
                style={[
                  typography.h3,
                  { color: colors.textInverse, textAlign: 'center' },
                ]}
              >
                Report
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 350, padding: spacing.lg }}>
              {selectedStudent && grouped[selectedStudent] && getMonthlyRecords(grouped[selectedStudent]).length > 0 ? (
                getMonthlyRecords(grouped[selectedStudent]).map(renderRecordRow)
              ) : (
                <Text
                  style={[
                    typography.body,
                    { color: colors.text, textAlign: 'center' },
                  ]}
                >
                  No records for this month.
                </Text>
              )}
            </ScrollView>
            <Button
              title="Close"
              onPress={() => setModalVisible(false)}
              variant="primary"
              accessibilityLabel="Close monthly report"
              style={{
                alignSelf: 'center',
                marginVertical: spacing.lg,
                minWidth: 160,
              }}
            />
          </View>
        </View>
      </RNModal>
    </View>
  );
};

// Takes no props and fetches its own data — but without memo it still
// re-rendered every time its parent (AttendanceScreen) did, i.e. every GPS
// tick, even though nothing here depends on GPS at all.
const OrganizationAttendanceView = React.memo(OrganizationAttendanceViewImpl);

const styles = StyleSheet.create({
  scanWorkPCBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  scanWorkPCText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  workPCConnectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#052e16',
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  workPCConnectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
  },
  workPCConnectedText: {
    color: '#4ade80',
    fontSize: 15,
    fontWeight: '700',
  },
  rootFlex: { flex: 1 },
  transparentBg: { backgroundColor: 'transparent' },
  hero: { paddingTop: 4, paddingBottom: 2 },
  heroGreeting: { color: 'rgba(255,255,255,0.95)', fontSize: 13, fontWeight: '600' },
  heroName: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
    textShadowColor: 'rgba(124,45,18,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroSub: { color: 'rgba(255,255,255,0.95)', fontSize: 13, marginTop: 4 },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  modalClose: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    flex: 1,
  },
});

const orgStyles = StyleSheet.create({
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  studentIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  studentMeta: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '92%',
    maxHeight: '85%',
    borderWidth: 1,
  },
});
