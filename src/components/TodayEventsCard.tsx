import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BookOpen, CalendarClock, ChevronRight, FlaskConical } from 'lucide-react-native';
import { isDone, loadDayEvents, toISO, type SchedEvent } from '../utils/scheduleEvents';

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

/**
 * "Today's Classes" — the day's class events surfaced on the
 * Attendance landing page. Tapping an event hands it to the parent to open the
 * completion flow (face verification + geotagged photo). Bump `reloadKey` to
 * refetch after a completion.
 */
export const TodayEventsCard: React.FC<{
  onSelect: (e: SchedEvent) => void;
  reloadKey?: number;
}> = ({ onSelect, reloadKey }) => {
  const today = toISO(new Date());
  const [events, setEvents] = useState<SchedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { events: ev } = await loadDayEvents(today);
      setEvents(ev);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <CalendarClock size={18} color="#2C9E83" />
        <Text style={styles.headText}>Today's Classes</Text>
        {events.length > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{events.length}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color="#2C9E83" style={{ paddingVertical: 18 }} />
      ) : events.length === 0 ? (
        <Text style={styles.empty}>No classes scheduled for today.</Text>
      ) : (
        events.map((ev, i) => {
          const color = STATUS_COLORS[ev.status] || '#64748B';
          const Icon = ev.subtype === 'practical' ? FlaskConical : BookOpen;
          const done = isDone(ev.status);
          return (
            <TouchableOpacity
              key={`${ev.kind}-${ev.id}`}
              style={[styles.row, i < events.length - 1 && styles.rowBorder]}
              activeOpacity={0.7}
              onPress={() => onSelect(ev)}
            >
              <View style={styles.iconWrap}>
                <Icon size={16} color="#2C9E83" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{ev.title}</Text>
                <Text style={styles.rowMeta}>
                  {ev.subtype}
                  {ev.start ? ` · ${ev.start}` : ''}
                  {ev.end ? `–${ev.end}` : ''}
                  {ev.location ? ` · ${ev.location}` : ''}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: color + '22' }]}>
                <Text style={[styles.badgeText, { color }]}>{done ? 'done' : ev.status.replace('_', ' ')}</Text>
              </View>
              {!done ? <ChevronRight size={16} color="#CBD5E1" /> : null}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
};

export default TodayEventsCard;

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(44,158,131,0.12)', shadowColor: '#7C2D12', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  headText: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  countPill: { backgroundColor: 'rgba(44,158,131,0.14)', borderRadius: 9999, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { color: '#E8590C', fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.05)' },
  iconWrap: { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(44,158,131,0.10)', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  rowMeta: { fontSize: 11.5, color: '#64748B', marginTop: 1 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  badgeText: { fontSize: 10.5, fontWeight: '700', textTransform: 'capitalize' },
  empty: { color: '#94A3B8', fontSize: 13, fontStyle: 'italic', paddingVertical: 12, textAlign: 'center' },
});
