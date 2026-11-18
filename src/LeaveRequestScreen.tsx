import React, { useEffect, useState, useCallback } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import ImagePicker from 'react-native-image-crop-picker';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Camera,
  ChevronRight,
  CircleAlert,
  FileText,
  ImagePlus,
  Info,
  MapPin,
  NotebookPen,
  PartyPopper,
  Paperclip,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Stethoscope,
  Building2,
  Clock,
  ListChecks,
  Trash2,
  UserCheck,
  X,
  Zap,
} from 'lucide-react-native';
import { useAuth } from './AuthContext';
import { apiService } from './services/api';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Input,
  Screen,
  SegmentedControl,
  SkeletonRow,
  StatusBadge,
  useTheme,
} from './components/ui';
import { showToast } from './utils/toast';
import { haptic } from './utils/haptics';

type LeaveRequestPayload = {
  startDate: string; // ISO date string (yyyy-mm-dd)
  endDate: string;   // ISO date string (yyyy-mm-dd)
  reason: string;
  notes?: string;
  delegateId?: string;
};

type Colleague = {
  _id: string;
  fullName: string;
  uid: string;
  designation?: string;
  role?: string;
};

type LeaveRecord = {
  _id?: string;
  id?: string;
  startDate: string;
  endDate: string;
  days?: number;
  reason: string;
  notes?: string;
  status?: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  // Rejection reason from organiser (legacy field name used by backend)
  reson?: string;
  contactNumber?: string;
  addressDuringLeave?: string;
  expectedReturnDate?: string;
  description?: string;
  comments?: string;
  attachments?: any[];
};

