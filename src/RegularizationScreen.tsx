import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Modal,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  Camera,
  ImagePlus,
  ChevronLeft,
  Calendar,
  Clock,
  FileText,
  History,
  CircleAlert,
  X,
  CalendarDays,
  Tag,
  Images,
  Paperclip,
  Trash2,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ImagePicker from 'react-native-image-crop-picker';
import Animated from 'react-native-reanimated';
import { useTabBarScrollHandler } from './components/ui/tabBarScroll';
import { apiService } from './services/api';
import { getApiBaseUrl } from './config';
import { Screen, Card, Button, Input, SegmentedControl, useTheme, StatusBadge } from './components/ui';
import { showToast } from './utils/toast';
import { typography, radii, spacing } from './theme';

type Tab = 'New Request' | 'My Requests';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const normalizeUri = (uri?: string | null) => {
  if (!uri) return '';
  if (/^https?:\/\//i.test(uri) || /^data:/i.test(uri) || uri.startsWith('file:')) return uri;
  const baseUrl = getApiBaseUrl().replace(/\/api\/?$/i, '');
  const cleanPath = uri.startsWith('/') ? uri : `/${uri}`;
  return `${baseUrl}${cleanPath}`;
};

const getEvidenceUris = (req: any): string[] => {
  if (!req) return [];
  const raw = req.evidenceData || req.evidenceUrl || req.evidence;
  if (Array.isArray(raw)) return raw.map(normalizeUri).filter(Boolean);
  if (typeof raw === 'string' && raw) return [normalizeUri(raw)];
  return [];
};

export default function RegularizationScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { colors } = theme;
  const onScroll = useTabBarScrollHandler();

  const [activeTab, setActiveTab] = useState<Tab>('New Request');

  // Form State
  const [date, setDate] = useState<Date | null>(null);
  const [type, setType] = useState('missing_check_in');
  const [reasonType, setReasonType] = useState('Official Duty');
  const [description, setDescription] = useState('');
  const [reqCheckIn, setReqCheckIn] = useState<Date | null>(null);
  const [reqCheckOut, setReqCheckOut] = useState<Date | null>(null);
  const [evidences, setEvidences] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Date/Time Picker Visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCheckInPicker, setShowCheckInPicker] = useState(false);
  const [showCheckOutPicker, setShowCheckOutPicker] = useState(false);

  // History State
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // getMyRegularizationRequests() has no limit/page param — every request
  // ever filed gets rendered at once via ScrollView + .map(). Capped display
  // + "load more" (same pattern as RequestScreen.tsx/SpotCheckHistoryScreen.tsx).
  const HISTORY_PAGE_SIZE = 20;
  const [displayLimit, setDisplayLimit] = useState(HISTORY_PAGE_SIZE);

  // Details & Lightbox Modals
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancelRequest = async (id: string) => {
    try {
      setCancellingId(id);
      const res = await apiService.cancelRegularizationRequest(id);
      if (res.success) {
        showToast({ type: 'success', title: 'Request cancelled successfully' });
        if (selectedRequest?._id === id) {
          setSelectedRequest(null);
        }
        fetchRequests();
      } else {
        showToast({ type: 'error', title: res.error || 'Failed to cancel request' });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Failed to cancel request' });
    } finally {
      setCancellingId(null);
    }
  };

  const fetchRequests = useCallback(async () => {
    if (requests.length === 0) setLoading(true);
    const res = await apiService.getMyRegularizationRequests();
    if (res.success) {
      setRequests(res.data?.requests || []);
    }
    setLoading(false);
  }, [requests.length]);

  useEffect(() => {
    if (activeTab === 'My Requests') {
      fetchRequests();
    }
  }, [activeTab, fetchRequests]);

  // KPI Stats
  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter(r => (r.status || 'pending').toLowerCase() === 'pending').length;
    const approved = requests.filter(r => (r.status || '').toLowerCase() === 'approved').length;
    const rejected = requests.filter(r => (r.status || '').toLowerCase() === 'rejected').length;
    const cancelled = requests.filter(r => (r.status || '').toLowerCase() === 'cancelled').length;
    return { total, pending, approved, rejected, cancelled };
  }, [requests]);

  const handlePickImage = async (fromCamera: boolean) => {
    if (evidences.length >= 5) {
      return showToast({ type: 'info', title: 'Maximum 5 photos allowed' });
    }
    try {
      const image = fromCamera
        ? await ImagePicker.openCamera({ mediaType: 'photo', cropping: false })
        : await ImagePicker.openPicker({ mediaType: 'photo', cropping: false });
      setEvidences(prev => [...prev, image]);
    } catch (e: any) {
      if (e.code !== 'E_PICKER_CANCELLED') showToast({ type: 'error', title: 'Failed to pick image' });
    }
  };

  const removeEvidence = (index: number) => {
    setEvidences(prev => prev.filter((_, i) => i !== index));
  };

  const formatDisplayDate = (d: Date | null | string) => {
    if (!d) return 'Tap to select date';
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
    return dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDisplayTime = (d: Date | null | string) => {
    if (!d) return 'Tap to select time';
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return '--:--';
    return dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const toISODate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const combineDateAndTime = (dateObj: Date, timeObj: Date): Date => {
    const combined = new Date(dateObj);
    combined.setHours(timeObj.getHours(), timeObj.getMinutes(), 0, 0);
    return combined;
  };

  const handleSubmit = async () => {
    if (!date) return showToast({ type: 'error', title: 'Please select a date.' });
    if (!description.trim()) return showToast({ type: 'error', title: 'Description is required.' });
    if ((type === 'missing_check_in' || type === 'both') && !reqCheckIn)
      return showToast({ type: 'error', title: 'Requested Check-In time is required.' });
    if ((type === 'missing_check_out' || type === 'both') && !reqCheckOut)
      return showToast({ type: 'error', title: 'Requested Check-Out time is required.' });

    setSubmitting(true);
    const fd = new FormData();
    fd.append('date', toISODate(date));
    fd.append('type', type);
    fd.append('reasonType', reasonType);
    fd.append('description', description);
    if (reqCheckIn) fd.append('requestedCheckInTime', combineDateAndTime(date, reqCheckIn).toISOString());
    if (reqCheckOut) fd.append('requestedCheckOutTime', combineDateAndTime(date, reqCheckOut).toISOString());
    
    if (evidences.length > 0) {
      evidences.forEach((ev, idx) => {
        fd.append('evidence', {
          uri: ev.path,
          type: ev.mime || 'image/jpeg',
          name: `evidence-${idx}-${Date.now()}.jpg`,
        } as any);
      });
    }

    const res = await apiService.submitRegularizationRequest(fd);
    if (res.success) {
      showToast({ type: 'success', title: 'Request submitted successfully' });
      setDate(null);
      setDescription('');
      setReqCheckIn(null);
      setReqCheckOut(null);
      setEvidences([]);
      fetchRequests();
      setActiveTab('My Requests');
    } else {
      showToast({ type: 'error', title: res.error || 'Failed to submit request' });
    }
    setSubmitting(false);
  };

  const renderStat = (label: string, value: number, bg: string, border: string, text: string, countColor: string) => (
    <View
      key={label}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        marginHorizontal: 3,
        backgroundColor: bg,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <Text style={[typography.h3, { color: countColor, fontWeight: '800', textAlign: 'center' }]}>
        {value}
      </Text>
      <Text
        style={[
          typography.caption,
          {
            color: text,
            fontSize: 10,
            fontWeight: '700',
            textAlign: 'center',
            width: '100%',
            marginTop: 2,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );

  const PickerRow = ({
    label,
    icon: Icon,
    value,
    isEmpty,
    onPress,
  }: {
    label: string;
    icon: any;
    value: string;
    isEmpty: boolean;
    onPress: () => void;
  }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[typography.title, { color: colors.text, marginBottom: 8, fontSize: 14 }]}>{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={[
          styles.pickerRow,
          { backgroundColor: colors.surfaceAlt, borderColor: isEmpty ? colors.border : colors.brand },
        ]}
      >
        <Icon size={18} color={isEmpty ? colors.textMuted : colors.brand} style={{ marginRight: 10 }} />
        <Text style={[typography.body, { color: isEmpty ? colors.textMuted : '#000000', fontWeight: isEmpty ? '400' : '800', flex: 1 }]}>
          {value}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderNewRequest = () => (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={styles.tabContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Card style={[styles.card, { borderRadius: radii.lg }]}>
        <Text style={[typography.h3, { color: colors.text }]}>New Regularization Request</Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 16 }]}>
          Submit a request for missing check-in or check-out attendance punches.
        </Text>

        <PickerRow
          label="Date"
          icon={Calendar}
          value={formatDisplayDate(date)}
          isEmpty={!date}
          onPress={() => setShowDatePicker(true)}
        />
        {showDatePicker && (
          <DateTimePicker
            value={date || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, selected) => {
              setShowDatePicker(false);
              if (selected) setDate(selected);
            }}
          />
        )}

        <Text style={[typography.title, { color: colors.text, marginTop: 4, marginBottom: 8, fontSize: 14 }]}>
          Missing Type
        </Text>
        <View style={styles.optionsRow}>
          {[
            { id: 'missing_check_in', label: 'Check-In Only' },
            { id: 'missing_check_out', label: 'Check-Out Only' },
            { id: 'both', label: 'Both Check-In & Out' },
          ].map(t => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.optionChip,
                {
                  backgroundColor: type === t.id ? '#E0F2FE' : colors.surfaceAlt,
                  borderColor: type === t.id ? '#0284C7' : colors.border,
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => setType(t.id)}
            >
              <Text
                style={{
                  color: type === t.id ? '#000000' : colors.textMuted,
                  fontWeight: type === t.id ? '800' : '500',
                  fontSize: 12,
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {(type === 'missing_check_in' || type === 'both') && (
          <View style={{ marginTop: 12 }}>
            <PickerRow
              label="Requested Check-In Time"
              icon={Clock}
              value={formatDisplayTime(reqCheckIn)}
              isEmpty={!reqCheckIn}
              onPress={() => setShowCheckInPicker(true)}
            />
            {showCheckInPicker && (
              <DateTimePicker
                value={reqCheckIn || new Date()}
                mode="time"
                is24Hour={false}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, selected) => {
                  setShowCheckInPicker(false);
                  if (selected) setReqCheckIn(selected);
                }}
              />
            )}
          </View>
        )}

        {(type === 'missing_check_out' || type === 'both') && (
          <View style={{ marginTop: 4 }}>
            <PickerRow
              label="Requested Check-Out Time"
              icon={Clock}
              value={formatDisplayTime(reqCheckOut)}
              isEmpty={!reqCheckOut}
              onPress={() => setShowCheckOutPicker(true)}
            />
            {showCheckOutPicker && (
              <DateTimePicker
                value={reqCheckOut || new Date()}
                mode="time"
                is24Hour={false}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, selected) => {
                  setShowCheckOutPicker(false);
                  if (selected) setReqCheckOut(selected);
                }}
              />
            )}
          </View>
        )}

        <Text style={[typography.title, { color: colors.text, marginTop: 4, marginBottom: 8, fontSize: 14 }]}>
          Reason Category
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
          {['Official Duty', 'Field Visit', 'No Internet', 'Network Failure', 'Device Issue', 'Emergency', 'Other'].map(r => (
            <TouchableOpacity
              key={r}
              style={[
                styles.optionChip,
                {
                  marginRight: 8,
                  backgroundColor: reasonType === r ? '#EDE9FE' : colors.surfaceAlt,
                  borderColor: reasonType === r ? '#7C3AED' : colors.border,
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => setReasonType(r)}
            >
              <Text
                style={{
                  color: reasonType === r ? '#000000' : colors.textMuted,
                  fontWeight: reasonType === r ? '800' : '500',
                  fontSize: 12,
                }}
              >
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Input
          label="Detailed Description *"
          placeholder="Explain why the punch was missed..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Evidence picker — multiple photo support matching RequestScreen */}
        <View style={{ marginTop: spacing.lg }}>
          <View style={styles.inlineRow}>
            <Paperclip size={16} color={colors.brand} />
            <Text style={[typography.bodyBold, { color: colors.text }]}>Evidence (photos)</Text>
            {evidences.length > 0 ? (
              <View style={[styles.docCount, { backgroundColor: colors.brandSoft }]}>
                <Text style={[typography.caption, { color: colors.brand, fontWeight: '800' }]}>{evidences.length}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[typography.small, { color: colors.textMuted, marginTop: 2, marginBottom: spacing.md }]}>
            Attach proof — photos of your ticket, system message, or duty letter (max 5 photos).
          </Text>

          {evidences.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {evidences.map((ev, i) => (
                  <View key={i} style={styles.docThumbWrap}>
                    <Image source={{ uri: ev.path }} style={[styles.docThumb, { borderColor: colors.border }]} />
                    <Pressable
                      onPress={() => removeEvidence(i)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.docRemove, { backgroundColor: colors.danger }]}
                    >
                      <X size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}

          <View style={styles.docBtnRow}>
            <Pressable
              onPress={() => handlePickImage(false)}
              style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md }]}
            >
              <ImagePlus size={16} color={colors.brand} />
              <Text style={[typography.small, { color: colors.text }]}>Gallery</Text>
            </Pressable>
            <Pressable
              onPress={() => handlePickImage(true)}
              style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md }]}
            >
              <Camera size={16} color={colors.brand} />
              <Text style={[typography.small, { color: colors.text }]}>Camera</Text>
            </Pressable>
          </View>
        </View>

        <Button
          title="Submit Regularization Request"
          onPress={handleSubmit}
          loading={submitting}
          style={{ marginTop: 24 }}
        />
      </Card>
    </Animated.ScrollView>
  );

  const renderHistory = () => (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={styles.tabContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Top KPI Count Card */}
      <Card
        elevation={1}
        style={{
          backgroundColor: '#F5F3FF',
          borderColor: '#DDD6FE',
          borderWidth: 1,
          borderRadius: radii.lg,
          marginBottom: spacing.lg,
        }}
      >
        <View style={styles.cardHeader}>
          <View style={{ padding: 6, borderRadius: radii.md, backgroundColor: '#EDE9FE' }}>
            <CalendarDays size={18} color="#7C3AED" />
          </View>
          <Text style={[typography.title, { color: colors.text, fontWeight: '800' }]}>
            Regularization Summary
          </Text>
        </View>
        <View style={styles.statGrid}>
          {renderStat('Total', stats.total, '#F0F7FF', '#BAE6FD', '#0284C7', '#0369A1')}
          {renderStat('Pending', stats.pending, '#FFFBEB', '#FDE68A', '#D97706', '#B45309')}
          {renderStat('Approved', stats.approved, '#ECFDF5', '#A7F3D0', '#059669', '#047857')}
          {renderStat('Rejected', stats.rejected, '#FFF1F2', '#FECDD3', '#E11D48', '#BE123C')}
          {renderStat('Cancelled', stats.cancelled, '#F8FAFC', '#CBD5E1', '#64748B', '#475569')}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <History size={18} color={colors.textMuted} style={{ marginRight: 6 }} />
        <Text style={[typography.title, { color: colors.text, fontWeight: '800' }]}>
          Request History
        </Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 12 }]}>Loading requests...</Text>
        </View>
      ) : requests.length === 0 ? (
        <Card style={{ padding: 24, alignItems: 'center' }}>
          <FileText size={36} color={colors.textMuted} />
          <Text style={[typography.title, { color: colors.text, marginTop: 12 }]}>No requests found</Text>
          <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center', marginTop: 4 }]}>
            You haven't submitted any attendance regularization requests yet.
          </Text>
        </Card>
      ) : (
        <>
        {requests.slice(0, displayLimit).map((r, i) => {
          const status = (r.status || 'pending').toLowerCase();
          const badgeStatus = status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : status === 'cancelled' ? 'neutral' : 'warning';
          const typeLabel = r.type === 'missing_check_in' ? 'Check-In' : r.type === 'missing_check_out' ? 'Check-Out' : 'Check-In & Out';
          const evidenceList = getEvidenceUris(r);
          const hasEvidence = evidenceList.length > 0;

          return (
            <View key={r._id || i}>
              <Card
                elevation={1}
                onPress={() => setSelectedRequest(r)}
                style={{
                  marginBottom: spacing.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View style={styles.historyHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Calendar size={16} color={colors.brand} />
                    <Text style={[typography.bodyBold, { color: colors.text }]}>
                      {formatDisplayDate(r.date)}
                    </Text>
                  </View>
                  <StatusBadge status={badgeStatus} label={status.toUpperCase()} size="small" />
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm, flexWrap: 'wrap' }}>
                  <View style={[styles.badgeChip, { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' }]}>
                    <Clock size={12} color="#0284C7" />
                    <Text style={{ color: '#0369A1', fontSize: 11, fontWeight: '700' }}>{typeLabel}</Text>
                  </View>
                  <View style={[styles.badgeChip, { backgroundColor: '#F3E8FF', borderColor: '#DDD6FE' }]}>
                    <Tag size={12} color="#7C3AED" />
                    <Text style={{ color: '#6D28D9', fontSize: 11, fontWeight: '700' }}>{r.reasonType}</Text>
                  </View>
                  {hasEvidence ? (
                    <View style={[styles.badgeChip, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}>
                      <Images size={12} color="#15803D" />
                      <Text style={{ color: '#166534', fontSize: 11, fontWeight: '700' }}>
                        {evidenceList.length} Proof Photo{evidenceList.length > 1 ? 's' : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.sm }]} numberOfLines={2}>
                  {r.description}
                </Text>

                {status === 'rejected' && r.adminRemarks ? (
                  <View style={[styles.remarksBox, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
                    <CircleAlert size={14} color="#E11D48" />
                    <Text style={[typography.caption, { color: '#BE123C', flex: 1 }]}>
                      Note: {r.adminRemarks}
                    </Text>
                  </View>
                ) : null}
              </Card>
            </View>
          );
        })}
        {requests.length > displayLimit && (
          <TouchableOpacity
            onPress={() => setDisplayLimit((n) => n + HISTORY_PAGE_SIZE)}
            style={{ alignItems: 'center', paddingVertical: 12, marginBottom: spacing.md }}
            accessibilityRole="button"
            accessibilityLabel="Load more regularization requests"
          >
            <Text style={[typography.small, { color: colors.brand, fontWeight: '700' }]}>
              Load more ({requests.length - displayLimit} more)
            </Text>
          </TouchableOpacity>
        )}
        </>
      )}
    </Animated.ScrollView>
  );

  const selectedEvidenceUris = selectedRequest ? getEvidenceUris(selectedRequest) : [];

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      {/* Full-Page Screen Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[typography.h2, { color: colors.text }]}>Attendance Regularization</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Request correction for missing check-in/out punches
          </Text>
        </View>
      </View>

      {/* Segmented Control Toggles */}
      <View style={styles.segWrapper}>
        <SegmentedControl
          options={['New Request', 'My Requests']}
          selectedIndex={activeTab === 'New Request' ? 0 : 1}
          onChange={idx => setActiveTab(idx === 0 ? 'New Request' : 'My Requests')}
          activeColors={[
            { bg: '#E0F2FE', border: '#BAE6FD', text: '#0284C7' },
            { bg: '#EDE9FE', border: '#DDD6FE', text: '#6D28D9' },
          ]}
        />
      </View>

      {activeTab === 'New Request' ? renderNewRequest() : renderHistory()}

      {/* Details Bottom Sheet Modal */}
      <Modal
        visible={!!selectedRequest}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRequest(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelectedRequest(null)} />
          <View style={[styles.sheetContainer, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h3, { color: colors.text }]}>Regularization Details</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  Submitted on {formatDisplayDate(selectedRequest?.createdAt || selectedRequest?.date)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedRequest(null)} style={styles.closeBtn}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.68 }} showsVerticalScrollIndicator={false}>
              {selectedRequest && (
                <View style={{ gap: 16, paddingBottom: 24 }}>
                  {/* Status Banner */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[typography.title, { color: colors.text }]}>Status</Text>
                    <StatusBadge
                      status={
                        selectedRequest.status === 'approved'
                          ? 'success'
                          : selectedRequest.status === 'rejected'
                          ? 'danger'
                          : selectedRequest.status === 'cancelled'
                          ? 'neutral'
                          : 'warning'
                      }
                      label={(selectedRequest.status || 'pending').toUpperCase()}
                    />
                  </View>

                  {/* Details Grid */}
                  <View style={[styles.detailBox, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={styles.detailRow}>
                      <Calendar size={16} color={colors.brand} />
                      <Text style={[typography.caption, { color: colors.textMuted }]}>Date:</Text>
                      <Text style={[typography.bodyBold, { color: colors.text }]}>
                        {formatDisplayDate(selectedRequest.date)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Clock size={16} color={colors.brand} />
                      <Text style={[typography.caption, { color: colors.textMuted }]}>Missing Punch:</Text>
                      <Text style={[typography.bodyBold, { color: colors.text }]}>
                        {selectedRequest.type === 'missing_check_in'
                          ? 'Check-In Only'
                          : selectedRequest.type === 'missing_check_out'
                          ? 'Check-Out Only'
                          : 'Both Check-In & Out'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Tag size={16} color={colors.brand} />
                      <Text style={[typography.caption, { color: colors.textMuted }]}>Reason Type:</Text>
                      <Text style={[typography.bodyBold, { color: colors.text }]}>
                        {selectedRequest.reasonType}
                      </Text>
                    </View>
                  </View>

                  {/* Requested Times */}
                  {(selectedRequest.requestedCheckInTime || selectedRequest.requestedCheckOutTime) ? (
                    <View style={[styles.detailBox, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', borderWidth: 1 }]}>
                      <Text style={[typography.caption, { color: '#0369A1', fontWeight: '700', marginBottom: 6 }]}>
                        REQUESTED TIMINGS
                      </Text>
                      {selectedRequest.requestedCheckInTime ? (
                        <Text style={[typography.body, { color: colors.text }]}>
                          Check-In: <Text style={{ fontWeight: '800' }}>{formatDisplayTime(selectedRequest.requestedCheckInTime)}</Text>
                        </Text>
                      ) : null}
                      {selectedRequest.requestedCheckOutTime ? (
                        <Text style={[typography.body, { color: colors.text, marginTop: 4 }]}>
                          Check-Out: <Text style={{ fontWeight: '800' }}>{formatDisplayTime(selectedRequest.requestedCheckOutTime)}</Text>
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Description */}
                  <View>
                    <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>Reason Description</Text>
                    <Text style={[typography.body, { color: colors.text }]}>{selectedRequest.description}</Text>
                  </View>

                  {/* Admin Remarks */}
                  {selectedRequest.adminRemarks ? (
                    <View style={[styles.remarksBox, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
                      <CircleAlert size={16} color="#E11D48" />
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.caption, { color: '#BE123C', fontWeight: '800' }]}>Admin Remarks</Text>
                        <Text style={[typography.small, { color: '#9F1239', marginTop: 2 }]}>{selectedRequest.adminRemarks}</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Evidence Photos */}
                  {selectedEvidenceUris.length > 0 ? (
                    <View style={{ marginTop: 4 }}>
                      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 8 }]}>
                        Evidence Photos ({selectedEvidenceUris.length})
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          {selectedEvidenceUris.map((uri, idx) => (
                            <TouchableOpacity
                              key={idx}
                              activeOpacity={0.85}
                              onPress={() => setPreviewImageUri(uri)}
                              style={styles.evidenceImageWrapper}
                            >
                              <Image
                                source={{ uri }}
                                style={styles.evidenceDetailImage}
                                resizeMode="cover"
                              />
                              <View style={styles.zoomHintBadge}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>ZOOM</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}

                  {/* Cancel Request button if pending */}
                  {(selectedRequest.status || 'pending').toLowerCase() === 'pending' ? (
                    <Button
                      title="Cancel Request"
                      onPress={() => handleCancelRequest(selectedRequest._id)}
                      loading={cancellingId === selectedRequest._id}
                      icon={Trash2}
                      variant="ghost"
                      size="sm"
                      fullWidth
                      style={{ marginTop: spacing.md }}
                      accessibilityLabel="Cancel this regularization request"
                    />
                  ) : null}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Full-Screen Image Lightbox Modal */}
      <Modal
        visible={!!previewImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity
            style={styles.lightboxCloseBtn}
            onPress={() => setPreviewImageUri(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={26} color="#ffffff" />
          </TouchableOpacity>
          {previewImageUri ? (
            <Image
              source={{ uri: previewImageUri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 12,
  },
  backBtn: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  segWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tabContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  card: {
    padding: 18,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  docCount: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 4,
  },
  docThumbWrap: {
    position: 'relative',
    width: 68,
    height: 68,
  },
  docThumb: {
    width: 68,
    height: 68,
    borderRadius: 8,
    borderWidth: 1,
  },
  docRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  docBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  remarksBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  detailBox: {
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evidenceImageWrapper: {
    width: 140,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  evidenceDetailImage: {
    width: '100%',
    height: '100%',
  },
  zoomHintBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    zIndex: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  lightboxImage: {
    width: SCREEN_WIDTH * 0.95,
    height: SCREEN_HEIGHT * 0.8,
  },
});