import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BookOpen, ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react-native';
import { EventCompletionModal } from './components/EventCompletionModal';
import {
  isDone,
  loadDayEvents,
  toISO,
  weekdayIdx,
  type SchedEvent,
} from './utils/scheduleEvents';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const STATUS_COLORS: Record<string, string> = {
  upcoming: '#64748B',
  scheduled: '#64748B',
  ongoing: '#2563EB',
  on_duty: '#2563EB',
  conducted: '#16A34A',
  completed: '#16A34A',
  deviation: '#D97706',
  missed: '#DC2626',
};

export const ScheduleScreen: React.FC = () => {
  const [dateISO, setDateISO] = useState(toISO(new Date()));
  const [meId, setMeId] = useState<string | null>(null);
  const [events, setEvents] = useState<SchedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SchedEvent | null>(null);

  const shiftDate = (delta: number) => {
    const d = new Date(`${dateISO}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setDateISO(toISO(d));
  };

  // forceRefresh only from the explicit pull-to-refresh gesture — the
  // mount/focus/20s-poll calls below deliberately stay TTL-gated (that TTL
  // is what turns this screen's polling into ~1 real network round-trip per
  // 3 minutes instead of one every 20s). Pulling to refresh means "I know
  // this might be stale, check now", so it bypasses that cache.
  const load = useCallback(async (forceRefresh = false) => {
    setError(null);
    try {
      const { events: ev, meId: id } = await loadDayEvents(dateISO, meId, forceRefresh);
      if (id && id !== meId) setMeId(id);
      setEvents(ev);
    } catch (e: any) {
      setError(e?.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO, meId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Keep the schedule live without a manual pull-to-refresh. This tab stays
  // mounted once visited, so a lecture added/removed elsewhere would otherwise
  // not appear until the date was changed or the list pulled. Refetch silently
  // (no spinner) when the tab regains focus and poll every 20s while focused.
  // loadRef avoids re-subscribing the focus effect on every date change, and the
  // first focus is skipped because the mount effect above already fetched.
  const loadRef = useRef(load);
  loadRef.current = load;
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
      } else {
        loadRef.current();
      }
      const id = setInterval(() => loadRef.current(), 20000);
      return () => clearInterval(id);
    }, [])
  );

  return (
    <View style={styles.container}>
      <View style={styles.dateBar}>
        <TouchableOpacity style={styles.navBtn} onPress={() => shiftDate(-1)}>
          <ChevronLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDateISO(toISO(new Date()))} style={{ alignItems: 'center' }}>
          <Text style={styles.dateText}>{DAYS[weekdayIdx(dateISO)]}</Text>
          <Text style={styles.dateSub}>{dateISO}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => shiftDate(1)}>
          <ChevronRight size={22} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2C9E83" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {events.length === 0 ? (
            <Text style={styles.empty}>No classes scheduled for this day.</Text>
          ) : (
            events.map((ev) => {
              const color = STATUS_COLORS[ev.status] || '#64748B';
              const Icon = ev.subtype === 'practical' ? FlaskConical : BookOpen;
              return (
                <TouchableOpacity key={`${ev.kind}-${ev.id}`} style={styles.card} onPress={() => setSelected(ev)} activeOpacity={0.7}>
                  <View style={styles.iconWrap}>
                    <Icon size={18} color="#2C9E83" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{ev.title}</Text>
                    <Text style={styles.cardMeta}>
                      {ev.subtype}
                      {ev.start ? ` · ${ev.start}` : ''}
                      {ev.end ? `–${ev.end}` : ''}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: color + '22' }]}>
                    <Text style={[styles.badgeText, { color }]}>{isDone(ev.status) ? 'done' : ev.status.replace('_', ' ')}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <Text style={styles.hint}>Tap an event to verify your face and click a geotagged photo — location & time are captured automatically.</Text>
        </ScrollView>
      )}

      {selected ? (
        <EventCompletionModal
          event={selected}
          dateISO={dateISO}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            setLoading(true);
            load();
          }}
        />
      ) : null}
    </View>
  );
};

export default ScheduleScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF7F2' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: 'rgba(44,158,131,0.12)' },
  navBtn: { padding: 8, borderRadius: 10, backgroundColor: '#FFF1E9' },
  dateText: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  dateSub: { fontSize: 12, color: '#64748B' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(44,158,131,0.10)' },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(44,158,131,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  empty: { color: '#94A3B8', fontSize: 14, fontStyle: 'italic', paddingVertical: 20, textAlign: 'center' },
  hint: { color: '#94A3B8', fontSize: 12, marginTop: 12, textAlign: 'center' },
  error: { color: '#DC2626', fontSize: 13, marginBottom: 8 },
});