export const LeaveRequestScreen: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { colors, spacing, radii, typography } = theme;

  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [displayMonthNum, setDisplayMonthNum] = useState<number>(new Date().getMonth() + 1);
  const [displayYear, setDisplayYear] = useState<number>(new Date().getFullYear());
  const [showSummary, setShowSummary] = useState(false);
  const [summaryItems, setSummaryItems] = useState<{ startDate: string; endDate: string; reason: string; notes?: string; status?: string; source: 'server' | 'local' }[]>([]);
  const [viewStatus, setViewStatus] = useState<null | 'pending' | 'approved' | 'rejected'>(null);
  const [holidayConfirmVisible, setHolidayConfirmVisible] = useState(false);
  // "i" info/help overlay explaining the whole leave flow.
  const [showHelp, setShowHelp] = useState(false);

  // ── Enterprise leave fields ──
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [dayPortion, setDayPortion] = useState<'full' | 'half'>('full');
  const [halfDayType, setHalfDayType] = useState<'first' | 'second'>('first');
  const [isEmergency, setIsEmergency] = useState(false);
  const [contactNumber, setContactNumber] = useState('');
  const [addressDuringLeave, setAddressDuringLeave] = useState('');
  const [description, setDescription] = useState('');
  const [comments, setComments] = useState('');
  const [expectedReturn, setExpectedReturn] = useState<Date | null>(null);
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  const [medicalFiles, setMedicalFiles] = useState<any[]>([]);
  const [supportingFiles, setSupportingFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const selectedType = leaveTypes.find((t) => t._id === selectedTypeId) || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiService.getLeaveTypes();
      if (!cancelled && res.success && Array.isArray(res.data) && res.data.length) {
        setLeaveTypes(res.data);
        setSelectedTypeId((prev) => prev || res.data[0]._id);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Delegate ("CC a colleague to cover my work while I'm on leave") — optional,
  // scoped to the applicant's own department by the server.
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selectedDelegateId, setSelectedDelegateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiService.getDepartmentColleagues();
      if (!cancelled && res.success && Array.isArray(res.data)) {
        setColleagues(res.data);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const getLocalKey = (uid?: string) => `leaveRequests_${uid || 'anonymous'}`;

  const saveLeaveLocally = async (items: { startDate: string; endDate: string; reason: string; notes?: string }[]) => {
    try {
      const key = getLocalKey(user?.id || user?.uid);
      const existing = await AsyncStorage.getItem(key);
      const list = existing ? JSON.parse(existing) : [];
      const updated = [...list, ...items.map(i => ({ ...i, status: 'pending', createdAt: new Date().toISOString() }))];
      await AsyncStorage.setItem(key, JSON.stringify(updated));
      return true;
    } catch (e) {
      return false;
    }
  };

  // Public holidays (2025) with festival names
  const PUBLIC_HOLIDAYS_2025: { date: string; name: string }[] = [
    { date: '2025-01-26', name: 'Republic Day' },
    { date: '2025-02-26', name: 'Maha Shivaratri' },
    { date: '2025-03-14', name: 'Holi' },
    { date: '2025-03-31', name: 'Id-ul-Fitr' },
    { date: '2025-04-10', name: 'Mahavir Jayanti' },
    { date: '2025-04-18', name: 'Good Friday' },
    { date: '2025-05-12', name: 'Buddha Purnima' },
    { date: '2025-06-07', name: 'Id-ul-Zuha (Bakrid)' },
    { date: '2025-07-06', name: 'Muharram' },
    { date: '2025-08-15', name: 'Independence Day' },
    { date: '2025-08-16', name: 'Janmashtami' },
    { date: '2025-09-05', name: 'Milad-un-Nabi or Id-e-Milad' },
    { date: '2025-10-02', name: 'Mahatma Gandhi’s Birthday' },
    { date: '2025-10-02', name: 'Dussehra' },
    { date: '2025-10-20', name: 'Diwali' },
    { date: '2025-11-05', name: 'Guru Nanak’s Birthday' },
    { date: '2025-12-25', name: 'Christmas Day' },
  ];

  const toISODate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatDateDDMMYYYY = (dateInput: Date | string) => {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const daysBetween = (a: Date, b: Date) => {
    const ms = Math.abs(new Date(b.toDateString()).getTime() - new Date(a.toDateString()).getTime());
    return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1; // inclusive
  };

  const enumerateDates = (a: Date, b: Date) => {
    const dates: string[] = [];
    const cur = new Date(a.toDateString());
    const end = new Date(b.toDateString());
    while (cur <= end) {
      dates.push(toISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  const holidaysMap: Record<string, string[]> = PUBLIC_HOLIDAYS_2025.reduce((acc, h) => {
    if (!acc[h.date]) acc[h.date] = [];
    acc[h.date].push(h.name);
    return acc;
  }, {} as Record<string, string[]>);

  const isHolidayDate = (d: Date) => !!holidaysMap[toISODate(d)];

  const isWeekendDate = (d: Date) => {
    const dayOfWeek = d.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  };

  const isPastDate = (d: Date) => {
    const today = new Date();
    const dateOnly = new Date(d.toDateString());
    const todayOnly = new Date(today.toDateString());
    return dateOnly < todayOnly;
  };

  const selectedDates = useCustomDates ? customDates : enumerateDates(startDate, endDate);
  const holidaysInRange = selectedDates
    .filter(d => holidaysMap[d])
    .map(d => ({ date: d, names: holidaysMap[d] }));
  const allDaysAreHolidays = holidaysInRange.length > 0 && holidaysInRange.length === selectedDates.length;

  // (Calendar removed as requested)

  const loadLeaves = useCallback(async (isRefresh = false) => {
    if (!user) return;
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const res = await apiService.getLeaveRequests({});
      if (res.success && res.data) {
        const payload: any = res.data as any;

        // Try multiple common shapes to extract an array of leave records
        const candidates: any[] = [
          payload,
          (payload as any)?.leaves,
          (payload as any)?.data,
          (payload as any)?.data?.leaves,
          (payload as any)?.data?.data,
          (payload as any)?.requests,
          (payload as any)?.data?.requests,
        ];
        const rawList: any[] = (candidates.find(Array.isArray) as any[]) || [];

        const unwrapDate = (v: any): string | undefined => {
          if (!v) return undefined;
          if (typeof v === 'string') return v;
          if (v instanceof Date) return v.toISOString();
          if (typeof v === 'object' && ('$date' in v)) {
            const dv = (v as any)['$date'];
            if (typeof dv === 'string') return dv;
            if (typeof dv === 'number') return new Date(dv).toISOString();
          }
          return undefined;
        };

        const normalized: LeaveRecord[] = rawList.map((it: any) => {
          const startRaw = it.startDate || it.leaveDates?.start || it.fromDate || it.start;
          const endRaw = it.endDate || it.leaveDates?.end || it.toDate || it.end;
          const start = unwrapDate(startRaw) || startRaw;
          const end = unwrapDate(endRaw) || endRaw;
          const recordReason = it.reason || it.leaveDetails || it.details || it.reson || '';
          const status = (it.status || 'pending') as any;
          const reson = it.reson || it.rejectReason || it.rejectionReason || '';
          return {
            ...it,
            startDate: start,
            endDate: end,
            reason: recordReason,
            status,
            reson,
          } as LeaveRecord;
        });
        // Show only persisted records from server; hide temporary/local optimistic ones
        const onlyPersisted = normalized.filter((it: any) => {
          const idVal = it?._id || it?.id;
          return !!idVal && (typeof idVal !== 'string' || !String(idVal).startsWith('temp-'));
        });
        setLeaves(onlyPersisted);
      } else {
        // Avoid showing temporary local records when API fails
        setLeaves([]);
        setError(res.error || 'Failed to load leave requests');
      }
    } catch (e) {
      // Avoid showing temporary local records when API fails
      setLeaves([]);
      setError(e instanceof Error ? e.message : 'Failed to load leave requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  // Attach supporting documents (photo of a certificate, etc.) from the gallery
  // or camera. Only images on mobile (react-native-image-crop-picker) — the
  // backend also accepts PDF/DOCX from the web portal.
  const pickDocuments = async (category: 'medical' | 'supporting', fromCamera: boolean) => {
    try {
      setUploading(true);
      const opts: any = { mediaType: 'photo', compressImageQuality: 0.8, cropping: false };
      let picked: any[] = [];
      if (fromCamera) {
        const img: any = await ImagePicker.openCamera(opts);
        picked = [img];
      } else {
        const imgs: any = await ImagePicker.openPicker({ ...opts, multiple: true });
        picked = Array.isArray(imgs) ? imgs : [imgs];
      }
      const files = picked.map((img: any, i: number) => ({
        path: img.path,
        mime: img.mime || 'image/jpeg',
        filename: img.filename || `${category}-${Date.now()}-${i}.jpg`,
        size: img.size,
      }));
      if (category === 'medical') setMedicalFiles((prev) => [...prev, ...files]);
      else setSupportingFiles((prev) => [...prev, ...files]);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/cancel/i.test(msg)) {
        showToast({ type: 'error', title: 'Upload failed', message: 'Could not attach the document. Please try again.' });
      }
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (category: 'medical' | 'supporting', idx: number) => {
    if (category === 'medical') setMedicalFiles((prev) => prev.filter((_, i) => i !== idx));
    else setSupportingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setReason('');
    setNotes('');
    setDescription('');
    setComments('');
    setContactNumber('');
    setAddressDuringLeave('');
    setMedicalFiles([]);
    setSupportingFiles([]);
    setSelectedDelegateId(null);
    setExpectedReturn(null);
    setDayPortion('full');
    setHalfDayType('first');
    setIsEmergency(false);
    setCustomDates([]);
  };

  // One enterprise application (start..end). Custom-dates mode loops this per day.
  const submitOne = (startStr: string, endStr: string) =>
    apiService.applyLeaveV3(
      {
        leaveTypeId: selectedTypeId as string,
        startDate: startStr,
        endDate: endStr,
        dayPortion,
        halfDayType: dayPortion === 'half' ? halfDayType : null,
        reason: reason.trim(),
        description: description.trim() || undefined,
        comments: comments.trim() || undefined,
        isEmergency,
        contactNumber: contactNumber.trim() || undefined,
        addressDuringLeave: addressDuringLeave.trim() || undefined,
        workHandoverTo: selectedDelegateId || undefined,
        expectedReturnDate: expectedReturn ? toISODate(expectedReturn) : undefined,
      },
      { medical: medicalFiles, supporting: supportingFiles }
    );

  const performSubmit = async () => {
    try {
      setSubmitting(true);
      if (!useCustomDates) {
        const startStr = toISODate(startDate);
        const endStr = dayPortion === 'half' ? startStr : toISODate(endDate);
        const res = await submitOne(startStr, endStr);
        if (res.success) {
          haptic('success');
          const approver = (res.data as any)?.assignedTo?.name;
          showToast({
            type: 'success',
            title: 'Leave request submitted',
            message: approver ? `Sent to ${approver} for review.` : 'Sent for review.',
          });
          resetForm();
          await loadLeaves();
        } else {
          showToast({ type: 'error', title: 'Could not submit', message: res.error || 'Failed to submit leave request' });
        }
      } else {
        const datesToSubmit = [...customDates].sort();
        let ok = 0;
        const failed: string[] = [];
        let lastError = '';
        for (const d of datesToSubmit) {
          const res = await submitOne(d, d);
          if (res.success) ok += 1;
          else { failed.push(d); lastError = res.error || lastError; }
        }
        if (ok > 0) haptic('success');
        if (failed.length === 0) {
          showToast({ type: 'success', title: 'Leave requests submitted', message: `${ok} day${ok === 1 ? '' : 's'} sent for review.` });
          resetForm();
        } else if (ok > 0) {
          showToast({ type: 'warning', title: 'Partly submitted', message: `${ok} sent, ${failed.length} failed (${failed.join(', ')}).` });
        } else {
          showToast({ type: 'error', title: 'Could not submit', message: lastError || 'Failed to submit leave requests' });
        }
        await loadLeaves();
      }
    } catch (e) {
      showToast({
        type: 'error',
        title: 'Submission failed',
        message: e instanceof Error ? e.message : 'Failed to submit leave',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!user) return;
    if (!selectedTypeId) {
      showToast({ type: 'warning', title: 'Leave type required', message: 'Please choose a leave type.' });
      return;
    }
    if (!reason.trim()) {
      showToast({
        type: 'warning',
        title: 'Reason required',
        message: 'Please enter a reason for leave',
      });
      return;
    }
    // Client-side heads-up for a document-required type (backend still enforces).
    if (selectedType?.requiresDocument && medicalFiles.length === 0 && supportingFiles.length === 0) {
      showToast({
        type: 'warning',
        title: 'Document required',
        message: `${selectedType.name} needs a supporting document. Please attach one.`,
      });
      return;
    }
    if (!useCustomDates) {
      if (endDate < startDate) {
        showToast({
          type: 'warning',
          title: 'Invalid dates',
          message: 'End date cannot be before start date',
        });
        return;
      }
    } else {
      if (customDates.length === 0) {
        showToast({
          type: 'warning',
          title: 'No dates selected',
          message: 'Please add at least one date.',
        });
        return;
      }
    }
    if (allDaysAreHolidays) {
      showToast({
        type: 'info',
        title: 'Holiday',
        message: 'Selected dates are public holidays. No leave needed.',
      });
      return;
    }
    if (holidaysInRange.length > 0) {
      // Confirmation moved into a bottom sheet (see ConfirmSheet below).
      setHolidayConfirmVisible(true);
      return;
    }
    await performSubmit();
  };

  const totalDays = !useCustomDates && dayPortion === 'half'
    ? 0.5
    : (useCustomDates ? selectedDates.length : daysBetween(startDate, endDate));

  const pendingLeaves = leaves.filter(lr => {
    const s = (lr.status || 'pending').toLowerCase();
    return s === 'pending' || s === 'submitted';
  });
  const approvedLeaves = leaves.filter(lr => (lr.status || '').toLowerCase() === 'approved');
  const rejectedLeaves = leaves.filter(lr => (lr.status || '').toLowerCase() === 'rejected');
  const getListByStatus = (status: 'pending' | 'approved' | 'rejected') => {
    if (status === 'pending') return pendingLeaves;
    if (status === 'approved') return approvedLeaves;
    return rejectedLeaves;
  };

  const statusRows: { status: 'pending' | 'approved' | 'rejected'; label: string; count: number }[] = [
    { status: 'pending', label: 'Pending', count: pendingLeaves.length },
    { status: 'approved', label: 'Approved', count: approvedLeaves.length },
    { status: 'rejected', label: 'Rejected', count: rejectedLeaves.length },
  ];

  const monthlyHolidays = PUBLIC_HOLIDAYS_2025
    .filter(h => {
      const d = new Date(h.date);
      return (d.getMonth() + 1) === displayMonthNum && d.getFullYear() === displayYear;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <Screen scroll refreshing={refreshing} onRefresh={() => loadLeaves(true)}>
        <Animated.View
          entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}
          style={styles.header}
        >
          <View style={styles.headerRow}>
            <View style={styles.flexText}>
              <Text style={[typography.h2, { color: colors.text }]}>Leave Request</Text>
              <Text style={[typography.body, { color: colors.textMuted }]}>
                Apply for one or more days
              </Text>
            </View>
            <Pressable
              onPress={() => setShowHelp(true)}
              accessibilityRole="button"
              accessibilityLabel="How leave works — help and guide"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.infoBtn, { backgroundColor: colors.brandSoft, borderColor: colors.brand }]}
            >
              <Info size={20} color={colors.brand} />
            </Pressable>
          </View>
        </Animated.View>

        {/* Apply card */}
        <Card elevation={1} enteringIndex={0} style={{ marginTop: spacing.lg }}>
          <Text style={[typography.title, { color: colors.text, marginBottom: spacing.md }]}>
            Apply
          </Text>

          {/* Leave type selector */}
          <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>
            Leave type
          </Text>
          {leaveTypes.length === 0 ? (
            <Text style={[typography.small, { color: colors.textMuted, marginBottom: spacing.md }]}>
              Loading leave types…
            </Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                <View style={styles.typeRow}>
                  {leaveTypes.map((t) => {
                    const selected = selectedTypeId === t._id;
                    const tint = t.color || colors.brand;
                    return (
                      <Pressable
                        key={t._id}
                        onPress={() => {
                          haptic('selection');
                          setSelectedTypeId(t._id);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Leave type ${t.name}`}
                        style={[
                          styles.typeChip,
                          {
                            borderRadius: radii.md,
                            borderColor: selected ? tint : colors.border,
                            backgroundColor: selected ? tint + '18' : colors.surface,
                          },
                        ]}
                      >
                        <View style={[styles.typeDot, { backgroundColor: tint }]} />
                        <Text
                          style={[
                            typography.small,
                            { color: selected ? tint : colors.text, fontWeight: selected ? '800' : '600' },
                          ]}
                        >
                          {t.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              {selectedType ? (
                <View style={styles.typeHintWrap}>
                  {selectedType.description ? (
                    <Text style={[typography.small, { color: colors.textMuted }]}>{selectedType.description}</Text>
                  ) : null}
                  <View style={styles.typeBadgeRow}>
                    <View style={[styles.typeBadge, { backgroundColor: colors.surfaceAlt }]}>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        Quota {selectedType.yearlyQuota}d
                      </Text>
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: selectedType.paid ? '#DCFCE7' : '#FEF3C7' }]}>
                      <Text style={[typography.caption, { color: selectedType.paid ? '#16A34A' : '#B45309' }]}>
                        {selectedType.paid ? 'Paid' : 'Unpaid'}
                      </Text>
                    </View>
                    {selectedType.requiresDocument ? (
                      <View style={[styles.typeBadge, { backgroundColor: '#FEE2E2' }]}>
                        <Text style={[typography.caption, { color: '#DC2626' }]}>Document required</Text>
                      </View>
                    ) : null}
                    {selectedType.minAdvanceNoticeDays > 0 ? (
                      <View style={[styles.typeBadge, { backgroundColor: colors.surfaceAlt }]}>
                        <Text style={[typography.caption, { color: colors.textMuted }]}>
                          {selectedType.minAdvanceNoticeDays}d notice
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </>
          )}

          <SegmentedControl
            options={['Date range', 'Custom dates']}
            selectedIndex={useCustomDates ? 1 : 0}
            onChange={index => {
              const custom = index === 1;
              setUseCustomDates(custom);
              if (custom) setDayPortion('full'); // half-day only makes sense for a single range day
            }}
            style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}
          />

          {!useCustomDates ? (
            <View style={styles.dateRow}>
              <View style={styles.dateBox}>
                <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>
                  Start date
                </Text>
                <Pressable
                  onPress={() => setShowStartPicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Start date, ${formatDateDDMMYYYY(startDate)}. Tap to change`}
                  hitSlop={{ top: 4, bottom: 4 }}
                  style={[
                    styles.dateButton,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  <CalendarDays size={16} color={colors.brand} />
                  <Text style={[typography.body, { color: colors.text }]}>
                    {formatDateDDMMYYYY(startDate)}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.dateBox}>
                <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>
                  End date
                </Text>
                <Pressable
                  onPress={() => setShowEndPicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`End date, ${formatDateDDMMYYYY(endDate)}. Tap to change`}
                  hitSlop={{ top: 4, bottom: 4 }}
                  style={[
                    styles.dateButton,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  <CalendarDays size={16} color={colors.brand} />
                  <Text style={[typography.body, { color: colors.text }]}>
                    {formatDateDDMMYYYY(endDate)}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>
                Dates
              </Text>
              <View style={styles.chipWrap}>
                {customDates.map(d => (
                  <View
                    key={d}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: colors.brandSoft,
                        borderColor: colors.brand,
                        borderRadius: radii.pill,
                      },
                    ]}
                  >
                    <Text style={[typography.small, { color: colors.brandStrong }]}>
                      {formatDateDDMMYYYY(d)}
                    </Text>
                    <Pressable
                      onPress={() => setCustomDates(prev => prev.filter(x => x !== d))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove date ${formatDateDDMMYYYY(d)}`}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <X size={14} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
              <Button
                title="Add date"
                onPress={() => setShowCustomPicker(true)}
                variant="outline"
                size="sm"
                icon={Plus}
                style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
                accessibilityLabel="Add a custom leave date"
              />
            </View>
          )}

          {/* Full / Half day (single range day only) */}
          {!useCustomDates && selectedType?.halfDayAllowed ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>Duration</Text>
              <SegmentedControl
                options={['Full day', 'Half day']}
                selectedIndex={dayPortion === 'half' ? 1 : 0}
                onChange={(i) => setDayPortion(i === 1 ? 'half' : 'full')}
              />
              {dayPortion === 'half' ? (
                <View style={{ marginTop: spacing.md }}>
                  <SegmentedControl
                    options={['First half', 'Second half']}
                    selectedIndex={halfDayType === 'second' ? 1 : 0}
                    onChange={(i) => setHalfDayType(i === 1 ? 'second' : 'first')}
                  />
                  <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.xs }]}>
                    Counts as 0.5 day, applied to the start date.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View
            style={[
              styles.summaryRow,
              {
                backgroundColor: colors.brandSoft,
                borderRadius: radii.md,
                marginTop: spacing.lg,
              },
            ]}
          >
            <Text style={[typography.body, { color: colors.brandStrong }]}>
              Total days selected
            </Text>
            <Text
              style={[typography.title, { color: colors.brandStrong }]}
              accessibilityLiveRegion="polite"
            >
              {totalDays}
            </Text>
          </View>

          {holidaysInRange.length > 0 && (
            <View
              style={[
                styles.banner,
                {
                  backgroundColor: allDaysAreHolidays ? colors.infoSoft : colors.warningSoft,
                  borderColor: allDaysAreHolidays ? colors.info : colors.warning,
                  borderRadius: radii.sm,
                  marginTop: spacing.md,
                },
              ]}
              accessibilityLiveRegion="polite"
            >
              <View style={styles.bannerHeader}>
                <PartyPopper
                  size={16}
                  color={allDaysAreHolidays ? colors.info : colors.warning}
                />
                <Text style={[typography.bodyBold, styles.flexText, { color: colors.text }]}>
                  {allDaysAreHolidays
                    ? 'All selected dates are public holidays'
                    : 'Selected range includes public holiday(s)'}
                </Text>
              </View>
              {holidaysInRange.map(h => (
                <Text
                  key={h.date}
                  style={[typography.small, { color: colors.textMuted }]}
                >
                  • {formatDateDDMMYYYY(h.date)}: {h.names.join(', ')}
                </Text>
              ))}
            </View>
          )}

          {!useCustomDates && showStartPicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(e: any, d?: Date) => {
                setShowStartPicker(false);
                if (d) {
                  if (isPastDate(d)) {
                    showToast({ type: 'warning', title: 'Invalid date', message: 'You cannot select a past date.' });
                    return;
                  }
                  if (isWeekendDate(d)) {
                    showToast({ type: 'warning', title: 'Weekend', message: 'You cannot select Saturday or Sunday.' });
                    return;
                  }
                  if (isHolidayDate(d)) {
                    const names = holidaysMap[toISODate(d)]?.join(', ');
                    showToast({
                      type: 'warning',
                      title: names || 'Public holiday',
                      message: 'You cannot select a public holiday as start date.',
                    });
                    return;
                  }
                  setStartDate(d);
                  setDisplayMonthNum(d.getMonth() + 1);
                  setDisplayYear(d.getFullYear());
                  if (d > endDate) setEndDate(d);
                }
              }}
            />
          )}
          {!useCustomDates && showEndPicker && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(e: any, d?: Date) => {
                setShowEndPicker(false);
                if (d) {
                  if (isPastDate(d)) {
                    showToast({ type: 'warning', title: 'Invalid date', message: 'You cannot select a past date.' });
                    return;
                  }
                  if (isWeekendDate(d)) {
                    showToast({ type: 'warning', title: 'Weekend', message: 'You cannot select Saturday or Sunday.' });
                    return;
                  }
                  if (isHolidayDate(d)) {
                    const names = holidaysMap[toISODate(d)]?.join(', ');
                    showToast({
                      type: 'warning',
                      title: names || 'Public holiday',
                      message: 'You cannot select a public holiday as end date.',
                    });
                    return;
                  }
                  setEndDate(d);
                  setDisplayMonthNum(d.getMonth() + 1);
                  setDisplayYear(d.getFullYear());
                }
              }}
            />
          )}
          {useCustomDates && showCustomPicker && (
            <DateTimePicker
              value={new Date()}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(e: any, d?: Date) => {
                setShowCustomPicker(false);
                if (d) {
                  if (isPastDate(d)) {
                    showToast({ type: 'warning', title: 'Invalid date', message: 'You cannot select a past date.' });
                    return;
                  }
                  if (isWeekendDate(d)) {
                    showToast({ type: 'warning', title: 'Weekend', message: 'You cannot select Saturday or Sunday.' });
                    return;
                  }
                  if (isHolidayDate(d)) {
                    const names = holidaysMap[toISODate(d)]?.join(', ');
                    showToast({
                      type: 'warning',
                      title: names || 'Public holiday',
                      message: 'You cannot select a public holiday.',
                    });
                    return;
                  }
                  const iso = toISODate(d);
                  setCustomDates(prev => prev.includes(iso) ? prev : [...prev, iso]);
                  setDisplayMonthNum(d.getMonth() + 1);
                  setDisplayYear(d.getFullYear());
                }
              }}
            />
          )}

          <View style={{ marginTop: spacing.lg }}>
            <Input
              label="Reason"
              icon={FileText}
              placeholder="e.g., Fever, Family function, Travel"
              value={reason}
              onChangeText={setReason}
            />
            <Input
              label="Detailed description (optional)"
              icon={NotebookPen}
              placeholder="Add context so your approver understands"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              inputStyle={styles.textArea}
            />
          </View>

          {/* Emergency toggle */}
          <View style={[styles.emergencyRow, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, marginTop: spacing.lg }]}>
            <View style={styles.emergencyLeft}>
              <View style={[styles.emergencyIcon, { backgroundColor: '#FEE2E2' }]}>
                <Zap size={16} color="#DC2626" />
              </View>
              <View style={styles.flexText}>
                <Text style={[typography.bodyBold, { color: colors.text }]}>Emergency leave</Text>
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  Skips the advance-notice rule when the type allows it.
                </Text>
              </View>
            </View>
            <Switch
              value={isEmergency}
              onValueChange={setIsEmergency}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
          </View>

          {/* Contact + address during leave */}
          <View style={{ marginTop: spacing.lg }}>
            <Input
              label="Contact number during leave (optional)"
              icon={Phone}
              placeholder="A number where you're reachable"
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
            />
            <Input
              label="Address during leave (optional)"
              icon={MapPin}
              placeholder="Where you'll be staying"
              value={addressDuringLeave}
              onChangeText={setAddressDuringLeave}
              multiline
              numberOfLines={2}
              inputStyle={styles.textArea}
            />
          </View>

          {/* Expected return date */}
          <View style={{ marginTop: spacing.md }}>
            <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>
              Expected return date (optional)
            </Text>
            <Pressable
              onPress={() => setShowReturnPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Expected return date"
              style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md }]}
            >
              <CalendarClock size={16} color={colors.brand} />
              <Text style={[typography.body, { color: expectedReturn ? colors.text : colors.textMuted }]}>
                {expectedReturn ? formatDateDDMMYYYY(expectedReturn) : 'Select a date'}
              </Text>
              {expectedReturn ? (
                <Pressable
                  onPress={() => setExpectedReturn(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ marginLeft: 'auto' }}
                >
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </Pressable>
            {showReturnPicker && (
              <DateTimePicker
                value={expectedReturn || endDate}
                mode="date"
                display="default"
                minimumDate={startDate}
                onChange={(e: any, d?: Date) => {
                  setShowReturnPicker(false);
                  if (d) setExpectedReturn(d);
                }}
              />
            )}
          </View>

          {/* Supporting documents */}
          <View style={{ marginTop: spacing.lg }}>
            <View style={styles.delegateHeaderRow}>
              <Paperclip size={16} color={colors.brand} />
              <Text style={[typography.label, { color: colors.text, marginLeft: spacing.xs }]}>
                Supporting documents{selectedType?.requiresDocument ? ' (required)' : ' (optional)'}
              </Text>
            </View>
            <Text style={[typography.small, { color: colors.textMuted, marginTop: 2, marginBottom: spacing.md }]}>
              {selectedType?.requiresDocument
                ? 'Attach your medical certificate as a clear photo.'
                : 'Attach a photo of any supporting document.'}
            </Text>

            <DocUploadGroup
              icon={Stethoscope}
              label="Medical certificate"
              files={medicalFiles}
              onPickGallery={() => pickDocuments('medical', false)}
              onPickCamera={() => pickDocuments('medical', true)}
              onRemove={(i) => removeFile('medical', i)}
              theme={theme}
              uploading={uploading}
            />
            <View style={{ height: spacing.md }} />
            <DocUploadGroup
              icon={FileText}
              label="Other documents"
              files={supportingFiles}
              onPickGallery={() => pickDocuments('supporting', false)}
              onPickCamera={() => pickDocuments('supporting', true)}
              onRemove={(i) => removeFile('supporting', i)}
              theme={theme}
              uploading={uploading}
            />
          </View>

          {/* Additional comments */}
          <View style={{ marginTop: spacing.lg }}>
            <Input
              label="Additional comments (optional)"
              icon={NotebookPen}
              placeholder="Anything else for your approver"
              value={comments}
              onChangeText={setComments}
              multiline
              numberOfLines={2}
              inputStyle={styles.textArea}
            />
          </View>

          {colleagues.length > 0 && (
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.delegateHeaderRow}>
                <UserCheck size={16} color={colors.brand} />
                <Text style={[typography.label, { color: colors.text, marginLeft: spacing.xs }]}>
                  Assign a colleague to cover (optional)
                </Text>
              </View>
              <Text style={[typography.small, { color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm }]}>
                They'll be notified that your work is theirs while you're on leave.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.delegateChipRow}>
                  {colleagues.map((c) => {
                    const selected = selectedDelegateId === c._id;
                    return (
                      <Pressable
                        key={c._id}
                        onPress={() => {
                          haptic('selection');
                          setSelectedDelegateId(selected ? null : c._id);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Assign ${c.fullName} to cover your work`}
                        style={[
                          styles.chip,
                          {
                            borderRadius: radii.pill,
                            borderColor: selected ? colors.brand : colors.border,
                            backgroundColor: selected ? colors.brandSoft : colors.surface,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.small,
                            { color: selected ? colors.brand : colors.text, fontWeight: selected ? '700' : '500' },
                          ]}
                        >
                          {c.fullName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          <Button
            title="Submit Request"
            onPress={submit}
            icon={Send}
            loading={submitting}
            fullWidth
            accessibilityLabel="Submit leave request"
            style={{ marginTop: spacing.lg }}
          />
        </Card>

        {/* My requests card */}
        <Card elevation={1} enteringIndex={1} style={{ marginTop: spacing.lg }}>
          <Text style={[typography.title, { color: colors.text, marginBottom: spacing.md }]}>
            My Requests
          </Text>
          {loading ? (
            <SkeletonRow lines={3} />
          ) : error ? (
            <View style={styles.bannerHeader}>
              <CircleAlert size={16} color={colors.danger} />
              <Text
                style={[typography.small, styles.flexText, { color: colors.danger }]}
                accessibilityLiveRegion="polite"
              >
                {error}
              </Text>
            </View>
          ) : (
            <View>
              {statusRows.map((row, index) => (
                <Pressable
                  key={row.status}
                  onPress={() => setViewStatus(row.status)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${row.count} ${row.label.toLowerCase()} requests`}
                  style={[
                    styles.statusRow,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                  ]}
                >
                  <StatusBadge status={row.status} label={row.label} />
                  <View style={styles.statusRowRight}>
                    <Text style={[typography.title, { color: colors.text }]}>
                      {row.count}
                    </Text>
                    <ChevronRight size={18} color={colors.textMuted} />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        {/* Public holidays card */}
        <Card elevation={1} enteringIndex={2} style={{ marginTop: spacing.lg }}>
          <Text style={[typography.title, { color: colors.text, marginBottom: spacing.md }]}>
            Public Holidays this month
          </Text>
          {monthlyHolidays.length === 0 ? (
            <Text style={[typography.small, { color: colors.textMuted }]}>
              No public holidays this month
            </Text>
          ) : (
            monthlyHolidays.map((it, index) => (
              <View
                key={`${it.date}-${it.name}`}
                style={[
                  styles.holidayRow,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <PartyPopper size={16} color={colors.info} />
                <Text style={[typography.bodyBold, { color: colors.text }]}>
                  {formatDateDDMMYYYY(it.date)}
                </Text>
                <Text
                  style={[typography.small, styles.flexText, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {it.name}
                </Text>
              </View>
            ))
          )}
        </Card>
      </Screen>

      {/* Status detail modal */}
      <Modal
        visible={viewStatus !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setViewStatus(null)}
      >
        <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]}>
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: colors.surface,
                borderBottomColor: colors.border,
                padding: spacing.lg,
              },
            ]}
          >
            <Text style={[typography.h3, { color: colors.text }]} accessibilityRole="header">
              {viewStatus === 'pending' ? 'Pending' : viewStatus === 'approved' ? 'Approved' : 'Rejected'} Requests
            </Text>
            <Pressable
              onPress={() => setViewStatus(null)}
              accessibilityRole="button"
              accessibilityLabel="Close request list"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[
                styles.modalClose,
                { backgroundColor: colors.surfaceAlt, borderRadius: radii.pill },
              ]}
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {(viewStatus ? getListByStatus(viewStatus) : []).length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No records"
                message={`You have no ${viewStatus || ''} leave requests yet.`}
              />
            ) : (
              (viewStatus ? getListByStatus(viewStatus) : []).map((lr, idx) => {
                const sd = new Date(lr.startDate);
                const ed = new Date(lr.endDate);
                const num = lr.days ?? daysBetween(sd, ed);
                const rejectionReason = (lr as any).reson || (lr as any).rejectReason || (lr as any).rejectionReason || '';
                return (
                  <Card
                    key={lr._id || lr.id || `vs-${idx}`}
                    elevation={1}
                    enteringIndex={Math.min(idx, 8)}
                    style={{ marginBottom: spacing.md }}
                    accessibilityLabel={`Leave from ${formatDateDDMMYYYY(sd)} to ${formatDateDDMMYYYY(ed)}, ${num} days`}
                  >
                    <View style={styles.requestHeader}>
                      <View style={[styles.bannerHeader, styles.flexText]}>
                        <CalendarDays size={16} color={colors.brand} />
                        <Text style={[typography.bodyBold, { color: colors.text }]}>
                          {formatDateDDMMYYYY(sd)} - {formatDateDDMMYYYY(ed)}
                        </Text>
                      </View>
                      <StatusBadge
                        status={viewStatus || 'pending'}
                        label={`${num} day${num === 1 ? '' : 's'}`}
                        size="small"
                      />
                    </View>
                    {/* Leave type + where it was sent */}
                    <View style={styles.reqMetaRow}>
                      {(lr as any).leaveTypeName ? (
                        <View style={[styles.reqTypePill, { backgroundColor: colors.brandSoft }]}>
                          <Text style={[typography.caption, { color: colors.brand, fontWeight: '800' }]}>
                            {(lr as any).leaveTypeName}
                          </Text>
                        </View>
                      ) : null}
                      {(lr as any).isEmergency ? (
                        <View style={[styles.reqTypePill, { backgroundColor: '#FEE2E2' }]}>
                          <Text style={[typography.caption, { color: '#DC2626', fontWeight: '800' }]}>Emergency</Text>
                        </View>
                      ) : null}
                      {(lr as any).dayPortion === 'half' ? (
                        <View style={[styles.reqTypePill, { backgroundColor: '#FEF3C7' }]}>
                          <Text style={[typography.caption, { color: '#B45309', fontWeight: '800' }]}>Half day</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text
                      style={[typography.small, { color: colors.textMuted, marginTop: spacing.xs }]}
                    >
                      {lr.reason}
                    </Text>

                    {(lr as any).assignedTo?.name ? (
                      <View style={[styles.bannerHeader, { marginTop: spacing.sm }]}>
                        <Building2 size={14} color={colors.brand} />
                        <Text style={[typography.caption, styles.flexText, { color: colors.textMuted }]}>
                          Sent to: <Text style={{ color: colors.text, fontWeight: '700' }}>{(lr as any).assignedTo.name}</Text>
                          {(lr as any).assignedTo.role ? ` · ${(lr as any).assignedTo.role}` : ''}
                        </Text>
                      </View>
                    ) : null}

                    {Array.isArray((lr as any).attachments) && (lr as any).attachments.length > 0 ? (
                      <View style={[styles.bannerHeader, { marginTop: spacing.sm }]}>
                        <Paperclip size={14} color={colors.brand} />
                        <Text style={[typography.caption, styles.flexText, { color: colors.textMuted }]}>
                          {(lr as any).attachments.length} document{(lr as any).attachments.length === 1 ? '' : 's'} attached
                        </Text>
                      </View>
                    ) : null}

                    {viewStatus === 'rejected' && rejectionReason ? (
                      <View style={[styles.bannerHeader, { marginTop: spacing.sm }]}>
                        <CircleAlert size={14} color={colors.danger} />
                        <Text
                          style={[typography.caption, styles.flexText, { color: colors.danger }]}
                        >
                          Reject reason: {rejectionReason}
                        </Text>
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Submission summary sheet */}
      <Modal
        visible={showSummary}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSummary(false)}
      >
        <View style={[styles.summarySheetRoot, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.summarySheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radii.xl,
                borderTopRightRadius: radii.xl,
                padding: spacing.xl,
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={[styles.bannerHeader, { marginTop: spacing.md, marginBottom: spacing.md }]}>
              <CalendarPlus size={20} color={colors.brand} />
              <Text style={[typography.h3, { color: colors.text }]} accessibilityRole="header">
                Leave Request Summary
              </Text>
            </View>
            <ScrollView style={styles.summaryList}>
              {summaryItems.map((it, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.summaryItem,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: radii.md,
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  <Text style={[typography.bodyBold, { color: colors.text }]}>
                    {formatDateDDMMYYYY(it.startDate)}
                    {it.endDate !== it.startDate ? ` - ${formatDateDDMMYYYY(it.endDate)}` : ''}
                  </Text>
                  <Text style={[typography.small, { color: colors.textMuted }]}>
                    Reason: {it.reason}
                  </Text>
                  {it.notes ? (
                    <Text style={[typography.small, { color: colors.textMuted }]}>
                      Notes: {it.notes}
                    </Text>
                  ) : null}
                  <View style={{ marginTop: spacing.sm }}>
                    <StatusBadge
                      status={it.source === 'server' ? 'success' : 'pending'}
                      label={`${it.status || 'submitted'} (${it.source})`}
                      size="small"
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
            <Button
              title="Close"
              onPress={() => setShowSummary(false)}
              fullWidth
              style={{ marginTop: spacing.md }}
              accessibilityLabel="Close leave request summary"
            />
          </View>
        </View>
      </Modal>

      {/* Holiday-in-range confirmation */}
      <ConfirmSheet
        visible={holidayConfirmVisible}
        title="Includes public holiday(s)"
        message={`Your selection includes:\n${holidaysInRange
          .map(h => `${formatDateDDMMYYYY(h.date)}: ${h.names.join(', ')}`)
          .join('\n')}\n\nApply leave for the working day(s) anyway?`}
        confirmLabel="Continue"
        cancelLabel="Cancel"
        icon={PartyPopper}
        loading={submitting}
        onConfirm={async () => {
          setHolidayConfirmVisible(false);
          await performSubmit();
        }}
        onCancel={() => setHolidayConfirmVisible(false)}
      />

      {/* "i" help / guide — how, what & where for the whole leave flow */}
      <Modal
        visible={showHelp}
        animationType="slide"
        transparent
        onRequestClose={() => setShowHelp(false)}
      >
        <View style={[styles.summarySheetRoot, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.helpSheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radii.xl,
                borderTopRightRadius: radii.xl,
                paddingHorizontal: spacing.xl,
                paddingTop: spacing.lg,
                paddingBottom: spacing.xl,
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={styles.helpTitleRow}>
              <View style={[styles.helpTitleIcon, { backgroundColor: colors.brandSoft }]}>
                <Info size={20} color={colors.brand} />
              </View>
              <Text style={[typography.h3, styles.flexText, { color: colors.text }]} accessibilityRole="header">
                How leave works
              </Text>
              <Pressable
                onPress={() => setShowHelp(false)}
                accessibilityRole="button"
                accessibilityLabel="Close help"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[styles.modalClose, { backgroundColor: colors.surfaceAlt, borderRadius: radii.pill }]}
              >
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.helpScroll}>
              {/* 1 — How to apply */}
              <HelpSection icon={ListChecks} title="How to apply" color={colors.brand} theme={theme}>
                {[
                  'Pick a Leave Type that matches your reason (Casual, Sick, Earned, etc.).',
                  'Choose Start & End date — or use Custom dates for scattered days.',
                  'Select Full day or Half day (first / second half).',
                  'Write a short Reason and add Details if needed.',
                  'Attach a document if the type needs one (see below).',
                  'Optionally assign a colleague to cover your work.',
                  'Tap Submit Request — done!',
                ].map((t, i) => (
                  <HelpStep key={i} n={i + 1} text={t} theme={theme} />
                ))}
              </HelpSection>

              {/* 2 — Documents */}
              <HelpSection icon={Paperclip} title="Documents & medical certificate" color="#DC2626" theme={theme}>
                <HelpLine theme={theme} text="Sick / medical leaves REQUIRE a medical certificate. Sick leave of 3+ days won't submit without it." />
                <HelpLine theme={theme} text="You can attach a clear photo or PDF. Multiple files are allowed." />
                <HelpLine theme={theme} text="Your files are private — only your HOD / admin can open them, and every view is logged." />
              </HelpSection>

              {/* 3 — Who approves it */}
              <HelpSection icon={Building2} title="Where your request goes" color="#16A34A" theme={theme}>
                <HelpLine theme={theme} text="Your request is sent to your Department HOD. If there's no HOD, it goes to the Institution Admin." />
                <HelpLine theme={theme} text="You'll see “Sent to: <name>” on your request, and get a notification when it's approved or rejected." />
                <HelpLine theme={theme} text="If a colleague is assigned to cover, they are notified too." />
              </HelpSection>

              {/* 4 — Statuses */}
              <HelpSection icon={ShieldCheck} title="Request statuses" color="#6366F1" theme={theme}>
                <HelpLine theme={theme} text="Pending — waiting for your HOD / admin to review." />
                <HelpLine theme={theme} text="Approved — leave granted; it shows on your attendance calendar." />
                <HelpLine theme={theme} text="Rejected — not granted; the reason is shown on the request." />
                <HelpLine theme={theme} text="Cancelled — you withdrew it (allowed within 1 hour of applying, while still pending)." />
              </HelpSection>

              {/* 5 — Good to know */}
              <HelpSection icon={Clock} title="Good to know" color="#F59E0B" theme={theme}>
                <HelpLine theme={theme} text="You cannot apply for a past date." />
                <HelpLine theme={theme} text="Weekends and public holidays are auto-excluded from your leave days." />
                <HelpLine theme={theme} text="You cannot take leave for a day you've already checked in on." />
                <HelpLine theme={theme} text="Each leave type has its own yearly quota and advance-notice rule (emergency leave can skip advance notice)." />
              </HelpSection>
            </ScrollView>

            <Button
              title="Got it"
              onPress={() => setShowHelp(false)}
              fullWidth
              style={{ marginTop: spacing.md }}
              accessibilityLabel="Close help"
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

/* ── Help modal building blocks ─────────────────────────────────────────── */
const HelpSection: React.FC<{ icon: any; title: string; color: string; theme: any; children: React.ReactNode }> = ({
  icon: Icon,
  title,
  color,
  theme,
  children,
}) => {
  const { colors, spacing, typography } = theme;
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.helpSectionHeader}>
        <View style={[styles.helpSectionIcon, { backgroundColor: color + '22' }]}>
          <Icon size={15} color={color} strokeWidth={2.4} />
        </View>
        <Text style={[typography.bodyBold, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>{children}</View>
    </View>
  );
};

const HelpStep: React.FC<{ n: number; text: string; theme: any }> = ({ n, text, theme }) => {
  const { colors, typography } = theme;
  return (
    <View style={styles.helpStepRow}>
      <View style={[styles.helpStepNum, { backgroundColor: colors.brand }]}>
        <Text style={styles.helpStepNumTxt}>{n}</Text>
      </View>
      <Text style={[typography.small, styles.flexText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
};

const HelpLine: React.FC<{ text: string; theme: any }> = ({ text, theme }) => {
  const { colors, typography } = theme;
  return (
    <View style={styles.helpLineRow}>
      <View style={[styles.helpBullet, { backgroundColor: colors.brand }]} />
      <Text style={[typography.small, styles.flexText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
};

/* Document upload group — thumbnails (with remove) + Gallery / Camera buttons. */
const DocUploadGroup: React.FC<{
  icon: any;
  label: string;
  files: any[];
  onPickGallery: () => void;
  onPickCamera: () => void;
  onRemove: (i: number) => void;
  theme: any;
  uploading: boolean;
}> = ({ icon: Icon, label, files, onPickGallery, onPickCamera, onRemove, theme, uploading }) => {
  const { colors, typography, radii } = theme;
  return (
    <View>
      <View style={styles.docLabelRow}>
        <Icon size={14} color={colors.brand} />
        <Text style={[typography.small, { color: colors.text, fontWeight: '700' }]}>{label}</Text>
        {files.length > 0 ? (
          <View style={[styles.docCount, { backgroundColor: colors.brandSoft }]}>
            <Text style={[typography.caption, { color: colors.brand, fontWeight: '800' }]}>{files.length}</Text>
          </View>
        ) : null}
      </View>

      {files.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {files.map((f, i) => (
              <View key={i} style={styles.docThumbWrap}>
                <Image source={{ uri: f.path || f.uri }} style={[styles.docThumb, { borderColor: colors.border }]} />
                <Pressable
                  onPress={() => onRemove(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${label} ${i + 1}`}
                  style={[styles.docRemove, { backgroundColor: colors.danger }]}
                >
                  <X size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <View style={styles.docBtnRow}>
        <Pressable
          onPress={onPickGallery}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={`Add ${label} from gallery`}
          style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, opacity: uploading ? 0.6 : 1 }]}
        >
          <ImagePlus size={16} color={colors.brand} />
          <Text style={[typography.small, { color: colors.text }]}>Gallery</Text>
        </Pressable>
        <Pressable
          onPress={onPickCamera}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={`Capture ${label} with camera`}
          style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, opacity: uploading ? 0.6 : 1 }]}
        >
          <Camera size={16} color={colors.brand} />
          <Text style={[typography.small, { color: colors.text }]}>Camera</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexText: {
    flex: 1,
  },
  header: {
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateBox: {
    flex: 1,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    minHeight: 48,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    minHeight: 32,
  },
  delegateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  delegateChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },

  // Leave type selector
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderWidth: 1.5,
    minHeight: 40,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typeHintWrap: {
    marginBottom: 4,
    gap: 6,
  },
  typeBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // Emergency toggle
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    gap: 10,
  },
  emergencyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  emergencyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Documents
  docLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  docCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  docThumbWrap: {
    position: 'relative',
  },
  docThumb: {
    width: 62,
    height: 62,
    borderRadius: 10,
    borderWidth: 1,
  },
  docRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  docBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    minHeight: 44,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  banner: {
    padding: 12,
    borderWidth: 1,
    gap: 4,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 48,
  },
  statusRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  holidayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  reqMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  reqTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  modalClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  summarySheet: {
    maxHeight: '85%',
  },
  summaryList: {
    maxHeight: 320,
  },
  summaryItem: {
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },

  // Help / "i" modal
  helpSheet: {
    maxHeight: '88%',
  },
  helpScroll: {
    marginTop: 8,
  },
  helpTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  helpTitleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helpSectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  helpStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  helpStepNumTxt: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  helpLineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  helpBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
});

export default LeaveRequestScreen;
