import React, { useMemo } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Path, Rect, Stop } from 'react-native-svg';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import {
  LogOut, Flame, TrendingUp, CalendarDays, MapPin, CalendarPlus, House, BookOpen,
  HeartHandshake, Zap, ChevronRight, Clock, CalendarClock, Check, FileText, QrCode,
} from 'lucide-react-native';
import { QuickActionButton } from './ui';

type Rec = { timestamp: string | number | Date; type?: string };
export type SchedEvent = {
  kind: 'class' | 'duty';
  id: string;
  title: string;
  subtype: string;
  start: string;
  end: string;
  location: string;
  status: string;
};
type LeaveInfo = { remaining: number; quota: number; used: number; medicalRemaining?: number } | null;
type Holiday = { date: string; name: string } | null;

const SCREEN_W = Dimensions.get('window').width;
const PAD = 16;
const GAP = 12;
const CARD_W = SCREEN_W - PAD * 2;
const HALF_W = (CARD_W - GAP) / 2;

const C = {
  ink: '#0F172A',
  sub: '#6B7280',
  muted: '#8A91A3',
  line: '#EEF1F6',
  glass: 'rgba(255,255,255,0.74)',
  glassBorder: 'rgba(255,255,255,0.8)',
  green: '#16A34A',
  red: '#FB7185',
  violet: '#8B5CF6',
  // Cool "aurora" accent — matches the footer + attendance hero.
  brand: '#6366F1',
  brandLt: '#A855F7',
  cyan: '#22D3EE',
  blue: '#2563EB',
  amber: '#F59E0B',
};

const initials = (n: string) =>
  (n || '?').trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase() || '?';

const isDone = (s: string) => s === 'conducted' || s === 'completed';

/* ───────── glass tile (optionally tappable) ───────── */
const Tile: React.FC<{ w?: number; children: React.ReactNode; style?: any; delay?: number; onPress?: () => void }> = ({ w, children, style, delay = 0, onPress }) => (
  <Animated.View
    entering={FadeInDown.delay(delay).duration(360).reduceMotion(ReduceMotion.System)}
    style={[styles.tile, w ? { width: w } : null, style]}
  >
    {onPress ? (
      <Pressable onPress={onPress} style={styles.tilePress}>
        {children}
      </Pressable>
    ) : (
      children
    )}
  </Animated.View>
);

/* ───────── gradient area chart (the one trend we keep) ───────── */
const Area: React.FC<{ data: number[]; width: number; height?: number; color: string; id: string }> = ({ data, width, height = 72, color, id }) => {
  const p = 6;
  const s = data.length >= 2 ? data : [0, 0];
  const max = Math.max(...s, 1), min = Math.min(...s, 0), rng = max - min || 1;
  const stepX = (width - p * 2) / (s.length - 1);
  const pts = s.map((v, i) => [p + i * stepX, height - p - ((v - min) / rng) * (height - p * 2)]);
  const line = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width - p},${height} L${p},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.26} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </SvgGrad>
      </Defs>
      <Path d={area} fill={`url(#${id})`} />
      <Path d={line} stroke={color} strokeWidth={2.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="#fff" strokeWidth={2.2} />
    </Svg>
  );
};

