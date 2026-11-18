import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { apiService, type Attendance } from './services/api';
import { Screen, SkeletonCard, SkeletonRow, useTheme } from './components/ui';
import { BentoDashboard } from './components/BentoDashboard';
import type { SchedEvent } from './components/BentoDashboard';
import { MeshBackdrop } from './components/MeshBackdrop';
import { loadDayEvents, toISO } from './utils/scheduleEvents';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergedTodayRecords } from './services/offlineAttendance';

type AttendanceStats = {
  totalRecords: number;
  presentDays: number;
  absentDays: number;
  averageDistance?: number;
};

type LeaveInfo = { remaining: number; quota: number; used: number; medicalRemaining?: number };
type Holiday = { date: string; name: string };

// Best-effort unwrap of a settled promise to its value (or null on reject).
const settled = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);


export const UserDashboardNew: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [todayStatus, setTodayStatus] = useState<'IN' | 'OUT' | 'ABSENT' | 'HOLIDAY'>('OUT');
  const [todayShifts, setTodayShifts] = useState<any[]>([]);
  const [leave, setLeave] = useState<LeaveInfo | null>(null);
  const [events, setEvents] = useState<SchedEvent[]>([]);
  const [nextHoliday, setNextHoliday] = useState<Holiday | null>(null);

  // Secondary "insight" data (leave / today's schedule / next holiday). Loaded
  // AFTER the core so the dashboard paints fast; each card fills in when ready
  // and degrades to an empty/placeholder state on failure.
  const loadInsights = useCallback(async () => {
    const [leaveR, eventsR, holidaysR] = await Promise.allSettled([
      apiService.getLeaveBalance(),
      loadDayEvents(toISO(new Date())),
      apiService.getHolidays(),
    ]);

    const leaveRes: any = settled(leaveR);
    if (leaveRes?.success && leaveRes.data) {
      const l = leaveRes.data;
      setLeave({
        remaining: l.combinedLeaveBalance ?? 0,
        quota: l.totalLeavesEarned ?? 0,
        used: l.totalLeavesUsed ?? 0,
        medicalRemaining: Math.max(0, (l.medicalQuota ?? 0) - (l.medicalUsed ?? 0)),
      });
    }

    const eventsRes = settled(eventsR);
    if (eventsRes?.events) setEvents(eventsRes.events);

    const holidaysRes: any = settled(holidaysR);
    if (holidaysRes?.success && Array.isArray(holidaysRes.data)) {
      const todayStr = toISO(new Date());
      const upcoming = holidaysRes.data
        .filter((h: any) => typeof h.date === 'string' && h.date >= todayStr)
        .sort((a: any, b: any) => a.date.localeCompare(b.date));
      if (upcoming[0]) {
        setNextHoliday({ date: upcoming[0].date, name: upcoming[0].name || upcoming[0].title || 'Holiday' });
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      // Load profile (cached → instant).
      const stored = await AsyncStorage.getItem('studentData');
      if (stored) {
        setProfile(JSON.parse(stored));
      } else if (user) {
        setProfile({ name: user.name, email: user.email, uid: user.id });
      }

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      // ~6 weeks of history is plenty for the 14-day trend + streak (was 13wk;
      // the heatmap that needed the long window is gone) — smaller, faster fetch.
      const histStart = new Date(now);
      histStart.setDate(histStart.getDate() - 45);

      // ── Core: drives the headline + month cards. Render as soon as this is in. ──
      const [statsR, historyR, shiftsR] = await Promise.allSettled([
        apiService.getAttendanceStats({ startDate: start, endDate: end }),
        apiService.getAttendanceHistory({ startDate: histStart.toISOString(), endDate: end, limit: 150, page: 1 }),
        apiService.getApplicableShifts?.() ?? Promise.resolve({ success: false }),
      ]);

      const statsRes: any = settled(statsR);
      if (statsRes?.success && statsRes.data) {
        const d: any = statsRes.data;
        setStats((d.stats ?? d) as AttendanceStats);
      }

      const historyRes: any = settled(historyR);
      if (historyRes?.success && historyRes.data) {
        const payload: any = historyRes.data;
        const list: Attendance[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.attendance)
            ? payload.attendance
            : Array.isArray(payload.data?.attendance)
              ? payload.data.attendance
              : [];
        setHistory(list);

        // Merge in any check-in/out still waiting to sync (offline queue) —
        // without this, a mark made while offline shows correctly on the
        // Attendance screen (which does merge) but wrongly as "Absent" here
        // until the queue flushes to the server.
        const merged = await mergedTodayRecords(list);
        const today = new Date().toDateString();
        const todayRecords = merged.filter((r) => new Date(r.timestamp).toDateString() === today);
        if (todayRecords.length === 0) {
          setTodayStatus('ABSENT');
        } else if (todayRecords.some((r) => r.type === 'in')) {
          setTodayStatus('IN');
        } else {
          setTodayStatus('OUT');
        }
      }

      const shiftsRes: any = settled(shiftsR);
      if (shiftsRes?.success && shiftsRes.data) {
        setTodayShifts(Array.isArray(shiftsRes.data) ? shiftsRes.data : []);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      // Paint now — don't wait on the slower insight calls.
      setLoading(false);
      setRefreshing(false);
    }

    // Fire-and-forget; the cards above are already on screen.
    loadInsights().catch((e) => console.warn('Failed to load dashboard insights:', e));
  }, [user, loadInsights]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
  }, [loadData]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const statusColor = useMemo(() => {
    if (todayStatus === 'IN') return colors.success;
    if (todayStatus === 'OUT') return colors.danger;
    return colors.warning;
  }, [todayStatus, colors]);

  // Shift window for the "Today" card. Shift shape is opaque, so pick fields
  // defensively and omit the line entirely if nothing usable is present.
  const shiftLabel = useMemo(() => {
    const s: any = todayShifts?.[0];
    if (!s) return undefined;
    const nm = s.name || s.shiftName || s.title;
    const st = s.startTime || s.start || s.from;
    const en = s.endTime || s.end || s.to;
    const time = st && en ? `${st}–${en}` : st || '';
    return [nm, time].filter(Boolean).join(' · ') || undefined;
  }, [todayShifts]);

  if (loading) {
    return (
      <Screen testID="dashboard-loading">
        <SkeletonRow lines={2} lastLineWidth="50%" style={{ marginBottom: spacing.xl }} />
        <View style={styles.skeletonGrid}>
          <SkeletonCard lines={2} style={{ flex: 1, marginRight: spacing.sm }} />
          <SkeletonCard lines={2} style={{ flex: 1, marginLeft: spacing.sm }} />
        </View>
        <SkeletonCard lines={3} style={{ marginTop: spacing.lg }} />
        <SkeletonCard lines={4} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <MeshBackdrop />
      <Screen
        scroll
        padded={false}
        edges={['left', 'right']}
        refreshing={refreshing}
        onRefresh={onRefresh}
        style={styles.transparent}
        testID="dashboard-screen"
      >
        <BentoDashboard
          insetsTop={insets.top}
          name={(profile as any)?.name ?? 'Student'}
          greeting={greeting}
          todayStatus={todayStatus}
          statusColor={statusColor}
          statusTime={
            todayStatus === 'IN' && history[0]
              ? new Date(history[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : undefined
          }
          shiftLabel={shiftLabel}
          present={stats?.presentDays ?? 0}
          absent={stats?.absentDays ?? 0}
          total={stats?.totalRecords ?? 0}
          records={history}
          leave={leave}
          events={events}
          nextHoliday={nextHoliday}
          onLogout={() => logout()}
          onNavigate={(route) => navigation.navigate(route as never)}
        />
      </Screen>
    </View>
  );

};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  skeletonGrid: {
    flexDirection: 'row',
  },
});
