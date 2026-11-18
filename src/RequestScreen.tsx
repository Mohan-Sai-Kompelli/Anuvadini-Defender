import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ImagePicker from 'react-native-image-crop-picker';
import Animated, {
  FadeInDown,
  LinearTransition,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Camera,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleStop,
  FileText,
  GraduationCap,
  History,
  Images,
  ImagePlus,
  Info,
  ListChecks,
  MapPin,
  Navigation,
  NotebookPen,
  Paperclip,
  Phone,
  Plane,
  Clock,
  Plus,
  Send,
  Share2,
  ShieldCheck,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Upload,
  UserCheck,
  X,
  Zap,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from './AuthContext';
import { apiService } from './services/api';
import { getCachedLeaveRequests, getCachedFieldRequests, getCachedCheckoutRequests } from './db/cache/requestsCache';
import {
  requestBackgroundLocationPermission,
  requestLocationPermission,
  requestNotificationPermission,
} from './utils/location';
import { liveLocationService } from './services/liveLocationService';
import { backgroundLocationService } from './services/backgroundLocationService';
import { nativeLiveLocation } from './services/nativeLiveLocation';
import { getApiBaseUrl } from './config';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Input,
  Screen,
  SegmentedControl,
  SkeletonCard,
  StatusBadge,
  useTheme,
} from './components/ui';
import { showToast } from './utils/toast';
import { haptic } from './utils/haptics';

type RequestType = 'leave' | 'field' | 'checkout';

// Department colleague selectable as a leave delegate (cover person).
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
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt?: string;
  type: 'leave';
  reson?: string; // rejection reason
  delegate?: Colleague | null;
  contactNumber?: string;
  addressDuringLeave?: string;
  expectedReturnDate?: string;
  description?: string;
  comments?: string;
  attachments?: any[];
};

type CheckoutRecord = {
  _id?: string;
  id?: string;
  date: string;
  details: string; // The reason
  startDate: string; // alias for date
  endDate: string; // alias for date
  reason: string; // alias for details
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt?: string;
  type: 'checkout';
  reson?: string; // rejection reason
  evidence?: string[];
};

type ReportPhoto = { label?: string; image: string; uploadedAt?: string };
type ReportDocument = {
  name?: string;
  mimeType?: string;
  data?: string;
  uploadedAt?: string;
};
type FieldReport = {
  submittedAt?: string;
  notes?: string;
  photos?: ReportPhoto[];
  documents?: ReportDocument[];
};

type FieldRecord = {
  _id?: string;
  id?: string;
  eventTitle?: string;
  startDate: string;
  endDate: string;
  days?: number;
  reason: string;
  notes?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'no_response';
  createdAt?: string;
  type: 'field';
  reson?: string; // rejection reason
  report?: FieldReport;
  location?: string;
  accompaniedBy?: string;
  evidence?: { image: string }[];
  noResponseAt?: string;
  noResponseReason?: string;
  noResponseReviewed?: boolean;
  noResponseReviewedAt?: string;
};

type RequestRecord = LeaveRecord | FieldRecord | CheckoutRecord;

// Shared by the live API response handling in loadRequests() and by the local
// WatermelonDB cache hydration on mount — both start from the same loosely
// shaped server record and need the same field fallbacks (backend key names
// have drifted across API versions; see the `it.a || it.b` chains below).
const normalizeLeave = (it: any): LeaveRecord => ({
  ...it,
  type: 'leave' as const,
  startDate: it.startDate || it.leaveDates?.start || it.fromDate,
  endDate: it.endDate || it.leaveDates?.end || it.toDate,
  reason: it.reason || it.leaveDetails || it.details || '',
  status: it.status || 'pending',
  reson: it.reson || it.rejectReason || '',
  delegate: it.delegate || null,
});

const normalizeField = (it: any): FieldRecord => ({
  ...it,
  type: 'field' as const,
  eventTitle: it.eventTitle || it.title || '',
  startDate: it.startDate || it.fromDate,
  endDate: it.endDate || it.toDate,
  reason: it.reason || it.details || '',
  location: it.location,
  accompaniedBy: it.accompaniedBy,
  evidence: it.evidence || [],
  status: it.status || 'pending',
  reson: it.reson || it.rejectReason || '',
  report: it.report,
  noResponseAt: it.noResponseAt,
  noResponseReason: it.noResponseReason,
  noResponseReviewed: !!it.noResponseReviewed,
  noResponseReviewedAt: it.noResponseReviewedAt,
});

const normalizeCheckout = (it: any): CheckoutRecord => ({
  ...it,
  type: 'checkout' as const,
  date: it.date,
  details: it.details || it.reason || '',
  startDate: it.date,
  endDate: it.date,
  reason: it.details || it.reason || '',
  status: it.status || 'pending',
  reson: it.reson || it.rejectReason || '',
  evidence: it.evidence || [],
});

const SHEET_MAX_HEIGHT = Dimensions.get('window').height * 0.88;

/**
 * ConfirmSheet-style bottom sheet (Modal + Reanimated, no gesture-handler)
 * used for the request form and live-location share flows.
 */
function FormSheet({
  visible,
  title,
  icon: Icon,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  icon?: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { theme } = useTheme();
  const { colors, spacing, typography, radii, durations } = theme;
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: durations.normal,
        reduceMotion: ReduceMotion.System,
      });
    } else {
      // Dismiss the keyboard FIRST (not on unmount) so its OS-driven collapse
      // animation runs alongside the sheet's slide-down instead of racing it
      // after the fact — that mismatch was the source of the visible flicker.
      Keyboard.dismiss();
      progress.value = withTiming(
        0,
        { duration: durations.fast, reduceMotion: ReduceMotion.System },
        finished => {
          if (finished) {
            runOnJS(unmount)();
          }
        },
      );
    }
  }, [visible, progress, durations.normal, durations.fast, unmount]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 600 }],
  }));

  if (!mounted) {
    return null;
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <View style={sheetStyles.root}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: colors.overlay },
              backdropStyle,
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            />
          </Animated.View>

          <Animated.View
            style={[
              sheetStyles.sheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radii.xl,
                borderTopRightRadius: radii.xl,
                paddingBottom: Math.max(insets.bottom, 10),
              },
              sheetStyle,
            ]}
            accessibilityViewIsModal
          >
            <View style={{ width: '100%', flexShrink: 1 }}>
              <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />
              <View
                style={[
                  sheetStyles.headerRow,
                  {
                    paddingHorizontal: spacing.xl,
                    paddingTop: spacing.lg,
                    paddingBottom: spacing.md,
                  },
                ]}
              >
                <View style={sheetStyles.headerTitle}>
                  {Icon ? (
                    <Icon size={20} color={colors.brand} strokeWidth={2} />
                  ) : null}
                  <Text
                    style={[typography.h3, { color: colors.text }]}
                    accessibilityRole="header"
                  >
                    {title}
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={`Close ${title}`}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={[
                    sheetStyles.closeButton,
                    { backgroundColor: colors.surfaceAlt, borderRadius: radii.pill },
                  ]}
                >
                  <X size={18} color={colors.textMuted} />
                </Pressable>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                contentContainerStyle={{
                  paddingHorizontal: spacing.xl,
                  paddingBottom: spacing.xl + 24,
                }}
              >
                {children}
              </ScrollView>
            </View>

            {/* Extended solid bottom fill to completely prevent bottom tab bar / background leakage */}
            <View
              style={{
                position: 'absolute',
                bottom: -300,
                left: 0,
                right: 0,
                height: 300,
                backgroundColor: colors.surface,
              }}
            />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Local fallback catalogue — mirrors the 13 seeded backend leave types so the
// picker ALWAYS populates instantly, even before the backend /leave-types
// endpoint is deployed (no endless "Loading…"). When the server list is
// available it replaces this; otherwise submission falls back to the legacy
// leave endpoint with the chosen type name embedded in the reason.
const FALLBACK_LEAVE_TYPES: any[] = [
  { _id: 'local-CL', code: 'CL', name: 'Casual Leave', description: 'Short personal leave for casual needs.', color: '#2563EB', paid: true, yearlyQuota: 12, requiresDocument: false, halfDayAllowed: true, minAdvanceNoticeDays: 1, genderEligibility: 'all' },
  { _id: 'local-SL', code: 'SL', name: 'Sick Leave', description: 'Leave due to illness. Certificate for 3+ days.', color: '#DC2626', paid: true, yearlyQuota: 12, requiresDocument: true, halfDayAllowed: true, minAdvanceNoticeDays: 0, genderEligibility: 'all' },
  { _id: 'local-EM', code: 'EM', name: 'Emergency Leave', description: 'Urgent, unforeseen situations.', color: '#EA580C', paid: true, yearlyQuota: 6, requiresDocument: false, halfDayAllowed: true, minAdvanceNoticeDays: 0, genderEligibility: 'all' },
  { _id: 'local-EL', code: 'EL', name: 'Earned / Privilege Leave', description: 'Accrued leave, can be carried forward.', color: '#16A34A', paid: true, yearlyQuota: 15, requiresDocument: false, halfDayAllowed: true, minAdvanceNoticeDays: 3, genderEligibility: 'all' },
  { _id: 'local-AL', code: 'AL', name: 'Annual Leave', description: 'Standard annual vacation leave.', color: '#0891B2', paid: true, yearlyQuota: 18, requiresDocument: false, halfDayAllowed: true, minAdvanceNoticeDays: 7, genderEligibility: 'all' },
  { _id: 'local-ML', code: 'ML', name: 'Marriage Leave', description: 'Leave for your own marriage.', color: '#DB2777', paid: true, yearlyQuota: 5, requiresDocument: true, halfDayAllowed: false, minAdvanceNoticeDays: 15, genderEligibility: 'all' },
  { _id: 'local-BL', code: 'BL', name: 'Bereavement Leave', description: 'Following the death of a close family member.', color: '#64748B', paid: true, yearlyQuota: 5, requiresDocument: false, halfDayAllowed: false, minAdvanceNoticeDays: 0, genderEligibility: 'all' },
  { _id: 'local-MTL', code: 'MTL', name: 'Maternity Leave', description: 'Childbirth and recovery.', color: '#C026D3', paid: true, yearlyQuota: 182, requiresDocument: true, halfDayAllowed: false, minAdvanceNoticeDays: 30, genderEligibility: 'female' },
  { _id: 'local-PTL', code: 'PTL', name: 'Paternity Leave', description: 'For a new father.', color: '#7C3AED', paid: true, yearlyQuota: 15, requiresDocument: false, halfDayAllowed: false, minAdvanceNoticeDays: 15, genderEligibility: 'male' },
  { _id: 'local-CO', code: 'CO', name: 'Comp Off', description: 'For working on a holiday/weekend.', color: '#0D9488', paid: true, yearlyQuota: 12, requiresDocument: false, halfDayAllowed: true, minAdvanceNoticeDays: 1, genderEligibility: 'all' },
  { _id: 'local-LWP', code: 'LWP', name: 'Leave Without Pay', description: 'Unpaid leave when balance is exhausted.', color: '#78716C', paid: false, yearlyQuota: 30, requiresDocument: false, halfDayAllowed: true, minAdvanceNoticeDays: 3, genderEligibility: 'all' },
  { _id: 'local-HD', code: 'HD', name: 'Half-Day Leave', description: 'A single half-day.', color: '#F59E0B', paid: true, yearlyQuota: 24, requiresDocument: false, halfDayAllowed: true, minAdvanceNoticeDays: 0, genderEligibility: 'all' },
  { _id: 'local-STL', code: 'STL', name: 'Study Leave', description: 'For approved study/examinations.', color: '#4F46E5', paid: true, yearlyQuota: 15, requiresDocument: true, halfDayAllowed: false, minAdvanceNoticeDays: 15, genderEligibility: 'all' },
];