/* ───────── main ───────── */
export const BentoDashboard: React.FC<{
  insetsTop: number;
  name: string;
  greeting: string;
  todayStatus: string;
  statusColor: string;
  statusTime?: string;
  shiftLabel?: string;
  present: number;
  absent: number;
  total: number;
  records?: Rec[];
  leave?: LeaveInfo;
  events?: SchedEvent[];
  nextHoliday?: Holiday;
  onLogout: () => void;
  onNavigate: (route: string) => void;
}> = ({
  insetsTop, name, greeting, todayStatus, statusColor, statusTime, shiftLabel,
  present, absent, total, records = [], leave, events = [], nextHoliday, onLogout, onNavigate,
}) => {
  const d = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of records) {
      const dt = new Date(r.timestamp);
      if (isNaN(dt.getTime())) continue;
      byDay.set(dt.toDateString(), (byDay.get(dt.toDateString()) || 0) + 1);
    }
    // last-14-day check-in trend
    const trend: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const dd = new Date();
      dd.setDate(dd.getDate() - i);
      trend.push(byDay.get(dd.toDateString()) || 0);
    }
    // present streak ending today (today not-yet-marked doesn't break it)
    let streak = 0;
    for (let i = 0; i < 120; i++) {
      const dd = new Date();
      dd.setDate(dd.getDate() - i);
      const has = (byDay.get(dd.toDateString()) || 0) > 0;
      if (has) streak += 1;
      else if (i === 0) continue;
      else break;
    }
    const rate = present + absent > 0 ? Math.round((present / (present + absent)) * 100) : 0;
    // working (non-Sunday) days left this month, excluding today
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let workingLeft = 0;
    for (let day = now.getDate() + 1; day <= lastDay; day++) {
      if (new Date(now.getFullYear(), now.getMonth(), day).getDay() !== 0) workingLeft += 1;
    }
    return { trend, streak, rate, workingLeft };
  }, [records, present, absent]);

  const weekdayLong = new Date().toLocaleDateString([], { weekday: 'long' });
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const statusLabel =
    todayStatus === 'IN' ? 'Checked In'
      : todayStatus === 'OUT' ? 'Checked Out'
        : todayStatus === 'HOLIDAY' ? 'Holiday today'
          : 'Not marked yet';
  const cta =
    todayStatus === 'HOLIDAY' ? null
      : todayStatus === 'IN' ? 'Check out'
        : 'Check in';
  const todaySub = [
    statusTime ? `Since ${statusTime}` : null,
    shiftLabel || null,
  ].filter(Boolean).join('  ·  ');

  const todayEvents = events.slice(0, 4);
  const hd = nextHoliday ? new Date(nextHoliday.date) : null;
  const holidayStr = hd && !isNaN(hd.getTime())
    ? hd.toLocaleDateString([], { day: 'numeric', month: 'short' })
    : '';

  return (
    <View style={{ paddingHorizontal: PAD, paddingTop: insetsTop + 8, paddingBottom: 28, gap: GAP }}>
      {/* top bar */}
      <View style={styles.topbar}>
        <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials(name)}</Text></View>
        <View style={{ flex: 1, marginLeft: 11 }}>
          <Text style={styles.hi}>{greeting} 👋</Text>
          <Text style={styles.dim}>{name}</Text>
        </View>
        <Pressable onPress={onLogout} hitSlop={8} style={styles.bell}><LogOut size={18} color="#334155" /></Pressable>
      </View>

      {/* TODAY — the headline, with the next action */}
      <Animated.View entering={FadeInDown.duration(360)} style={styles.featured}>
        <Svg width={CARD_W} height={158} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGrad id="feat" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={C.brandLt} />
              <Stop offset="0.55" stopColor={C.brand} />
              <Stop offset="1" stopColor={C.cyan} />
            </SvgGrad>
          </Defs>
          <Rect x={0} y={0} width={CARD_W} height={158} rx={26} fill="url(#feat)" />
          {/* soft bokeh glow for depth */}
          <Circle cx={CARD_W * 0.86} cy={18} r={72} fill="rgba(255,255,255,0.13)" />
          <Circle cx={CARD_W * 0.08} cy={150} r={58} fill="rgba(255,255,255,0.10)" />
        </Svg>
        <View style={styles.featTopRow}>
          <Text style={styles.featLbl}>TODAY · {weekdayLong}</Text>
          <View style={styles.featTime}>
            <Clock size={12} color="rgba(255,255,255,0.92)" strokeWidth={2.4} />
            <Text style={styles.featTimeTxt}>{timeStr}</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.sdot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusBig}>{statusLabel}</Text>
        </View>
        {todaySub ? <Text style={styles.featSub}>{todaySub}</Text> : null}
        {cta ? (
          <Pressable style={styles.ctaBtn} onPress={() => onNavigate('Attendance')}>
            <MapPin size={16} color={C.brand} />
            <Text style={styles.ctaTxt}>{cta}</Text>
            <ChevronRight size={16} color={C.brand} />
          </Pressable>
        ) : null}
      </Animated.View>

      {/* row: leave balance + month rate (colorful gradient cards) */}
      <View style={styles.row}>
        <GradientStat
          w={HALF_W} delay={60} id="gLeave" gradient={[C.brandLt, C.violet]}
          icon={<CalendarPlus size={18} color="#fff" />}
          value={leave ? String(leave.remaining) : '—'} valueSub="left"
          cap="Leave balance"
          sub={leave ? `${leave.used} of ${leave.quota} used` : 'Tap to apply'}
          onPress={() => onNavigate('Request')}
        />
        <GradientStat
          w={HALF_W} delay={80} id="gRate" gradient={[C.blue, C.cyan]}
          icon={<TrendingUp size={18} color="#fff" />}
          value={`${d.rate}%`} cap="Attendance · month"
          sub={`${present}/${present + absent} days present`}
        />
      </View>

      {/* this month summary + the one trend chart — taps into the full calendar report */}
      <Tile delay={100} onPress={() => onNavigate('CalendarReport')}>
        <View style={styles.tileHead}>
          <Text style={styles.tLbl}>This month</Text>
          <View style={styles.tileHeadRight}>
            <View style={styles.streakChip}>
              <Flame size={13} color="#fff" />
              <Text style={styles.streakTxt}>{d.streak}d streak</Text>
            </View>
            <ChevronRight size={16} color={C.muted} />
          </View>
        </View>
        <View style={styles.miniRow}>
          <MiniStat n={present} t="Present" c={C.green} />
          <View style={styles.miniDiv} />
          <MiniStat n={absent} t="Absent" c={C.red} />
          <View style={styles.miniDiv} />
          <MiniStat n={d.workingLeft} t="Days left" c={C.muted} />
        </View>
        <Area data={d.trend} width={CARD_W - 32} color={C.brand} id="trend" />
        <Text style={styles.trendCap}>{total} check-ins · last 14 days</Text>
      </Tile>

      {/* today's schedule */}
      <Tile delay={120}>
        <View style={styles.tileHead}>
          <Text style={styles.tLbl}>Today's schedule</Text>
          <Text style={styles.tSub}>{weekdayLong}</Text>
        </View>
        {todayEvents.length > 0 ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            {todayEvents.map((ev) => (
              <View key={ev.id} style={styles.evRow}>
                <View style={[styles.evIcon, { backgroundColor: '#EEF0FF' }]}>
                  <BookOpen size={16} color={C.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.evTitle} numberOfLines={1}>{ev.title || 'Class'}</Text>
                  <Text style={styles.evSub} numberOfLines={1}>
                    {[ev.subtype, ev.location].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {ev.start ? (
                    <View style={styles.evTimeRow}>
                      <Clock size={11} color={C.muted} />
                      <Text style={styles.evTime}>{ev.start}{ev.end ? `–${ev.end}` : ''}</Text>
                    </View>
                  ) : null}
                  {isDone(ev.status) ? (
                    <View style={styles.doneRow}><Check size={11} color={C.green} /><Text style={styles.doneTxt}>done</Text></View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyTxt}>No classes or duties scheduled today 🎉</Text>
        )}
        {nextHoliday ? (
          <Pressable style={styles.holidayRow} onPress={() => onNavigate('HolidayCalendar')}>
            <CalendarClock size={14} color={C.amber} />
            <Text style={styles.holidayTxt}>Next holiday · {holidayStr} · {nextHoliday.name}</Text>
          </Pressable>
        ) : null}
      </Tile>

      {/* quick actions */}
      <View style={styles.secRow}><Zap size={16} color={C.brand} /><Text style={styles.secTxt}>Quick actions</Text></View>
      <View style={styles.qrow}>
        <QuickActionButton icon={MapPin} label="Mark Attendance" onPress={() => onNavigate('Attendance')} color={C.green} />
        <QuickActionButton icon={CalendarPlus} label="Apply Leave" onPress={() => onNavigate('Request')} color={C.violet} />
      </View>
      <View style={styles.qrow}>
        <QuickActionButton icon={CalendarDays} label="My Schedule" onPress={() => onNavigate('Schedule')} color={C.blue} />
        <QuickActionButton icon={CalendarDays} label="Calendar Report" onPress={() => onNavigate('CalendarReport')} color={C.brand} />
      </View>
      <View style={styles.qrow}>
        <QuickActionButton icon={BookOpen} label="Teaching Log" onPress={() => onNavigate('Teaching')} color={C.brand} />
        <QuickActionButton icon={HeartHandshake} label="Outreach" onPress={() => onNavigate('Outreach')} color={C.green} />
      </View>
      <View style={styles.qrow}>
        <QuickActionButton icon={FileText} label="Requests" onPress={() => onNavigate('Request')} color={C.violet} />
        <QuickActionButton icon={QrCode} label="Scan Work PC" onPress={() => onNavigate('PairWorkPC')} color={C.blue} />
      </View>
    </View>
  );
};

const MiniStat: React.FC<{ n: number; t: string; c: string }> = ({ n, t, c }) => (
  <View style={styles.miniStat}>
    <Text style={[styles.miniNum, { color: c }]}>{n}</Text>
    <Text style={styles.miniLbl}>{t}</Text>
  </View>
);

/* colorful gradient stat card (leave / rate) */
const G_H = 118;
const GradientStat: React.FC<{
  w: number;
  delay?: number;
  id: string;
  gradient: [string, string];
  icon: React.ReactNode;
  value: string;
  valueSub?: string;
  cap: string;
  sub?: string;
  onPress?: () => void;
}> = ({ w, delay = 0, id, gradient, icon, value, valueSub, cap, sub, onPress }) => {
  const body = (
    <>
      <Svg width={w} height={G_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGrad id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient[0]} />
            <Stop offset="1" stopColor={gradient[1]} />
          </SvgGrad>
        </Defs>
        <Rect x={0} y={0} width={w} height={G_H} rx={22} fill={`url(#${id})`} />
        <Circle cx={w * 0.9} cy={10} r={42} fill="rgba(255,255,255,0.12)" />
      </Svg>
      <View style={styles.gIconWrap}>{icon}</View>
      <Text style={styles.gValue}>
        {value}{valueSub ? <Text style={styles.gValueSub}> {valueSub}</Text> : null}
      </Text>
      <Text style={styles.gCap}>{cap}</Text>
      {sub ? <Text style={styles.gSub}>{sub}</Text> : null}
    </>
  );
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(360).reduceMotion(ReduceMotion.System)}
      style={[styles.gTile, { width: w, height: G_H }]}
    >
      {onPress ? <Pressable onPress={onPress} style={{ flex: 1 }}>{body}</Pressable> : body}
    </Animated.View>
  );
};

