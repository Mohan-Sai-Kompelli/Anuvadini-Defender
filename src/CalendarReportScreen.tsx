import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  SafeAreaView,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Rect, Stop } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check, X, PartyPopper, Plane, Coffee, TrendingUp, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react-native';
import { Theme } from './theme';
import { apiService } from './services/api';
import { useTabBarScrollHandler } from './components/ui/tabBarScroll';

/* ───────── types ───────── */
type DayStatus =
  | 'present'
  | 'absent'
  | 'holiday'
  | 'leave'
  | 'wfh'
  | 'weekend'
  | 'today'
  | 'future';

interface DayCell {
  date: string;
  day: number;
  dayName: string;
  weekday: number; // 0 = Sun
  isWeekend: boolean;
  isFuture: boolean;
  isToday: boolean;
  status: DayStatus;
  label: string;
  holidayName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  hours: number | null;
  records: { type: string; time: string; method: string }[];
}

interface Summary {
  present: number;
  absent: number;
  holidays: number;
  leaves: number;
  wfh: number;
  weekends: number;
  workingDays: number;
  totalDays: number;
  attendanceRate: number;
}

/* ───────── status → colour map (matches the aurora dashboard palette) ───────── */
const STATUS = {
  present: { c: '#16A34A', bg: 'rgba(22,163,74,0.12)', label: 'Present' },
  absent: { c: '#EF4444', bg: 'rgba(239,68,68,0.12)', label: 'Absent' },
  holiday: { c: '#F59E0B', bg: 'rgba(245,158,11,0.14)', label: 'Holiday' },
  leave: { c: '#8B5CF6', bg: 'rgba(139,92,246,0.14)', label: 'Leave' },
  wfh: { c: '#2563EB', bg: 'rgba(37,99,235,0.12)', label: 'WFH' },
  weekend: { c: '#94A3B8', bg: 'rgba(148,163,184,0.10)', label: 'Weekend' },
  today: { c: '#6366F1', bg: 'rgba(99,102,241,0.12)', label: 'Today' },
  future: { c: '#CBD5E1', bg: 'transparent', label: '' },
} as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthLabel = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const SCREEN_W = Dimensions.get('window').width;
const HERO_W = SCREEN_W - Theme.spacing.md * 2;
const HERO_H = 132;

/* stat tiles meta — icon + colour per metric. `status` links a tile to the
   matching day rows in the day-by-day log, so tapping the tile can filter +
   scroll straight to that stat's actual days. */
const STAT_META: { key: string; label: string; color: string; Icon: any; status?: DayStatus; isTotal?: boolean }[] = [
  { key: 'total', label: 'Total', color: '#6366F1', Icon: CalendarIcon, isTotal: true },
  { key: 'present', label: 'Present', color: STATUS.present.c, Icon: Check, status: 'present' },
  { key: 'absent', label: 'Absent', color: STATUS.absent.c, Icon: X, status: 'absent' },
  { key: 'weekends', label: 'Weekends', color: STATUS.weekend.c, Icon: Coffee, status: 'weekend' },
  { key: 'leaves', label: 'Leave', color: STATUS.leave.c, Icon: Plane, status: 'leave' },
  { key: 'holidays', label: 'Holidays', color: STATUS.holiday.c, Icon: PartyPopper, status: 'holiday' },
];