export const RequestScreen: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { colors, spacing, radii, typography } = theme;

  // UI State
  const [requestType, setRequestType] = useState<RequestType>('leave');
  // History was rendering every record at once (ScrollView + .map, no
  // FlatList) — the more a user accumulates over their account's lifetime,
  // the slower this screen got to open/scroll. A true FlatList swap would
  // mean restructuring this whole page (forms/filters/other cards share one
  // ScrollView with this list) — riskier than the win is worth here. Capping
  // how many cards actually mount, with a manual "load more", gets the same
  // practical result (bounded render cost regardless of history size)
  // without that restructure.
  const HISTORY_PAGE_SIZE = 20;
  const [historyDisplayLimit, setHistoryDisplayLimit] = useState(HISTORY_PAGE_SIZE);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'leave' | 'field' | 'checkout' | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null);

  // Form State
  const [eventTitle, setEventTitle] = useState('');
  // ── Outreach (on-duty) extra fields ──
  const [outreachLocation, setOutreachLocation] = useState('');
  const [accompaniedBy, setAccompaniedBy] = useState('');
  const [outreachEvidence, setOutreachEvidence] = useState<{ image: string }[]>([]);
  const [outreachUploading, setOutreachUploading] = useState(false);
  const [checkoutEvidence, setCheckoutEvidence] = useState<{ image: string }[]>([]);
  const [checkoutUploading, setCheckoutUploading] = useState(false);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [outreachDurationType, setOutreachDurationType] = useState<'full' | 'half' | 'custom'>('full');
  const [outreachHalfDayType, setOutreachHalfDayType] = useState<'first' | 'second'>('first');
  const [outreachStartTime, setOutreachStartTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [outreachEndTime, setOutreachEndTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(17, 0, 0, 0);
    return d;
  });
  const [showOutreachStartPicker, setShowOutreachStartPicker] = useState(false);
  const [showOutreachEndPicker, setShowOutreachEndPicker] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Delegate ("CC a colleague to cover my work while I'm on leave") — optional,
  // leave requests only; the server scopes the list to the applicant's own
  // organization + department.
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selectedDelegateId, setSelectedDelegateId] = useState<string | null>(null);
  const [delegateDropdownOpen, setDelegateDropdownOpen] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  // ── Enterprise leave fields ──
  const [leaveTypes, setLeaveTypes] = useState<any[]>(() => FALLBACK_LEAVE_TYPES);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(() => FALLBACK_LEAVE_TYPES[0]?._id ?? null);
  const [typesFromServer, setTypesFromServer] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [dayPortion, setDayPortion] = useState<'full' | 'half'>('full');
  const [halfDayType, setHalfDayType] = useState<'first' | 'second'>('first');
  const [isEmergency, setIsEmergency] = useState(false);
  const [contactNumber, setContactNumber] = useState('');
  const [addressDuringLeave, setAddressDuringLeave] = useState('');
  const [expectedReturn, setExpectedReturn] = useState<Date | null>(null);
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  const [comments, setComments] = useState('');
  const [medicalFiles, setMedicalFiles] = useState<any[]>([]);
  const [supportingFiles, setSupportingFiles] = useState<any[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showLeaveHelp, setShowLeaveHelp] = useState(false);

  const selectedLeaveType = leaveTypes.find((t) => t._id === selectedTypeId) || null;

  useEffect(() => {
    let cancelled = false;
    // Show a gender-appropriate fallback catalogue INSTANTLY, then quietly
    // upgrade to the server's configured types if the endpoint is available.
    const gender = (user as any)?.gender;
    const fb = FALLBACK_LEAVE_TYPES.filter(
      (t) => t.genderEligibility === 'all' || !gender || t.genderEligibility === gender
    );
    setLeaveTypes(fb);
    setSelectedTypeId((prev) => (prev && fb.some((t) => t._id === prev) ? prev : fb[0]?._id ?? null));
    (async () => {
      try {
        const res = await apiService.getLeaveTypes();
        if (!cancelled && res.success && Array.isArray(res.data) && res.data.length) {
          setLeaveTypes(res.data);
          setTypesFromServer(true);
          setSelectedTypeId(res.data[0]._id);
        }
      } catch {
        /* older backend — keep the fallback list + legacy submit */
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Detect whether the employee has already checked in TODAY — if so, today's
  // date is not a valid leave day, so the pickers below start from tomorrow and
  // today is never selectable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const res = await apiService.getMonthlyCalendar(now.getMonth() + 1, now.getFullYear());
        if (!cancelled && res.success && (res.data as any)?.days) {
          const todayEntry = (res.data as any).days.find((d: any) => d.day === now.getDate());
          if (todayEntry?.checkIn) setCheckedInToday(true);
        }
      } catch {
        /* best-effort — backend still blocks a checked-in day on submit */
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Earliest date a leave may start: tomorrow if already checked in today, else today.
  const minLeaveDate = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (checkedInToday) d.setDate(d.getDate() + 1);
    return d;
  }, [checkedInToday]);

  // If we learn the user checked in today, push any today-dated selection forward.
  useEffect(() => {
    if (!checkedInToday) return;
    setStartDate((prev) => (prev < minLeaveDate ? new Date(minLeaveDate) : prev));
    setEndDate((prev) => (prev < minLeaveDate ? new Date(minLeaveDate) : prev));
  }, [checkedInToday, minLeaveDate]);

  const pickLeaveDocs = async (category: 'medical' | 'supporting', fromCamera: boolean) => {
    try {
      setUploadingDoc(true);
      // Cap the resized output resolution — otherwise a full-res phone photo,
      // compressed by quality alone, can push the base64/multipart payload
      // large enough to get cut off mid-upload and render as a corrupted image.
      const opts: any = { mediaType: 'photo', compressImageQuality: 0.8, compressImageMaxWidth: 1600, compressImageMaxHeight: 1600, cropping: false };
      let picked: any[] = [];
      if (fromCamera) {
        picked = [await ImagePicker.openCamera(opts)];
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
      if (!/cancel/i.test(String(e?.message || ''))) {
        showToast({ type: 'error', title: 'Upload failed', message: 'Could not attach the document.' });
      }
    } finally {
      setUploadingDoc(false);
    }
  };

  const removeLeaveDoc = (category: 'medical' | 'supporting', idx: number) => {
    if (category === 'medical') setMedicalFiles((prev) => prev.filter((_, i) => i !== idx));
    else setSupportingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Outreach evidence — captured as base64 data-URLs so it can be stored with
  // the request (proof of the meeting/venue: invite, photo, ID, etc.).
  const pickOutreachEvidence = async (fromCamera: boolean) => {
    try {
      setOutreachUploading(true);
      // Capped resolution (see pickLeaveDocs) — keeps the base64 payload small
      // enough that it can't get truncated mid-request and render as a torn/
      // corrupted image.
      const opts: any = { mediaType: 'photo', compressImageQuality: 0.7, compressImageMaxWidth: 1280, compressImageMaxHeight: 1280, cropping: false, includeBase64: true };
      let picked: any[] = [];
      if (fromCamera) {
        picked = [await ImagePicker.openCamera(opts)];
      } else {
        const imgs: any = await ImagePicker.openPicker({ ...opts, multiple: true });
        picked = Array.isArray(imgs) ? imgs : [imgs];
      }
      const items = picked
        .filter((img: any) => img?.data)
        .map((img: any) => ({ image: `data:${img.mime || 'image/jpeg'};base64,${img.data}` }));
      setOutreachEvidence((prev) => [...prev, ...items].slice(0, 6));
    } catch (e: any) {
      if (!/cancel/i.test(String(e?.message || ''))) {
        showToast({ type: 'error', title: 'Upload failed', message: 'Could not attach the evidence photo.' });
      }
    } finally {
      setOutreachUploading(false);
    }
  };

  const removeOutreachEvidence = (idx: number) =>
    setOutreachEvidence((prev) => prev.filter((_, i) => i !== idx));

  const pickCheckoutEvidence = async (fromCamera: boolean) => {
    try {
      setCheckoutUploading(true);
      // Capped resolution (see pickLeaveDocs) — keeps the base64 payload small
      // enough that it can't get truncated mid-request and render as a torn/
      // corrupted image.
      const opts: any = { mediaType: 'photo', compressImageQuality: 0.7, compressImageMaxWidth: 1280, compressImageMaxHeight: 1280, cropping: false, includeBase64: true };
      let picked: any[] = [];
      if (fromCamera) {
        picked = [await ImagePicker.openCamera(opts)];
      } else {
        const imgs: any = await ImagePicker.openPicker({ ...opts, multiple: true });
        picked = Array.isArray(imgs) ? imgs : [imgs];
      }
      const items = picked
        .filter((img: any) => img?.data)
        .map((img: any) => ({ image: `data:${img.mime || 'image/jpeg'};base64,${img.data}` }));
      setCheckoutEvidence((prev) => [...prev, ...items].slice(0, 6));
    } catch (e: any) {
      if (!/cancel/i.test(String(e?.message || ''))) {
        showToast({ type: 'error', title: 'Upload failed', message: 'Could not attach the evidence photo.' });
      }
    } finally {
      setCheckoutUploading(false);
    }
  };

  const removeCheckoutEvidence = (idx: number) =>
    setCheckoutEvidence((prev) => prev.filter((_, i) => i !== idx));

  // Checkout request eligible dates dropdown
  const [eligibleCheckoutDates, setEligibleCheckoutDates] = useState<Array<{ date: Date; dateStr: string; label: string }>>([]);
  const [loadingEligibleDates, setLoadingEligibleDates] = useState(false);
  const [checkoutDateDropdownOpen, setCheckoutDateDropdownOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiService.getDepartmentColleagues();
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setColleagues(res.data);
        }
      } catch {
        // Endpoint missing on older servers — picker simply stays hidden.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Data State
  const [loading, setLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string>('');

  useEffect(() => {
    let active = true;
    (async () => {
      const token = await apiService.getAuthToken();
      if (token && active) {
        setAuthToken(token);
      }
    })();
    return () => { active = false; };
  }, []);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRecord[]>([]);
  const [fieldRequests, setFieldRequests] = useState<FieldRecord[]>([]);
  const [checkoutRequests, setCheckoutRequests] = useState<CheckoutRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Paint instantly from the local WatermelonDB cache on mount (WhatsApp-style
  // stale-while-revalidate), while loadRequests()'s useFocusEffect below still
  // does the real network fetch and overwrites this with fresh data. Runs once
  // — a plain read, no loading spinner tied to it, so it can never block or
  // flicker the real fetch.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [cachedLeave, cachedField, cachedCheckout] = await Promise.all([
          getCachedLeaveRequests(),
          getCachedFieldRequests(),
          getCachedCheckoutRequests(),
        ]);
        if (!active) return;
        if (cachedLeave.length) setLeaveRequests(cachedLeave.map(normalizeLeave));
        if (cachedField.length) setFieldRequests(cachedField.map(normalizeField));
        if (cachedCheckout.length) setCheckoutRequests(cachedCheckout.map(normalizeCheckout));
      } catch (e) {
        console.warn('[db] RequestScreen cache hydration failed:', e);
      }
    })();
    return () => { active = false; };
  }, []);

  // Event-info upload state (field requests, on the event day)
  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<FieldRecord | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [reportNotes, setReportNotes] = useState('');
  const [reportPhotos, setReportPhotos] = useState<ReportPhoto[]>([]);

  // Live location sharing state
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareDurationMinutes, setShareDurationMinutes] = useState(60);
  const [shareDestination, setShareDestination] = useState('');
  const [shareReason, setShareReason] = useState('');
  const [shareNotes, setShareNotes] = useState('');
  const [shareSession, setShareSession] = useState<any | null>(null);
  const [confirmStopVisible, setConfirmStopVisible] = useState(false);

  // Cancel-within-1-hour state (leave/field/checkout requests, while still pending)
  const [cancelTarget, setCancelTarget] = useState<{ id: string; type: 'leave' | 'field' | 'checkout' } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const formatDate = (dateInput: Date | string | null | undefined) => {
    if (!dateInput) return '—';
    try {
      const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
      if (isNaN(d.getTime())) return '—';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return '—';
    }
  };

  const toISODate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const daysBetween = (a: Date, b: Date) => {
    const ms = Math.abs(new Date(b.toDateString()).getTime() - new Date(a.toDateString()).getTime());
    return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  };

  const [refreshing, setRefreshing] = useState(false);

  // isRefresh only controls the loading-spinner UI (pull-to-refresh vs first
  // load). forceRefresh is separate: it bypasses the TTL cache in api.ts.
  // Both the explicit pull-to-refresh AND "reload right after I just
  // submitted/cancelled a request" need forceRefresh — otherwise a request
  // you just created could be missing from the list for up to 2 minutes
  // (the TTL window) because the cache still looks "fresh" even though you
  // know for a fact it's now stale.
  const loadRequests = useCallback(async (isRefresh = false, forceRefresh = false) => {
    if (!user) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else if (leaveRequests.length === 0 && fieldRequests.length === 0 && checkoutRequests.length === 0) {
        setLoading(true);
      }
      setError(null);

      // Load leave requests
      const leaveRes = await apiService.getLeaveRequests({ forceRefresh });
      if (leaveRes.success && leaveRes.data) {
        const payload: any = leaveRes.data;
        const candidates: any[] = [
          payload,
          payload?.leaves,
          payload?.data,
          payload?.data?.leaves,
          payload?.requests,
        ];
        const rawList: any[] = (candidates.find(Array.isArray) as any[]) || [];

        const normalizedLeaves: LeaveRecord[] = rawList.map(normalizeLeave);

        if (normalizedLeaves.length > 0) {
          const sample = normalizedLeaves[0] as any;
          console.log('[DEBUG] First leave request fields:', JSON.stringify({
            contactNumber: sample.contactNumber,
            addressDuringLeave: sample.addressDuringLeave,
            expectedReturnDate: sample.expectedReturnDate,
            description: sample.description,
            comments: sample.comments,
            attachments: sample.attachments?.length,
            type: sample.type,
            keys: Object.keys(sample).join(','),
          }));
        }
        setLeaveRequests(normalizedLeaves);
      } else {
        console.log('Failed to load leave requests:', leaveRes.error);
        setLeaveRequests([]);
      }

      // Load field requests
      try {
        const fieldRes = await apiService.getFieldRequests({ forceRefresh });
        if (fieldRes.success && fieldRes.data) {
          const fieldData: any = fieldRes.data;
          const candidates: any[] = [
            fieldData,
            fieldData?.requests,
            fieldData?.data,
            fieldData?.data?.requests,
            fieldData?.fieldRequests,
            fieldData?.data?.fieldRequests,
          ];
          const fieldList: any[] = (candidates.find(Array.isArray) as any[]) || [];

          const normalizedField: FieldRecord[] = fieldList.map(normalizeField);

          setFieldRequests(normalizedField);
          console.log('Loaded field requests:', normalizedField.length);
        } else {
          console.log('No field requests found:', fieldRes.error);
          setFieldRequests([]);
        }
      } catch (fieldError) {
        console.log('Field requests error:', fieldError);
        setFieldRequests([]);
      }

      // Load checkout requests
      try {
        const checkoutRes = await apiService.getMyCheckoutRequests(forceRefresh);
        if (checkoutRes.success && checkoutRes.data) {
          const checkoutData: any = checkoutRes.data;
          const candidates: any[] = [
            checkoutData,
            checkoutData?.requests,
            checkoutData?.data,
            checkoutData?.data?.requests,
            checkoutData?.checkoutRequests,
            checkoutData?.data?.checkoutRequests,
          ];
          const rawList: any[] = (candidates.find(Array.isArray) as any[]) || [];
          const normalized: CheckoutRecord[] = rawList.map(normalizeCheckout);
          setCheckoutRequests(normalized);
          console.log('Loaded checkout requests:', normalized.length);
        } else {
          setCheckoutRequests([]);
        }
      } catch (checkoutError) {
        console.log('Checkout requests error:', checkoutError);
        setCheckoutRequests([]);
      }

    } catch (e) {
      console.error('Error loading requests:', e);
      setError(e instanceof Error ? e.message : 'Failed to load requests');
      setLeaveRequests([]);
      setFieldRequests([]);
      setCheckoutRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // A pending leave/field/checkout request can be cancelled by its owner
  // within 1 hour of submitting it — a short window to undo a mistaken
  // application. Checkout requests previously had no Cancel option at all —
  // this screen's history list showed a pending checkout with nothing to
  // withdraw it, even though the exact same 1-hour-undo pattern already
  // existed for leave and field requests.
  const CANCEL_WINDOW_MS = 60 * 60 * 1000;
  const canCancelRequest = (request: LeaveRecord | FieldRecord | CheckoutRecord) => {
    if (request.type !== 'leave' && request.type !== 'field' && request.type !== 'checkout') return false;
    if ((request.status || '').toLowerCase() !== 'pending') return false;
    if (!request.createdAt) return false;
    return Date.now() - new Date(request.createdAt).getTime() < CANCEL_WINDOW_MS;
  };

  const confirmCancelRequest = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res =
        cancelTarget.type === 'leave'
          ? await apiService.cancelLeaveRequest(cancelTarget.id)
          : cancelTarget.type === 'field'
            ? await apiService.cancelFieldRequest(cancelTarget.id)
            : await apiService.cancelCheckoutRequest(cancelTarget.id);
      if (res.success) {
        showToast({ type: 'success', title: 'Request cancelled', message: 'Your request has been withdrawn.' });
        setCancelTarget(null);
        await loadRequests(false, true);
      } else {
        showToast({ type: 'error', title: 'Could not cancel', message: res.error || 'Please try again.' });
      }
    } catch (e) {
      showToast({
        type: 'error',
        title: 'Could not cancel',
        message: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setCancelling(false);
    }
  };

  const loadShareSession = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('liveTrackingShare');
      if (!raw) {
        setShareSession(null);
        return;
      }
      const parsed = JSON.parse(raw);
      const endsAt = parsed?.endsAt ? new Date(parsed.endsAt) : null;
      if (!parsed?.active || (endsAt && endsAt <= new Date())) {
        // Don't delete the key — appInitService.restoreLiveTrackingFromStorage()
        // treats a MISSING key as "no local record, ask the server" and that
        // check unconditionally REACTIVATES tracking. Leaving an explicit
        // {active:false}/expired record here (this screen only reads it for
        // its own display, it doesn't own the session) keeps that later check
        // on the safe "not active" path instead of silently restarting
        // tracking on the next app resume.
        await AsyncStorage.removeItem('liveTrackingAuthToken');
        setShareSession(null);
        return;
      }
      setShareSession(parsed);
    } catch (shareError) {
      console.warn('Failed to load share session:', shareError);
      setShareSession(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
      loadShareSession();
    }, [loadRequests, loadShareSession])
  );

  const submitRequest = async () => {
    if (!user) return;

    const isReasonEmpty = !reason.trim();
    const isEventTitleEmpty = modalType === 'field' && !eventTitle.trim();
    const isDelegateEmpty = modalType === 'leave' && colleagues.length > 0 && !selectedDelegateId;
    const isLeaveTypeEmpty = modalType === 'leave' && leaveTypes.length > 0 && !selectedTypeId;
    const isDocumentMissing = modalType === 'leave' && selectedLeaveType?.requiresDocument && medicalFiles.length === 0 && supportingFiles.length === 0;
    const isCheckoutDateEmpty = modalType === 'checkout' && !eligibleCheckoutDates.some(d => toISODate(d.date) === toISODate(startDate));

    if (isReasonEmpty || isEventTitleEmpty || isDelegateEmpty || isLeaveTypeEmpty || isDocumentMissing || isCheckoutDateEmpty) {
      setAttemptedSubmit(true);
      // Name the SPECIFIC missing field instead of a generic "fill mandatory
      // fields" — the order here matches the order fields appear in the form.
      const missing = isLeaveTypeEmpty
        ? 'Please select a leave type.'
        : isEventTitleEmpty
        ? 'Please enter an event / purpose title.'
        : isReasonEmpty
        ? 'Please enter a reason.'
        : isDelegateEmpty
        ? 'Please select a colleague to cover your work while on leave.'
        : isDocumentMissing
        ? `${selectedLeaveType?.name || 'This leave type'} requires a supporting document — attach a photo or file.`
        : isCheckoutDateEmpty
        ? 'Please select a date you actually checked in on but did not check out.'
        : 'Please fill in all mandatory fields highlighted in red.';
      showToast({
        type: 'warning',
        title: 'Required field missing',
        message: missing,
      });
      return;
    }

    if (modalType === 'checkout') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const reqDate = new Date(startDate);
      reqDate.setHours(0, 0, 0, 0);

      const daysDifference = Math.floor((today.getTime() - reqDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDifference < 1) {
        showToast({
          type: 'warning',
          title: 'Invalid Date',
          message: 'Checkout request can only be submitted for past dates.',
        });
        return;
      }

      try {
        setSubmitting(true);
        const month = reqDate.getMonth() + 1;
        const year = reqDate.getFullYear();
        const res = await apiService.getMonthlyCalendar(month, year);
        if (res.success && res.data && (res.data as any).days) {
          const days = (res.data as any).days;
          const dayNum = reqDate.getDate();
          const matchedDay = days.find((d: any) => d.day === dayNum);
          if (matchedDay) {
            if (!matchedDay.checkIn) {
              setSubmitting(false);
              showToast({
                type: 'warning',
                title: 'Invalid Date',
                message: 'You did not check in on this day.',
              });
              return;
            }
            if (matchedDay.checkOut) {
              setSubmitting(false);
              showToast({
                type: 'warning',
                title: 'Invalid Date',
                message: 'You already checked out on this day.',
              });
              return;
            }
          } else {
            setSubmitting(false);
            showToast({
              type: 'warning',
              title: 'Invalid Date',
              message: 'No record found for this date.',
            });
            return;
          }
        } else {
          setSubmitting(false);
          showToast({
            type: 'warning',
            title: 'Verification failed',
            message: 'Could not verify attendance for the selected date.',
          });
          return;
        }
      } catch (err) {
        setSubmitting(false);
        showToast({
          type: 'warning',
          title: 'Verification failed',
          message: 'Could not verify attendance for the selected date.',
        });
        return;
      } finally {
        setSubmitting(false);
      }
    }

    // Compare dates properly
    let startDateStr = toISODate(startDate);
    let endDateStr = toISODate(endDate);

    if (modalType === 'field') {
      const startCopy = new Date(startDate);
      const endCopy = new Date(endDate);
      if (outreachDurationType === 'half') {
        if (outreachHalfDayType === 'first') {
          startCopy.setHours(9, 0, 0, 0);
          endCopy.setHours(13, 30, 0, 0);
        } else {
          startCopy.setHours(13, 30, 0, 0);
          endCopy.setHours(18, 0, 0, 0);
        }
      } else if (outreachDurationType === 'custom') {
        startCopy.setHours(outreachStartTime.getHours(), outreachStartTime.getMinutes(), 0, 0);
        endCopy.setHours(outreachEndTime.getHours(), outreachEndTime.getMinutes(), 0, 0);
      } else {
        startCopy.setHours(0, 0, 0, 0);
        endCopy.setHours(23, 59, 59, 999);
      }
      startDateStr = startCopy.toISOString();
      endDateStr = endCopy.toISOString();
    }

    if (new Date(endDateStr) < new Date(startDateStr)) {
      showToast({
        type: 'warning',
        title: 'Invalid dates',
        message: 'End date / time cannot be before start date / time',
      });
      return;
    }

    const payload = {
      startDate: startDateStr,
      endDate: endDateStr,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
    };

    const type: RequestType = modalType === 'leave' ? 'leave' : (modalType === 'checkout' ? 'checkout' : 'field');
    const tempId = `temp-${Date.now()}`;
    
    // Base optimistic object
    let optimistic: any = {
      _id: tempId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      type,
    };
    
    if (type === 'checkout') {
      optimistic = {
        ...optimistic,
        date: startDateStr,
        details: reason.trim(),
        startDate: startDateStr,
        endDate: startDateStr,
        reason: reason.trim(),
      };
    } else {
      optimistic = {
        ...optimistic,
        startDate: startDateStr,
        endDate: endDateStr,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        ...(type === 'field' ? { eventTitle: eventTitle.trim() } : {}),
      };
    }

    const rollback = () => {
      if (type === 'leave') {
        setLeaveRequests(prev => prev.filter(r => r._id !== tempId));
      } else if (type === 'checkout') {
        setCheckoutRequests(prev => prev.filter(r => r._id !== tempId));
      } else {
        setFieldRequests(prev => prev.filter(r => r._id !== tempId));
      }
    };

    try {
      setSubmitting(true);

      console.log('Submitting request:', type); // Debug log

      // Optimistic insert: show as pending immediately and close the sheet.
      if (type === 'leave') {
        setLeaveRequests(prev => [optimistic as LeaveRecord, ...prev]);
      } else if (type === 'checkout') {
        setCheckoutRequests(prev => [optimistic as CheckoutRecord, ...prev]);
      } else {
        setFieldRequests(prev => [optimistic as FieldRecord, ...prev]);
      }
      setShowModal(false);

      let response;
      if (modalType === 'leave') {
        // Always use the enterprise V3 endpoint which supports file uploads.
        // The server's apply-v3 resolves fallback IDs (e.g. 'local-CL') via
        // code lookup, so this works whether typesFromServer is true or false.
        response = await apiService.applyLeaveV3(
          {
            leaveTypeId: selectedTypeId || 'local-CL',
            startDate: startDateStr,
            endDate: dayPortion === 'half' ? startDateStr : endDateStr,
            dayPortion,
            halfDayType: dayPortion === 'half' ? halfDayType : null,
            reason: reason.trim(),
            description: notes.trim() || undefined,
            comments: comments.trim() || undefined,
            isEmergency,
            contactNumber: contactNumber.trim() || undefined,
            addressDuringLeave: addressDuringLeave.trim() || undefined,
            workHandoverTo: selectedDelegateId || undefined,
            expectedReturnDate: expectedReturn ? toISODate(expectedReturn) : undefined,
          },
          { medical: medicalFiles, supporting: supportingFiles }
        );
      } else if (modalType === 'checkout') {
        response = await apiService.createCheckoutRequest({
          date: startDateStr,
          details: reason.trim(),
          evidence: checkoutEvidence.map((e) => e.image),
        });
      } else {
        response = await apiService.applyField({
          ...payload,
          eventTitle: eventTitle.trim(),
          location: outreachLocation.trim() || undefined,
          accompaniedBy: accompaniedBy.trim() || undefined,
          evidence: outreachEvidence.map((e) => e.image),
        });
      }

      if (response.success) {
        haptic('success');
        showToast({
          type: 'success',
          title: 'Request submitted',
          message: `${modalType === 'leave' ? 'Leave' : (modalType === 'checkout' ? 'Checkout' : 'Outreach')} request submitted successfully`,
        });
        setReason('');
        setNotes('');
        setEventTitle('');
        setSelectedDelegateId(null);
        setDelegateDropdownOpen(false);
        setOutreachLocation('');
        setAccompaniedBy('');
        setOutreachEvidence([]);
        setCheckoutEvidence([]);
        setOutreachDurationType('full');
        setOutreachHalfDayType('first');
        // Reset enterprise leave fields
        setComments('');
        setContactNumber('');
        setAddressDuringLeave('');
        setExpectedReturn(null);
        setMedicalFiles([]);
        setSupportingFiles([]);
        setDayPortion('full');
        setHalfDayType('first');
        setIsEmergency(false);
        await loadRequests(false, true); // Refresh data after submission — force, so the new request isn't hidden by a still-"fresh" cache
      } else {
        rollback();
        console.error('Request submission failed:', response.error);
        haptic('error');
        showToast({
          type: 'error',
          title: 'Submission failed',
          message: response.error || `Failed to submit ${modalType} request`,
        });
      }
    } catch (submissionError) {
      rollback();
      console.error('Request submission error:', submissionError);
      haptic('error');
      showToast({
        type: 'error',
        title: 'Submission failed',
        message: submissionError instanceof Error
          ? submissionError.message
          : `Failed to submit ${modalType} request`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toBadgeStatus = (status?: string): 'pending' | 'approved' | 'rejected' | 'no_response' | 'cancelled' => {
    const normalized = (status || 'pending').toLowerCase();
    if (normalized === 'approved') return 'approved';
    if (normalized === 'rejected') return 'rejected';
    if (normalized === 'no_response') return 'no_response';
    if (normalized === 'cancelled') return 'cancelled';
    return 'pending';
  };

  const getStatusLabel = (status?: string) => {
    const normalized = (status || 'pending').toLowerCase();
    if (normalized === 'no_response') return 'No Response';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const formatTime = (d: Date | null | undefined) => {
    if (!d || isNaN(d.getTime())) return '';
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const formatRequestDateRange = (req: RequestRecord) => {
    if (!req || !req.startDate || !req.endDate) return '—';
    const start = new Date(req.startDate);
    const end = new Date(req.endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return '—';
    }
    
    const hasTime = start.getHours() !== 0 || start.getMinutes() !== 0 || end.getHours() !== 23 || end.getMinutes() !== 59;
    
    if (req.type === 'field' && hasTime) {
      if (start.toDateString() === end.toDateString()) {
        return `${formatDate(start)} (${formatTime(start)} - ${formatTime(end)})`;
      } else {
        return `${formatDate(start)} ${formatTime(start)} - ${formatDate(end)} ${formatTime(end)}`;
      }
    }
    
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const normalizeUri = (raw: any) => {
    if (!raw) return '';
    const uri = typeof raw === 'string' ? raw : (raw.image || raw.url || raw.uri || '');
    if (!uri) return '';
    if (/^https?:\/\//i.test(uri) || /^data:/i.test(uri)) return uri;
    const baseUrl = getApiBaseUrl().replace(/\/api\/?$/i, '');
    const cleanPath = uri.startsWith('/') ? uri : `/${uri}`;
    return `${baseUrl}${cleanPath}`;
  };

  const getAttachmentUrl = (att: any, reqId: string) => {
    if (!att) return '';
    const pathOrUrl = att.url || att.path || (reqId ? `/api/leaves/${reqId}/attachments/${att._id || att.id}` : '');
    return normalizeUri(pathOrUrl);
  };

  const getRequestStats = (requests: RequestRecord[]) => {
    const pending = requests.filter(r => (r.status || 'pending').toLowerCase() === 'pending').length;
    const approved = requests.filter(r => (r.status || '').toLowerCase() === 'approved').length;
    const rejected = requests.filter(r => (r.status || '').toLowerCase() === 'rejected').length;
    const cancelled = requests.filter(r => (r.status || '').toLowerCase() === 'cancelled').length;
    const noResponse = requests.filter(r => (r.status || '').toLowerCase() === 'no_response').length;

    return { pending, approved, rejected, cancelled, noResponse, total: requests.length };
  };

  const getCurrentActiveRequests = (requests: RequestRecord[]) => {
    const now = new Date();
    return requests.filter(r => {
      if (r.status?.toLowerCase() !== 'approved') return false;
      const activeEnd = new Date(r.endDate);
      return activeEnd >= now;
    });
  };

  const leaveStats = useMemo(() => getRequestStats(leaveRequests), [leaveRequests]);
  const fieldStats = useMemo(() => getRequestStats(fieldRequests), [fieldRequests]);
  const checkoutStats = useMemo(() => getRequestStats(checkoutRequests), [checkoutRequests]);
  
  const activeLeaves = useMemo(() => getCurrentActiveRequests(leaveRequests), [leaveRequests]);
  const activeField = useMemo(() => getCurrentActiveRequests(fieldRequests), [fieldRequests]);

  const stats = requestType === 'leave' ? leaveStats : (requestType === 'field' ? fieldStats : checkoutStats);
  const activeForType = requestType === 'leave' ? activeLeaves : (requestType === 'field' ? activeField : []);
  const historyForType: RequestRecord[] = useMemo(() => {
    const list = requestType === 'leave' ? leaveRequests : (requestType === 'field' ? fieldRequests : checkoutRequests);
    return [...list].sort(
      (a, b) => new Date(b.createdAt || b.startDate || '').getTime() - new Date(a.createdAt || a.startDate || '').getTime(),
    );
  }, [requestType, leaveRequests, fieldRequests, checkoutRequests]);

  // Switching tabs (leave/field/checkout) should start from the most recent
  // page again, not stay expanded to whatever was scrolled to on the last tab.
  useEffect(() => {
    setHistoryDisplayLimit(HISTORY_PAGE_SIZE);
  }, [requestType]);

  const visibleHistory = useMemo(
    () => historyForType.slice(0, historyDisplayLimit),
    [historyForType, historyDisplayLimit],
  );

  // A field request can receive event info once it's approved and the event
  // day has arrived.
  const canUploadReport = (record: RequestRecord): record is FieldRecord => {
    if (record.type !== 'field') return false;
    if ((record.status || '').toLowerCase() !== 'approved') return false;
    const start = new Date(record.startDate);
    start.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today >= start;
  };

  const loadEligibleCheckoutDates = async () => {
    setLoadingEligibleDates(true);
    setEligibleCheckoutDates([]);
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const currentRes = await apiService.getMonthlyCalendar(currentMonth, currentYear);

      let prevMonth = currentMonth - 1;
      let prevYear = currentYear;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = currentYear - 1;
      }
      const prevRes = await apiService.getMonthlyCalendar(prevMonth, prevYear);

      const allDays: any[] = [];
      if (prevRes.success && prevRes.data && (prevRes.data as any).days) {
        allDays.push(...(prevRes.data as any).days);
      }
      if (currentRes.success && currentRes.data && (currentRes.data as any).days) {
        allDays.push(...(currentRes.data as any).days);
      }

      const todayStr = toISODate(new Date());
      const eligible = allDays
        .filter((d: any) => {
          return d.date < todayStr && d.checkIn && !d.checkOut;
        })
        .map((d: any) => {
          const dateObj = new Date(d.date);
          return {
            date: dateObj,
            dateStr: d.date,
            label: `${d.dayName}, ${d.date.split('-')[2]}/${d.date.split('-')[1]} (Checked in: ${d.checkIn})`,
          };
        });

      eligible.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

      setEligibleCheckoutDates(eligible);
      if (eligible.length > 0) {
        setStartDate(eligible[0].date);
        setEndDate(eligible[0].date);
      }
    } catch (e) {
      console.log('Error loading eligible checkout dates:', e);
    } finally {
      setLoadingEligibleDates(false);
    }
  };

  const openRequestModal = (type: 'leave' | 'field' | 'checkout') => {
    setModalType(type);
    setEventTitle('');
    // Leave can't start on a day already checked in — default to tomorrow then.
    const initialDate = type === 'checkout'
      ? new Date(Date.now() - 86400000)
      : (type === 'leave' && checkedInToday ? new Date(minLeaveDate) : new Date());
    setStartDate(initialDate);
    setEndDate(initialDate);
    setReason('');
    setNotes('');
    setShowModal(true);
    setAttemptedSubmit(false);
    if (type === 'checkout') {
      loadEligibleCheckoutDates();
    }
  };

  const openUploadSheet = (record: FieldRecord) => {
    setUploadTarget(record);
    setReportNotes('');
    setReportPhotos([]);
    setUploadVisible(true);
  };

  const addReportPhoto = async (fromCamera: boolean) => {
    try {
      const img: any = fromCamera
        ? await ImagePicker.openCamera({
            mediaType: 'photo',
            cropping: false,
            includeBase64: true,
            compressImageQuality: 0.6,
            compressImageMaxWidth: 1280,
            compressImageMaxHeight: 1280,
          })
        : await ImagePicker.openPicker({
            mediaType: 'photo',
            cropping: false,
            includeBase64: true,
            compressImageQuality: 0.6,
            compressImageMaxWidth: 1280,
            compressImageMaxHeight: 1280,
          });
      if (img?.data) {
        const uri = `data:${img.mime || 'image/jpeg'};base64,${img.data}`;
        setReportPhotos(prev => [...prev, { image: uri, label: 'Event photo' }]);
      }
    } catch {
      // user cancelled the picker
    }
  };

  const removeReportPhoto = (index: number) => {
    setReportPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const submitReport = async () => {
    if (!uploadTarget?._id) return;
    if (!reportNotes.trim() && reportPhotos.length === 0) {
      showToast({
        type: 'warning',
        title: 'Nothing to upload',
        message: 'Add a photo or write a report about the event first.',
      });
      return;
    }
    try {
      setUploadSubmitting(true);
      const response = await apiService.submitFieldReport(uploadTarget._id, {
        notes: reportNotes.trim() || undefined,
        photos: reportPhotos,
      });
      if (response.success) {
        haptic('success');
        showToast({
          type: 'success',
          title: 'Event info uploaded',
          message: 'Your event information was submitted successfully.',
        });
        setUploadVisible(false);
        setUploadTarget(null);
        await loadRequests(false, true);
      } else {
        haptic('error');
        showToast({
          type: 'error',
          title: 'Upload failed',
          message: response.error || 'Could not upload event information.',
        });
      }
    } catch (uploadError) {
      haptic('error');
      showToast({
        type: 'error',
        title: 'Upload failed',
        message:
          uploadError instanceof Error
            ? uploadError.message
            : 'Could not upload event information.',
      });
    } finally {
      setUploadSubmitting(false);
    }
  };

  const formatDateTime = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return date.toLocaleString();
  };

  const handleStartShare = async () => {
    if (!shareDestination.trim()) {
      showToast({
        type: 'warning',
        title: 'Destination required',
        message: 'Please enter where you are going.',
      });
      return;
    }
    if (!shareReason.trim()) {
      showToast({
        type: 'warning',
        title: 'Reason required',
        message: 'Please enter a reason for sharing.',
      });
      return;
    }
    if (!shareDurationMinutes || shareDurationMinutes <= 0) {
      showToast({
        type: 'warning',
        title: 'Duration required',
        message: 'Please select how long to share.',
      });
      return;
    }

    try {
      setShareSubmitting(true);

      // Notification permission is nice-to-have (the tracking notification is
      // hidden without it) but must NOT block starting the share.
      const notificationGranted = await requestNotificationPermission();

      // Foreground (fine) location is the only HARD requirement to start.
      const fineLocationGranted = await requestLocationPermission();
      if (!fineLocationGranted) {
        showToast({
          type: 'warning',
          title: 'Location permission required',
          message: 'Allow location access to share your live location. If no prompt appears, enable Location for this app in Settings.',
        });
        return;
      }

      // Background ("Allow all the time") is a SOFT requirement: on Android 11+
      // the OS never shows a dialog for it, so blocking here made Start Sharing
      // silently unusable on real devices. Start anyway — the foreground
      // service keeps tracking alive — and tell the user how to upgrade it.
      const backgroundGranted = await requestBackgroundLocationPermission();
      if (!backgroundGranted) {
        showToast({
          type: 'info',
          title: 'Tip for reliable tracking',
          message: 'For tracking to continue with the app closed, set Location permission to "Allow all the time" in Settings.',
        });
      }
      if (!notificationGranted) {
        showToast({
          type: 'info',
          title: 'Notifications off',
          message: 'Enable notifications to see the live-tracking status notification.',
        });
      }

      const payload = {
        durationMinutes: shareDurationMinutes,
        destination: shareDestination.trim(),
        reason: shareReason.trim(),
        notes: shareNotes.trim() || undefined
      };

      const startShare =
        typeof (apiService as any).startLiveLocationShare === 'function'
          ? (apiService as any).startLiveLocationShare.bind(apiService)
          : null;
      const makeRequestFallback = (apiService as any).makeRequest
        ? (apiService as any).makeRequest.bind(apiService)
        : null;

      if (!startShare && !makeRequestFallback) {
        showToast({
          type: 'error',
          title: 'Live tracking unavailable',
          message: 'Live tracking API is not available. Please restart the app.',
        });
        return;
      }

      const response = startShare
        ? await startShare(payload)
        : await makeRequestFallback('/student/live-location/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

      if (!response.success || !response.data) {
        showToast({
          type: 'error',
          title: 'Error',
          message: response.error || 'Failed to start live tracking.',
        });
        return;
      }

      // makeRequest keeps the server envelope in response.data. Support both
      // the current { success, data: { trackUntil } } response and the older
      // liveTrackingSession shape used by deployed servers.
      const responseBody: any = response.data;
      const serverData = responseBody?.data ?? responseBody;
      const returnedSession =
        responseBody?.liveTrackingSession ?? serverData?.liveTrackingSession;
      const endsAt = returnedSession?.endsAt ?? serverData?.trackUntil;
      if (!returnedSession && !endsAt) {
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to start live tracking.',
        });
        return;
      }
      const newSession = {
        ...(returnedSession || {}),
        active: true,
        endsAt,
        destination: shareDestination.trim(),
        reason: shareReason.trim(),
        notes: shareNotes.trim() || undefined,
      };
      const authToken = await AsyncStorage.getItem('authToken');
      if (authToken) {
        await AsyncStorage.setItem('liveTrackingAuthToken', authToken);
      }
      await AsyncStorage.setItem('liveTrackingShare', JSON.stringify(newSession));
      setShareSession(newSession);
      setShareModalVisible(false);

      await liveLocationService.start();
      // Stop explicitly shuts down the native foreground service. It must be
      // started again here; previously only the JS fallback was restarted,
      // which made the APK's second Start appear to do nothing.
      if (nativeLiveLocation.available && authToken) {
        nativeLiveLocation.start(
          `${getApiBaseUrl()}/student/live-location`,
          authToken,
          60000
        );
        await backgroundLocationService.stop();
      } else {
        await backgroundLocationService.start();
      }

      haptic('success');
      showToast({
        type: 'success',
        title: 'Live tracking started',
        message: 'Keep the app running to share your live location.',
      });
    } catch (shareError) {
      console.error('Failed to start live tracking:', shareError);
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to start live tracking.',
      });
    } finally {
      setShareSubmitting(false);
    }
  };

  const handleStopShare = async () => {
    try {
      setShareSubmitting(true);
      const stopShare =
        typeof (apiService as any).stopLiveLocationShare === 'function'
          ? (apiService as any).stopLiveLocationShare.bind(apiService)
          : null;
      const makeRequestFallback = (apiService as any).makeRequest
        ? (apiService as any).makeRequest.bind(apiService)
        : null;

      if (!stopShare && !makeRequestFallback) {
        showToast({
          type: 'error',
          title: 'Live tracking unavailable',
          message: 'Live tracking API is not available. Please restart the app.',
        });
        return;
      }

      const response = stopShare
        ? await stopShare()
        : await makeRequestFallback('/student/live-location/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
      if (!response.success) {
        showToast({
          type: 'error',
          title: 'Error',
          message: response.error || 'Failed to stop live tracking.',
        });
        return;
      }
      await liveLocationService.stop(true); // explicit user stop
      nativeLiveLocation.stop(); // native foreground service, if it was the one running
      await backgroundLocationService.stop();
      // {active:false}, not removed — see loadShareSession() above for why a
      // missing key is unsafe (it makes the next app-resume check reactivate
      // tracking via /live-location/share).
      await AsyncStorage.setItem('liveTrackingShare', JSON.stringify({ active: false }));
      await AsyncStorage.removeItem('liveTrackingAuthToken');
      setShareSession(null);
      showToast({
        type: 'info',
        title: 'Live tracking stopped',
        message: 'Your live location is no longer shared.',
      });
    } catch (shareError) {
      console.error('Failed to stop live tracking:', shareError);
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to stop live tracking.',
      });
    } finally {
      setShareSubmitting(false);
    }
  };

  const confirmStopShare = async () => {
    await handleStopShare();
    setConfirmStopVisible(false);
  };

  const TypeIcon = requestType === 'leave' ? Plane : (requestType === 'field' ? Navigation : Clock);
  const selectedDelegate = colleagues.find((c) => c._id === selectedDelegateId) || null;

  const getStatColors = (type: string) => {
    switch (type.toLowerCase()) {
      case 'total':
        return { bg: '#F0F7FF', border: '#BAE6FD', text: '#0284C7', count: '#0369A1' };
      case 'pending':
        return { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', count: '#B45309' };
      case 'approved':
        return { bg: '#ECFDF5', border: '#A7F3D0', text: '#059669', count: '#047857' };
      case 'rejected':
        return { bg: '#FFF1F2', border: '#FECDD3', text: '#E11D48', count: '#BE123C' };
      case 'cancelled':
        return { bg: '#F8FAFC', border: '#CBD5E1', text: '#64748B', count: '#475569' };
      default: // other
        return { bg: '#F8FAFC', border: '#E2E8F0', text: '#64748B', count: '#475569' };
    }
  };

  const renderStat = (label: string, value: number, _color: string) => {
    const c = getStatColors(label);
    return (
      <View
        key={label}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 8,
          paddingHorizontal: 4,
          marginHorizontal: 3,
          backgroundColor: c.bg,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <Text style={[typography.h3, { color: c.count, fontWeight: '800', textAlign: 'center' }]}>
          {value}
        </Text>
        <Text
          style={[
            typography.caption,
            {
              color: c.text,
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
  };

  return (
    <>
      <Screen
        scroll
        refreshing={refreshing}
        onRefresh={() => loadRequests(true, true)}
        edges={['left', 'right']}
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}
          style={styles.headerRow}
        >
          <View
            style={[
              styles.headerIcon,
              { backgroundColor: colors.brandSoft, borderRadius: radii.lg },
            ]}
          >
            <FileText size={26} color={colors.brand} />
          </View>
          <View style={styles.headerText}>
            <Text style={[typography.h2, { color: colors.text }]}>Requests</Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>
              Submit and track your leave, outreach & checkout requests
            </Text>
          </View>
        </Animated.View>

        <SegmentedControl
          options={['Leave', 'Outreach', 'Checkout']}
          selectedIndex={requestType === 'leave' ? 0 : (requestType === 'field' ? 1 : 2)}
          onChange={index => setRequestType(index === 0 ? 'leave' : (index === 1 ? 'field' : 'checkout'))}
          activeColors={[
            { bg: '#E0F2FE', border: '#BAE6FD', text: '#0284C7' },
            { bg: '#DCFCE7', border: '#BBF7D0', text: '#15803D' },
            { bg: '#EDE9FE', border: '#DDD6FE', text: '#6D28D9' },
          ]}
          style={{ marginTop: spacing.lg }}
        />

        {error ? (
          <Card
            elevation={0}
            style={{
              marginTop: spacing.lg,
              backgroundColor: colors.dangerSoft,
              borderColor: colors.danger,
            }}
          >
            <View style={styles.inlineRow}>
              <CircleAlert size={20} color={colors.danger} />
              <Text
                style={[typography.body, styles.flexText, { color: colors.danger }]}
                accessibilityLiveRegion="polite"
              >
                {error}
              </Text>
              <Button
                title="Retry"
                onPress={() => loadRequests(false, true)}
                variant="outline"
                size="sm"
                accessibilityLabel="Retry loading requests"
              />
            </View>
          </Card>
        ) : null}

        {loading ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </View>
        ) : (
          <>
            {/* Statistics */}
            <Card
              elevation={1}
              enteringIndex={0}
              style={[
                { marginTop: spacing.lg, borderRadius: radii.lg },
                requestType === 'leave'
                  ? { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', borderWidth: 1 }
                  : requestType === 'field'
                  ? { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 }
                  : { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE', borderWidth: 1 },
              ]}
            >
              <View style={styles.cardHeader}>
                <View
                  style={{
                    padding: 6,
                    borderRadius: radii.md,
                    backgroundColor:
                      requestType === 'leave'
                        ? '#E0F2FE'
                        : requestType === 'field'
                        ? '#DCFCE7'
                        : '#EDE9FE',
                  }}
                >
                  <TypeIcon
                    size={18}
                    color={
                      requestType === 'leave'
                        ? '#0284C7'
                        : requestType === 'field'
                        ? '#16A34A'
                        : '#7C3AED'
                    }
                  />
                </View>
                <Text style={[typography.title, { color: colors.text, fontWeight: '800' }]}>
                  {requestType === 'leave'
                    ? 'Leave Requests'
                    : requestType === 'field'
                    ? 'Outreach Requests'
                    : 'Checkout Requests'}
                </Text>
              </View>
              <View style={styles.statGrid}>
                {renderStat('Total', stats.total, colors.brand)}
                {renderStat('Pending', stats.pending, colors.warning)}
                {renderStat('Approved', stats.approved, colors.success)}
                {renderStat('Rejected', stats.rejected, colors.danger)}
                {renderStat('Cancelled', stats.cancelled, colors.textMuted)}
              </View>
            </Card>

            <Button
              title={requestType === 'leave' ? 'New Leave Request' : (requestType === 'field' ? 'New Outreach Request' : 'New Checkout Request')}
              onPress={() => openRequestModal(requestType)}
              icon={Plus}
              fullWidth
              style={{ marginTop: spacing.lg }}
              accessibilityLabel={
                requestType === 'leave'
                  ? 'Create a new leave request'
                  : (requestType === 'field' ? 'Create a new outreach request' : 'Create a new checkout request')
              }
            />

            {/* Active requests */}
            {activeForType.length > 0 ? (
              <Card elevation={1} enteringIndex={1} style={{ marginTop: spacing.lg }}>
                <View style={styles.cardHeader}>
                  <CircleCheck size={20} color={colors.success} />
                  <Text style={[typography.title, { color: colors.text }]}>
                    {requestType === 'leave' ? 'On Leave' : (requestType === 'field' ? 'On Outreach' : 'Active')}
                  </Text>
                </View>
                {activeForType.map((active, index) => (
                  <View
                    key={active._id || index}
                    style={[
                      styles.activeItem,
                      {
                        backgroundColor: colors.surfaceAlt,
                        borderLeftColor: colors.brand,
                        borderRadius: radii.md,
                        marginTop: index === 0 ? 0 : spacing.sm,
                      },
                    ]}
                  >
                    <Text style={[typography.bodyBold, { color: colors.text }]}>
                      {formatDate(active.startDate)} - {formatDate(active.endDate)}
                    </Text>
                    <Text style={[typography.small, { color: colors.textMuted }]}>
                      {active.reason}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {/* Live Location Sharing */}
            {requestType === 'field' && (
              <Card elevation={1} enteringIndex={2} style={{ marginTop: spacing.lg }}>
                <View style={styles.cardHeader}>
                  <Navigation size={20} color={colors.info} />
                  <Text style={[typography.title, { color: colors.text }]}>
                    Live Location Sharing
                  </Text>
                </View>

                {shareSession?.active ? (
                  <View>
                    <Text
                      style={[typography.bodyBold, { color: colors.text }]}
                      accessibilityLiveRegion="polite"
                    >
                      Shared until {formatDateTime(shareSession.endsAt)}
                    </Text>
                    <Text style={[typography.small, { color: colors.textMuted }]}>
                      Destination: {shareSession.destination || '—'}
                    </Text>
                    <Text style={[typography.small, { color: colors.textMuted }]}>
                      Reason: {shareSession.reason || '—'}
                    </Text>
                    {shareSession.notes ? (
                      <Text style={[typography.small, { color: colors.textMuted }]}>
                        Notes: {shareSession.notes}
                      </Text>
                    ) : null}
                    <Button
                      title="Stop Sharing"
                      onPress={() => setConfirmStopVisible(true)}
                      variant="danger"
                      icon={CircleStop}
                      disabled={shareSubmitting}
                      fullWidth
                      style={{ marginTop: spacing.md }}
                      accessibilityLabel="Stop sharing live location"
                    />
                  </View>
                ) : (
                  <View>
                    <Text style={[typography.small, { color: colors.textMuted }]}>
                      Share your live location with admin when needed.
                    </Text>
                    <Button
                      title="Share Live Location"
                      onPress={() => setShareModalVisible(true)}
                      variant="secondary"
                      icon={Share2}
                      fullWidth
                      style={{ marginTop: spacing.md }}
                      accessibilityLabel="Share live location with admin"
                    />
                  </View>
                )}
              </Card>
            )}

            {/* Request history */}
            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <History size={18} color={colors.textMuted} />
              <Text style={[typography.title, { color: colors.text }]}>
                Request History
              </Text>
            </View>

            {historyForType.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No requests yet"
                message={`Start by creating your first ${requestType === 'leave' ? 'leave' : (requestType === 'field' ? 'outreach' : 'checkout')} request`}
              />
            ) : (
              <>
              {visibleHistory.map((request, index) => {
                const isField = request.type === 'field';
                const isCheckout = request.type === 'checkout';
                const RequestIcon = request.type === 'leave' ? Plane : (request.type === 'field' ? Navigation : Clock);
                const fieldRecord = isField ? (request as FieldRecord) : null;
                const report = fieldRecord?.report;
                const reportPhotoCount = report?.photos?.length || 0;
                const reportDocCount = report?.documents?.length || 0;
                const hasReport =
                  !!report &&
                  (!!report.submittedAt ||
                    reportPhotoCount > 0 ||
                    reportDocCount > 0 ||
                    !!report.notes);
                const isNoResponse = (request.status || '').toLowerCase() === 'no_response';
                return (
                  <View key={request._id || `${request.type}-${index}`}>
                      <Card
                        elevation={1}
                        onPress={() => setSelectedRequest(request)}
                        style={{
                          marginTop: spacing.md,
                          marginBottom: index === historyForType.length - 1 ? spacing.xl : spacing.xs,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                        accessibilityLabel={`${isField ? 'Outreach' : (isCheckout ? 'Checkout' : 'Leave')} request from ${formatDate(request.startDate)} to ${formatDate(request.endDate)}, ${getStatusLabel(request.status)}`}
                      >
                        <View style={styles.requestHeader}>
                          <View style={styles.inlineRow}>
                            <RequestIcon
                              size={18}
                              color={isField ? colors.info : (isCheckout ? colors.brand : colors.brand)}
                            />
                            <Text style={[typography.bodyBold, { color: colors.text }]}>
                              {isField
                                ? fieldRecord?.eventTitle || 'Outreach'
                                : (isCheckout ? 'Checkout Request' : 'Leave')}
                            </Text>
                        </View>
                        <StatusBadge
                          status={toBadgeStatus(request.status)}
                          label={getStatusLabel(request.status)}
                          size="small"
                        />
                      </View>
                      <View style={[styles.inlineRow, { marginTop: spacing.sm }]}>
                        <CalendarRange size={14} color={colors.textMuted} />
                        <Text style={[typography.small, { color: colors.text }]}>
                          {formatRequestDateRange(request)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          typography.small,
                          { color: colors.textMuted, marginTop: spacing.xs },
                        ]}
                        numberOfLines={2}
                      >
                        {request.reason}
                      </Text>

                      {/* Outreach details: who you went with, where */}
                      {isField && (fieldRecord?.accompaniedBy || fieldRecord?.location) ? (
                        <View
                          style={[
                            styles.reportSummary,
                            { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, marginTop: spacing.sm },
                          ]}
                        >
                          {fieldRecord?.accompaniedBy ? (
                            <View style={styles.inlineRow}>
                              <UserCheck size={14} color={colors.brand} />
                              <Text style={[typography.caption, styles.flexText, { color: colors.text }]}>
                                Went with: <Text style={{ fontWeight: '700' }}>{fieldRecord.accompaniedBy}</Text>
                              </Text>
                            </View>
                          ) : null}
                          {fieldRecord?.location ? (
                            <View style={[styles.inlineRow, { marginTop: 4 }]}>
                              <MapPin size={14} color={colors.info} />
                              <Text style={[typography.caption, styles.flexText, { color: colors.text }]}>
                                {fieldRecord.location}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {!isField && (request as LeaveRecord).delegate ? (
                        <View
                          style={[
                            styles.delegateSummary,
                            {
                              backgroundColor: colors.infoSoft,
                              borderRadius: radii.md,
                              marginTop: spacing.sm,
                            },
                          ]}
                        >
                          <UserCheck size={15} color={colors.info} />
                          <View style={styles.flexText}>
                            <Text style={[typography.caption, { color: colors.textMuted }]}>Work covered by</Text>
                            <Text style={[typography.small, { color: colors.text, fontWeight: '700' }]}>
                              {(request as LeaveRecord).delegate?.fullName}
                              {(request as LeaveRecord).delegate?.uid
                                ? ` · ${(request as LeaveRecord).delegate?.uid}`
                                : ''}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                      {request.status === 'rejected' && request.reson ? (
                        <View style={[styles.inlineRow, { marginTop: spacing.sm }]}>
                          <CircleAlert size={14} color={colors.danger} />
                          <Text
                            style={[
                              typography.caption,
                              styles.flexText,
                              { color: colors.danger },
                            ]}
                          >
                            Note: {request.reson}
                          </Text>
                        </View>
                      ) : null}

                      {isField && isNoResponse ? (
                        <View
                          style={[
                            styles.reportSummary,
                            {
                              backgroundColor: colors.surfaceAlt,
                              borderRadius: radii.md,
                              marginTop: spacing.sm,
                            },
                          ]}
                        >
                          <View style={styles.inlineRow}>
                            <TriangleAlert size={14} color={colors.textMuted} />
                            <Text style={[typography.caption, styles.flexText, { color: colors.text }]}>
                              Admin did not respond before the outreach start date.
                            </Text>
                          </View>
                          <Text
                            style={[
                              typography.small,
                              { color: colors.textMuted, marginTop: spacing.xs },
                            ]}
                          >
                            {(fieldRecord as FieldRecord | null)?.noResponseReason ||
                              'This request moved out of pending automatically and cannot be approved now.'}
                          </Text>
                          {(fieldRecord as FieldRecord | null)?.noResponseAt ? (
                            <Text
                              style={[
                                typography.caption,
                                { color: colors.textMuted, marginTop: spacing.xs },
                              ]}
                            >
                              Marked on {formatDateTime((fieldRecord as FieldRecord).noResponseAt)}
                            </Text>
                          ) : null}
                          {(fieldRecord as FieldRecord | null)?.noResponseReviewed ? (
                            <Text
                              style={[
                                typography.caption,
                                { color: colors.success, marginTop: spacing.xs },
                              ]}
                            >
                              Reviewed by admin
                              {(fieldRecord as FieldRecord).noResponseReviewedAt
                                ? ` on ${formatDateTime((fieldRecord as FieldRecord).noResponseReviewedAt)}`
                                : ''}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Event-day info: summary of what was already uploaded */}
                      {isField && hasReport ? (
                        <View
                          style={[
                            styles.reportSummary,
                            {
                              backgroundColor: colors.surfaceAlt,
                              borderRadius: radii.md,
                              marginTop: spacing.sm,
                            },
                          ]}
                        >
                          <View style={styles.inlineRow}>
                            <CircleCheck size={14} color={colors.success} />
                            <Text style={[typography.caption, { color: colors.text }]}>
                              Event info uploaded
                              {reportPhotoCount > 0
                                ? ` · ${reportPhotoCount} photo${reportPhotoCount > 1 ? 's' : ''}`
                                : ''}
                              {reportDocCount > 0
                                ? ` · ${reportDocCount} document${reportDocCount > 1 ? 's' : ''}`
                                : ''}
                            </Text>
                          </View>
                          {report?.notes ? (
                            <Text
                              style={[
                                typography.small,
                                { color: colors.textMuted, marginTop: spacing.xs },
                              ]}
                              numberOfLines={3}
                            >
                              {report.notes}
                            </Text>
                          ) : null}
                          {reportPhotoCount > 0 ? (
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              style={{ marginTop: spacing.sm }}
                            >
                              {report!.photos!.map((p, i) => (
                                <TouchableOpacity key={i} onPress={() => setPreviewImageUri(normalizeUri(p))} activeOpacity={0.8}>
                                  <Image
                                    source={{ uri: normalizeUri(p) }}
                                    style={[
                                      styles.reportThumb,
                                      { borderRadius: radii.sm, marginRight: 6 },
                                    ]}
                                    resizeMode="cover"
                                  />
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Event-day info: upload entry point */}
                      {fieldRecord && canUploadReport(request) ? (
                        <Button
                          title={hasReport ? 'Add more event info' : 'Upload event info'}
                          onPress={() => openUploadSheet(fieldRecord)}
                          icon={Upload}
                          variant="secondary"
                          size="sm"
                          fullWidth
                          style={{ marginTop: spacing.md }}
                          accessibilityLabel={`Upload information about ${fieldRecord.eventTitle || 'this outreach'}`}
                        />
                      ) : null}

                      {canCancelRequest(request) ? (
                        <Button
                          title="Cancel Request"
                          onPress={() =>
                            setCancelTarget({
                              id: String(request._id),
                              type: request.type as 'leave' | 'field' | 'checkout',
                            })
                          }
                          icon={Trash2}
                          variant="ghost"
                          size="sm"
                          fullWidth
                          style={{ marginTop: spacing.md }}
                          accessibilityLabel="Cancel this request — available for 1 hour after submitting"
                        />
                      ) : null}
                    </Card>
                  </View>
                );
              })}
              {historyForType.length > historyDisplayLimit && (
                <Button
                  title={`Load more (${historyForType.length - historyDisplayLimit} more)`}
                  onPress={() => setHistoryDisplayLimit((n) => n + HISTORY_PAGE_SIZE)}
                  variant="outline"
                  size="sm"
                  fullWidth
                  style={{ marginTop: spacing.md }}
                  accessibilityLabel="Load more request history"
                />
              )}
              </>
            )}
          </>
        )}
      </Screen>

      {/* Cancel request confirmation (destructive, within-1-hour undo) */}
      <ConfirmSheet
        visible={!!cancelTarget}
        title="Cancel this request?"
        message="This will withdraw your pending request. This cannot be undone."
        confirmLabel="Cancel Request"
        cancelLabel="Keep Request"
        destructive
        loading={cancelling}
        icon={Trash2}
        onConfirm={confirmCancelRequest}
        onCancel={() => setCancelTarget(null)}
      />

      {/* New request bottom sheet */}
      <FormSheet
        visible={showModal}
        title={modalType === 'leave' ? 'Request Leave' : (modalType === 'checkout' ? 'Checkout Request' : 'Request Outreach')}
        icon={modalType === 'leave' ? Plane : (modalType === 'checkout' ? Clock : Navigation)}
        onClose={() => setShowModal(false)}
      >
        {modalType === 'leave' ? (
          <>
            {/* How-leave-works info row */}
            <Pressable
              onPress={() => setShowLeaveHelp(true)}
              accessibilityRole="button"
              accessibilityLabel="How leave works — help and guide"
              style={[styles.leaveInfoRow, { backgroundColor: colors.brandSoft, borderRadius: radii.md, marginBottom: spacing.lg }]}
            >
              <Info size={18} color={colors.brand} />
              <Text style={[typography.small, styles.flexText, { color: colors.brand, fontWeight: '700' }]}>
                How leave works — types, documents & who approves it
              </Text>
              <ChevronDown size={16} color={colors.brand} style={{ transform: [{ rotate: '-90deg' }] }} />
            </Pressable>

            {checkedInToday ? (
              <View style={[styles.leaveInfoRow, { backgroundColor: '#FEF3C7', borderRadius: radii.md, marginBottom: spacing.lg }]}>
                <CircleAlert size={16} color="#B45309" />
                <Text style={[typography.small, styles.flexText, { color: '#92400E', fontWeight: '600' }]}>
                  You've already checked in today — leave can start from tomorrow onwards.
                </Text>
              </View>
            ) : null}

            {/* Leave type selector */}
            <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>Leave type *</Text>
            {leaveTypes.length === 0 ? (
              <View style={[styles.dateButton, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.lg }]}>
                <Text style={[typography.small, { color: colors.textMuted }]}>Loading leave types…</Text>
              </View>
            ) : (
              <View style={{ marginBottom: spacing.lg }}>
                <Pressable
                  onPress={() => setTypeDropdownOpen((o) => !o)}
                  accessibilityRole="button"
                  accessibilityLabel="Select leave type"
                  style={[
                    styles.delegateSelect,
                    {
                      borderRadius: radii.md,
                      borderColor: (attemptedSubmit && !selectedTypeId) ? colors.danger : (typeDropdownOpen ? colors.brand : colors.border),
                      backgroundColor: colors.surface,
                      borderWidth: (attemptedSubmit && !selectedTypeId) ? 1.5 : 1,
                    }
                  ]}
                >
                  <View style={[styles.typeDot, { backgroundColor: selectedLeaveType?.color || colors.brand }]} />
                  <View style={styles.flexText}>
                    <Text style={[typography.small, { color: colors.text, fontWeight: '700' }]}>
                      {selectedLeaveType?.name || 'Select leave type'}
                    </Text>
                    {selectedLeaveType?.description ? (
                      <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                        {selectedLeaveType.description}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronDown size={18} color={colors.textMuted} />
                </Pressable>

                {typeDropdownOpen ? (
                  <View style={[styles.delegateMenu, { borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}>
                      {leaveTypes.map((t) => {
                        const selected = selectedTypeId === t._id;
                        return (
                          <Pressable
                            key={t._id}
                            onPress={() => {
                              haptic('selection');
                              setSelectedTypeId(t._id);
                              setTypeDropdownOpen(false);
                              if (!t.halfDayAllowed) setDayPortion('full');
                            }}
                            style={[styles.delegateOption, { borderRadius: radii.sm, backgroundColor: selected ? colors.brandSoft : colors.surfaceAlt }]}
                          >
                            <View style={styles.inlineRow}>
                              <View style={[styles.typeDot, { backgroundColor: t.color || colors.brand }]} />
                              <Text style={[typography.small, { color: selected ? colors.brand : colors.text, fontWeight: selected ? '800' : '600' }]}>
                                {t.name}
                              </Text>
                            </View>
                            <Text style={[typography.caption, { color: colors.textMuted }]}>
                              {t.paid ? 'Paid' : 'Unpaid'} · Quota {t.yearlyQuota}d{t.requiresDocument ? ' · Doc required' : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                {selectedLeaveType ? (
                  <View style={styles.typeBadgeRow}>
                    <View style={[styles.typeBadge, { backgroundColor: selectedLeaveType.paid ? '#DCFCE7' : '#FEF3C7' }]}>
                      <Text style={[typography.caption, { color: selectedLeaveType.paid ? '#16A34A' : '#B45309', fontWeight: '700' }]}>
                        {selectedLeaveType.paid ? 'Paid' : 'Unpaid'}
                      </Text>
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: colors.surfaceAlt }]}>
                      <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '700' }]}>Quota {selectedLeaveType.yearlyQuota}d</Text>
                    </View>
                    {selectedLeaveType.requiresDocument ? (
                      <View style={[styles.typeBadge, { backgroundColor: '#FEE2E2' }]}>
                        <Text style={[typography.caption, { color: '#DC2626', fontWeight: '700' }]}>Document required</Text>
                      </View>
                    ) : null}
                    {selectedLeaveType.minAdvanceNoticeDays > 0 ? (
                      <View style={[styles.typeBadge, { backgroundColor: colors.surfaceAlt }]}>
                        <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '700' }]}>{selectedLeaveType.minAdvanceNoticeDays}d notice</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </>
        ) : null}

        {modalType === 'field' ? (
          <View style={{ marginBottom: spacing.lg }}>
            {/* What outreach means */}
            <View style={[styles.leaveInfoRow, { backgroundColor: colors.infoSoft, borderRadius: radii.md, marginBottom: spacing.lg, alignItems: 'flex-start' }]}>
              <Navigation size={18} color={colors.info} />
              <Text style={[typography.small, styles.flexText, { color: colors.text }]}>
                Use this when you were on official duty — a meeting or visit on behalf of the institution — so your attendance couldn't be marked. Add where you went, who you went with, and evidence.
              </Text>
            </View>

            <Input
              label="Purpose / Meeting *"
              icon={Briefcase}
              placeholder="e.g., District Health Camp, Client meeting"
              value={eventTitle}
              onChangeText={setEventTitle}
              error={attemptedSubmit && !eventTitle.trim() ? ' ' : undefined}
            />
            <Input
              label="Where did you go? (Location)"
              icon={MapPin}
              placeholder="e.g., Collector's office, Anuvadini HQ Delhi"
              value={outreachLocation}
              onChangeText={setOutreachLocation}
            />
            <Input
              label="Who did you go with? (Head / senior)"
              icon={UserCheck}
              placeholder="e.g., Dr. Sharma (HOD), Principal"
              value={accompaniedBy}
              onChangeText={setAccompaniedBy}
            />
          </View>
        ) : null}

        {modalType === 'checkout' ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Text
              style={[
                typography.bodyBold,
                { color: colors.text, marginBottom: spacing.sm },
              ]}
            >
              Select Date *
            </Text>
            {loadingEligibleDates ? (
              <View style={[styles.dateButton, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text style={[typography.body, { color: colors.textMuted }]}>Loading eligible dates...</Text>
              </View>
            ) : eligibleCheckoutDates.length === 0 ? (
              <View style={[styles.dateButton, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, opacity: 0.7 }]}>
                <Text style={[typography.body, { color: colors.danger, fontWeight: '600' }]}>
                  No eligible dates found (checked in but missed checkout)
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => setCheckoutDateDropdownOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel="Select date for checkout request"
                  style={[
                    styles.delegateSelect,
                    {
                      borderRadius: radii.md,
                      borderColor: (attemptedSubmit && !eligibleCheckoutDates.some(d => toISODate(d.date) === toISODate(startDate))) ? colors.danger : (checkoutDateDropdownOpen ? colors.brand : colors.border),
                      backgroundColor: colors.surface,
                      borderWidth: (attemptedSubmit && !eligibleCheckoutDates.some(d => toISODate(d.date) === toISODate(startDate))) ? 1.5 : 1,
                    },
                  ]}
                >
                  <CalendarDays size={18} color={colors.brand} />
                  <View style={styles.flexText}>
                    <Text style={[typography.small, { color: colors.text }]}>
                      {eligibleCheckoutDates.find(d => toISODate(d.date) === toISODate(startDate))?.label || 'Select Date'}
                    </Text>
                  </View>
                  <ChevronDown size={18} color={colors.textMuted} />
                </Pressable>

                {checkoutDateDropdownOpen && (
                  <View style={[styles.delegateMenu, { borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                      {eligibleCheckoutDates.map((d) => {
                        const selected = toISODate(startDate) === d.dateStr;
                        return (
                          <Pressable
                            key={d.dateStr}
                            onPress={() => {
                              haptic('selection');
                              setStartDate(d.date);
                              setEndDate(d.date);
                              setCheckoutDateDropdownOpen(false);
                            }}
                            style={[
                              styles.delegateOption,
                              {
                                borderRadius: radii.sm,
                                backgroundColor: selected ? colors.brandSoft : colors.surfaceAlt,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                typography.small,
                                {
                                  color: selected ? colors.brand : colors.text,
                                  fontWeight: selected ? '700' : '500',
                                },
                              ]}
                            >
                              {d.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </>
            )}
          </View>
        ) : (
          <View style={styles.dateRow}>
            <View style={styles.dateBox}>
              <Text
                style={[
                  typography.bodyBold,
                  { color: colors.text, marginBottom: spacing.sm },
                ]}
              >
                {modalType === 'field' && outreachDurationType !== 'full' ? 'Select Date' : 'Start date'}
              </Text>
              <Pressable
                onPress={() => setShowStartPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Start date, ${formatDate(startDate)}. Tap to change`}
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
                  {formatDate(startDate)}
                </Text>
              </Pressable>
            </View>

            {!(modalType === 'field' && outreachDurationType !== 'full') && (
              <View style={styles.dateBox}>
                <Text
                  style={[
                    typography.bodyBold,
                    { color: colors.text, marginBottom: spacing.sm },
                  ]}
                >
                  End date
                </Text>
                <Pressable
                  onPress={() => setShowEndPicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`End date, ${formatDate(endDate)}. Tap to change`}
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
                    {formatDate(endDate)}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {modalType === 'field' && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>Outreach Duration</Text>
            <View style={styles.segRow}>
              {(['full', 'half', 'custom'] as const).map((opt) => {
                const on = outreachDurationType === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      setOutreachDurationType(opt);
                      if (opt === 'half' || opt === 'custom') {
                        setEndDate(startDate); // Same day
                      }
                    }}
                    style={[
                      styles.segBtn,
                      {
                        borderColor: on ? colors.brand : colors.border,
                        backgroundColor: on ? colors.brandSoft : colors.surface,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Text style={[typography.small, { color: on ? colors.brand : colors.text, fontWeight: on ? '800' : '600' }]}>
                      {opt === 'full' ? 'Full Day' : opt === 'half' ? 'Half Day' : 'Custom Time'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {outreachDurationType === 'half' && (
              <View style={[styles.segRow, { marginTop: spacing.sm }]}>
                {(['first', 'second'] as const).map((opt) => {
                  const on = outreachHalfDayType === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setOutreachHalfDayType(opt)}
                      style={[
                        styles.segBtn,
                        {
                          borderColor: on ? colors.brand : colors.border,
                          backgroundColor: on ? colors.brandSoft : colors.surface,
                          borderRadius: radii.md,
                        },
                      ]}
                    >
                      <Text style={[typography.small, { color: on ? colors.brand : colors.text, fontWeight: on ? '800' : '600' }]}>
                        {opt === 'first' ? 'First Half (9:00 AM - 1:30 PM)' : 'Second Half (1:30 PM - 6:00 PM)'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {outreachDurationType === 'custom' && (
              <View style={[styles.dateRow, { marginTop: spacing.sm }]}>
                <View style={styles.dateBox}>
                  <Text style={[typography.small, { color: colors.textMuted, marginBottom: 4 }]}>Start Time</Text>
                  <Pressable
                    onPress={() => setShowOutreachStartPicker(true)}
                    style={[
                      styles.dateButton,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceAlt,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Text style={[typography.body, { color: colors.text }]}>
                      {formatTime(outreachStartTime)}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.dateBox}>
                  <Text style={[typography.small, { color: colors.textMuted, marginBottom: 4 }]}>End Time</Text>
                  <Pressable
                    onPress={() => setShowOutreachEndPicker(true)}
                    style={[
                      styles.dateButton,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceAlt,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Text style={[typography.body, { color: colors.text }]}>
                      {formatTime(outreachEndTime)}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        {modalType !== 'checkout' && (
          <>
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
                Total days
              </Text>
              <Text
                style={[typography.title, { color: colors.brandStrong }]}
                accessibilityLiveRegion="polite"
              >
                {daysBetween(startDate, endDate)}
              </Text>
            </View>

            {startDate.toDateString() === endDate.toDateString() ? (
              <View style={[styles.inlineRow, { marginTop: spacing.md }]}>
                <Info size={16} color={colors.info} />
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  Single day {modalType === 'leave' ? 'leave' : 'outreach'} request
                </Text>
              </View>
            ) : null}
          </>
        )}

        {/* Full / Half day (leave only, single day) */}
        {modalType === 'leave' && selectedLeaveType?.halfDayAllowed && startDate.toDateString() === endDate.toDateString() ? (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm }]}>Duration</Text>
            <View style={styles.segRow}>
              {(['full', 'half'] as const).map((opt) => {
                const on = dayPortion === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setDayPortion(opt)}
                    style={[styles.segBtn, { borderColor: on ? colors.brand : colors.border, backgroundColor: on ? colors.brandSoft : colors.surface, borderRadius: radii.md }]}
                  >
                    <Text style={[typography.small, { color: on ? colors.brand : colors.text, fontWeight: on ? '800' : '600' }]}>
                      {opt === 'full' ? 'Full day' : 'Half day'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {dayPortion === 'half' ? (
              <View style={[styles.segRow, { marginTop: spacing.sm }]}>
                {(['first', 'second'] as const).map((opt) => {
                  const on = halfDayType === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setHalfDayType(opt)}
                      style={[styles.segBtn, { borderColor: on ? colors.brand : colors.border, backgroundColor: on ? colors.brandSoft : colors.surface, borderRadius: radii.md }]}
                    >
                      <Text style={[typography.small, { color: on ? colors.brand : colors.text, fontWeight: on ? '800' : '600' }]}>
                        {opt === 'first' ? 'First half' : 'Second half'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ marginTop: spacing.lg }}>
          <Input
            label={modalType === 'checkout' ? 'Reason for missed checkout *' : 'Reason *'}
            icon={FileText}
            placeholder={
              modalType === 'leave'
                ? 'e.g., Fever, Family function, Travel'
                : (modalType === 'checkout' ? 'e.g., Forgot to checkout at 5 PM' : 'e.g., Field survey, Camp, Conference')
            }
            value={reason}
            onChangeText={setReason}
            error={attemptedSubmit && !reason.trim() ? ' ' : undefined}
          />
          {modalType !== 'checkout' && (
            <Input
              label={modalType === 'leave' ? 'Detailed description' : 'Additional notes'}
              icon={NotebookPen}
              placeholder="Optional additional details"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              inputStyle={styles.textArea}
            />
          )}
        </View>

        {/* Outreach evidence */}
        {modalType === 'field' && (
          <View style={{ marginTop: spacing.lg }}>
            <View style={styles.inlineRow}>
              <Paperclip size={16} color={colors.brand} />
              <Text style={[typography.bodyBold, { color: colors.text }]}>Evidence (photos)</Text>
              {outreachEvidence.length > 0 ? (
                <View style={[styles.docCount, { backgroundColor: colors.brandSoft }]}>
                  <Text style={[typography.caption, { color: colors.brand, fontWeight: '800' }]}>{outreachEvidence.length}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[typography.small, { color: colors.textMuted, marginTop: 2, marginBottom: spacing.md }]}>
              Attach proof — a photo at the venue, the invite/letter, or your ID at the meeting.
            </Text>
            {outreachEvidence.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {outreachEvidence.map((f, i) => (
                    <View key={i} style={styles.docThumbWrap}>
                      <Image source={{ uri: f.image }} style={[styles.docThumb, { borderColor: colors.border }]} />
                      <Pressable onPress={() => removeOutreachEvidence(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[styles.docRemove, { backgroundColor: colors.danger }]}>
                        <X size={12} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : null}
            <View style={styles.docBtnRow}>
              <Pressable onPress={() => pickOutreachEvidence(false)} disabled={outreachUploading} style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, opacity: outreachUploading ? 0.6 : 1 }]}>
                <ImagePlus size={16} color={colors.brand} />
                <Text style={[typography.small, { color: colors.text }]}>Gallery</Text>
              </Pressable>
              <Pressable onPress={() => pickOutreachEvidence(true)} disabled={outreachUploading} style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, opacity: outreachUploading ? 0.6 : 1 }]}>
                <Camera size={16} color={colors.brand} />
                <Text style={[typography.small, { color: colors.text }]}>Camera</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Checkout evidence */}
        {modalType === 'checkout' && (
          <View style={{ marginTop: spacing.lg }}>
            <View style={styles.inlineRow}>
              <Paperclip size={16} color={colors.brand} />
              <Text style={[typography.bodyBold, { color: colors.text }]}>Optional Evidence / Photo</Text>
              {checkoutEvidence.length > 0 ? (
                <View style={[styles.docCount, { backgroundColor: colors.brandSoft }]}>
                  <Text style={[typography.caption, { color: colors.brand, fontWeight: '800' }]}>{checkoutEvidence.length}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[typography.small, { color: colors.textMuted, marginTop: 2, marginBottom: spacing.md }]}>
              Attach an optional photo as evidence (e.g. your punch-out issue, system message, or office desk photo).
            </Text>
            {checkoutEvidence.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {checkoutEvidence.map((f, i) => (
                    <View key={i} style={styles.docThumbWrap}>
                      <Image source={{ uri: f.image }} style={[styles.docThumb, { borderColor: colors.border }]} />
                      <Pressable onPress={() => removeCheckoutEvidence(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[styles.docRemove, { backgroundColor: colors.danger }]}>
                        <X size={12} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : null}
            <View style={styles.docBtnRow}>
              <Pressable onPress={() => pickCheckoutEvidence(false)} disabled={checkoutUploading} style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, opacity: checkoutUploading ? 0.6 : 1 }]}>
                <ImagePlus size={16} color={colors.brand} />
                <Text style={[typography.small, { color: colors.text }]}>Gallery</Text>
              </Pressable>
              <Pressable onPress={() => pickCheckoutEvidence(true)} disabled={checkoutUploading} style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, opacity: checkoutUploading ? 0.6 : 1 }]}>
                <Camera size={16} color={colors.brand} />
                <Text style={[typography.small, { color: colors.text }]}>Camera</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Enterprise leave fields */}
        {modalType === 'leave' && (
          <>
            <View style={[styles.emergencyRow, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, marginBottom: spacing.lg }]}>
              <View style={styles.emergencyLeft}>
                <View style={[styles.emergencyIcon, { backgroundColor: '#FEE2E2' }]}>
                  <Zap size={16} color="#DC2626" />
                </View>
                <View style={styles.flexText}>
                  <Text style={[typography.bodyBold, { color: colors.text }]}>Emergency leave</Text>
                  <Text style={[typography.small, { color: colors.textMuted }]}>Skips the advance-notice rule when allowed.</Text>
                </View>
              </View>
              <Switch value={isEmergency} onValueChange={setIsEmergency} trackColor={{ true: colors.brand, false: colors.border }} />
            </View>

            <Input
              label="Contact number during leave"
              icon={Phone}
              placeholder="A number where you're reachable"
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
            />
            <Input
              label="Address during leave"
              icon={MapPin}
              placeholder="Where you'll be staying"
              value={addressDuringLeave}
              onChangeText={setAddressDuringLeave}
              multiline
              numberOfLines={2}
              inputStyle={styles.textArea}
            />

            <Text style={[typography.bodyBold, { color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm }]}>Expected return date</Text>
            <Pressable
              onPress={() => setShowReturnPicker(true)}
              accessibilityRole="button"
              style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md }]}
            >
              <CalendarClock size={16} color={colors.brand} />
              <Text style={[typography.body, { color: expectedReturn ? colors.text : colors.textMuted }]}>
                {expectedReturn ? formatDate(expectedReturn) : 'Select a date (optional)'}
              </Text>
              {expectedReturn ? (
                <Pressable onPress={() => setExpectedReturn(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 'auto' }}>
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

            {/* Documents */}
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.inlineRow}>
                <Paperclip size={16} color={colors.brand} />
                <Text style={[typography.bodyBold, { color: colors.text }]}>
                  Supporting documents{selectedLeaveType?.requiresDocument ? ' *' : ''}
                </Text>
              </View>
              <Text style={[typography.small, { color: colors.textMuted, marginTop: 2, marginBottom: spacing.md }]}>
                {selectedLeaveType?.requiresDocument
                  ? 'Attach your medical certificate as a clear photo.'
                  : 'Attach a photo of any supporting document (optional).'}
              </Text>

              <LeaveDocGroup icon={Stethoscope} label="Medical certificate" files={medicalFiles} onGallery={() => pickLeaveDocs('medical', false)} onCamera={() => pickLeaveDocs('medical', true)} onRemove={(i) => removeLeaveDoc('medical', i)} theme={theme} disabled={uploadingDoc} />
              <View style={{ height: spacing.md }} />
              <LeaveDocGroup icon={FileText} label="Other documents" files={supportingFiles} onGallery={() => pickLeaveDocs('supporting', false)} onCamera={() => pickLeaveDocs('supporting', true)} onRemove={(i) => removeLeaveDoc('supporting', i)} theme={theme} disabled={uploadingDoc} />
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <Input
                label="Additional comments"
                icon={NotebookPen}
                placeholder="Anything else for your approver"
                value={comments}
                onChangeText={setComments}
                multiline
                numberOfLines={2}
                inputStyle={styles.textArea}
              />
            </View>
          </>
        )}

        {modalType === 'leave' && (
          <View style={{ marginBottom: spacing.md }}>
            <View style={styles.inlineRow}>
              <UserCheck size={16} color={colors.brand} />
              <Text style={[typography.bodyBold, { color: colors.text }]}>
                Who will cover your work? {colleagues.length > 0 ? '*' : ''}
              </Text>
            </View>
            <Text
              style={[
                typography.small,
                { color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
              ]}
            >
              They'll be notified that your work is theirs while you're on leave.
            </Text>
            <Pressable
              onPress={() => colleagues.length > 0 && setDelegateDropdownOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: delegateDropdownOpen, disabled: colleagues.length === 0 }}
              accessibilityLabel="Select the colleague who will cover your work"
              style={[
                styles.delegateSelect,
                {
                  borderRadius: radii.md,
                  borderColor: (attemptedSubmit && colleagues.length > 0 && !selectedDelegateId) ? colors.danger : (delegateDropdownOpen ? colors.brand : colors.border),
                  backgroundColor: colleagues.length === 0 ? colors.surfaceAlt : colors.surface,
                  opacity: colleagues.length === 0 ? 0.7 : 1,
                  borderWidth: (attemptedSubmit && colleagues.length > 0 && !selectedDelegateId) ? 1.5 : 1,
                },
              ]}
            >
              <UserCheck size={18} color={selectedDelegate ? colors.brand : colors.textMuted} />
              <View style={styles.flexText}>
                <Text style={[typography.small, { color: selectedDelegate ? colors.text : colors.textMuted }]}>
                  {colleagues.length === 0 ? 'No colleagues available to assign' : (selectedDelegate?.fullName || 'Select covering colleague')}
                </Text>
                {selectedDelegate?.designation || selectedDelegate?.uid ? (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {selectedDelegate.designation || selectedDelegate.uid}
                  </Text>
                ) : null}
              </View>
              {colleagues.length > 0 && <ChevronDown size={18} color={colors.textMuted} />}
            </Pressable>

            {delegateDropdownOpen && colleagues.length > 0 ? (
              <View style={[styles.delegateMenu, { borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface }]}>
                {colleagues.map((c) => {
                  const selected = selectedDelegateId === c._id;
                  return (
                    <Pressable
                      key={c._id}
                      onPress={() => {
                        haptic('selection');
                        setSelectedDelegateId(c._id);
                        setDelegateDropdownOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Assign ${c.fullName} to cover your work`}
                      style={[
                        styles.delegateOption,
                        {
                          borderRadius: radii.sm,
                          backgroundColor: selected ? colors.brandSoft : colors.surfaceAlt,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.small,
                          {
                            color: selected ? colors.brand : colors.text,
                            fontWeight: selected ? '700' : '500',
                          },
                        ]}
                      >
                        {c.fullName}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        {c.designation || c.uid}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        )}

        <Button
          title={`Submit ${modalType === 'leave' ? 'Leave' : (modalType === 'checkout' ? 'Checkout' : 'Outreach')} Request`}
          onPress={submitRequest}
          icon={Send}
          loading={submitting}
          fullWidth
          style={{ marginTop: spacing.sm }}
          accessibilityLabel={`Submit ${modalType === 'leave' ? 'leave' : (modalType === 'checkout' ? 'checkout' : 'outreach')} request`}
        />

        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            minimumDate={modalType === 'checkout' ? undefined : (modalType === 'leave' ? minLeaveDate : new Date())}
            maximumDate={modalType === 'checkout' ? new Date(Date.now() - 86400000) : undefined}
            onChange={(event, selectedDate) => {
              setShowStartPicker(false);
              if (selectedDate) {
                setStartDate(selectedDate);
                if (selectedDate > endDate) {
                  setEndDate(selectedDate);
                }
              }
            }}
          />
        )}

        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display="default"
            minimumDate={startDate}
            onChange={(event, selectedDate) => {
              setShowEndPicker(false);
              if (selectedDate) {
                setEndDate(selectedDate);
              }
            }}
          />
        )}

        {showOutreachStartPicker && (
          <DateTimePicker
            value={outreachStartTime}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={(event, selectedTime) => {
              setShowOutreachStartPicker(false);
              if (selectedTime) {
                setOutreachStartTime(selectedTime);
              }
            }}
          />
        )}

        {showOutreachEndPicker && (
          <DateTimePicker
            value={outreachEndTime}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={(event, selectedTime) => {
              setShowOutreachEndPicker(false);
              if (selectedTime) {
                setOutreachEndTime(selectedTime);
              }
            }}
          />
        )}
      </FormSheet>

      {/* Detailed request view modal */}
      <FormSheet
        visible={!!selectedRequest}
        title={
          selectedRequest?.type === 'leave'
            ? 'Leave Details'
            : selectedRequest?.type === 'checkout'
            ? 'Checkout Details'
            : 'Outreach Details'
        }
        icon={selectedRequest?.type === 'leave' ? Plane : (selectedRequest?.type === 'checkout' ? Clock : Navigation)}
        onClose={() => setSelectedRequest(null)}
      >
        {selectedRequest && (
          <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
            <View style={{ gap: spacing.md }}>
              {/* Status Badge */}
              <View style={[styles.inlineRow, { justifyContent: 'space-between', paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Text style={[typography.bodyBold, { color: colors.text }]}>Status</Text>
                <StatusBadge
                  status={toBadgeStatus(selectedRequest.status)}
                  label={getStatusLabel(selectedRequest.status)}
                  size="small"
                />
              </View>

              {/* Title / Type details */}
              <View style={{ gap: spacing.xs }}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {selectedRequest.type === 'leave' ? 'Leave Type' : selectedRequest.type === 'field' ? 'Outreach Purpose' : 'Request Type'}
                </Text>
                <Text style={[typography.bodyBold, { color: colors.text }]}>
                  {selectedRequest.type === 'field'
                    ? (selectedRequest as FieldRecord).eventTitle || 'Outreach'
                    : selectedRequest.type === 'leave'
                    ? ((selectedRequest as any).leaveTypeName || leaveTypes.find(t => t._id === (selectedRequest as any).typeId)?.name || 'Leave')
                    : 'Missed Checkout'}
                </Text>
              </View>

              {/* Date / Time details */}
              <View style={{ gap: spacing.xs }}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>Dates & Duration</Text>
                <Text style={[typography.body, { color: colors.text }]}>
                  {formatRequestDateRange(selectedRequest)}
                </Text>
              </View>

              {/* Reason */}
              <View style={{ gap: spacing.xs }}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>Reason</Text>
                <Text style={[typography.body, { color: colors.text }]}>
                  {selectedRequest.reason || 'No reason provided'}
                </Text>
              </View>

              {/* Detailed Description / Description */}
              {((selectedRequest as any).description || selectedRequest.notes) ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {selectedRequest.type === 'leave' ? 'Detailed Description' : 'Additional Notes'}
                  </Text>
                  <Text style={[typography.body, { color: colors.text }]}>
                    {(selectedRequest as any).description || selectedRequest.notes}
                  </Text>
                </View>
              ) : null}

              {/* Comments */}
              {(selectedRequest as any).comments ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>Additional Comments</Text>
                  <Text style={[typography.body, { color: colors.text }]}>
                    {(selectedRequest as any).comments}
                  </Text>
                </View>
              ) : null}

              {/* Extra details for Outreach */}
              {selectedRequest.type === 'field' && (
                <>
                  {/* Location */}
                  <View style={{ gap: spacing.xs }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>Location</Text>
                    <View style={styles.inlineRow}>
                      <MapPin size={14} color={colors.brand} />
                      <Text style={[typography.body, { color: colors.text }]}>
                        {(selectedRequest as FieldRecord).location || '—'}
                      </Text>
                    </View>
                  </View>

                  {/* Accompanied By */}
                  <View style={{ gap: spacing.xs }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>Accompanied By</Text>
                    <View style={styles.inlineRow}>
                      <UserCheck size={14} color={colors.brand} />
                      <Text style={[typography.body, { color: colors.text }]}>
                        {(selectedRequest as FieldRecord).accompaniedBy || '—'}
                      </Text>
                    </View>
                  </View>

                  {/* Evidence / Proof Photos */}
                  <View style={{ gap: spacing.xs }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      Evidence ({ ((selectedRequest as FieldRecord).evidence?.length || 0) })
                    </Text>
                    {(selectedRequest as FieldRecord).evidence && (selectedRequest as FieldRecord).evidence!.length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {(selectedRequest as FieldRecord).evidence!.map((item: any, idx) => {
                            const uri = normalizeUri(item);
                            if (!uri) return null;
                            return (
                              <TouchableOpacity key={idx} onPress={() => setPreviewImageUri(uri)} activeOpacity={0.8}>
                                <Image source={{ uri }} style={[styles.docThumb, { borderColor: colors.border, width: 80, height: 80, borderRadius: radii.md }]} />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    ) : (
                      <Text style={[typography.body, { color: colors.textMuted, fontStyle: 'italic' }]}>No evidence photos attached</Text>
                    )}
                  </View>

                  {/* Event Report Details */}
                  {((selectedRequest as FieldRecord).report?.submittedAt || (selectedRequest as FieldRecord).report?.notes || ((selectedRequest as FieldRecord).report?.photos && (selectedRequest as FieldRecord).report?.photos?.length > 0) || ((selectedRequest as FieldRecord).report?.documents && (selectedRequest as FieldRecord).report?.documents?.length > 0)) ? (
                    <View style={{ gap: spacing.md, marginTop: spacing.xs, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={[typography.bodyBold, { color: colors.text }]}>Event-Day Report</Text>
                      
                      {/* Report Notes */}
                      {(selectedRequest as FieldRecord).report?.notes ? (
                        <View style={{ gap: spacing.xs }}>
                          <Text style={[typography.caption, { color: colors.textMuted }]}>Report Notes</Text>
                          <Text style={[typography.body, { color: colors.text }]}>
                            {(selectedRequest as FieldRecord).report?.notes}
                          </Text>
                        </View>
                      ) : null}

                      {/* Report Photos */}
                      {(selectedRequest as FieldRecord).report?.photos && (selectedRequest as FieldRecord).report!.photos!.length > 0 ? (
                        <View style={{ gap: spacing.xs }}>
                          <Text style={[typography.caption, { color: colors.textMuted }]}>Report Photos ({ (selectedRequest as FieldRecord).report!.photos!.length })</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {(selectedRequest as FieldRecord).report!.photos!.map((item: any, idx) => {
                                const uri = normalizeUri(item);
                                if (!uri) return null;
                                return (
                                  <TouchableOpacity key={idx} onPress={() => setPreviewImageUri(uri)} activeOpacity={0.8}>
                                    <Image source={{ uri }} style={[styles.docThumb, { borderColor: colors.border, width: 80, height: 80, borderRadius: radii.md }]} />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </ScrollView>
                        </View>
                      ) : null}

                      {/* Report Documents */}
                      {(selectedRequest as FieldRecord).report?.documents && (selectedRequest as FieldRecord).report!.documents!.length > 0 ? (
                        <View style={{ gap: spacing.xs }}>
                          <Text style={[typography.caption, { color: colors.textMuted }]}>Report Documents ({ (selectedRequest as FieldRecord).report!.documents!.length })</Text>
                          <View style={{ gap: spacing.xs }}>
                            {(selectedRequest as FieldRecord).report!.documents!.map((doc: any, idx) => (
                              <View key={idx} style={[styles.inlineRow, { gap: spacing.sm }]}>
                                <Paperclip size={14} color={colors.brand} />
                                <Text style={[typography.small, { color: colors.text }]}>
                                  {doc.name || 'document.pdf'}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}

              {/* Extra details for Leave */}
              {selectedRequest.type === 'leave' && (
                <>
                  {/* Delegate / Work Handover */}
                  <View style={{ gap: spacing.xs }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>Covering Colleague</Text>
                    <View style={styles.inlineRow}>
                      <UserCheck size={14} color={colors.brand} />
                      <Text style={[typography.body, { color: colors.text }]}>
                        {(selectedRequest as any).delegate?.fullName ||
                          ((selectedRequest as any).delegate && typeof (selectedRequest as any).delegate === 'object'
                            ? (selectedRequest as any).delegate.fullName
                            : colleagues.find(c => c._id === (selectedRequest as any).delegateId || c._id === (selectedRequest as any).delegate || c._id === (selectedRequest as any).workHandoverTo)?.fullName) ||
                          'Not assigned'}
                        { (selectedRequest as any).delegate?.uid ? ` (${(selectedRequest as any).delegate.uid})` : '' }
                      </Text>
                    </View>
                  </View>

                  {/* Emergency Contact */}
                  <View style={{ gap: spacing.xs }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>Emergency Contact</Text>
                    <Text style={[typography.body, { color: colors.text }]}>
                      {(selectedRequest as LeaveRecord).contactNumber || '—'}
                    </Text>
                  </View>

                  {/* Address During Leave */}
                  <View style={{ gap: spacing.xs }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>Address during leave</Text>
                    <Text style={[typography.body, { color: colors.text }]}>
                      {(selectedRequest as any).addressDuringLeave || '—'}
                    </Text>
                  </View>

                  {/* Expected Return Date */}
                  <View style={{ gap: spacing.xs }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>Expected Return Date</Text>
                    <Text style={[typography.body, { color: colors.text }]}>
                      {(selectedRequest as any).expectedReturnDate ? formatDate((selectedRequest as any).expectedReturnDate) : '—'}
                    </Text>
                  </View>

                  {/* Attachments */}
                  {(selectedRequest as any).attachments && (selectedRequest as any).attachments.length > 0 ? (
                    <View style={{ gap: spacing.xs }}>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>Attachments ({ (selectedRequest as any).attachments.length })</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {(selectedRequest as any).attachments.map((att: any, idx: number) => {
                            const isImage = (att.mimeType || '').startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.originalName || att.filename || '');
                            const fileUrl = getAttachmentUrl(att, selectedRequest._id || '');
                            if (isImage && fileUrl) {
                              return (
                                <TouchableOpacity key={idx} style={{ alignItems: 'center' }} onPress={() => setPreviewImageUri(fileUrl)} activeOpacity={0.8}>
                                  <Image
                                    source={{
                                      uri: fileUrl,
                                      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined
                                    }}
                                    style={[styles.docThumb, { borderColor: colors.border, width: 80, height: 80, borderRadius: radii.md }]}
                                  />
                                  <Text style={[typography.caption, { color: colors.textMuted, fontSize: 10, maxWidth: 80, textAlign: 'center', marginTop: 2 }]} numberOfLines={1}>
                                    {att.originalName || 'image.jpg'}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }
                            return (
                              <View key={idx} style={[styles.docThumb, { borderColor: colors.border, width: 80, height: 80, borderRadius: radii.md, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', padding: 4 }]}>
                                <FileText size={24} color={colors.textMuted} />
                                <Text style={[typography.caption, { color: colors.text, fontSize: 10, textAlign: 'center', marginTop: 4, width: '100%' }]} numberOfLines={2}>
                                  {att.originalName || 'file'}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}
                </>
              )}

              {/* Extra details for Checkout */}
              {selectedRequest.type === 'checkout' && (selectedRequest as CheckoutRecord).evidence && (selectedRequest as CheckoutRecord).evidence!.length > 0 ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>Evidence ({ (selectedRequest as CheckoutRecord).evidence!.length })</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(selectedRequest as CheckoutRecord).evidence!.map((item: any, idx) => {
                        const uri = normalizeUri(item);
                        if (!uri) return null;
                        return (
                          <TouchableOpacity key={idx} onPress={() => setPreviewImageUri(uri)} activeOpacity={0.8}>
                            <Image source={{ uri }} style={[styles.docThumb, { borderColor: colors.border, width: 80, height: 80, borderRadius: radii.md }]} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              ) : null}
            </View>
          </ScrollView>
        )}
      </FormSheet>

      {/* Full-Screen Image Lightbox Viewer */}
      <Modal
        visible={!!previewImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.94)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 48,
              right: 20,
              zIndex: 20,
              backgroundColor: 'rgba(255, 255, 255, 0.25)',
              borderRadius: 24,
              padding: 10,
            }}
            onPress={() => setPreviewImageUri(null)}
            activeOpacity={0.7}
            accessibilityLabel="Close image preview"
          >
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImageUri ? (
            <TouchableOpacity
              style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
              activeOpacity={1}
              onPress={() => setPreviewImageUri(null)}
            >
              <Image
                source={{ uri: previewImageUri }}
                style={{ width: '94%', height: '82%' }}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </Modal>

      {/* "How leave works" help sheet */}
      <Modal visible={showLeaveHelp} animationType="fade" transparent hardwareAccelerated onRequestClose={() => setShowLeaveHelp(false)}>
        <View style={[styles.helpRoot, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.helpSheet, { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.helpTitleRow}>
              <View style={[styles.helpTitleIcon, { backgroundColor: colors.brandSoft }]}>
                <Info size={20} color={colors.brand} />
              </View>
              <Text style={[typography.h3, styles.flexText, { color: colors.text }]}>How leave works</Text>
              <Pressable onPress={() => setShowLeaveHelp(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={[styles.helpClose, { backgroundColor: colors.surfaceAlt }]}>
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
              <HelpSection icon={ListChecks} title="How to apply" color={colors.brand} theme={theme}>
                {[
                  'Pick a Leave Type — each has its own quota and rules.',
                  'Choose Start & End date (or a single day).',
                  'For a single day you can pick Full or Half day.',
                  'Write a Reason and a Detailed description.',
                  'Attach a document if the type needs one.',
                  'Pick a colleague to cover your work, then Submit.',
                ].map((t, i) => <HelpStep key={i} n={i + 1} text={t} theme={theme} />)}
              </HelpSection>
              <HelpSection icon={Paperclip} title="Documents & medical certificate" color="#DC2626" theme={theme}>
                <HelpLine theme={theme} text="Sick / medical leaves REQUIRE a medical certificate — attach a clear photo." />
                <HelpLine theme={theme} text="Files are private; only your HOD / admin can view them, and every view is logged." />
              </HelpSection>
              <HelpSection icon={Building2} title="Where your request goes" color="#16A34A" theme={theme}>
                <HelpLine theme={theme} text="It's sent to your Department HOD (or the Institution Admin if there's no HOD)." />
                <HelpLine theme={theme} text="You'll see “Sent to: <name>” on your request and get notified on approval/rejection." />
              </HelpSection>
              <HelpSection icon={Clock} title="Good to know" color="#F59E0B" theme={theme}>
                <HelpLine theme={theme} text="You can't apply for a past date, or for a day you've already checked in on." />
                <HelpLine theme={theme} text="Weekends and public holidays are auto-excluded; half day = 0.5 day." />
                <HelpLine theme={theme} text="Emergency leave can skip the advance-notice rule when the type allows it." />
              </HelpSection>
            </ScrollView>
            <Button title="Got it" onPress={() => setShowLeaveHelp(false)} fullWidth style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </Modal>

      {/* Event-day info upload bottom sheet */}
      <FormSheet
        visible={uploadVisible}
        title="Upload Event Info"
        icon={Upload}
        onClose={() => setUploadVisible(false)}
      >
        {uploadTarget ? (
          <View
            style={[
              styles.uploadEventHeader,
              { backgroundColor: colors.brandSoft, borderRadius: radii.md },
            ]}
          >
            <Text style={[typography.bodyBold, { color: colors.brandStrong }]}>
              {uploadTarget.eventTitle || 'Outreach'}
            </Text>
            <Text style={[typography.small, { color: colors.brandStrong }]}>
              {formatDate(uploadTarget.startDate)} - {formatDate(uploadTarget.endDate)}
            </Text>
          </View>
        ) : null}

        <Text
          style={[
            typography.small,
            { color: colors.textMuted, marginTop: spacing.md },
          ]}
        >
          Add photos and a short report describing what happened at the event.
        </Text>

        <View style={[styles.uploadActions, { marginTop: spacing.md }]}>
          <Button
            title="Take photo"
            onPress={() => addReportPhoto(true)}
            icon={Camera}
            variant="secondary"
            size="sm"
            style={styles.uploadActionBtn}
            accessibilityLabel="Take a photo of the event"
          />
          <Button
            title="Add photo / scan"
            onPress={() => addReportPhoto(false)}
            icon={Images}
            variant="secondary"
            size="sm"
            style={styles.uploadActionBtn}
            accessibilityLabel="Choose a photo or document scan from gallery"
          />
        </View>

        {reportPhotos.length > 0 ? (
          <View style={styles.thumbGrid}>
            {reportPhotos.map((p, i) => (
              <View key={i} style={styles.thumbWrap}>
                <Image
                  source={{ uri: p.image }}
                  style={[styles.uploadThumb, { borderRadius: radii.md }]}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => removeReportPhoto(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[
                    styles.thumbRemove,
                    { backgroundColor: colors.danger, borderRadius: radii.pill },
                  ]}
                >
                  <Trash2 size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: spacing.md }}>
          <Input
            label="Event report"
            icon={NotebookPen}
            placeholder="What happened at the event? Key details, outcomes, etc."
            value={reportNotes}
            onChangeText={setReportNotes}
            multiline
            numberOfLines={4}
            inputStyle={styles.textArea}
          />
        </View>

        <View
          style={[
            styles.warningBanner,
            { backgroundColor: colors.infoSoft, borderRadius: radii.sm },
          ]}
        >
          <Paperclip size={16} color={colors.info} />
          <Text style={[typography.small, styles.flexText, { color: colors.text }]}>
            To attach a PDF or file, photograph or screenshot it and add it as a photo.
          </Text>
        </View>

        <Button
          title="Submit Event Info"
          onPress={submitReport}
          icon={Send}
          loading={uploadSubmitting}
          fullWidth
          style={{ marginTop: spacing.md }}
          accessibilityLabel="Submit event information"
        />
      </FormSheet>

      {/* Live location share bottom sheet */}
      <FormSheet
        visible={shareModalVisible}
        title="Share Live Location"
        icon={Navigation}
        onClose={() => setShareModalVisible(false)}
      >
        <Text
          style={[
            typography.bodyBold,
            { color: colors.text, marginBottom: spacing.sm },
          ]}
        >
          How long to share?
        </Text>
        <View style={styles.durationRow}>
          {[30, 60, 120, 240, 480].map((minutes) => {
            const selected = shareDurationMinutes === minutes;
            const durationLabel = minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
            return (
              <Pressable
                key={minutes}
                onPress={() => setShareDurationMinutes(minutes)}
                accessibilityRole="button"
                accessibilityLabel={`Share for ${durationLabel}`}
                accessibilityState={{ selected }}
                hitSlop={{ top: 8, bottom: 8 }}
                style={[
                  styles.durationChip,
                  {
                    borderColor: selected ? colors.brand : colors.border,
                    backgroundColor: selected ? colors.brandSoft : colors.surfaceAlt,
                    borderRadius: radii.pill,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.bodyBold,
                    { color: selected ? colors.brandStrong : colors.textMuted },
                  ]}
                >
                  {durationLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Input
          label="Where are you going? *"
          icon={MapPin}
          placeholder="e.g., Client office, Field visit"
          value={shareDestination}
          onChangeText={setShareDestination}
        />
        <Input
          label="Reason *"
          icon={FileText}
          placeholder="e.g., Meeting, Delivery, Support"
          value={shareReason}
          onChangeText={setShareReason}
        />
        <Input
          label="Notes (optional)"
          icon={NotebookPen}
          placeholder="Any extra details"
          value={shareNotes}
          onChangeText={setShareNotes}
          multiline
          numberOfLines={3}
          inputStyle={styles.textAreaSmall}
        />

        <View
          style={[
            styles.warningBanner,
            { backgroundColor: colors.warningSoft, borderRadius: radii.sm },
          ]}
        >
          <TriangleAlert size={16} color={colors.warning} />
          <Text
            style={[typography.small, styles.flexText, { color: colors.text }]}
          >
            Don't close the app while sharing live location.
          </Text>
        </View>

        <Button
          title="Start Sharing"
          onPress={handleStartShare}
          icon={Share2}
          loading={shareSubmitting}
          fullWidth
          style={{ marginTop: spacing.lg }}
          accessibilityLabel="Start sharing live location"
        />
      </FormSheet>

      {/* Stop sharing confirmation (destructive) */}
      <ConfirmSheet
        visible={confirmStopVisible}
        title="Stop sharing live location?"
        message="Admin will no longer be able to see your live location."
        confirmLabel="Stop Sharing"
        cancelLabel="Keep Sharing"
        destructive
        loading={shareSubmitting}
        icon={CircleStop}
        onConfirm={confirmStopShare}
        onCancel={() => setConfirmStopVisible(false)}
      />
    </>
  );
};

const sheetStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: SHEET_MAX_HEIGHT,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/* Leave document upload group — thumbnails (remove) + Gallery / Camera buttons. */
const LeaveDocGroup: React.FC<{
  icon: any; label: string; files: any[];
  onGallery: () => void; onCamera: () => void; onRemove: (i: number) => void;
  theme: any; disabled: boolean;
}> = ({ icon: Icon, label, files, onGallery, onCamera, onRemove, theme, disabled }) => {
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
                <Pressable onPress={() => onRemove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[styles.docRemove, { backgroundColor: colors.danger }]}>
                  <X size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <View style={styles.docBtnRow}>
        <Pressable onPress={onGallery} disabled={disabled} style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, opacity: disabled ? 0.6 : 1 }]}>
          <ImagePlus size={16} color={colors.brand} />
          <Text style={[typography.small, { color: colors.text }]}>Gallery</Text>
        </Pressable>
        <Pressable onPress={onCamera} disabled={disabled} style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, opacity: disabled ? 0.6 : 1 }]}>
          <Camera size={16} color={colors.brand} />
          <Text style={[typography.small, { color: colors.text }]}>Camera</Text>
        </Pressable>
      </View>
    </View>
  );
};

const HelpSection: React.FC<{ icon: any; title: string; color: string; theme: any; children: React.ReactNode }> = ({ icon: Icon, title, color, theme, children }) => {
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

const styles = StyleSheet.create({
  leaveInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 13 },
  typeDot: { width: 9, height: 9, borderRadius: 5 },
  typeBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  segRow: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderWidth: 1.5, minHeight: 44 },
  emergencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, gap: 10, marginTop: 4 },
  emergencyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  emergencyIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  docCount: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  docThumbWrap: { position: 'relative' },
  docThumb: { width: 62, height: 62, borderRadius: 10, borderWidth: 1 },
  docRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docBtnRow: { flexDirection: 'row', gap: 8 },
  docBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, minHeight: 44 },
  helpRoot: { flex: 1, justifyContent: 'flex-end' },
  helpSheet: { maxHeight: '88%', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 22 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center' },
  helpTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 8 },
  helpTitleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  helpClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  helpSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  helpSectionIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  helpStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  helpStepNum: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  helpStepNumTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  helpLineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  helpBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flexText: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  activeItem: {
    padding: 12,
    borderLeftWidth: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  delegateSelect: {
    minHeight: 54,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  delegateMenu: {
    borderWidth: 1,
    padding: 6,
    marginTop: 6,
    gap: 4,
  },
  delegateOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  delegateSummary: {
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  dateBox: {
    flex: 1,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    minHeight: 48,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  durationChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  reportSummary: {
    padding: 12,
  },
  reportThumb: {
    width: 64,
    height: 64,
    marginRight: 8,
    backgroundColor: '#E2E8F0',
  },
  uploadEventHeader: {
    padding: 12,
    marginTop: 4,
  },
  uploadActions: {
    flexDirection: 'row',
    gap: 12,
  },
  uploadActionBtn: {
    flex: 1,
  },
  thumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  thumbWrap: {
    position: 'relative',
  },
  uploadThumb: {
    width: 84,
    height: 84,
    backgroundColor: '#E2E8F0',
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RequestScreen;
