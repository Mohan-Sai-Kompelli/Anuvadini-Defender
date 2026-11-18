import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient as SvgGrad, Rect, Stop } from 'react-native-svg';
import {
  ShieldCheck,
  CircleCheck,
  CircleX,
  Clock,
  Flame,
  Activity,
} from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { apiService } from './services/api';
import { useTabBarScrollHandler } from './components/ui/tabBarScroll';

const W = Dimensions.get('window').width;
const PAD = 16;
const CARD_W = W - PAD * 2;

const C = {
  ink: '#0F172A',
  sub: '#64748B',
  muted: '#94A3B8',
  line: '#EEF1F6',
  card: '#FFFFFF',
  bg: '#F6F4FB',
  border: '#ECEAF5',
  indigo: '#6366F1',
  purple: '#A855F7',
  cyan: '#22D3EE',
  green: '#16A34A',
  greenSoft: '#DCFCE7',
  red: '#EF4444',
  redSoft: '#FEE2E2',
  amber: '#F59E0B',
  amberSoft: '#FEF3C7',
};

type Item = {
  id: string;
  status: 'pending' | 'responded' | 'missed' | 'skipped';
  issuedAt: string;
  respondedAt?: string | null;
  responseSec?: number | null;
};
type Stats = { total: number; responded: number; missed: number; pending: number; rate: number; streak: number; avgResponseSec: number | null };

const STATUS = {
  responded: { label: 'Verified', color: C.green, soft: C.greenSoft, icon: CircleCheck },
  missed: { label: 'Missed', color: C.red, soft: C.redSoft, icon: CircleX },
  pending: { label: 'Awaiting', color: C.amber, soft: C.amberSoft, icon: Clock },
  skipped: { label: 'Skipped', color: C.muted, soft: C.line, icon: Clock },
} as const;

function ago(iso?: string | null): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Gradient ring gauge (indigo → cyan). */
const Ring: React.FC<{ pct: number }> = ({ pct }) => {
  const size = 116;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, pct / 100)));
  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgGrad id="ringg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#A5B4FC" />
          <Stop offset="1" stopColor="#FFFFFF" />
        </SvgGrad>
      </Defs>
      <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.28)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ringg)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </G>
    </Svg>
  );
};

const StatTile: React.FC<{
  icon: any;
  value: string | number;
  label: string;
  color: string;
  soft: string;
  active?: boolean;
  onPress?: () => void;
}> = ({ icon: Icon, value, label, color, soft, active, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.75}
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={onPress ? `${label}: ${value}. Tap to view these checks.` : undefined}
    style={[styles.tile, active && { borderColor: color, borderWidth: 1.5, backgroundColor: soft }]}
  >
    <View style={[styles.tileIcon, { backgroundColor: soft }]}><Icon size={17} color={color} /></View>
    <Text style={styles.tileVal}>{value}</Text>
    <Text style={styles.tileLbl}>{label}</Text>
  </TouchableOpacity>
);