export default BentoDashboard;

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  hi: { fontSize: 17, fontWeight: '800', color: C.ink },
  dim: { fontSize: 12, color: C.sub, marginTop: 1 },
  bell: { width: 44, height: 44, borderRadius: 15, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder, alignItems: 'center', justifyContent: 'center' },

  featured: { borderRadius: 26, padding: 18, overflow: 'hidden', minHeight: 158, justifyContent: 'center', shadowColor: C.brand, shadowOpacity: 0.32, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 7 },
  featTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featTime: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 9999, paddingHorizontal: 9, paddingVertical: 4 },
  featTimeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  featLbl: { color: '#fff', fontSize: 12, fontWeight: '700', opacity: 0.92, letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 6 },
  sdot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  statusBig: { color: '#fff', fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  featSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '600', marginTop: 4 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, backgroundColor: '#fff', borderRadius: 9999, paddingHorizontal: 14, paddingVertical: 9 },
  ctaTxt: { color: C.brand, fontSize: 14, fontWeight: '800' },

  tile: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder, borderRadius: 24, padding: 16, shadowColor: '#1F265A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 2 },
  tilePress: { flex: 1 },
  row: { flexDirection: 'row', gap: GAP },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tLbl: { fontSize: 11.5, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  tBig: { fontSize: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.8, marginTop: 2 },
  tBigSub: { fontSize: 13, color: C.muted, fontWeight: '700' },
  tCap: { fontSize: 12.5, color: C.ink, fontWeight: '700', marginTop: 4 },
  tSub: { fontSize: 11.5, color: C.muted, fontWeight: '600', marginTop: 1 },
  chip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  gTile: { borderRadius: 22, overflow: 'hidden', padding: 14, shadowColor: '#1F265A', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  gIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  gValue: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 12, letterSpacing: -0.6 },
  gValueSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' },
  gCap: { color: '#fff', fontSize: 12.5, fontWeight: '800', marginTop: 4 },
  gSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontWeight: '600', marginTop: 1 },

  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F97316', borderRadius: 9999, paddingHorizontal: 9, paddingVertical: 4 },
  streakTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  miniRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 6 },
  miniStat: { flex: 1, alignItems: 'center' },
  miniNum: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  miniLbl: { fontSize: 11, fontWeight: '700', color: C.muted, marginTop: 1 },
  miniDiv: { width: 1, height: 28, backgroundColor: C.line },
  trendCap: { fontSize: 11, color: C.muted, fontWeight: '600', marginTop: 2 },

  evRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  evIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  evTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  evSub: { fontSize: 11.5, color: C.muted, fontWeight: '600', marginTop: 1 },
  evTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  evTime: { fontSize: 12, fontWeight: '800', color: C.sub },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  doneTxt: { fontSize: 10.5, fontWeight: '700', color: C.green },
  emptyTxt: { fontSize: 13, color: C.sub, fontWeight: '600', marginTop: 10, marginBottom: 2 },
  holidayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  holidayTxt: { fontSize: 12, fontWeight: '700', color: C.sub, flex: 1 },

  secRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, marginLeft: 4 },
  secTxt: { fontSize: 13, fontWeight: '800', color: C.ink },
  qrow: { flexDirection: 'row', gap: GAP },
});
