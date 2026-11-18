import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import { CustomColors as colors } from './colors';
import { useAuth } from './AuthContext';
import { apiService, type Attendance } from './services/api';
import Animated from 'react-native-reanimated';
import { useTabBarScrollHandler } from './components/ui/tabBarScroll';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AttendanceStats = {
  totalRecords: number;
  presentDays: number;
  absentDays: number;
  averageDistance?: number;
};

export const UserDashboard: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const onScroll = useTabBarScrollHandler();

  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [checkoutRequestsLoading, setCheckoutRequestsLoading] = useState(true);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [checkoutRequestsError, setCheckoutRequestsError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [checkoutRequests, setCheckoutRequests] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Move these functions outside useEffect so they can be reused
  const loadProfile = useCallback(async () => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      // Prefer local storage and useAuth for profile to avoid 404s
      const stored = await AsyncStorage.getItem('studentData');
      if (stored) {
        setProfile(JSON.parse(stored));
      } else if (user) {
        setProfile({ name: user.name, email: user.email, uid: user.uid ?? user.id });
      } else {
        setProfile(null);
      }
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);
      const start = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1).toISOString();
      const end = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      const res = await apiService.getAttendanceStats({ startDate: start, endDate: end });
      if (res.success && res.data) {
        const d: any = res.data as any;
        setStats((d.stats ?? d) as AttendanceStats);
      } else {
        setStatsError(res.error || 'Failed to load stats');
      }
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setStatsLoading(false);
    }
  }, [selectedMonth]);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const start = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1).toISOString();
      const end = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      const res = await apiService.getAttendanceHistory({ startDate: start, endDate: end, limit: 200, page: 1 });
      if (res.success && res.data) {
        const payload: any = res.data as any;
        const list: Attendance[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.attendance)
            ? payload.attendance
            : Array.isArray(payload.data?.attendance)
              ? payload.data.attendance
              : [];
        setHistory(list);
      } else {
        setHistory([]);
        setHistoryError(res.error || 'Failed to load history');
      }
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedMonth]);

  const loadCheckoutRequests = useCallback(async () => {
    try {
      setCheckoutRequestsLoading(true);
      setCheckoutRequestsError(null);
      const response = await apiService.getMyCheckoutRequests();
      if (response.success && response.data) {
        // Ensure data is always an array
        const data = Array.isArray(response.data) ? response.data : [];
        setCheckoutRequests(data);
      } else {
        setCheckoutRequestsError(response.error || 'Failed to load checkout requests');
        setCheckoutRequests([]);
      }
    } catch (e) {
      setCheckoutRequestsError(e instanceof Error ? e.message : 'Failed to load checkout requests');
      setCheckoutRequests([]);
    } finally {
      setCheckoutRequestsLoading(false);
    }
  }, []);

  // Add a refresh handler
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadProfile(), loadStats(), loadHistory(), loadCheckoutRequests()]);
    setLoading(false);
  }, [loadProfile, loadStats, loadHistory, loadCheckoutRequests]);

  useEffect(() => {
    loadProfile();
    loadStats();
    loadHistory();
    loadCheckoutRequests();
  }, [selectedMonth, user, loadProfile, loadStats, loadHistory, loadCheckoutRequests]);

  useEffect(() => {
    setLoading(profileLoading || statsLoading || historyLoading || checkoutRequestsLoading);
  }, [profileLoading, statsLoading, historyLoading, checkoutRequestsLoading]);

  const today = useMemo(() => new Date().toDateString(), []);

  // Function to check if there's already a checkout request for a specific date
  const getCheckoutRequestForDate = useCallback((date: Date) => {
    // Safety check to ensure checkoutRequests is an array
    if (!Array.isArray(checkoutRequests)) {
      return undefined;
    }
    
    const dateStr = date.toDateString();
    return checkoutRequests.find(request => {
      const requestDate = new Date(request.date);
      return requestDate.toDateString() === dateStr;
    });
  }, [checkoutRequests]);

  // Function to check if a date is eligible for checkout request (must be at least 1 day old)
  const isDateEligibleForCheckoutRequest = useCallback((date: Date) => {
    const today = new Date();
    const requestDate = new Date(date);
    
    // Set both dates to start of day for accurate comparison
    today.setHours(0, 0, 0, 0);
    requestDate.setHours(0, 0, 0, 0);
    
    const daysDifference = Math.floor((today.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDifference >= 1;
  }, []);
  const todayRecords = useMemo(
    () => history.filter((r) => new Date(r.timestamp).toDateString() === today),
    [history, today]
  );

  // Group history by date and build rows with check-in and check-out on the same line
  const dailyHistory = useMemo(() => {
    type DayRow = { date: Date; in?: Attendance; out?: Attendance };
    const byDay: Record<string, DayRow> = {};
    for (const rec of history) {
      const ts = new Date(rec.timestamp);
      const key = ts.toDateString();
      if (!byDay[key]) {
        byDay[key] = { date: new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()) };
      }
      if (rec.type === 'in') {
        if (!byDay[key].in || new Date(rec.timestamp) < new Date(byDay[key].in!.timestamp)) {
          byDay[key].in = rec;
        }
      } else if (rec.type === 'out') {
        if (!byDay[key].out || new Date(rec.timestamp) > new Date(byDay[key].out!.timestamp)) {
          byDay[key].out = rec;
        }
      }
    }
    return Object.values(byDay).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [history]);

  // Build 7-day bar data
  const last7Days = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    const now = new Date(selectedMonth);
    const end = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const count = history.filter(h => {
        const t = new Date(h.timestamp);
        return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth() && t.getDate() === d.getDate();
      }).length;
      days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), value: count });
    }
    return days;
  }, [history, selectedMonth]);

  const presentVsAbsent = useMemo(() => {
    let present = 0, half = 0, absent = 0;
    const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), i);
      const ins = history.filter(h => new Date(h.timestamp).getDate() === i && h.type === 'in').length;
      const outs = history.filter(h => new Date(h.timestamp).getDate() === i && h.type === 'out').length;
      if (ins > 0 && outs > 0) present++;
      else if (ins > 0 || outs > 0) half++;
      else absent++;
    }
    return { present, half, absent };
  }, [history, selectedMonth]);

  const Bar: React.FC<{ data: { label: string; value: number }[]; max?: number }>
    = ({ data, max }) => {
    const width = Dimensions.get('window').width - 60;
    const barMax = max ?? Math.max(1, ...data.map(d => d.value));
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {data.map((d, idx) => (
          <View key={idx} style={{ alignItems: 'center' }}>
            <View style={{ height: 100, width: (width / data.length) - 12, justifyContent: 'flex-end' }}>
              <View style={{ height: (d.value / barMax) * 100, backgroundColor: '#2563eb', borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
            </View>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{d.label}</Text>
          </View>
        ))}
      </View>
    );
  };

  const Segment: React.FC<{ title: string; value: number; color: string }>
    = ({ title, value, color }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Text style={{ color: colors.text }}>{title}: {value}</Text>
      </View>
    );

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </View>
      ) : (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.content}
        >
          {/* Header */}
          <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View>
              <Text style={styles.title}>Welcome{user?.name ? `, ${user.name}` : ''}</Text>
              <Text style={styles.subtitle}>Your dashboard overview</Text>
            </View>
            <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh}>
              <Text style={styles.refreshBtnText}>🔄 Refresh</Text>
            </TouchableOpacity>
          </View>

          {/* Month Picker */}
          <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <Text style={styles.cardTitle}>📅 Month</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))}><Text style={styles.primaryBtnText}>◀</Text></TouchableOpacity>
              <Text style={{ alignSelf: 'center', color: colors.text }}>
                {selectedMonth.toLocaleString('default', { month: 'long' })} {selectedMonth.getFullYear()}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))}><Text style={styles.primaryBtnText}>▶</Text></TouchableOpacity>
            </View>
          </View>

          {/* Attendance Overview */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 Attendance Overview (This Month)</Text>
            {statsError ? (
              <Text style={styles.errorText}>{statsError}</Text>
            ) : stats ? (
              <View style={styles.statsGrid}>
                <Stat value={String(stats.totalRecords)} label="Total Records" />
                <Stat value={String(stats.presentDays)} label="Present Days" highlight="success" />
                <Stat value={String(stats.absentDays)} label="Absent Days" highlight="error" />
                {/* Average distance hidden as requested */}
              </View>
            ) : (
              <Text style={styles.mutedText}>No stats available</Text>
            )}
            <View style={styles.rowButtons}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('AttendanceDashboard' as never)}>
                <Text style={styles.primaryBtnText}>Open Detailed Attendance</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Charts */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📈 Last 7 Days</Text>
            <Bar data={last7Days} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🧮 Monthly Status</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <Segment title="Present" value={presentVsAbsent.present} color={colors.success} />
              <Segment title="Half Day" value={presentVsAbsent.half} color={colors.warning} />
              <Segment title="Absent" value={presentVsAbsent.absent} color={colors.error} />
            </View>
          </View>

          {/* Recent Attendance */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🕒 Recent Attendance</Text>
            {historyError ? (
              <Text style={styles.errorText}>{historyError}</Text>
            ) : dailyHistory.length === 0 ? (
              <Text style={styles.mutedText}>No attendance records found</Text>
            ) : (
              <View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCellDate, styles.tableHeaderText]}>Date</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderText]}>Check-In</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderText]}>Check-Out</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderText]}>Duration</Text>
                </View>
                {dailyHistory.slice(0, 10).map((row, idx) => {
                  const dayName = row.date.toLocaleDateString('en-US', { weekday: 'short' });
                  const dateStr = row.date.toLocaleDateString();
                  const inTime = row.in ? new Date(row.in.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
                  const outTime = row.out ? new Date(row.out.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

                  const inVerified = row.in ? (((row.in as any).status === 'success') || (row.in as any).faceVerified || (row.in as any).voiceVerified || (row.in as any).irisVerified || (row.in as any).thumbVerified || (row.in as any).faceVerification?.verified === true) : false;
                  const outVerified = row.out ? (((row.out as any).status === 'success') || (row.out as any).faceVerified || (row.out as any).voiceVerified || (row.out as any).irisVerified || (row.out as any).thumbVerified || (row.out as any).faceVerification?.verified === true) : false;

                  const durationStr = (row.in && row.out) ? (() => {
                    const start = new Date(row.in!.timestamp).getTime();
                    const end = new Date(row.out!.timestamp).getTime();
                    const diffMs = end - start;
                    if (diffMs <= 0 || !Number.isFinite(diffMs)) return '--';
                    const totalMinutes = Math.floor(diffMs / 60000);
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    return `${hours}h ${minutes}m`;
                  })() : '--';

                  return (
                    <View key={`${row.date.getTime()}-${idx}`} style={styles.tableRow}>
                      <Text style={styles.tableCellDate}>{dayName}, {dateStr}</Text>
                      <Text style={[styles.tableCell, { color: inVerified ? colors.text : colors.error }]}>
                        {row.in ? ` ${inTime}${inVerified ? '' : ' ❌'}` : '—'}
                      </Text>
                      {row.out ? (
                        <Text style={[styles.tableCell, { color: outVerified ? colors.text : colors.error }]}>
                          {` ${outTime}${outVerified ? '' : ' ❌'}`}
                        </Text>
                      ) : (() => {
                        // Check if there's already a checkout request for this date
                        const existingRequest = getCheckoutRequestForDate(row.date);
                        
                        // Check if the date is eligible for checkout request (must be at least 1 day old)
                        const isEligible = isDateEligibleForCheckoutRequest(row.date);
                        
                        if (existingRequest) {
                          // Show status instead of button
                          const statusInfo = (() => {
                            switch (existingRequest.status) {
                              case 'approved':
                                return { 
                                  text: existingRequest.autoApproved ? '✅ Auto-Approved' : '✅ Approved', 
                                  color: colors.success 
                                };
                              case 'rejected':
                                return { text: '❌ Rejected', color: colors.error };
                              default:
                                return { text: '⏳ Pending', color: '#f59e0b' };
                            }
                          })();
                          
                          return (
                            <Text style={[styles.tableCell, { color: statusInfo.color, fontSize: 12, fontWeight: '600' }]}>
                              {statusInfo.text}
                            </Text>
                          );
                        }
                        
                        // Show message if not eligible for request (same day or too recent)
                        if (!isEligible) {
                          const today = new Date();
                          const requestDate = new Date(row.date);
                          today.setHours(0, 0, 0, 0);
                          requestDate.setHours(0, 0, 0, 0);
                          const daysDifference = Math.floor((today.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));
                          
                          return (
                            <Text style={[styles.tableCell, { color: colors.textSecondary, fontSize: 11, fontStyle: 'italic' }]}>
                              {daysDifference === 0 ? 'Same day' : 'Too recent'}
                            </Text>
                          );
                        }
                        
                        // Show button if no request exists and date is eligible
                        return (
                          <TouchableOpacity
                            style={[styles.tableCell, styles.linkBtn]}
                            onPress={async () => {
                              try {
                                // Get current location for auto-approval check
                                let currentLocation = null;
                                try {
                                  // Request location permission
                                  let hasPermission = false;
                                  
                                  if (Platform.OS === 'android') {
                                    const granted = await PermissionsAndroid.request(
                                      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                                      {
                                        title: 'Location Permission',
                                        message: 'This app needs access to location for checkout requests.',
                                        buttonNeutral: 'Ask Me Later',
                                        buttonNegative: 'Cancel',
                                        buttonPositive: 'OK',
                                      }
                                    );
                                    hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
                                  } else {
                                    // For iOS, you might need to add location permission in Info.plist
                                    hasPermission = true;
                                  }

                                  if (hasPermission) {
                                    Geolocation.getCurrentPosition(
                                      (position) => {
                                        currentLocation = {
                                          latitude: position.coords.latitude,
                                          longitude: position.coords.longitude,
                                        };
                                      },
                                      (error) => {
                                        console.log('Could not get location for checkout request:', error);
                                      },
                                      {
                                        enableHighAccuracy: true,
                                        timeout: 15000,
                                        maximumAge: 10000,
                                        // showLocationDialog:false — omitting it defaults to
                                        // true, triggering Play Services' native "turn on
                                        // location" dialog, which can throw a non-JS
                                        // (uncatchable) exception. See src/utils/location.ts.
                                        showLocationDialog: false,
                                      }
                                    );
                                  }
                                } catch (locationError) {
                                  console.log('Could not get location for checkout request:', locationError);
                                }

                                const isoDate = row.date.toISOString();
                                const res = await apiService.createCheckoutRequest({
                                  date: isoDate,
                                  details: `Forgot checkout for ${row.date.toDateString()}`,
                                  latitude: currentLocation?.latitude,
                                  longitude: currentLocation?.longitude,
                                });
                                if (!res.success) {
                                  Alert.alert('Checkout Request', res.error || 'Failed to submit request');
                                  return;
                                }
                                
                                // Show different message based on auto-approval
                                const message = res.data?.autoApproved 
                                  ? `Checkout request automatically approved! You were ${res.data.distance}m from office.`
                                  : 'Checkout request submitted for approval';
                                
                                Alert.alert('Checkout Request', message);
                                await handleRefresh();
                              } catch (e: any) {
                                Alert.alert('Checkout Request', e?.message || 'Failed to submit request');
                              }
                            }}
                          >
                            <Text style={styles.linkBtnText}>Forgot Checkout</Text>
                          </TouchableOpacity>
                        );
                      })()}
                      <Text style={styles.tableCell}>
                        {durationStr !== '--' ? ` ${durationStr}` : '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Today Summary */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📅 Today</Text>
            {todayRecords.length === 0 ? (
              <Text style={styles.mutedText}>No records yet today</Text>
            ) : (
              todayRecords.map((rec, idx) => {
                const date = new Date(rec.timestamp);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                const dateStr = date.toLocaleDateString();
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Determine authentication method from authMethod field or fallback to legacy fields
                const authMethod = (rec as any).authMethod ? 
                  (() => {
                    switch((rec as any).authMethod) {
                      case 'face': return '👤 Face';
                      case 'voice': return '🎤 Voice';
                      case 'iris': return '👁️ Iris';
                      case 'thumb': return '👍 Thumb';
                      case 'manual': return '✋ Manual';
                      default: return '❓ Unknown';
                    }
                  })() :
                  // Fallback to legacy fields
                  (rec as any).faceVerified ? '👤 Face' : 
                  (rec as any).voiceVerified ? '🎤 Voice' : 
                  (rec as any).irisVerified ? '👁️ Iris' : 
                  (rec as any).thumbVerified ? '👍 Thumb' : 
                  '👤 Face'; // Default to face

                // Determine verification status - treat as success if any verification is true
                const isVerified = (rec as any).status === 'success' ||
                                 (rec as any).faceVerified || 
                                 (rec as any).voiceVerified || 
                                 (rec as any).irisVerified || 
                                 (rec as any).thumbVerified ||
                                 (rec as any).faceVerification?.verified === true;

                return (
                  <View key={`${rec.id || rec.timestamp}-today-${idx}`} style={styles.historyRowExpanded}>
                    <View style={styles.historyMainRow}>
                      <Text style={styles.historyType}>{rec.type === 'in' ? '📥 IN' : '📤 OUT'}</Text>
                      <View style={styles.historyDateTimeContainer}>
                        <Text style={styles.historyDate}>{dayName}, {dateStr}</Text>
                        <Text style={styles.historyTime}>{timeStr}</Text>
                      </View>
                      <Text style={[styles.verificationStatus, { color: isVerified ? colors.success : colors.error }]}>
                        {isVerified ? '✅' : '❌'}
                      </Text>
                    </View>
                    <View style={styles.historyMetaRow}>
                      <Text style={styles.authMethod}>{authMethod}</Text>
                      {/* Distance removed */}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const Stat: React.FC<{ value: string; label: string; highlight?: 'success' | 'error' }> = ({ value, label, highlight }) => (
  <View style={styles.statBox}>
    <Text
      style={[
        styles.statValue,
        highlight === 'success' && { color: colors.success },
        highlight === 'error' && { color: colors.error },
      ]}
    >
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: colors.textSecondary },
  content: { padding: 20 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 10 },
  infoRow: { flexDirection: 'row', marginBottom: 8 },
  infoLabel: { flex: 1, color: colors.textSecondary },
  infoValue: { flex: 2, color: colors.text, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statBox: { width: '48%', marginBottom: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: colors.primary },
  statLabel: { color: colors.textSecondary, marginTop: 2 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyRowExpanded: { 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: colors.border 
  },
  historyMainRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 6
  },
  historyDateTimeContainer: { 
    flex: 1, 
    alignItems: 'center' 
  },
  historyMetaRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingLeft: 80
  },
  verificationStatus: { 
    fontSize: 16, 
    fontWeight: '600' 
  },
  authMethod: { 
    color: colors.textSecondary, 
    fontSize: 12 
  },
  confidence: { 
    color: colors.textSecondary, 
    fontSize: 12 
  },
  errorText: { 
    color: colors.error, 
    textAlign: 'center', 
    marginVertical: 8 
  },
  historyType: { width: 70, color: colors.text },
  historyDate: { flex: 1, color: colors.textSecondary },
  historyTime: { width: 90, textAlign: 'right', color: colors.text },
  mutedText: { color: colors.textSecondary },
  rowButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.primary },
  linkBtnText: { color: colors.primary, fontWeight: '600' },
  primaryBtn: { backgroundColor: '#0259ca', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  primaryBtnText: { color: 'white', fontWeight: '600' },
  refreshBtn: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  refreshBtnText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  // Table styles for recent attendance
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableCellDate: {
    flex: 1.3,
    color: colors.textSecondary,
  },
  tableCell: {
    flex: 1,
    color: colors.text,
    textAlign: 'right',
  },
  tableHeaderText: {
    color: colors.text,
    fontWeight: '600',
  },
});

export default UserDashboard;