export const SpotCheckHistoryScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Tap a stat → filter the Recent list to that status and scroll down to it.
  const [filter, setFilter] = useState<Item['status'] | null>(null);
  // `recent` is unbounded (fetched with no page/limit) and was rendered fully
  // via ScrollView + .map() — a long-tenured user with hundreds of spot-check
  // records would mount every row at once. Capped display + "load more"
  // (same pattern as RequestScreen.tsx's history list) instead of a full
  // FlatList rewrite — this screen's list shares one ScrollView with the
  // stats header/filter bar above it, same as RequestScreen.
  const HISTORY_PAGE_SIZE = 20;
  const [displayLimit, setDisplayLimit] = useState(HISTORY_PAGE_SIZE);
  const scrollRef = useRef<ScrollView>(null);
  const listYRef = useRef(0);
  const onScroll = useTabBarScrollHandler();

  const focusStatus = useCallback((status: Item['status']) => {
    setFilter((prev) => (prev === status ? null : status));
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, listYRef.current - 12), animated: true });
    });
  }, []);

  const load = useCallback(async (forceRefresh = false) => {
    setError(null);
    try {
      const res = await apiService.getMySpotChecks(forceRefresh);
      if (res.success && res.data) {
        setStats((res.data as any).stats || null);
        setRecent((res.data as any).recent || []);
      } else {
        setError(res.error || 'Failed to load your spot-checks');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load your spot-checks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Changing which status is focused should start the visible list from the
  // top again, not stay expanded to wherever it was scrolled for the last filter.
  useEffect(() => { setDisplayLimit(HISTORY_PAGE_SIZE); }, [filter]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={C.indigo} /></View>;
  }

  const s = stats || { total: 0, responded: 0, missed: 0, pending: 0, rate: 0, streak: 0, avgResponseSec: null };
  const filteredRecent = recent.filter((it) => !filter || it.status === filter);

  return (
    <Animated.ScrollView
      ref={scrollRef as any}
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: PAD, paddingBottom: 40 }}
      refreshControl={<RefreshControl tintColor={C.indigo} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
    >
      <View style={styles.head}>
        <View style={styles.headIcon}><ShieldCheck size={22} color={C.indigo} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>My Spot-Checks</Text>
          <Text style={styles.sub}>Random attendance verifications sent by your HOD/Admin.</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Hero: response rate ring */}
      <View style={styles.hero}>
        <Svg width={CARD_W} height={150} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGrad id="hero" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={C.indigo} />
              <Stop offset="0.6" stopColor={C.purple} />
              <Stop offset="1" stopColor="#7C3AED" />
            </SvgGrad>
          </Defs>
          <Rect x={0} y={0} width={CARD_W} height={150} rx={24} fill="url(#hero)" />
        </Svg>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLbl}>Response rate</Text>
            <Text style={styles.heroVal}>{s.rate}%</Text>
            <View style={styles.heroPill}>
              <Flame size={13} color="#fff" />
              <Text style={styles.heroPillTxt}>{s.streak} in a row</Text>
            </View>
          </View>
          <View style={{ width: 116, height: 116, alignItems: 'center', justifyContent: 'center' }}>
            <Ring pct={s.rate} />
            <View style={styles.ringCenter}>
              <Text style={styles.ringNum}>{s.responded}/{s.responded + s.missed}</Text>
              <Text style={styles.ringLbl}>verified</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Stat tiles: Row 1 = Total & Avg response | Row 2 = Completed & Missed */}
      <View style={styles.tilesRow}>
        <StatTile icon={ShieldCheck} value={s.total || (s.responded + s.missed)} label="Total" color={C.indigo} soft="#EEF0FF" active={filter === null} onPress={() => setFilter(null)} />
        <StatTile icon={Activity} value={s.avgResponseSec != null ? `${s.avgResponseSec}s` : '—'} label="Avg response" color="#8B5CF6" soft="#F3E8FF" />
      </View>
      <View style={styles.tilesRow}>
        <StatTile icon={CircleCheck} value={s.responded} label="Completed" color={C.green} soft={C.greenSoft} active={filter === 'responded'} onPress={() => focusStatus('responded')} />
        <StatTile icon={CircleX} value={s.missed} label="Missed" color={C.red} soft={C.redSoft} active={filter === 'missed'} onPress={() => focusStatus('missed')} />
      </View>

      {/* Recent list */}
      <View onLayout={(e) => { listYRef.current = e.nativeEvent.layout.y; }}>
        <Text style={styles.section}>Recent checks</Text>
      </View>

      {filter ? (
        <View style={styles.filterBar}>
          <View style={[styles.filterPill, { backgroundColor: (STATUS[filter] || STATUS.skipped).soft }]}>
            <Text style={[styles.filterPillTxt, { color: (STATUS[filter] || STATUS.skipped).color }]}>
              {(STATUS[filter] || STATUS.skipped).label} · {recent.filter((it) => it.status === filter).length}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setFilter(null)} hitSlop={8} style={styles.filterClear}>
            <Text style={styles.filterClearTxt}>Show all</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {recent.length === 0 ? (
        <View style={styles.empty}>
          <ShieldCheck size={26} color={C.muted} />
          <Text style={styles.emptyTxt}>No spot-checks yet</Text>
          <Text style={styles.emptySub}>When your HOD/Admin sends a check, it'll appear here.</Text>
        </View>
      ) : filteredRecent.length === 0 ? (
        <View style={styles.empty}>
          <ShieldCheck size={26} color={C.muted} />
          <Text style={styles.emptyTxt}>No {(STATUS[filter!] || STATUS.skipped).label.toLowerCase()} checks</Text>
          <Text style={styles.emptySub}>Try another stat, or tap "Show all".</Text>
        </View>
      ) : (
        <>
        {filteredRecent.slice(0, displayLimit).map((it) => {
          const m = STATUS[it.status] || STATUS.skipped;
          const Icon = m.icon;
          return (
            <View key={it.id} style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: m.soft }]}><Icon size={18} color={m.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {it.status === 'responded'
                    ? `Verified${it.responseSec ? ` in ${it.responseSec}s` : ''}`
                    : it.status === 'missed'
                    ? 'Missed — not verified in time'
                    : it.status === 'pending'
                    ? 'Awaiting your verification'
                    : 'Skipped'}
                </Text>
                <Text style={styles.rowMeta}>Sent {ago(it.issuedAt)}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: m.soft }]}>
                <Text style={[styles.badgeTxt, { color: m.color }]}>{m.label}</Text>
              </View>
            </View>
          );
        })}
        {filteredRecent.length > displayLimit && (
          <TouchableOpacity
            onPress={() => setDisplayLimit((n) => n + HISTORY_PAGE_SIZE)}
            style={styles.loadMore}
            accessibilityRole="button"
            accessibilityLabel="Load more spot-check history"
          >
            <Text style={styles.loadMoreTxt}>
              Load more ({filteredRecent.length - displayLimit} more)
            </Text>
          </TouchableOpacity>
        )}
        </>
      )}
    </Animated.ScrollView>
  );
};

