import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  Trash2,
  BookOpen,
  FlaskConical,
  Stethoscope,
  Landmark,
  Users,
  Clock,
  Camera,
  CheckCircle2,
  XCircle,
  MapPin,
  Coffee,
  CalendarSearch,
  Sun,
  PartyPopper,
  Bell,
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, StatCard } from '../components/ui';
import ClassEvidenceModal, { buildEvidence } from '../components/ClassEvidenceModal';
import TimetableAnalytics from '../components/TimetableAnalytics';
import DayScheduleModal from '../components/DayScheduleModal';
import { fetchWeekLog, fetchEvidence, ymd } from '../lib/teachingLog';
import { portalAPI } from '../services/api';

// Mon–Sat carry classes; Sunday is a holiday column. Day starts 9 AM; 1 PM lunch.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [...DAYS, 'Sun'];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const LUNCH_HOUR = 13;

const TYPE_META = {
  lecture: {
    label: 'Lecture',
    icon: BookOpen,
    block:
      'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
    badge: 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300',
    tint: 'text-primary-700 dark:text-primary-300',
  },
  practical: {
    label: 'Practical',
    icon: FlaskConical,
    block:
      'border-warning-300 bg-warning-50 text-warning-800 dark:border-warning-700 dark:bg-warning-900/40 dark:text-warning-200',
    badge: 'bg-warning-100 text-warning-700 dark:bg-warning-900/50 dark:text-warning-300',
    tint: 'text-warning-600 dark:text-warning-300',
  },
  clinical: {
    label: 'Clinical',
    icon: Stethoscope,
    block:
      'border-success-300 bg-success-50 text-success-800 dark:border-success-700 dark:bg-success-900/40 dark:text-success-200',
    badge: 'bg-success-100 text-success-700 dark:bg-success-900/50 dark:text-success-300',
    tint: 'text-success-700 dark:text-success-300',
  },
  activity: {
    label: 'Library / SSIP',
    icon: Landmark,
    block:
      'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    tint: 'text-slate-600 dark:text-slate-300',
  },
};

// Block styling for past slots, keyed by evidence status.
const STATUS_BLOCK = {
  conducted:
    'border-success-400 bg-success-50 text-success-800 ring-1 ring-success-300/60 dark:border-success-600 dark:bg-success-900/30 dark:text-success-200 dark:ring-success-700/50',
  missed:
    'border-danger-400 bg-danger-50 text-danger-800 ring-1 ring-danger-300/60 dark:border-danger-600 dark:bg-danger-900/30 dark:text-danger-200 dark:ring-danger-700/50',
};

function mondayOfWeek(offsetWeeks) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function fmtHour(h) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${suffix}`;
}

const distinct = (arr) => [...new Set(arr.filter((v) => v && v !== '—'))].sort();

const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

function TimetableSelect({ value, options, onChange, placeholder = 'Select', disabled = false, className = '', buttonClassName = '' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => String(option.value) === String(value) && !option.disabled);

  return (
    <div className={`relative min-w-0 ${open ? 'z-[120]' : 'z-0'} ${className}`}  onBlur={() => setOpen(false)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-[2.5rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div
          className="absolute left-0 right-0 top-full z-[999] mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-elevation-3 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-elevation-3-dark"
          data-lenis-prevent
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                disabled={option.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full min-w-0 px-3 py-2 text-left text-sm transition ${
                  option.disabled
                    ? 'cursor-not-allowed text-slate-400 dark:text-slate-500'
                    : isSelected
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-800 hover:bg-primary-50 hover:text-primary-700 dark:text-slate-100 dark:hover:bg-slate-800'
                }`}
                role="option"
                aria-selected={isSelected}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
// Compact "camera" badge shown top-right on every class card. Past conducted
// slots get a green tick + hover preview of the uploaded geo-tagged selfie;
// missed slots get a red cross.
function CameraBadge({ ev, conducted, missed, start }) {
  const [errored, setErrored] = useState(false);
  return (
    <span className="group/cam relative ml-auto flex shrink-0 items-center gap-1">
      {conducted && (
        <CheckCircle2 className="h-3.5 w-3.5 text-success-600 dark:text-success-400" aria-label="Conducted" />
      )}
      {missed && <XCircle className="h-3.5 w-3.5 text-danger-500 dark:text-danger-400" aria-label="Missed" />}
      <Camera
        className={`h-4 w-4 ${
          conducted
            ? 'text-success-600 dark:text-success-400'
            : missed
            ? 'text-danger-500 dark:text-danger-400'
            : 'text-slate-400 opacity-70'
        }`}
        aria-hidden="true"
      />
      {conducted && ev && (
        <span className="pointer-events-none absolute right-0 top-6 z-30 hidden w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-elevation-3 group-hover/cam:block dark:border-slate-700 dark:bg-slate-800">
          {errored ? (
            <span className="flex aspect-[3/2] w-full items-center justify-center rounded bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
              <Camera className="h-5 w-5" />
            </span>
          ) : (
            <img
              src={ev.photos[0].uri}
              alt="Uploaded geo-tagged selfie"
              onError={() => setErrored(true)}
              className="aspect-[3/2] w-full rounded object-cover"
            />
          )}
          <span className="mt-1 block text-center text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Geo-tagged selfie · {start}
          </span>
        </span>
      )}
    </span>
  );
}

