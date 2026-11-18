import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import {
  CalendarDays,
  CalendarRange,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Eye,
  Fingerprint,
  Hand,
  Inbox,
  LogIn,
  LogOut,
  Mic,
  User,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from './AuthContext';
import { apiService } from './services/api';
import {
  EmptyState,
  Screen,
  SectionHeader,
  SkeletonCard,
  SkeletonRow,
  StatCard,
  StatusBadge,
  useTheme,
} from './components/ui';
import { haptic } from './utils/haptics';

interface AttendanceRecord {
  _id: string;
  type: 'in' | 'out';
  timestamp: string;
  location: {
    latitude: number;
    longitude: number;
    distance: number;
  };
  faceVerification: {
    confidence: number;
    verified: boolean;
  };
  status: string;
  orgId?: {
    name: string;
    officeLocation: {
      latitude: number;
      longitude: number;
      address: string;
    };
  };
}

interface AttendanceStats {
  totalRecords: number;
  presentDays: number;
  absentDays: number;
  averageDistance?: number;
  successRate: number;
  thisWeek: {
    in: number;
    out: number;
    total: number;
  };
  thisMonth: {
    in: number;
    out: number;
    total: number;
  };
}

const AUTH_METHODS: Record<string, { icon: LucideIcon; label: string }> = {
  face: { icon: User, label: 'Face' },
  voice: { icon: Mic, label: 'Voice' },
  iris: { icon: Eye, label: 'Iris' },
  thumb: { icon: Fingerprint, label: 'Thumb' },
  palm: { icon: Hand, label: 'Palm' },
};

export const AttendanceDashboard: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { colors, spacing, radii, typography, shadows } = theme;

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAttendanceData = async (refresh = false) => {
    try {
      setLoadError(null);
      if (refresh) {
        setRefreshing(true);
      }

      if ((user as any)?.role === 'organization') {
        // Organization: fetch all attendance
        const orgResponse = await apiService.getOrganizationAttendance({
          startDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString(),
          endDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).toISOString(),
          limit: 1000
        });
        if (orgResponse.success && orgResponse.data && Array.isArray((orgResponse.data as any).attendance)) {
          setRecords((orgResponse.data as any).attendance);
          // Compute stats for all students
          const totalRecords = orgResponse.data.attendance.length;
          const presentDays = new Set(orgResponse.data.attendance.filter((r: any) => r.type === 'in').map((r: any) => new Date(r.timestamp).toDateString())).size;
          const absentDays = 0; // Optional: compute if you have absence data
          const averageDistance = 0; // hidden / not used
          setStats({
            totalRecords,
            presentDays,
            absentDays,
            averageDistance,
            successRate: 0,
            thisWeek: { in: 0, out: 0, total: 0 },
            thisMonth: { in: 0, out: 0, total: 0 },
          });
        } else {
          setRecords([]);
          setStats(null);
          setLoadError(orgResponse.error || 'Failed to load organization attendance');
        }
      } else {
        // Student: Load attendance history for selected month
        const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString();
        const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
        const historyResponse = await apiService.getAttendanceHistory({
          startDate: monthStart,
          endDate: monthEnd,
          // Server defaults to limit=20 when omitted — a full month easily has
          // 40-60+ records (2/day), so without this the calendar table and
          // recent-records list silently dropped everything past the newest 20
          // and most of the month showed as blank/Absent.
          limit: 1000,
        });

        if (historyResponse.success && historyResponse.data) {
          const payload: any = historyResponse.data as any;
          const historyData = Array.isArray(payload)
            ? payload
            : Array.isArray(payload.attendance)
              ? payload.attendance
              : Array.isArray(payload.data?.attendance)
                ? payload.data.attendance
                : [];
          setRecords(historyData);
        } else {
          setRecords([]);
        }

        // Load attendance statistics
        const statsResponse = await apiService.getAttendanceStats({
          startDate: monthStart,
          endDate: monthEnd,
        });

        if (statsResponse.success && statsResponse.data) {
          const d: any = statsResponse.data as any;
          const base = d.stats ?? d;
          setStats({
            totalRecords: base.totalRecords ?? 0,
            presentDays: base.presentDays ?? 0,
            absentDays: base.absentDays ?? 0,
            averageDistance: base.averageDistance,
            successRate: base.successRate ?? 0,
            thisWeek: base.thisWeek ?? { in: 0, out: 0, total: base.totalRecords ?? 0 },
            thisMonth: base.thisMonth ?? { in: 0, out: 0, total: base.totalRecords ?? 0 },
          });
        }
      }
    } catch (error: any) {
      setLoadError(error?.message || 'Error loading attendance data');
      setRecords([]);
      setStats(null);
      console.error('Error loading attendance data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadAttendanceData(true);
  };

  useEffect(() => {
    loadAttendanceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const openLocationInMaps = (latitude: number, longitude: number) => {
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  const getTodayRecords = () => {
    const today = new Date().toDateString();
    return records.filter(record =>
      new Date(record.timestamp).toDateString() === today
    );
  };

  // Month navigation helpers
  const goPrevMonth = () => {
    haptic('selection');
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() - 1);
    setSelectedDate(d);
  };

  const isCurrentMonth = (d: Date) => {
    const today = new Date();
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  };

  const goNextMonth = () => {
    // Never navigate past the current month — there's no attendance data to
    // show for months that haven't happened yet.
    if (isCurrentMonth(selectedDate)) return;
    haptic('selection');
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() + 1);
    setSelectedDate(d);
  };

  const getMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  };

  type DayStatus = 'present' | 'checkedin' | 'half' | 'absent' | 'leave' | 'weekend' | 'future';

  const getDayStatus = (day: Date): { status: DayStatus; inTimes: string[]; outTimes: string[] } => {
    // Compare based on local date parts to avoid timezone toDateString drift
    const y = day.getFullYear();
    const m = day.getMonth();
    const dnum = day.getDate();
    const dayRecords = records.filter(r => {
      const dt = new Date(r.timestamp);
      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === dnum;
    });
    const inTimes: string[] = [];
    const outTimes: string[] = [];
    let hasLeave = false;
    dayRecords.forEach((r) => {
      const t = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (r.type === 'in') inTimes.push(t);
      if (r.type === 'out') outTimes.push(t);
      if (r.type === 'leave') hasLeave = true;
    });
    // Saturday(6)/Sunday(0) with no actual attendance is a weekend, not an
    // absence — showing up always wins (checked below first), matching the
    // same "present overrides weekend" rule used elsewhere in the app
    // (server/routes/attendance.js's /calendar endpoint).
    const dow = day.getDay();
    const isWeekend = dow === 0 || dow === 6;

    // A day that hasn't happened yet is neither present nor absent — it just
    // hasn't occurred, so it must never render as a red "Absent". This table
    // renders the WHOLE calendar month (getMonthDays), including days still
    // ahead of today, and previously judged every one of them with no
    // records as "Absent" regardless of date — the exact same gap the
    // server's /calendar endpoint and CalendarReportScreen.tsx already guard
    // against with their own 'future' status.
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const isFuture = day.getTime() > todayEnd.getTime();

    let status: DayStatus = isFuture ? 'future' : isWeekend ? 'weekend' : 'absent';
    if (hasLeave) {
      status = 'leave';
    } else if (inTimes.length > 0 && outTimes.length > 0) {
      status = 'present';
    } else if (inTimes.length > 0 && outTimes.length === 0) {
      status = 'checkedin';
    } else if (outTimes.length > 0 && inTimes.length === 0) {
      status = 'half';
    }
    return { status, inTimes, outTimes };
  };

  const todayRecords = getTodayRecords();
  const monthDays = getMonthDays(selectedDate);

  const dayStatusColor: Record<DayStatus, string> = {
    present: colors.success,
    checkedin: colors.brand,
    half: colors.warning,
    absent: colors.danger,
    leave: '#8B5CF6',
    weekend: colors.textMuted,
    future: colors.textMuted,
  };

  const renderRecordCard = (record: AttendanceRecord, index: number) => {
    const date = new Date(record.timestamp);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (record.type === 'leave') {
      return (
        <Animated.View
          key={record._id || record.timestamp || String(index)}
          entering={FadeInDown.duration(300)
            .delay(Math.min(index, 8) * 50)
            .reduceMotion(ReduceMotion.System)}
          style={[
            shadows.e2,
            styles.recordCard,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              borderColor: colors.border,
              padding: spacing.lg,
              borderLeftWidth: 4,
              borderLeftColor: '#8B5CF6',
            },
          ]}
          accessible
          accessibilityLabel={`On Leave, ${dayName}`}
        >
          <View style={[styles.recordHeader, { marginBottom: spacing.sm }]}>
            <CalendarDays
              size={20}
              color="#8B5CF6"
              strokeWidth={2.25}
            />
            <Text style={[typography.bodyBold, styles.recordType, { color: '#8B5CF6', marginLeft: spacing.sm }]}>
              LEAVE
            </Text>
            <StatusBadge status="verified" text="Approved" size="small" />
          </View>
          <Text style={[typography.h3, { color: '#8B5CF6', marginBottom: spacing.sm }]}>On Leave</Text>
          <View style={[styles.metaRow, { marginBottom: spacing.xs }]}>
            <CalendarDays size={14} color={colors.textMuted} strokeWidth={2} />
            <Text style={[typography.small, { color: colors.textMuted, marginLeft: spacing.xs }]}>{dayName}</Text>
          </View>
          <View style={styles.metaRow}>
            <ClipboardList size={14} color={colors.textMuted} strokeWidth={2} />
            <Text style={[typography.small, { color: colors.textMuted, marginLeft: spacing.xs }]}>Academic Leave</Text>
          </View>
        </Animated.View>
      );
    }

    // Determine authentication method
    const method = AUTH_METHODS[(record as any).authMethod as string] ??
      ((record as any).authMethod ? { icon: CircleHelp, label: 'Unknown' } : AUTH_METHODS.face);
    const MethodIcon = method.icon;
    const TypeIcon = record.type === 'in' ? LogIn : LogOut;

    // Determine verification status
    const isVerified = (record as any).status === 'success' ||
                       (record as any).faceVerification?.verified === true;

    return (
      <Animated.View
        key={record._id || record.timestamp || String(index)}
        entering={FadeInDown.duration(300)
          .delay(Math.min(index, 8) * 50)
          .reduceMotion(ReduceMotion.System)}
        style={[
          shadows.e2,
          styles.recordCard,
          { backgroundColor: colors.surface, borderRadius: radii.md, borderColor: colors.border, padding: spacing.lg },
        ]}
        accessible
        accessibilityLabel={`${record.type === 'in' ? 'Check in' : 'Check out'} at ${timeStr}, ${dayName}, ${method.label} authentication, ${isVerified ? 'verified' : 'failed'}`}
      >
        <View style={[styles.recordHeader, { marginBottom: spacing.sm }]}>
          <TypeIcon
            size={20}
            color={record.type === 'in' ? colors.success : colors.brand}
            strokeWidth={2.25}
          />
          <Text style={[typography.bodyBold, styles.recordType, { color: colors.text, marginLeft: spacing.sm }]}>
            {record?.type?.toUpperCase()}
          </Text>
          <StatusBadge status={isVerified ? 'verified' : 'failed'} size="small" />
        </View>
        <Text style={[typography.h3, { color: colors.brand, marginBottom: spacing.sm }]}>{timeStr}</Text>
        <View style={[styles.metaRow, { marginBottom: spacing.xs }]}>
          <CalendarDays size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={[typography.small, { color: colors.textMuted, marginLeft: spacing.xs }]}>{dayName}</Text>
        </View>
        <View style={styles.metaRow}>
          <MethodIcon size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={[typography.small, { color: colors.textMuted, marginLeft: spacing.xs }]}>{method.label}</Text>
        </View>
      </Animated.View>
    );
  };

  const monthChip = (label: string, onPress: () => void, accessibilityLabel: string) => (
    <Pressable
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.border,
          borderRadius: radii.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[typography.small, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <Screen testID="attendance-dashboard-loading" edges={['left', 'right']}>
        <SkeletonRow lines={2} lastLineWidth="60%" style={{ marginBottom: spacing.xl }} />
        <SkeletonCard lines={2} style={{ marginBottom: spacing.lg }} />
        <SkeletonCard lines={3} style={{ marginBottom: spacing.lg }} />
        <SkeletonCard lines={4} />
        {loadError ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.body, { color: colors.danger, marginTop: spacing.lg }]}
          >
            {loadError}
          </Text>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false} refreshing={refreshing} onRefresh={onRefresh} testID="attendance-dashboard" edges={['left', 'right']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            padding: spacing.md,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[typography.h1, { color: colors.text, marginBottom: spacing.xs }]} accessibilityRole="header">
          Attendance Dashboard
        </Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {user?.role === 'student' ? 'Your attendance overview' : 'Organization attendance overview'}
        </Text>

        <View style={styles.monthNavBox}>
          <Pressable
            onPress={goPrevMonth}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
                borderRadius: radii.md,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <ChevronLeft size={20} color={colors.text} strokeWidth={2.25} />
          </Pressable>

          <Text style={[typography.title, styles.monthTitleText]} accessibilityLiveRegion="polite">
            {selectedDate.toLocaleString('default', { month: 'long' })} {selectedDate.getFullYear()}
          </Text>

          <Pressable
            onPress={goNextMonth}
            disabled={isCurrentMonth(selectedDate)}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: isCurrentMonth(selectedDate) }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
                borderRadius: radii.md,
                opacity: isCurrentMonth(selectedDate) ? 0.35 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <ChevronRight size={20} color={colors.text} strokeWidth={2.25} />
          </Pressable>
        </View>
      </View>

      {/* Statistics Cards */}
      {stats && (
        <View style={{ marginTop: spacing.md }}>
          <SectionHeader title="Monthly Statistics" icon={ChartColumn} />
          <View style={[styles.statsGrid, { paddingHorizontal: spacing.lg }]}>
            <View style={[styles.statsCol, { marginRight: spacing.sm }]}>
              <StatCard title="Records" value={stats.totalRecords} subtitle="Total" enteringIndex={0} />
            </View>
            <View style={[styles.statsCol, { marginHorizontal: spacing.xs }]}>
              <StatCard
                title="Present"
                value={stats.presentDays}
                subtitle="Days"
                accentColor={colors.success}
                enteringIndex={1}
              />
            </View>
            <View style={[styles.statsCol, { marginLeft: spacing.sm }]}>
              <StatCard
                title="Absent"
                value={stats.absentDays}
                subtitle="Days"
                accentColor={colors.danger}
                enteringIndex={2}
              />
            </View>
          </View>

          {/* "This Week" only makes sense while viewing the current month — a
              past/future month has no "this week" of its own. */}
          {isCurrentMonth(selectedDate) && (
            <Animated.View
              entering={FadeInDown.duration(300).delay(150).reduceMotion(ReduceMotion.System)}
              style={[
                shadows.e2,
                styles.weeklyCard,
                {
                  marginHorizontal: spacing.lg,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radii.md,
                  padding: spacing.lg,
                },
              ]}
            >
              <View style={[styles.metaRow, { marginBottom: spacing.md }]}>
                <CalendarDays size={16} color={colors.brand} strokeWidth={2.25} style={{ flexShrink: 0 }} />
                <Text
                  numberOfLines={1}
                  style={[styles.weeklyCardTitle, typography.bodyBold, { color: colors.text, marginLeft: spacing.sm }]}
                >
                  This Week
                </Text>
              </View>
              <View style={styles.weeklyGrid}>
                <View style={styles.weeklyItem}>
                  <Text style={[typography.h3, { color: colors.brand, marginBottom: spacing.xs }]}>
                    {stats.thisWeek.in}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>Check-ins</Text>
                </View>
                <View style={styles.weeklyItem}>
                  <Text style={[typography.h3, { color: colors.brand, marginBottom: spacing.xs }]}>
                    {stats.thisWeek.out}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>Check-outs</Text>
                </View>
                <View style={styles.weeklyItem}>
                  <Text style={[typography.h3, { color: colors.brand, marginBottom: spacing.xs }]}>
                    {stats.thisWeek.total}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>Total</Text>
                </View>
              </View>
            </Animated.View>
          )}
        </View>
      )}

      {/* Today's Summary — shown ONLY when viewing the current month */}
      {selectedDate.getMonth() === new Date().getMonth() &&
      selectedDate.getFullYear() === new Date().getFullYear() ? (
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title="Today's Summary" icon={CalendarDays} />
          {todayRecords.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No records today"
              message="Your check-ins and check-outs for today will appear here."
            />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {todayRecords.map((record, index) => renderRecordCard(record, index))}
            </View>
          )}
        </View>
      ) : null}

      {/* Monthly Detailed Report */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Monthly Detailed Report" icon={CalendarRange} />
        <View
          style={[
            styles.table,
            {
              marginHorizontal: spacing.lg,
              borderColor: colors.border,
              borderRadius: radii.md,
            },
          ]}
        >
          <View style={[styles.dayRow, { backgroundColor: colors.surfaceAlt, borderTopColor: colors.border }]}>
            <Text style={[typography.label, styles.dayCell, { color: colors.text }]}>Date</Text>
            <Text style={[typography.label, styles.dayCell, { color: colors.text }]}>Day</Text>
            <Text style={[typography.label, styles.dayCell, { color: colors.text }]}>Status</Text>
            <Text style={[typography.label, styles.dayCell, { color: colors.text }]}>In</Text>
            <Text style={[typography.label, styles.dayCell, { color: colors.text }]}>Out</Text>
          </View>
          {monthDays.map((d) => {
            const { status, inTimes, outTimes } = getDayStatus(d);
            const statusText =
              status === 'present'
                ? 'Present'
                : status === 'checkedin'
                  ? 'Checked-in'
                  : status === 'half'
                    ? 'Half Day'
                    : status === 'leave'
                      ? 'On Leave'
                      : status === 'weekend'
                        ? 'Weekend'
                        : status === 'future'
                          ? '—'
                          : 'Absent';
            return (
              <View
                key={d.toISOString()}
                style={[styles.dayRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
              >
                <Text style={[typography.small, styles.dayCell, { color: colors.text }]}>{d.getDate()}</Text>
                <Text style={[typography.small, styles.dayCell, { color: colors.text }]}>
                  {d.toLocaleString('default', { weekday: 'short' })}
                </Text>
                <Text style={[typography.small, styles.dayCell, styles.statusCell, { color: dayStatusColor[status] }]}>
                  {statusText}
                </Text>
                <Text style={[typography.small, styles.dayCell, { color: colors.text }]}>
                  {inTimes.join(', ') || '-'}
                </Text>
                <Text style={[typography.small, styles.dayCell, { color: colors.text }]}>
                  {outTimes.join(', ') || '-'}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Recent Records */}
      <View style={{ marginTop: spacing.xl, marginBottom: spacing.xxl }}>
        <SectionHeader title="Recent Records" icon={ClipboardList} />
        {records.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No attendance records"
            message="Records for the selected month will appear here."
          />
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {records.slice(0, 10).map((record, index) => renderRecordCard(record, index))}
          </View>
        )}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
  },
  monthNavBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },
  monthTitleText: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  chip: {
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
  },
  statsCol: {
    flex: 1,
  },
  weeklyCard: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  weeklyCardTitle: {
    flexShrink: 1,
  },
  weeklyGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weeklyItem: {
    alignItems: 'center',
  },
  recordCard: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordType: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  table: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  dayCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  statusCell: {
    fontWeight: '600',
  },
});