/* ───────── gradient hero with attendance ring ───────── */
const RateHero: React.FC<{ rate: number; present: number; absent: number; workingDays: number }> = ({
  rate,
  present,
  absent,
  workingDays,
}) => {
  const ring = 84;
  const stroke = 9;
  const r = (ring - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, rate)) / 100) * circ;
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.heroCard}>
      <Svg width={HERO_W} height={HERO_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGrad id="calHero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#A855F7" />
            <Stop offset="0.5" stopColor="#6366F1" />
            <Stop offset="1" stopColor="#22D3EE" />
          </SvgGrad>
        </Defs>
        <Rect x={0} y={0} width={HERO_W} height={HERO_H} rx={24} fill="url(#calHero)" />
        <Circle cx={HERO_W * 0.84} cy={8} r={64} fill="rgba(255,255,255,0.12)" />
        <Circle cx={HERO_W * 0.12} cy={HERO_H} r={46} fill="rgba(255,255,255,0.1)" />
      </Svg>
      <View style={styles.heroRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroValue}>{rate}%</Text>
          <Text style={styles.heroLabel}>Attendance this month</Text>
          <Text style={styles.heroSub}>
            {present} present · {absent} absent · {workingDays} working days
          </Text>
        </View>
        <View style={styles.ringWrap}>
          <Svg width={ring} height={ring}>
            <Circle cx={ring / 2} cy={ring / 2} r={r} stroke="rgba(255,255,255,0.28)" strokeWidth={stroke} fill="none" />
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={r}
              stroke="#fff"
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <TrendingUp size={20} color="#fff" strokeWidth={2.6} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

export const CalendarReportScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [days, setDays] = useState<DayCell[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthName, setMonthName] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchingMonth, setFetchingMonth] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DayCell | null>(null);
  // Tap-a-stat → scroll-to-its-days. `statusFilter` narrows the day-by-day log
  // to the tapped metric (Present/Absent/Holiday/Leave/Weekend); tapping the
  // same tile again clears it. `logY` is the log section's scroll offset,
  // captured via onLayout, so we can animate straight to it.
  const [statusFilter, setStatusFilter] = useState<DayStatus | null>(null);
  const scrollRef = React.useRef<ScrollView>(null);
  const logYRef = React.useRef(0);
  const onScroll = useTabBarScrollHandler();

  const focusStat = useCallback((status: DayStatus) => {
    setStatusFilter((prev) => {
      const next = prev === status ? null : status;
      // Scroll to the day-by-day log so the tapped stat's actual days are in
      // view. rAF lets the filtered list lay out first so the offset is right.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, logYRef.current - 12), animated: true });
      });
      return next;
    });
  }, []);

  const cacheRef = React.useRef<Map<string, { days: DayCell[]; summary: Summary; monthName: string }>>(new Map());

  const load = useCallback(async (isInitial = false, forceRefresh = false) => {
    const month = cursor.getMonth() + 1;
    const year = cursor.getFullYear();
    const key = `${year}-${month}`;

    setError(null);

    // Instant cache hit if previously visited
    const cached = cacheRef.current.get(key);
    if (cached) {
      setDays(cached.days);
      setSummary(cached.summary);
      setMonthName(cached.monthName);
      setLoading(false);
      setRefreshing(false);
    } else {
      if (isInitial || days.length === 0) {
        setLoading(true);
      } else {
        setFetchingMonth(true);
      }
    }

    try {
      const res = await apiService.getMonthlyCalendar(month, year, forceRefresh);
      if (res.success && res.data && (res.data as any).days) {
        const d = res.data as any;
        const freshDays = d.days || [];
        const freshSummary = d.summary || null;
        const freshMonthName = d.monthName || monthLabel(cursor);

        setDays(freshDays);
        setSummary(freshSummary);
        setMonthName(freshMonthName);

        cacheRef.current.set(key, {
          days: freshDays,
          summary: freshSummary,
          monthName: freshMonthName,
        });
      } else if (!cached) {
        setDays([]);
        setSummary(null);
        setError((res as any).error || 'Could not load your calendar.');
      }
    } catch (e: any) {
      if (!cached) {
        setError(e?.message || 'Could not load your calendar.');
      }
    } finally {
      setLoading(false);
      setFetchingMonth(false);
      setRefreshing(false);
    }
  }, [cursor, days.length]);

  useEffect(() => {
    load(days.length === 0);
  }, [cursor]);

  const onRefresh = () => {
    const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
    cacheRef.current.delete(key);
    setRefreshing(true);
    load(false, true);
  };

  const goPrev = () => {
    const prevDate = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    setMonthName(monthLabel(prevDate));
    setCursor(prevDate);
  };

  const goNext = () => {
    const nextDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    setMonthName(monthLabel(nextDate));
    setCursor(nextDate);
  };

  const isCurrentMonth =
    cursor.getMonth() === new Date().getMonth() && cursor.getFullYear() === new Date().getFullYear();

  // Leading blanks so day 1 lands under its weekday column.
  const leadingBlanks = days.length ? days[0].weekday : 0;

  const weeks = React.useMemo(() => {
    const cells: (DayCell | null)[] = [
      ...Array.from({ length: leadingBlanks }, () => null),
      ...days,
    ];
    const rows: (DayCell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const row = cells.slice(i, i + 7);
      while (row.length < 7) row.push(null);
      rows.push(row);
    }
    return rows;
  }, [days, leadingBlanks]);

  // Rows for the day-by-day log. Default view hides bare weekends (unless there
  // was a check-in); a tapped stat filters to exactly that status.
  const logDays = React.useMemo(() => {
    const past = days.filter((d) => !d.isFuture);
    if (statusFilter) return past.filter((d) => d.status === statusFilter);
    return past.filter((d) => d.status !== 'weekend' || d.checkIn);
  }, [days, statusFilter]);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top + 6, 16) }]}>
      <Animated.ScrollView
        ref={scrollRef as any}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Theme.colors.primary} />
            <Text style={styles.loadingText}>Loading your report…</Text>
          </View>
        ) : (
          <>
            {/* Summary cards */}
            {summary && (
              <View style={styles.summaryWrap}>
                <RateHero
                  rate={summary.attendanceRate}
                  present={summary.present}
                  absent={summary.absent}
                  workingDays={summary.workingDays}
                />
                <View style={styles.statGrid}>
                  {STAT_META.map((m, i) => {
                    const count = m.isTotal
                      ? (summary.present ?? 0) + (summary.absent ?? 0) + (summary.leaves ?? 0)
                      : ((summary[m.key as keyof Summary] as number) ?? 0);
                    return (
                      <StatChip
                        key={m.key}
                        n={count}
                        label={m.label}
                        color={m.color}
                        Icon={m.Icon}
                        delay={80 + i * 45}
                        active={m.status ? statusFilter === m.status : statusFilter === null}
                        onPress={() => (m.status ? focusStat(m.status) : focusStat(null))}
                      />
                    );
                  })}
                </View>
              </View>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={onRefresh} style={styles.retryBtn}>
                  <Text style={styles.retryTxt}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Month Navigation Bar (Placed down right above Calendar Grid) */}
            <View style={styles.monthNavCard}>
              <TouchableOpacity
                onPress={goPrev}
                style={styles.navButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <ChevronLeft size={22} color={Theme.colors.primary} strokeWidth={2.5} />
              </TouchableOpacity>

              <View style={styles.monthTitleWrap}>
                {fetchingMonth ? (
                  <ActivityIndicator size="small" color={Theme.colors.primary} style={{ marginRight: 8 }} />
                ) : (
                  <CalendarIcon size={18} color={Theme.colors.primary} style={{ marginRight: 8 }} />
                )}
                <Text style={styles.monthTitle}>{monthName || monthLabel(cursor)}</Text>
              </View>

              <TouchableOpacity
                onPress={goNext}
                style={[styles.navButton, isCurrentMonth && styles.navButtonDisabled]}
                disabled={isCurrentMonth}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <ChevronRight
                  size={22}
                  color={isCurrentMonth ? '#CBD5E1' : Theme.colors.primary}
                  strokeWidth={2.5}
                />
              </TouchableOpacity>
            </View>

            {/* Calendar grid */}
            <View style={[styles.calendarCard, fetchingMonth && { opacity: 0.55 }]}>
              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((w) => (
                  <Text key={w} style={styles.weekdayText}>
                    {w}
                  </Text>
                ))}
              </View>
              <View>
                {weeks.map((week, wi) => (
                  <View key={`w${wi}`} style={styles.weekRow}>
                    {week.map((d, di) =>
                      d ? (
                        (() => {
                          const s = STATUS[d.status] || STATUS.future;
                          return (
                            <TouchableOpacity
                              key={d.date}
                              style={[
                                styles.cell,
                                { backgroundColor: s.bg },
                                d.isToday && styles.cellToday,
                              ]}
                              onPress={() => setSelected(d)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.cellDay, { color: d.isFuture ? '#CBD5E1' : Theme.colors.text }]}>
                                {d.day}
                              </Text>
                              {d.checkIn ? (
                                <Text style={styles.cellTime}>{d.checkIn}</Text>
                              ) : (
                                <View style={[styles.cellDot, { backgroundColor: s.c }]} />
                              )}
                            </TouchableOpacity>
                          );
                        })()
                      ) : (
                        <View key={`w${wi}b${di}`} style={styles.cell} />
                      )
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              {(['present', 'absent', 'holiday', 'leave', 'weekend'] as DayStatus[]).map((k) => (
                <View key={k} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: STATUS[k].c }]} />
                  <Text style={styles.legendText}>{STATUS[k].label}</Text>
                </View>
              ))}
            </View>

            {/* Day-by-day list (the detailed log) */}
            <View
              onLayout={(e) => {
                logYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionTitle}>Day-by-day log</Text>
            </View>

            {statusFilter ? (
              <View style={styles.filterBar}>
                <View style={[styles.filterPill, { backgroundColor: (STATUS[statusFilter] || STATUS.future).c + '18' }]}>
                  <View style={[styles.legendDot, { backgroundColor: (STATUS[statusFilter] || STATUS.future).c }]} />
                  <Text style={[styles.filterPillTxt, { color: (STATUS[statusFilter] || STATUS.future).c }]}>
                    {(STATUS[statusFilter] || STATUS.future).label} · {logDays.length}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setStatusFilter(null)} hitSlop={8} style={styles.filterClear}>
                  <Text style={styles.filterClearTxt}>Show all</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {logDays
              .map((d) => {
                const s = STATUS[d.status] || STATUS.future;
                return (
                  <TouchableOpacity key={d.date} style={styles.logRow} onPress={() => setSelected(d)} activeOpacity={0.7}>
                    <View style={[styles.logDateBox, { backgroundColor: s.bg }]}>
                      <Text style={[styles.logDay, { color: s.c }]}>{d.day}</Text>
                      <Text style={styles.logDow}>{d.dayName}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logLabel}>{d.label || s.label}</Text>
                      {d.checkIn || d.checkOut ? (
                        <Text style={styles.logTimes}>
                          {d.checkIn ? `In ${d.checkIn}` : 'In —'}
                          {'   '}
                          {d.checkOut ? `Out ${d.checkOut}` : 'Out —'}
                          {d.hours != null ? `   ·   ${d.hours}h` : ''}
                        </Text>
                      ) : (
                        <Text style={styles.logTimesMuted}>No attendance recorded</Text>
                      )}
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: s.c }]}>
                      <Text style={styles.statusPillTxt}>{s.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            {logDays.length === 0 && !error ? (
              <Text style={styles.emptyText}>
                {statusFilter
                  ? `No ${(STATUS[statusFilter] || STATUS.future).label.toLowerCase()} days this month.`
                  : 'No records for this month yet.'}
              </Text>
            ) : null}
          </>
        )}
      </Animated.ScrollView>

      {/* Day detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelected(null)}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            {selected && (
              <>
                <Text style={styles.modalTitle}>
                  {new Date(selected.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
                <View
                  style={[
                    styles.modalStatusPill,
                    { backgroundColor: (STATUS[selected.status] || STATUS.future).c },
                  ]}
                >
                  <Text style={styles.modalStatusTxt}>{selected.label || (STATUS[selected.status] || STATUS.future).label}</Text>
                </View>

                {selected.holidayName ? (
                  <Row label="Holiday" value={selected.holidayName} />
                ) : null}
                {selected.checkIn ? <Row label="Check in" value={selected.checkIn} /> : null}
                {selected.checkOut ? <Row label="Check out" value={selected.checkOut} /> : null}
                {selected.hours != null ? <Row label="Hours" value={`${selected.hours} hours`} /> : null}

                {selected.records.length > 0 ? (
                  <>
                    <Text style={styles.modalSub}>All punches</Text>
                    {selected.records.map((r, i) => (
                      <View key={i} style={styles.punchRow}>
                        <Text style={styles.punchType}>{r.type === 'in' ? 'Check in' : r.type === 'out' ? 'Check out' : r.type}</Text>
                        <Text style={styles.punchTime}>{r.time}</Text>
                        <Text style={styles.punchMethod}>{r.method}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={styles.modalMuted}>No check-in or check-out on this day.</Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const StatChip: React.FC<{
  n: number;
  label: string;
  color: string;
  Icon: any;
  delay: number;
  active?: boolean;
  onPress?: () => void;
}> = ({ n, label, color, Icon, delay, active, onPress }) => (
  <Animated.View entering={FadeInDown.delay(delay).duration(340)} style={styles.statChipWrap}>
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${n}. Tap to view these days.`}
      style={[
        styles.statChip,
        active && {
          borderColor: color,
          borderWidth: 2,
        },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Icon size={16} color={color} strokeWidth={2.5} />
      </View>
      <Text style={[styles.statNum, { color }]}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  </Animated.View>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

export default CalendarReportScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.background },
  center: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...Theme.typography.bodyText, marginTop: Theme.spacing.md, color: Theme.colors.textSecondary },

  monthNavCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
    backgroundColor: Theme.colors.white,
    borderRadius: 16,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 10,
    ...Theme.shadows.elevation2,
  },
  monthTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    backgroundColor: '#F1F5F9',
    opacity: 0.6,
  },

  // Summary
  summaryWrap: { paddingHorizontal: Theme.spacing.md, marginBottom: Theme.spacing.md },
  heroCard: {
    width: HERO_W,
    height: HERO_H,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
    shadowColor: '#6366F1',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Theme.spacing.lg },
  heroValue: { color: '#fff', fontSize: 42, fontWeight: '800', letterSpacing: -1.2 },
  heroLabel: { color: 'rgba(255,255,255,0.96)', fontSize: 14, fontWeight: '700', marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.84)', fontSize: 12, fontWeight: '600', marginTop: 6 },
  ringWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.spacing.sm },
  statChipWrap: { width: '31.5%' },
  statChip: {
    width: '100%',
    position: 'relative',
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...Theme.shadows.elevation2,
  },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '700', color: Theme.colors.textSecondary, marginTop: 2 },

  // Calendar
  calendarCard: {
    marginHorizontal: Theme.spacing.md,
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.sm,
    ...Theme.shadows.elevation2,
  },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
    paddingVertical: 6,
  },
  // Each week is its own fixed-width row of exactly 7 cells (no flexWrap) —
  // see the `weeks` memo above for why: flexWrap across the whole month let a
  // sub-pixel rounding error in the repeating-decimal 100/7% cell width push
  // the 7th (Saturday) cell into the next row on some devices, shifting every
  // later date one column left.
  weekRow: { flexDirection: 'row' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    padding: 2,
  },
  cellToday: { borderWidth: 1.5, borderColor: '#6366F1' },
  cellDay: { fontSize: 14, fontWeight: '700' },
  cellTime: { fontSize: 8.5, fontWeight: '700', color: '#16A34A', marginTop: 1 },
  cellDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    gap: Theme.spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11.5, fontWeight: '600', color: Theme.colors.textSecondary },

  // Active-filter indicator above the day-by-day log
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999 },
  filterPillTxt: { fontSize: 12.5, fontWeight: '800' },
  filterClear: { paddingHorizontal: 10, paddingVertical: 6 },
  filterClearTxt: { fontSize: 12.5, fontWeight: '700', color: Theme.colors.primary },

  // Day log
  sectionTitle: {
    ...Theme.typography.cardTitle,
    paddingHorizontal: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.sm,
    gap: Theme.spacing.md,
    ...Theme.shadows.elevation2,
  },
  logDateBox: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logDay: { fontSize: 17, fontWeight: '800' },
  logDow: { fontSize: 10, fontWeight: '700', color: Theme.colors.textSecondary },
  logLabel: { fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  logTimes: { fontSize: 12, fontWeight: '600', color: Theme.colors.textSecondary, marginTop: 2 },
  logTimesMuted: { fontSize: 12, fontWeight: '500', color: '#B0B7C3', marginTop: 2, fontStyle: 'italic' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9999 },
  statusPillTxt: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  emptyText: {
    ...Theme.typography.bodyText,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Theme.spacing.lg,
  },

  errorBox: { marginHorizontal: Theme.spacing.md, marginBottom: Theme.spacing.md, alignItems: 'center' },
  errorText: { ...Theme.typography.caption, color: Theme.colors.error, marginBottom: Theme.spacing.sm },
  retryBtn: {
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primaryLight,
  },
  retryTxt: { color: Theme.colors.primary, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Theme.colors.white,
    borderTopLeftRadius: Theme.borderRadius.lg,
    borderTopRightRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    paddingTop: Theme.spacing.xl,
  },
  closeButton: {
    position: 'absolute',
    top: Theme.spacing.md,
    right: Theme.spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  closeButtonText: { fontSize: 18, color: Theme.colors.text },
  modalTitle: { ...Theme.typography.sectionTitle, marginBottom: Theme.spacing.sm },
  modalStatusPill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999, marginBottom: Theme.spacing.md },
  modalStatusTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  modalSub: { ...Theme.typography.caption, textTransform: 'uppercase', fontWeight: '700', marginTop: Theme.spacing.md, marginBottom: Theme.spacing.sm },
  modalMuted: { ...Theme.typography.bodyText, color: Theme.colors.textSecondary, marginTop: Theme.spacing.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  detailLabel: { ...Theme.typography.bodyText, color: Theme.colors.textSecondary },
  detailValue: { ...Theme.typography.bodyText, fontWeight: '700', color: Theme.colors.text },
  punchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  punchType: { ...Theme.typography.bodyText, fontWeight: '700', flex: 1 },
  punchTime: { ...Theme.typography.bodyText, color: Theme.colors.text, flex: 1, textAlign: 'center' },
  punchMethod: { ...Theme.typography.caption, color: Theme.colors.textSecondary, flex: 1, textAlign: 'right' },
});