// Map a backend Timetable entry (faculty populated) to the UI shape.
const mapEntry = (e) => ({
  id: e._id,
  facultyId: e.faculty && e.faculty._id ? e.faculty._id : e.faculty,
  // Prefer the faculty's LIVE name (so renames/reassignments reflect immediately)
  // and only fall back to the denormalised label for unlinked/legacy rows.
  faculty: (e.faculty && e.faculty.fullName) || e.facultyLabel || 'Unknown',
  facultyName: (e.faculty && e.faculty.fullName) || e.facultyLabel || '',
  subject: e.subject,
  type: e.type || 'lecture',
  day: e.day,
  start: e.start,
  end: e.end,
  room: e.room || '',
  academicYear: e.academicYear || '',
});

export default function TimetableManagement() {
  const { role, userType, viewAsOrg } = useAuth();
  const readOnly = userType === 'superadmin' && !!viewAsOrg;
  // Only the institution head (Admin) may switch between batches. HOD & everyone
  // else are locked to the default (latest 2024-* batch).
  const isHoi = role === 'hoi';

  const [classes, setClasses] = useState([]); // live timetable from the DB
  const [facultyList, setFacultyList] = useState([]); // org faculty/staff roster
  const [loading, setLoading] = useState(true);
  const [batchId, setBatchId] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notifying, setNotifying] = useState(false);
  const [form, setForm] = useState(null);
  const [evidenceData, setEvidenceData] = useState(null);
  const [dayView, setDayView] = useState(null);
  const [logMap, setLogMap] = useState({}); // real class-checkin status, by `${ttId}_${ymd}`
  const [absentFacultyIds, setAbsentFacultyIds] = useState([]);
  const todayDayIdx = (new Date().getDay() + 6) % 7;
  const [mobileDayIdx, setMobileDayIdx] = useState(todayDayIdx);

  // Load the institute timetable + faculty roster from the API.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [ttRes, facRes] = await Promise.all([
          axios.get('/api/timetables'),
          axios.get('/api/students', { params: { limit: 1000 } }),
        ]);
        if (!alive) return;
        const mapped = (ttRes.data.entries || []).map(mapEntry);
        setClasses(mapped);
        setFacultyList(
          (facRes.data.students || []).map((s) => ({
            id: s._id,
            name: s.fullName,
            role: s.role || 'faculty',
            department: s.department || '',
            designation: s.designation || '',
          }))
        );
        // Default to the batch the user actually has the MOST classes in. (A
        // naive "includes 2024" match wrongly sent the Engineering HOD — whose
        // batch is 2023-2024 — to the near-empty 2024-2025 batch.)
        const yrCounts = {};
        mapped.forEach((c) => {
          if (c.academicYear) yrCounts[c.academicYear] = (yrCounts[c.academicYear] || 0) + 1;
        });
        const preferred =
          Object.entries(yrCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        setBatchId((b) => b || preferred);
      } catch (err) {
        if (alive) toast.error('Failed to load timetable');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Pull the REAL class-checkin status (conducted/missed/ongoing + geo + selfie)
  // for the visible week so the cards reflect live teaching-log data.
  useEffect(() => {
    if (!classes.length) return undefined;
    const monday = mondayOfWeek(weekOffset);
    const dates = DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
    let alive = true;
    fetchWeekLog(dates, 'org').then((m) => {
      if (alive) setLogMap(m);
    });
    return () => {
      alive = false;
    };
  }, [weekOffset, classes.length]);

  const years = useMemo(
    () => [...new Set(classes.map((c) => c.academicYear).filter(Boolean))].sort().reverse(),
    [classes]
  );
  const batchLabel = batchId ? `Academic Year ${batchId}` : 'All batches';

  const monday = mondayOfWeek(weekOffset);
  const weekDates = ALL_DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const weekLabel = `${weekDates[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekDates[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  // Classify a column date as past / today / future (drives the greying + the
  // "today" highlight — past days are dimmed across every week, not just this one).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayKind = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === startOfToday.getTime()) return 'today';
    return d < startOfToday ? 'past' : 'future';
  };

  // Faculty dropdown = full org roster (employees); subjects/rooms = datalists.
  const facultyOptions = useMemo(
    () => facultyList.filter((f) => ['faculty', 'staff', 'hod'].includes(f.role)),
    [facultyList]
  );
  const subjectOptions = useMemo(() => distinct(classes.map((c) => c.subject)), [classes]);
  const roomOptions = useMemo(() => distinct(classes.map((c) => c.room)), [classes]);

  // Each academic-year batch belongs to exactly one department (e.g. 2024-2025 →
  // Administration). Derive that mapping from the existing timetable (a year's
  // department = the dominant department among its scheduled faculty) so the Admin
  // can only ever assign a class to a faculty member of THAT department.
  const facDeptById = useMemo(
    () => new Map(facultyList.map((f) => [f.id, f.department])),
    [facultyList]
  );
  const yearToDept = useMemo(() => {
    const counts = {};
    for (const c of classes) {
      const dept = facDeptById.get(c.facultyId);
      if (!c.academicYear || !dept) continue;
      counts[c.academicYear] = counts[c.academicYear] || {};
      counts[c.academicYear][dept] = (counts[c.academicYear][dept] || 0) + 1;
    }
    const map = {};
    for (const [yr, byDept] of Object.entries(counts)) {
      map[yr] = Object.entries(byDept).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }
    return map;
  }, [classes, facDeptById]);

  const batchDept = batchId ? yearToDept[batchId] || null : null;

  // Faculty roster scoped to the selected batch's department. Falls back to the
  // full roster when the batch's department can't be resolved yet (empty batch).
  const deptFacultyOptions = useMemo(
    () => (batchDept ? facultyOptions.filter((f) => f.department === batchDept) : facultyOptions),
    [facultyOptions, batchDept]
  );

  // Switching batch (= switching department) invalidates any faculty filter from
  // the previous department, so reset it.
  useEffect(() => {
    setFacultyFilter('all');
  }, [batchId]);

  // Keep scroll gestures inside the assign modal/dropdowns instead of moving the page behind it.
  useEffect(() => {
    if (!modalOpen) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [modalOpen]);

  // Options for the assign/edit modal: the batch's department roster, plus the
  // currently-edited faculty if it happens to sit outside (legacy data), so the
  // dropdown never renders blank on an existing entry.
  const modalFacultyOptions = useMemo(() => {
    if (!editingId || !form?.facultyId || deptFacultyOptions.some((f) => f.id === form.facultyId)) {
      return deptFacultyOptions;
    }
    const extra = facultyOptions.find((f) => f.id === form.facultyId);
    return extra ? [extra, ...deptFacultyOptions] : deptFacultyOptions;
  }, [deptFacultyOptions, facultyOptions, editingId, form]);

  // Fetch absent faculty list when modal is open and the day of class changes
  useEffect(() => {
    if (!modalOpen || !form || !weekDates[form.day]) {
      setAbsentFacultyIds([]);
      return;
    }
    const targetDateStr = ymd(weekDates[form.day]);
    let alive = true;
    (async () => {
      try {
        const res = await axios.get('/api/timetables/absent-faculty', {
          params: { date: targetDateStr }
        });
        if (!alive) return;
        if (res.data?.success) {
          setAbsentFacultyIds(res.data.absentFacultyIds || []);
        }
      } catch (err) {
        console.error('Failed to fetch absent faculty:', err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [modalOpen, form?.day, weekDates]);

  // Filter out absent faculty members unless it is an edit flow for that specific faculty
  const filteredModalFacultyOptions = useMemo(() => {
    return modalFacultyOptions.filter((f) => {
      if (!absentFacultyIds.includes(f.id)) return true;
      if (editingId && f.id === form?.facultyId) return true;
      return false;
    });
  }, [modalFacultyOptions, absentFacultyIds, editingId, form?.facultyId]);

  // If the current selected faculty is absent, auto-select the first available non-absent faculty
  useEffect(() => {
    if (!modalOpen || editingId || !form || !filteredModalFacultyOptions.length) return;
    const currentIsAbsent = absentFacultyIds.includes(form.facultyId);
    const currentIsStillAvailable = filteredModalFacultyOptions.some((f) => f.id === form.facultyId);
    if (currentIsAbsent || !currentIsStillAvailable) {
      setForm((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          facultyId: filteredModalFacultyOptions[0]?.id || '',
        };
      });
    }
  }, [filteredModalFacultyOptions, absentFacultyIds, modalOpen, editingId]);

  const visible = useMemo(
    () =>
      classes.filter(
        (c) =>
          (!batchId || c.academicYear === batchId) &&
          (facultyFilter === 'all' || c.facultyId === facultyFilter)
      ),
    [classes, batchId, facultyFilter]
  );

  const stats = useMemo(() => {
    const lectures = visible.filter((c) => c.type === 'lecture').length;
    const practicals = visible.filter((c) => c.type === 'practical').length;
    const clinical = visible.filter((c) => c.type === 'clinical').length;
    const facultyCount = new Set(visible.map((c) => c.facultyId)).size;
    return { total: visible.length, lectures, practicals, clinical, facultyCount };
  }, [visible]);

  const emptyForm = () => ({
    facultyId: deptFacultyOptions[0]?.id || '',
    subject: subjectOptions[0] || '',
    type: 'lecture',
    day: 0,
    start: '09:00',
    end: '10:00',
    room: roomOptions[0] || '',
  });

  const openCreate = (day, hour) => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      facultyId: facultyFilter !== 'all' ? facultyFilter : deptFacultyOptions[0]?.id || '',
      day: day ?? 0,
      start: hour != null ? `${String(hour).padStart(2, '0')}:00` : '09:00',
      end: hour != null ? `${String(hour + 1).padStart(2, '0')}:00` : '10:00',
    });
    setModalOpen(true);
  };

  const openEdit = (cls) => {
    setEditingId(cls.id);
    setForm({
      facultyId: cls.facultyId,
      subject: cls.subject,
      type: cls.type,
      day: cls.day,
      start: cls.start,
      end: cls.end,
      room: cls.room,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.end <= form.start) {
      toast.error('End time must be after start time');
      return;
    }
    if (!form.facultyId) {
      toast.error('Please select a faculty member');
      return;
    }
    const fac = facultyOptions.find((f) => f.id === form.facultyId);
    // Safety net behind the scoped dropdown: never let a faculty member land on
    // another department's batch.
    if (batchDept && fac?.department && fac.department !== batchDept) {
      toast.error(`This batch is ${batchDept} — pick a ${batchDept} faculty member`);
      return;
    }
    const payload = {
      faculty: form.facultyId,
      subject: form.subject,
      type: form.type,
      day: Number(form.day),
      start: form.start,
      end: form.end,
      room: form.room,
      academicYear: batchId,
      facultyLabel: fac ? fac.name : '',
    };
    try {
      if (editingId) {
        const { data } = await axios.put(`/api/timetables/${editingId}`, payload);
        const updated = mapEntry(data.entry);
        setClasses((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
        toast.success('Class updated');
      } else {
        const { data } = await axios.post('/api/timetables', payload);
        setClasses((prev) => [...prev, mapEntry(data.entry)]);
        toast.success(`Class assigned to ${fac ? fac.name : 'faculty'}`);
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the class');
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`/api/timetables/${editingId}`);
      setClasses((prev) => prev.filter((c) => c.id !== editingId));
      toast.success('Class removed from timetable');
      setModalOpen(false);
    } catch (err) {
      toast.error('Could not remove the class');
    }
  };

  // Push a notification to the faculty teaching the class being edited.
  const handleNotifyClass = async () => {
    if (!editingId || !form) return;
    const defaultMsg = `Reminder: your class "${form.subject}" is scheduled at ${form.start}${form.room ? ` in ${form.room}` : ''}.`;
    const msg = window.prompt("Message to send to this class's faculty:", defaultMsg);
    if (msg == null) return; // cancelled
    if (!msg.trim()) {
      toast.error('Message cannot be empty');
      return;
    }
    setNotifying(true);
    try {
      const res = await portalAPI.sendClassNotification({ timetableId: editingId, body: msg.trim() });
      if (res && res.success) {
        toast.success(res.sent ? `Notification sent to ${res.sent} faculty` : 'No faculty device to notify');
      } else {
        toast.error((res && res.error) || 'Failed to send notification');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to send notification');
    } finally {
      setNotifying(false);
    }
  };

  const classesAt = (day, hour) =>
    visible.filter((c) => c.day === day && parseInt(c.start.slice(0, 2), 10) === hour);

  // A slot is "past" once its end time on the displayed week's date has gone by.
  const isPastInstance = (cls, date) => {
    const end = new Date(date);
    const [hh, mm] = cls.end.split(':').map(Number);
    end.setHours(hh, mm, 0, 0);
    return end < new Date();
  };

  const dateLabelOf = (date) =>
    date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const openEvidence = async (cls, date) => {
    // Prefer the real uploaded evidence; the modal falls back to the
    // deterministic preview when there is no check-in record.
    const real = await fetchEvidence(cls.id, date, 'org');
    setEvidenceData({
      id: cls.id,
      subject: cls.subject,
      faculty: cls.faculty || 'Unknown',
      type: cls.type,
      room: cls.room,
      dateLabel: dateLabelOf(date),
      start: cls.start,
      end: cls.end,
      realEvidence: real,
    });
  };

  // Card status/geo/selfie — REAL class-checkin when available, else a
  // deterministic preview for past slots (so colours stay stable in the demo).
  const cellEvidence = (cls, date) => {
    const real = logMap[`${cls.id}_${ymd(date)}`];
    if (real && real.status && real.status !== 'upcoming') {
      const fmt = (n) => (n == null ? '' : Number(n).toFixed(5));
      return {
        status: real.status === 'missed' ? 'missed' : 'conducted',
        geo: { lat: real.geo ? fmt(real.geo.latitude) : '', lng: real.geo ? fmt(real.geo.longitude) : '' },
        photos: [{ uri: real.selfieUrl || '' }],
        live: true,
      };
    }
    if (isPastInstance(cls, date)) {
      const b = buildEvidence({ id: cls.id, type: cls.type, room: cls.room, dateLabel: dateLabelOf(date), start: cls.start, end: cls.end });
      return { status: b.status === 'missed' ? 'missed' : 'conducted', geo: { lat: b.geo.lat, lng: b.geo.lng }, photos: [{ uri: b.photos[0].uri }], live: false };
    }
    return null;
  };

  // Date picker → open the full schedule for the chosen day, in timetable format.
  const openDayView = async (dateStr) => {
    if (!dateStr) return;
    const date = new Date(`${dateStr}T00:00:00`);
    const dayIdx = (date.getDay() + 6) % 7; // Mon=0 … Sun=6

    // Sync mobile active day index
    setMobileDayIdx(dayIdx);

    // Auto-update week offset to the week containing the chosen date
    const todayMon = mondayOfWeek(0);
    const targetMon = new Date(date);
    targetMon.setDate(date.getDate() - dayIdx);
    targetMon.setHours(0, 0, 0, 0);
    const msDiff = targetMon.getTime() - todayMon.getTime();
    const weeks = Math.round(msDiff / (7 * 24 * 60 * 60 * 1000));
    setWeekOffset(weeks);

    const dayClasses = dayIdx > 5 ? [] : visible.filter((c) => c.day === dayIdx);
    setDayView({
      date,
      dayIdx,
      dateLabel: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
      classes: dayClasses,
      liveRows: null,
    });
    if (dayClasses.length) {
      const map = await fetchWeekLog([date], 'org');
      const byTt = {};
      Object.values(map).forEach((r) => {
        byTt[r.timetableId] = r;
      });
      setDayView((dv) => (dv && dv.date?.getTime() === date.getTime() ? { ...dv, liveRows: byTt } : dv));
    }
  };

  const activeIcon = (cls) => (TYPE_META[cls.type] || TYPE_META.lecture).icon;

  return (
    <div className="min-h-screen min-w-0 space-y-4 overflow-hidden bg-slate-50 p-3 dark:bg-slate-900 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-primary-600 p-2.5 text-white">
            <CalendarDays className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">Academic Timetable</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {batchLabel} · {loading ? 'loading…' : `${classes.length} classes · synced to the faculty portal`}
            </p>
          </div>
        </div>
        <Button 
          icon={Plus} 
          onClick={() => openCreate()}
          disabled={readOnly}
          title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
          className={`w-full sm:w-auto ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Assign Class
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Classes / week" value={stats.total} icon={CalendarDays} />
        <StatCard label="Faculty scheduled" value={stats.facultyCount} icon={Users} />
        <StatCard label="Lectures" value={stats.lectures} icon={BookOpen} />
        <StatCard label="Practicals" value={stats.practicals} icon={FlaskConical} />
        <div className="sm:col-span-2 lg:col-span-1">
          <StatCard label="Clinical teaching" value={stats.clinical} icon={Stethoscope} />
        </div>
      </div>

      {/* Analytics — daily / weekly / monthly / semester (collapsible) */}
      <TimetableAnalytics
        classes={visible}
        academicYear={batchId}
        faculty={facultyFilter !== 'all' ? facultyFilter : undefined}
      />

      {/* Week navigation + filters */}
      <Card className="relative z-30 overflow-visible" bodyClassName="overflow-visible">
        <div className="space-y-3">
          {/* Row 1 — week navigation + jump to a specific day */}
          <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-col gap-2 min-[380px]:flex-row min-[380px]:items-center">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Week</span>
              <div className="inline-flex w-full min-w-0 items-center gap-1 rounded-pill border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800 min-[380px]:w-auto">
                <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week" />
                <span className="min-w-0 flex-1 px-1 text-center text-xs font-bold text-slate-800 dark:text-slate-100 min-[380px]:min-w-[10.5rem] min-[380px]:text-sm">
                  {weekLabel}
                </span>
                <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week" />
                {weekOffset !== 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                    Today
                  </Button>
                )}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2 min-[380px]:flex-row min-[380px]:items-center">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Go to date</span>
              <label className="inline-flex w-full min-w-0 items-center gap-2 rounded-pill border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800 transition focus-within:ring-2 focus-within:ring-primary-500 hover:border-primary-400 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200 min-[380px]:w-auto min-[380px]:py-1.5">
                <CalendarSearch className="h-4 w-4 shrink-0" aria-hidden="true" />
                <input
                  type="date"
                  onChange={(e) => openDayView(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-primary-800 focus:outline-none dark:text-primary-200"
                  aria-label="Open a specific day's timetable"
                />
              </label>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-700/60" />

          {/* Row 2 — batch + faculty filters and the type legend */}
          <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-3">
            {/* HOD is locked to their own batch; Admin can switch between batches. */}
            {isHoi && years.length > 1 && (
              <div className="flex min-w-0 flex-col gap-2 min-[380px]:flex-row min-[380px]:items-center">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Batch</span>
                <TimetableSelect
                  value={batchId}
                  onChange={setBatchId}
                  options={years.map((y) => ({ value: y, label: `Academic Year ${y}` }))}
                  className="w-full sm:w-56"
                  buttonClassName="border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
                  placeholder="Academic year"
                />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-2 min-[380px]:flex-row min-[380px]:items-center">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Faculty</span>
              <TimetableSelect
                value={facultyFilter}
                onChange={setFacultyFilter}
                options={[
                  { value: 'all', label: 'All faculty' },
                  ...deptFacultyOptions.map((f) => ({ value: f.id, label: f.name })),
                ]}
                className="w-full sm:w-56"
                placeholder="All faculty"
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 sm:ml-auto">
              {Object.entries(TYPE_META).map(([key, meta]) => (
                <span key={key} className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-medium ${meta.badge}`}>
                  <meta.icon className="h-3 w-3" aria-hidden="true" />
                  {meta.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Calendar grid */}
      <Card bodyClassName="!p-0 overflow-hidden">
        {/* Mobile Day Pills Bar */}
        <div className="block border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-4 lg:hidden">
          <div className="flex max-w-full snap-x gap-2 overflow-x-auto pb-1 scrollbar-none">
            {ALL_DAYS.map((day, i) => {
              const date = weekDates[i];
              const kind = dayKind(date);
              const isToday = kind === 'today';
              const isSelected = mobileDayIdx === i;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setMobileDayIdx(i)}
                  className={`flex min-w-[3.45rem] snap-center flex-col items-center justify-center rounded-xl border px-3 py-2 transition-all duration-200 cursor-pointer min-[380px]:min-w-[3.75rem] ${
                    isSelected
                      ? 'bg-[#FF6B35] border-[#FF6B35] text-white shadow-sm'
                      : isToday
                      ? 'bg-orange-50 border-orange-200 text-[#FF6B35] dark:bg-[#FF6B35]/10 dark:border-[#FF6B35]/20'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-750'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">{day}</span>
                  <span className="text-sm font-extrabold mt-0.5">{date.getDate()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile vertical timeline list */}
        <div className="block lg:hidden p-4 space-y-4">
          {mobileDayIdx === 6 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-rose-50 to-amber-50 dark:from-rose-950/20 dark:to-amber-955/10 p-8 border border-rose-100 dark:border-rose-900/30 text-center animate-fade-in">
              <Sun className="h-10 w-10 text-amber-400 animate-float" />
              <PartyPopper className="h-5 w-5 text-rose-400 mt-2" />
              <h3 className="text-base font-bold text-rose-700 dark:text-rose-300 mt-3 uppercase tracking-wider">Holiday</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No classes scheduled for Sunday.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {HOURS.map((hour) => {
                if (hour === LUNCH_HOUR) {
                  return (
                    <div key={hour} className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 dark:border-amber-900/30 dark:bg-amber-955/10">
                      <div className="flex items-center gap-3 text-amber-700 dark:text-amber-300">
                        <Coffee className="h-4 w-4" />
                        <div>
                          <div className="text-xs font-extrabold uppercase tracking-wide">Lunch Break</div>
                          <div className="text-[11px] opacity-80 mt-0.5">1:00 PM – 2:00 PM</div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const slotClasses = classesAt(mobileDayIdx, hour);
                const evDate = weekDates[mobileDayIdx];
                const isPastSlot = isPastInstance({ end: `${hour + 1 < 10 ? '0' : ''}${hour + 1}:00` }, evDate);

                return (
                  <div key={hour} className="flex gap-3.5 items-start">
                    {/* Time Label */}
                    <div className="w-14 shrink-0 text-right pt-2">
                      <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{fmtHour(hour)}</span>
                    </div>

                    {/* Card container */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {slotClasses.length > 0 ? (
                        slotClasses.map((cls) => {
                          const meta = TYPE_META[cls.type] || TYPE_META.lecture;
                          const Icon = activeIcon(cls);
                          const ev = cellEvidence(cls, evDate);
                          const missed = ev && ev.status === 'missed';
                          const conducted = ev && ev.status !== 'missed';
                          const block = conducted ? STATUS_BLOCK.conducted : missed ? STATUS_BLOCK.missed : meta.block;
                          const isPast = isPastInstance(cls, evDate);

                          return (
                            <button
                              key={cls.id}
                              type="button"
                              onClick={() => (ev ? openEvidence(cls, evDate) : openEdit(cls))}
                              className={`w-full rounded-xl border p-3.5 text-left shadow-sm transition-all hover:shadow-md ${block} ${
                                isPast ? 'opacity-80 dark:opacity-75 hover:opacity-100' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.badge}`}>
                                  <Icon className="h-2.5 w-2.5" />
                                  {meta.label}
                                </span>
                                <CameraBadge ev={ev} conducted={conducted} missed={missed} start={cls.start} />
                              </div>

                              <h4 className="mt-2 text-sm font-extrabold text-slate-800 dark:text-slate-100 leading-snug">{cls.subject}</h4>
                              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-350 font-semibold">{cls.faculty}</p>

                              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
                                <span className="flex items-center gap-1 font-semibold">
                                  <Clock size={11} /> {cls.start} – {cls.end}
                                </span>
                                <span className="flex items-center gap-1 font-semibold truncate max-w-full">
                                  <MapPin size={11} /> {conducted ? `${ev.geo.lat}, ${ev.geo.lng}` : cls.room || 'No room'}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ) : isPastSlot ? (
                        <div className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-100 bg-slate-50/10 py-3 text-xs font-bold text-slate-300 dark:border-slate-800/40 dark:bg-slate-900/10 min-h-[46px] select-none">
                          No class scheduled
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openCreate(mobileDayIdx, hour)}
                          disabled={readOnly}
                          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 py-3 text-xs font-bold text-slate-400 hover:border-[#FF6B35] hover:text-[#FF6B35] dark:border-slate-800 dark:bg-slate-900/30 dark:hover:bg-slate-800/50 cursor-pointer min-h-[46px] transition-all"
                        >
                          <Plus size={14} /> Assign Slot
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Calendar Grid */}
        <div className="hidden overflow-x-auto overflow-y-visible lg:block">
          <table className="min-w-[64rem] w-full table-fixed border-collapse text-sm xl:min-w-[72rem]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800">
                <th className="w-20 border-b border-r border-slate-200 px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <Clock className="mx-auto h-4 w-4" aria-hidden="true" />
                </th>
                {ALL_DAYS.map((day, i) => {
                  const isSunday = i === 6;
                  const kind = dayKind(weekDates[i]);
                  const isToday = kind === 'today';
                  const isPastDay = kind === 'past' && !isSunday;
                  return (
                    <th
                      key={day}
                      className={`relative border-b border-r border-slate-200 px-2 py-3 text-center last:border-r-0 dark:border-slate-700 ${
                        isToday
                          ? 'bg-gradient-to-b from-primary-500 to-primary-600 shadow-lg shadow-primary-600/20'
                          : isSunday
                          ? 'animate-pulse bg-gradient-to-b from-rose-50 to-amber-50 dark:from-rose-900/30 dark:to-amber-900/20'
                          : isPastDay
                          ? 'bg-slate-50 opacity-70 dark:bg-slate-800/60'
                          : ''
                      }`}
                    >
                      <div
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          isToday
                            ? 'text-white/90'
                            : isSunday
                            ? 'text-rose-600 dark:text-rose-300'
                            : isPastDay
                            ? 'text-slate-400 dark:text-slate-500'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {day}
                      </div>
                      <div
                        className={`text-sm font-bold ${
                          isToday
                            ? 'text-white'
                            : isSunday
                            ? 'text-rose-600 dark:text-rose-300'
                            : isPastDay
                            ? 'text-slate-400 dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {weekDates[i].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </div>
                      {isToday && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-pill bg-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
                          <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-white" /> Today
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hour, rowIdx) => {
                // Lunch break — single animated band across the six teaching days.
                if (hour === LUNCH_HOUR) {
                  return (
                    <tr key={hour}>
                      <td className="border-b border-r border-slate-200 bg-amber-50 px-2 py-2 text-center align-middle text-xs font-bold text-amber-600 dark:border-slate-700 dark:bg-amber-900/20 dark:text-amber-300">
                        {fmtHour(hour)}
                      </td>
                      <td
                        colSpan={DAYS.length}
                        className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 dark:border-slate-700 dark:from-amber-900/30 dark:via-orange-900/30 dark:to-amber-900/30"
                      >
                        <div className="animate-wave absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />
                        <div className="relative z-10 flex items-center justify-center gap-2 py-5 text-sm font-bold tracking-wide text-amber-700 dark:text-amber-300">
                          <Coffee className="h-5 w-5 animate-float" aria-hidden="true" />
                          Lunch Break · 1:00 – 2:00 PM
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={hour}>
                    <td className="border-b border-r border-slate-200 px-2 py-2 text-center align-top text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      {fmtHour(hour)}
                    </td>
                    {DAYS.map((_, dayIdx) => {
                      const slotClasses = classesAt(dayIdx, hour);
                      const kind = dayKind(weekDates[dayIdx]);
                      const isToday = kind === 'today';
                      const isPastDay = kind === 'past';
                      return (
                        <td
                          key={dayIdx}
                          className={`group h-16 border-b border-r p-1 align-top transition-opacity dark:border-slate-700/60 ${
                            isToday
                              ? 'border-primary-200 bg-primary-50/70 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.18)] dark:border-primary-800 dark:bg-primary-900/15'
                              : 'border-slate-100'
                          } ${isPastDay ? 'opacity-55 grayscale-[0.25] hover:opacity-100 hover:grayscale-0' : ''}`}
                        >
                          <div className="space-y-1">
                            {slotClasses.map((cls) => {
                              const meta = TYPE_META[cls.type] || TYPE_META.lecture;
                              const Icon = activeIcon(cls);
                              const ev = cellEvidence(cls, weekDates[dayIdx]);
                              const missed = ev && ev.status === 'missed';
                              const conducted = ev && ev.status !== 'missed';
                              const block = conducted ? STATUS_BLOCK.conducted : missed ? STATUS_BLOCK.missed : meta.block;
                              return (
                                <button
                                  key={cls.id}
                                  onClick={() => (ev ? openEvidence(cls, weekDates[dayIdx]) : openEdit(cls))}
                                  className={`hover-lift w-full rounded-md border px-2 py-1.5 text-left transition-all hover:shadow-elevation-2 dark:hover:shadow-elevation-2-dark ${block}`}
                                  title={`${cls.subject} · ${cls.faculty} · ${cls.room}${ev ? ' — view uploaded photos, note & geolocation' : ''}`}
                                >
                                  {/* Row 1: subject + camera badge (top-right) */}
                                  <div className="flex items-start gap-1 text-xs font-semibold">
                                    <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${meta.tint}`} aria-hidden="true" />
                                    <span className={`min-w-0 flex-1 truncate ${meta.tint}`}>{cls.subject}</span>
                                    <CameraBadge ev={ev} conducted={conducted} missed={missed} start={cls.start} />
                                  </div>
                                  {/* Row 2: faculty */}
                                  <div className="truncate text-[11px] opacity-80">{cls.faculty}</div>
                                  {/* Row 3: time · room */}
                                  <div className="truncate text-[11px] opacity-70">
                                    {cls.start}–{cls.end} · {cls.room}
                                  </div>
                                  {/* Row 4: geo (bottom-left) */}
                                  <div
                                    className={`mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] ${
                                      conducted ? 'text-success-700/90 dark:text-success-300/90' : 'text-slate-400 dark:text-slate-500'
                                    }`}
                                  >
                                    <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                    {conducted ? `${ev.geo.lat}, ${ev.geo.lng}` : cls.room}
                                  </div>
                                </button>
                              );
                            })}
                            <button
                              onClick={() => openCreate(dayIdx, hour)}
                              disabled={readOnly}
                              title={readOnly ? "Editing is disabled in Read-Only Mode." : `Assign class on ${DAYS[dayIdx]} at ${fmtHour(hour)}`}
                              className={`hidden w-full items-center justify-center rounded-md border border-dashed border-slate-300 py-1 text-slate-400 hover:border-primary-400 hover:text-primary-600 group-hover:flex dark:border-slate-600 dark:hover:border-primary-500 dark:hover:text-primary-300 ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
                              aria-label={`Assign class on ${DAYS[dayIdx]} at ${fmtHour(hour)}`}
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    {/* Sunday holiday column — spans the whole grid height, rendered once */}
                    {rowIdx === 0 && (
                      <td
                        rowSpan={HOURS.length}
                        className="relative overflow-hidden border-b border-l border-slate-200 bg-gradient-to-b from-rose-50 via-amber-50 to-rose-50 align-middle dark:border-slate-700 dark:from-rose-900/20 dark:via-amber-900/10 dark:to-rose-900/20"
                      >
                        <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center">
                          <Sun className="h-8 w-8 animate-float text-amber-400" aria-hidden="true" />
                          <PartyPopper className="h-5 w-5 animate-bounce text-rose-400" aria-hidden="true" />
                          <span className="rounded-pill bg-rose-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
                            Holiday
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            No classes scheduled
                          </span>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Evidence viewer for past classes */}
      <ClassEvidenceModal
        open={!!evidenceData}
        onClose={() => setEvidenceData(null)}
        data={evidenceData}
        realEvidence={evidenceData?.realEvidence}
      />

      {/* Single-day timetable (date picker) — same status as the weekly grid */}
      <DayScheduleModal
        open={!!dayView}
        onClose={() => setDayView(null)}
        date={dayView?.date}
        dayIdx={dayView?.dayIdx}
        dateLabel={dayView?.dateLabel}
        classes={dayView?.classes || []}
        liveRows={dayView?.liveRows || null}
        onOpenEvidence={(cls) => {
          if (!dayView) return;
          openEvidence(cls, dayView.date);
          setDayView(null);
        }}
      />

      {/* Assign / edit modal */}
      {modalOpen && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} aria-hidden="true" />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-elevation-3 dark:bg-slate-800 dark:shadow-elevation-3-dark max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? 'Edit class' : 'Assign class'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Faculty
                  {batchDept ? (
                    <span className="ml-1 font-semibold text-primary-600 dark:text-primary-300">
                      · {batchDept}{batchId ? ` (${batchId})` : ''}
                    </span>
                  ) : null}
                </label>
                <TimetableSelect
                  value={form.facultyId}
                  onChange={(value) => setForm({ ...form, facultyId: value })}
                  options={[
                    {
                      value: '',
                      label: batchDept ? `Select ${batchDept} faculty...` : 'Select faculty...',
                      disabled: true,
                    },
                    ...filteredModalFacultyOptions.map((f) => ({
                      value: f.id,
                      label: `${f.name}${f.designation ? ` - ${f.designation}` : ''}${f.department ? `, ${f.department}` : ''}`,
                    })),
                  ]}
                  className="mt-1 w-full"
                  placeholder={batchDept ? `Select ${batchDept} faculty...` : 'Select faculty...'}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Subject</label>
                  <input
                    list="subject-options"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className={inputClass}
                  />
                  <datalist id="subject-options">
                    {subjectOptions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Type</label>
                  <TimetableSelect
                    value={form.type}
                    onChange={(value) => setForm({ ...form, type: value })}
                    options={Object.entries(TYPE_META).map(([key, meta]) => ({ value: key, label: meta.label }))}
                    className="mt-1 w-full"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Day</label>
                  <TimetableSelect
                    value={form.day}
                    onChange={(value) => setForm({ ...form, day: Number(value) })}
                    options={DAYS.map((d, i) => ({ value: i, label: d }))}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Start</label>
                  <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={inputClass} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">End</label>
                  <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={inputClass} required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Room / kind</label>
                <input
                  list="room-options"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  className={inputClass}
                />
                <datalist id="room-options">
                  {roomOptions.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                {editingId ? (
                  <Button 
                    type="button" 
                    variant="danger" 
                    icon={Trash2} 
                    onClick={handleDelete}
                    disabled={readOnly}
                    title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                    className={`w-full sm:w-auto ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    Remove
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {editingId && (
                    <Button
                      type="button"
                      variant="outline"
                      icon={Bell}
                      loading={notifying}
                      onClick={handleNotifyClass}
                    >
                      Notify faculty
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={readOnly}
                    title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                    className={`w-full sm:w-auto ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {editingId ? 'Save changes' : 'Assign class'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
