import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { CalendarX2, TrendingUp, UserCheck, Percent } from 'lucide-react-native';
import { useTheme } from './ui';

type Rec = { timestamp: string | number | Date; type?: string; distance?: number };

const SCREEN_W = Dimensions.get('window').width;

/* ───────────────────────── donut ───────────────────────── */
const Donut: React.FC<{ size?: number; stroke?: number; segments: { value: number; color: string }[]; track: string }> = ({
  size = 132,
  stroke = 16,
  segments,
  track,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {segments.map((s, i) => {
          const len = (c * s.value) / total;
          const el = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={s.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += len;
          return el;
        })}
      </G>
    </Svg>
  );
};

/* ───────────────────────── area trend ───────────────────────── */
const AreaTrend: React.FC<{ data: number[]; width: number; height?: number; color: string; gradId: string }> = ({
  data,
  width,
  height = 96,
  color,
  gradId,
}) => {
  const pad = 6;
  const series = data.length >= 2 ? data : [0, 0];
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width - pad},${height} L${pad},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Path d={area} fill={`url(#${gradId})`} />
      <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="#fff" strokeWidth={2} />
    </Svg>
  );
};

/* ───────────────────────── week bars ───────────────────────── */
const WeekBars: React.FC<{ data: { label: string; on: boolean }[]; width: number; color: string; track: string }> = ({
  data,
  width,
  color,
  track,
}) => {
  const height = 70;
  const n = data.length || 1;
  const slot = width / n;
  const bw = Math.min(20, slot * 0.5);
  return (
    <Svg width={width} height={height + 16}>
      {data.map((d, i) => {
        const x = i * slot + (slot - bw) / 2;
        const h = d.on ? height : 12;
        return <Rect key={i} x={x} y={height - h} width={bw} height={h} rx={5} fill={d.on ? color : track} />;
      })}
    </Svg>
  );
};

/* ───────────────────────── KPI tile ───────────────────────── */
const Kpi: React.FC<{ icon: any; value: number | string; label: string; tint: string; soft: string }> = ({
  icon: Icon,
  value,
  label,
  tint,
  soft,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View style={[styles.kpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.kpiIcon, { backgroundColor: soft }]}>
        <Icon size={18} color={tint} strokeWidth={2.2} />
      </View>
      <Text style={[styles.kpiVal, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.kpiLbl, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
};

const Panel: React.FC<{ title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }> = ({
  title,
  sub,
  children,
  right,
}) => {
  const { theme } = useTheme();
  const { colors, shadows } = theme;
  return (
    <View style={[styles.panel, shadows.e2, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.panelHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>{title}</Text>
          {sub ? <Text style={[styles.panelSub, { color: colors.textMuted }]}>{sub}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
};

const Legend: React.FC<{ items: { color: string; label: string; value: number }[] }> = ({ items }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View style={{ flex: 1, gap: 9 }}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendRow}>
          <View style={[styles.swatch, { backgroundColor: it.color }]} />
          <Text style={[styles.legendLabel, { color: colors.text }]}>{it.label}</Text>
          <Text style={[styles.legendValue, { color: colors.text }]}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
};

/* ───────────────────────── main ───────────────────────── */
export const DashboardAnalytics: React.FC<{ records?: Rec[]; present: number; absent: number; total: number }> = ({
  records = [],
  present,
  absent,
  total,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const derived = useMemo(() => {
    // Group records by calendar day.
    const byDay = new Map<string, { present: boolean; count: number; leave: boolean }>();
    for (const r of records) {
      const d = new Date(r.timestamp);
      if (isNaN(d.getTime())) continue;
      const k = d.toDateString();
      const e = byDay.get(k) || { present: false, count: 0, leave: false };
      e.count += 1;
      if (r.type === 'in') e.present = true;
      if (r.type === 'leave') e.leave = true;
      byDay.set(k, e);
    }
    // Last 14 days: activity (records/day) for the trend.
    const trend: number[] = [];
    const week: { label: string; on: boolean }[] = [];
    const WK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const e = byDay.get(d.toDateString());
      trend.push(e ? e.count : 0);
      if (i <= 6) week.push({ label: WK[d.getDay()], on: !!(e && (e.present || e.leave)) });
    }
    const rate = total > 0 ? Math.round((present / (present + absent || 1)) * 100) : present + absent > 0 ? Math.round((present / (present + absent)) * 100) : 0;
    return { trend, week, rate };
  }, [records, present, absent, total]);

  const innerW = SCREEN_W - spacing.lg * 2 - spacing.lg * 2; // screen pad + panel pad

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
      {/* KPI row */}
      <View style={styles.kpiRow}>
        <Kpi icon={UserCheck} value={present} label="Present" tint={colors.success} soft={colors.successSoft} />
        <Kpi icon={CalendarX2} value={absent} label="Absent" tint={colors.danger} soft={colors.dangerSoft || '#FEE2E2'} />
        <Kpi icon={Percent} value={`${derived.rate}%`} label="Rate" tint={colors.brand} soft={colors.brandSoft} />
        <Kpi icon={TrendingUp} value={total} label="Records" tint={colors.info} soft={colors.infoSoft || '#E0F2FE'} />
      </View>

      {/* Attendance rate donut */}
      <Panel title="This month" sub="present vs absent days">
        <View style={styles.donutWrap}>
          <View>
            <Donut
              segments={[
                { value: present, color: colors.success },
                { value: Math.max(absent, present + absent === 0 ? 1 : 0), color: colors.surfaceAlt },
              ]}
              track={colors.surfaceAlt}
            />
            <View style={styles.donutCenter} pointerEvents="none">
              <Text style={[styles.donutNum, { color: colors.text }]}>{derived.rate}%</Text>
              <Text style={[styles.donutLbl, { color: colors.textMuted }]}>present</Text>
            </View>
          </View>
          <Legend
            items={[
              { color: colors.success, label: 'Present', value: present },
              { color: colors.danger, label: 'Absent', value: absent },
              { color: colors.brand, label: 'Total', value: present + absent },
            ]}
          />
        </View>
      </Panel>

      {/* Activity trend */}
      <Panel title="Activity" sub="check-ins · last 14 days">
        <AreaTrend data={derived.trend} width={innerW} color={colors.brand} gradId="dashTrend" />
      </Panel>

      {/* This week presence */}
      <Panel title="This week" sub="days present">
        <WeekBars data={derived.week} width={innerW} color={colors.success} track={colors.surfaceAlt} />
      </Panel>
    </View>
  );
};

export default DashboardAnalytics;

const styles = StyleSheet.create({
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 11, alignItems: 'flex-start' },
  kpiIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiVal: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  kpiLbl: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  panel: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  panelTitle: { fontSize: 15, fontWeight: '800' },
  panelSub: { fontSize: 12, marginTop: 1 },
  donutWrap: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  donutCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  donutNum: { fontSize: 24, fontWeight: '800' },
  donutLbl: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  swatch: { width: 11, height: 11, borderRadius: 3 },
  legendLabel: { fontSize: 13, fontWeight: '600' },
  legendValue: { marginLeft: 'auto', fontSize: 14, fontWeight: '800' },
});
