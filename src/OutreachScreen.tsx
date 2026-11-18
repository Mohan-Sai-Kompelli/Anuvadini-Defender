import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  HeartHandshake,
  MapPin,
  Users,
  CalendarDays,
  Target,
  FileText,
  Send,
  Info,
} from 'lucide-react-native';
import { apiService } from './services/api';

const pad = (n: number) => String(n).padStart(2, '0');
const todayISO = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

const TYPES = ['Health Camp', 'Awareness Drive', 'Screening Camp', 'Vaccination', 'Other'];

type Activity = {
  _id: string;
  title: string;
  type?: string;
  location?: string;
  date?: string;
  purpose?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'rejected';
  rejectionReason?: string;
  participants?: number;
  lead?: { _id?: string; fullName?: string };
};

// How each backend status reads to the requesting faculty member.
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending approval', color: '#B45309', bg: '#FEF3C7' },
  in_progress: { label: 'Approved', color: '#15803D', bg: '#DCFCE7' },
  completed: { label: 'Completed', color: '#15803D', bg: '#DCFCE7' },
  rejected: { label: 'Rejected', color: '#B91C1C', bg: '#FEE2E2' },
};

export const OutreachScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  // getOutreach() has no limit/page param — every outreach activity ever
  // logged renders at once via ScrollView + .map(). Same capped-display +
  // "load more" pattern as the other history lists fixed alongside this one.
  const HISTORY_PAGE_SIZE = 20;
  const [displayLimit, setDisplayLimit] = useState(HISTORY_PAGE_SIZE);

  // Request form
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Health Camp');
  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState(todayISO);
  const [venue, setVenue] = useState('');
  const [participants, setParticipants] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async (forceRefresh = false) => {
    setError(null);
    try {
      let myId = meId;
      if (!myId) {
        const prof = await apiService.getPortalProfile();
        myId = prof.success ? prof.data?.profile?.id || null : null;
        setMeId(myId);
      }
      const res = await apiService.getOutreach(forceRefresh);
      if (!res.success) {
        setError(res.error || 'Failed to load outreach requests');
        setActivities([]);
        return;
      }
      const all: Activity[] = res.data?.activities || [];
      setActivities(myId ? all.filter((a) => String(a.lead?._id) === String(myId)) : all);
    } catch (e: any) {
      setError(e?.message || 'Failed to load outreach requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const submitRequest = async () => {
    if (!title.trim() || !purpose.trim() || !venue.trim()) {
      Alert.alert('Missing info', 'Please fill in the activity name, purpose and venue.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert('Invalid date', 'Use the date format YYYY-MM-DD.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiService.createOutreach({
        title: title.trim(),
        type,
        date: date.trim(),
        location: venue.trim(),
        purpose: purpose.trim(),
        description: description.trim(),
        participants: parseInt(participants, 10) || 0,
      });
      if (res.success) {
        setTitle('');
        setPurpose('');
        setVenue('');
        setParticipants('');
        setDescription('');
        setDate(todayISO);
        setType('Health Camp');
        Alert.alert('Request sent', 'Your outreach request has been sent to your HOD/Admin for approval.');
        loadData();
      } else {
        Alert.alert('Failed', res.error || 'Could not send the request.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2C9E83" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          tintColor="#2C9E83"
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadData(true);
          }}
        />
      }
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <HeartHandshake size={22} color="#2C9E83" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Outreach & Field Visits</Text>
          <Text style={styles.sub}>Request approval for a health camp or community visit.</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* How it works */}
      <View style={styles.infoBox}>
        <Info size={15} color="#9A3412" />
        <Text style={styles.infoText}>
          Your request goes to your HOD/Admin for approval. You'll be notified once it's reviewed.
        </Text>
      </View>

      {/* Request form */}
      <Text style={styles.section}>Request an activity</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Activity name</Text>
        <TextInput
          style={styles.inputBoxed}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Rural Health Camp"
          placeholderTextColor="#94A3B8"
        />

        <Text style={[styles.label, styles.mt]}>Type</Text>
        <View style={styles.chipsWrap}>
          {TYPES.map((t) => {
            const active = type === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                style={[styles.typeChip, active && styles.typeChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, styles.mt]}>Purpose</Text>
        <View style={styles.inputRow}>
          <Target size={16} color="#94A3B8" />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={purpose}
            onChangeText={setPurpose}
            placeholder="What is this activity for?"
            placeholderTextColor="#94A3B8"
            multiline
          />
        </View>

        <Text style={[styles.label, styles.mt]}>Requested date</Text>
        <View style={styles.inputRow}>
          <CalendarDays size={16} color="#94A3B8" />
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
          />
        </View>

        <Text style={[styles.label, styles.mt]}>Venue / location</Text>
        <View style={styles.inputRow}>
          <MapPin size={16} color="#94A3B8" />
          <TextInput
            style={styles.input}
            value={venue}
            onChangeText={setVenue}
            placeholder="e.g. Village Rampur, PHC"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <Text style={[styles.label, styles.mt]}>Expected participants</Text>
        <View style={styles.inputRow}>
          <Users size={16} color="#94A3B8" />
          <TextInput
            style={styles.input}
            value={participants}
            onChangeText={setParticipants}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <Text style={[styles.label, styles.mt]}>Details (optional)</Text>
        <View style={styles.inputRow}>
          <FileText size={16} color="#94A3B8" />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Anything the approver should know…"
            placeholderTextColor="#94A3B8"
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          disabled={submitting}
          onPress={submitRequest}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Send size={17} color="#fff" />
              <Text style={styles.submitText}>Send request to admin</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* My requests */}
      <Text style={[styles.section, styles.mt]}>My requests</Text>
      {activities.length === 0 ? (
        <Text style={styles.empty}>No outreach requests yet.</Text>
      ) : (
        <>
        {activities.slice(0, displayLimit).map((a) => {
          const meta = STATUS_META[a.status || 'pending'] || STATUS_META.pending;
          return (
            <View key={a._id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.iconWrap}>
                  <HeartHandshake size={18} color="#2C9E83" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subject}>{a.title}</Text>
                  <Text style={styles.meta}>
                    {a.type || 'Health Camp'} · {a.location || '—'} · {a.date}
                  </Text>
                  {a.participants ? (
                    <Text style={styles.meta}>
                      <Users size={11} color="#94A3B8" /> {a.participants} expected
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>

              {a.purpose ? (
                <Text style={styles.purpose} numberOfLines={3}>
                  {a.purpose}
                </Text>
              ) : null}

              {a.status === 'rejected' && a.rejectionReason ? (
                <View style={styles.rejectBox}>
                  <Text style={styles.rejectText}>Reason: {a.rejectionReason}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
        {activities.length > displayLimit && (
          <TouchableOpacity
            onPress={() => setDisplayLimit((n) => n + HISTORY_PAGE_SIZE)}
            style={styles.loadMore}
            accessibilityRole="button"
            accessibilityLabel="Load more outreach requests"
          >
            <Text style={styles.loadMoreText}>
              Load more ({activities.length - displayLimit} more)
            </Text>
          </TouchableOpacity>
        )}
        </>
      )}
    </ScrollView>
  );
};

export default OutreachScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF6EF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF6EF' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#CCEDE1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: { fontSize: 21, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 12.5, color: '#64748B', marginTop: 2 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1E6',
    borderRadius: 12,
    padding: 11,
    marginTop: 12,
  },
  infoText: { flex: 1, fontSize: 12, color: '#9A3412', fontWeight: '600', lineHeight: 17 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9A3412',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1E7DE',
    shadowColor: '#C2410C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#CCEDE1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  subject: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  purpose: { fontSize: 13, color: '#334155', marginTop: 10, lineHeight: 19 },
  rejectBox: { marginTop: 10, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10 },
  rejectText: { fontSize: 12.5, color: '#B91C1C', fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  mt: { marginTop: 14 },
  inputBoxed: {
    borderWidth: 1,
    borderColor: '#E7DED6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFCFA',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E7DED6',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 4,
    backgroundColor: '#FFFCFA',
  },
  input: { flex: 1, paddingVertical: 9, fontSize: 14, color: '#0F172A' },
  multiline: { minHeight: 44, textAlignVertical: 'top', paddingTop: 9 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E7DED6',
    backgroundColor: '#FFFCFA',
  },
  typeChipActive: { backgroundColor: '#2C9E83', borderColor: '#2C9E83' },
  typeChipText: { fontSize: 12.5, fontWeight: '700', color: '#64748B' },
  typeChipTextActive: { color: '#FFFFFF' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2C9E83',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 18,
    shadowColor: '#2C9E83',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { color: '#94A3B8', fontSize: 14, fontStyle: 'italic', paddingVertical: 8 },
  loadMore: { alignItems: 'center', paddingVertical: 12 },
  loadMoreText: { fontSize: 13, fontWeight: '700', color: '#2C9E83' },
  error: { color: '#DC2626', fontSize: 13, marginVertical: 8 },
});
