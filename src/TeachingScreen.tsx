import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import { BookOpen, FlaskConical, Stethoscope, MapPin, Camera } from 'lucide-react-native';
import { apiService } from './services/api';
import { requestLocationPermission, getCurrentPositionDetailed } from './utils/location';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// JS getDay(): 0=Sun..6=Sat. Map to 0=Mon..5=Sat (Sun → 6, which has no slots).
const todayDayIndex = (() => {
  const d = new Date().getDay();
  return (d + 6) % 7;
})();

const todayISO = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
})();

type Slot = {
  id: string;
  subject: string;
  type: string;
  day: number;
  start: string;
  end: string;
  room?: string;
  status?: 'upcoming' | 'ongoing' | 'conducted' | 'deviation' | 'missed';
  actualStart?: string | null;
  actualEnd?: string | null;
};

const TYPE_ICON: Record<string, any> = {
  lecture: BookOpen,
  practical: FlaskConical,
  clinical: Stethoscope,
};

const STATUS_COLORS: Record<string, string> = {
  ongoing: '#2563EB',
  conducted: '#16A34A',
  deviation: '#D97706',
  missed: '#DC2626',
  upcoming: '#64748B',
};

export const TeachingScreen: React.FC = () => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    setError(null);
    try {
      const ttRes = await apiService.getMyTimetable(forceRefresh);
      if (!ttRes.success) {
        setError(ttRes.error || 'Failed to load timetable');
        setSlots([]);
        return;
      }
      const rows: Slot[] = ttRes.data?.rows || [];

      // Seed today's status from the class-checkin log.
      const statusByTt: Record<string, any> = {};
      try {
        const logRes = await apiService.getClassCheckinLog(todayISO, forceRefresh);
        if (logRes.success) {
          (logRes.data?.rows || []).forEach((r: any) => {
            if (r.timetableId) statusByTt[String(r.timetableId)] = r;
          });
        }
      } catch {
        // non-fatal: just show timetable without seeded status
      }

      setSlots(
        rows.map((s) => {
          const log = statusByTt[String(s.id)];
          return {
            ...s,
            status: log?.status,
            actualStart: log?.actualStart ?? null,
            actualEnd: log?.actualEnd ?? null,
          };
        })
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to load timetable');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const capturePhoto = async (front: boolean): Promise<string | null> => {
    try {
      const img: any = await ImagePicker.openCamera({
        mediaType: 'photo',
        cropping: false,
        includeBase64: true,
        compressImageQuality: 0.6,
        useFrontCamera: front,
        // width/height are ignored without cropping; use compressImageMax* so the
        // capture is actually downsized and its base64 fits in the JSON upload.
        compressImageMaxWidth: 1280,
        compressImageMaxHeight: 1280,
      });
      if (img?.data) return `data:${img.mime || 'image/jpeg'};base64,${img.data}`;
      return null;
    } catch {
      return null; // user cancelled the camera
    }
  };

  const conduct = async (slot: Slot, action: 'start' | 'end') => {
    setBusyId(slot.id);
    try {
      // 1) Capture evidence photo. Required to START; optional to END.
      const image = await capturePhoto(action === 'start');
      if (action === 'start' && !image) {
        Alert.alert('Selfie required', 'A check-in selfie is needed to start the class.');
        return;
      }

      // 2) Geo (best-effort — backend still records the class without it).
      let geo: { latitude: number; longitude: number; accuracy: number } | null = null;
      const granted = await requestLocationPermission();
      if (granted) {
        try {
          geo = await getCurrentPositionDetailed();
        } catch {
          // ignore — proceed without geo
        }
      }

      const photos = image
        ? [{ label: action === 'start' ? 'Check-in selfie' : 'Wrap-up photo', image }]
        : undefined;

      const res = await apiService.classCheckin({
        timetableId: slot.id,
        action,
        date: todayISO,
        ...(geo
          ? { latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy }
          : {}),
        photos,
      });

      if (res.success) {
        const ck = res.data?.checkin;
        setSlots((prev) =>
          prev.map((s) =>
            s.id === slot.id
              ? {
                  ...s,
                  status: ck?.status || (action === 'start' ? 'ongoing' : 'conducted'),
                  actualStart: ck?.actualStart ?? s.actualStart,
                  actualEnd: ck?.actualEnd ?? s.actualEnd,
                }
              : s
          )
        );
        Alert.alert('Success', action === 'start' ? 'Class started.' : 'Class marked as conducted.');
      } else {
        Alert.alert('Failed', res.error || 'Could not record the class.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (slot: Slot) => {
    const busy = busyId === slot.id;
    if (slot.status === 'conducted' || slot.status === 'deviation') {
      const isDeviation = slot.status === 'deviation';
      return (
        <View style={styles.conductedRow}>
          <Text style={[styles.conductedText, isDeviation && { color: STATUS_COLORS.deviation }]}>
            {isDeviation ? '⚠ Conducted (Deviation)' : '✓ Conducted'}
            {slot.actualStart ? ` · ${slot.actualStart}` : ''}
            {slot.actualEnd ? `–${slot.actualEnd}` : ''}
          </Text>
        </View>
      );
    }
    if (slot.status === 'ongoing') {
      return (
        <TouchableOpacity
          style={[styles.btn, styles.btnEnd]}
          disabled={busy}
          onPress={() => conduct(slot, 'end')}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Camera size={16} color="#fff" />
              <Text style={styles.btnText}>End class</Text>
            </>
          )}
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={[styles.btn, styles.btnStart]}
        disabled={busy}
        onPress={() => conduct(slot, 'start')}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Camera size={16} color="#fff" />
            <Text style={styles.btnText}>Start class</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  const renderSlot = (slot: Slot, conductable: boolean) => {
    const Icon = TYPE_ICON[slot.type] || BookOpen;
    const statusColor = STATUS_COLORS[slot.status || 'upcoming'];
    return (
      <View key={slot.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.iconWrap}>
            <Icon size={18} color="#2C8395" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.subject}>{slot.subject}</Text>
            <Text style={styles.meta}>
              {slot.start}–{slot.end}
              {slot.room ? ` · Room ${slot.room}` : ''} · {slot.type}
            </Text>
          </View>
          {slot.status ? (
            <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
              <Text style={[styles.badgeText, { color: statusColor }]}>{slot.status}</Text>
            </View>
          ) : null}
        </View>
        {conductable ? renderActions(slot) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2C8395" />
      </View>
    );
  }

  const todaySlots = slots
    .filter((s) => s.day === todayDayIndex)
    .sort((a, b) => a.start.localeCompare(b.start));

  const weekByDay = DAYS.map((label, idx) => ({
    label,
    idx,
    items: slots.filter((s) => s.day === idx).sort((a, b) => a.start.localeCompare(b.start)),
  }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadData(true);
          }}
        />
      }
    >
      <Text style={styles.h1}>My Timetable</Text>
      <Text style={styles.sub}>Conduct your classes — capture a selfie + location as evidence.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.section}>
        Today · {DAYS[todayDayIndex] || 'Sunday'}
      </Text>
      {todaySlots.length === 0 ? (
        <Text style={styles.empty}>No classes scheduled today.</Text>
      ) : (
        todaySlots.map((s) => renderSlot(s, true))
      )}

      <Text style={[styles.section, { marginTop: 24 }]}>This week</Text>
      {weekByDay.map((d) =>
        d.items.length === 0 ? null : (
          <View key={d.label} style={{ marginBottom: 8 }}>
            <Text style={styles.dayLabel}>{d.label}</Text>
            {d.items.map((s) => renderSlot(s, false))}
          </View>
        )
      )}
    </ScrollView>
  );
};

export default TeachingScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  h1: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  sub: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 8 },
  section: { fontSize: 13, fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  dayLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginBottom: 4, marginLeft: 2 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(44,131,149,0.10)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  subject: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, marginTop: 12 },
  btnStart: { backgroundColor: '#2C8395' },
  btnEnd: { backgroundColor: '#2563EB' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  conductedRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(15,23,42,0.06)' },
  conductedText: { color: '#16A34A', fontWeight: '600', fontSize: 13 },
  empty: { color: '#94A3B8', fontSize: 14, fontStyle: 'italic', paddingVertical: 8 },
  error: { color: '#DC2626', fontSize: 13, marginVertical: 8 },
});