export default SpotCheckHistoryScreen;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EEF0FF', alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 21, fontWeight: '800', color: C.ink },
  sub: { fontSize: 12.5, color: C.sub, marginTop: 2 },
  error: { color: C.red, fontSize: 13, marginBottom: 10 },

  hero: { borderRadius: 24, padding: 18, overflow: 'hidden', minHeight: 150, justifyContent: 'center', shadowColor: C.indigo, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 7, marginBottom: 14 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLbl: { color: '#fff', fontSize: 12, fontWeight: '700', opacity: 0.9, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroVal: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1.5, marginTop: 2 },
  heroPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 9999, paddingHorizontal: 11, paddingVertical: 5 },
  heroPillTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringNum: { color: '#fff', fontSize: 17, fontWeight: '800' },
  ringLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase' },

  tilesRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  tile: { flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14, shadowColor: '#1F265A', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  tileVal: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  tileLbl: { fontSize: 11.5, fontWeight: '600', color: C.muted, marginTop: 2 },

  section: { fontSize: 12, fontWeight: '800', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8, marginBottom: 10, marginLeft: 2 },

  filterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999 },
  filterPillTxt: { fontSize: 12.5, fontWeight: '800' },
  filterClear: { paddingHorizontal: 8, paddingVertical: 6 },
  filterClearTxt: { fontSize: 12.5, fontWeight: '700', color: C.indigo },
  loadMore: { alignItems: 'center', paddingVertical: 12, marginBottom: 10 },
  loadMoreTxt: { fontSize: 13, fontWeight: '700', color: C.indigo },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 13, marginBottom: 10 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  rowMeta: { fontSize: 11.5, color: C.muted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  badgeTxt: { fontSize: 11, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 28, gap: 4 },
  emptyTxt: { fontSize: 14, fontWeight: '700', color: C.sub, marginTop: 6 },
  emptySub: { fontSize: 12, color: C.muted, textAlign: 'center', paddingHorizontal: 30 },
});
