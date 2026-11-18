import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Tent,
  CalendarDays,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Camera,
  Users,
  Route,
  FileText,
  ShieldCheck,
  PlayCircle,
  CalendarRange,
  List,
  ChevronDown,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { EmptyState } from '../components/ui';
import OutreachDetailModal from '../components/OutreachDetailModal';
import OutreachDayModal from '../components/OutreachDayModal';
import ScrollReveal from '../components/ScrollReveal';
import MonthCalendar from '../components/MonthCalendar';
import { useAuth } from '../contexts/AuthContext';
import { downloadCsv } from '../lib/csvExport';

// ─────────────────────────────────────────────────────────────────────────────

// Compact palettes for the calendar view (literal classes — Tailwind-safe).
const OUT_STATUS_CAL = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  no_response: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  no_response_reviewed: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const OUT_STATUS_DOT = {
  pending: 'bg-amber-500',
  in_progress: 'bg-sky-500',
  completed: 'bg-emerald-500',
  rejected: 'bg-rose-500',
  no_response: 'bg-slate-500',
  no_response_reviewed: 'bg-slate-400',
};

const STATUS_META = {
  pending: {
    label: 'Pending approval',
    icon: Clock,
    badge: 'bg-warning-50 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400 border border-warning-100 dark:border-warning-900/30',
  },
  in_progress: {
    label: 'In progress',
    icon: PlayCircle,
    badge: 'bg-info-50 text-info-700 dark:bg-info-900/40 dark:text-info-300 border border-info-100 dark:border-info-900/30',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    badge: 'bg-success-50 text-success-700 dark:bg-success-900/40 dark:text-success-400 border border-success-100 dark:border-success-900/30',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    badge: 'bg-danger-50 text-danger-700 dark:bg-danger-900/40 dark:text-danger-400 border border-danger-100 dark:border-danger-900/30',
  },
  no_response: {
    label: 'No response',
    icon: AlertTriangle,
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  },
  no_response_reviewed: {
    label: 'No response reviewed',
    icon: Eye,
    badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
  },
};

const getInitials = (name) =>
  (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Map a backend OutreachActivity (lead populated) to the page's shape.
const mapActivity = (a) => ({
  id: a._id,
  title: a.title,
  type: a.type || 'Health Camp',
  lead: (a.lead && a.lead.fullName) || '—',
  department: (a.lead && a.lead.department) || '',
  date: a.date,
  location: a.location,
  status: a.status || 'pending',
  gpsPoints: a.gpsPoints || 0,
  photos: a.photoCount || 0,
  participants: a.participants || 0,
  hash: a.evidenceHash ? `${String(a.evidenceHash).slice(0, 4)}…${String(a.evidenceHash).slice(-4)}` : null,
  // Real fields captured from the app — used by the detail modal so it shows
  // only what was actually filled, not fabricated evidence.
  purpose: a.purpose || '',
  description: a.description || '',
  photoList: Array.isArray(a.photos) ? a.photos : [],
  evidenceHashFull: a.evidenceHash || null,
  createdAt: a.createdAt || null,
  noResponseAt: a.noResponseAt || null,
  noResponseReason: a.noResponseReason || '',
});

const todayYmd = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

function OutreachSelect({ value, options, onChange, placeholder = 'Select', className = '' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => String(option.value) === String(value));

  return (
    <div className={`relative min-w-0 ${open ? 'z-[120]' : 'z-0'} ${className}`}  onBlur={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[2.65rem] w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-emerald-300 bg-white px-3 py-2 text-left text-sm font-bold text-slate-800 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[999] mt-1 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-elevation-3 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-elevation-3-dark"
          data-lenis-prevent
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full min-w-0 px-3.5 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-800 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-slate-800'
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
export default function OutreachActivities() {
  const { userType, viewAsOrg } = useAuth();
  const readOnly = userType === 'superadmin' && !!viewAsOrg;

  const [activities, setActivities] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [dayPicker, setDayPicker] = useState(null); // { dateKey, items } when a day has multiple activities
  const [viewMode, setViewMode] = useState('calendar'); // 'list' | 'calendar'
  const [calMonth, setCalMonth] = useState(new Date());

  // Live outreach activities from the backend (Module 5).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get('/api/outreach');
        if (!alive) return;
        const list = (res.data?.activities || []).map(mapActivity);
        setActivities(list);
      } catch (err) {
        console.error('Failed to load outreach activities:', err);
        if (alive) setActivities([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const today = todayYmd();
  const pending = activities.filter((a) => a.status === 'pending' && a.date >= today);
  const noResponse = activities.filter((a) => a.status === 'no_response');

  const rows = useMemo(
    () =>
      activities.filter((a) => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          a.title.toLowerCase().includes(q) ||
          a.lead.toLowerCase().includes(q) ||
          a.location.toLowerCase().includes(q)
        );
      }),
    [activities, query, statusFilter]
  );

  const stats = useMemo(() => {
    const completed = activities.filter((a) => a.status === 'completed');
    return {
      total: activities.length,
      pending: pending.length,
      noResponse: noResponse.length,
      participants: activities.reduce((sum, a) => sum + a.participants, 0),
      photos: activities.reduce((sum, a) => sum + a.photos, 0),
      completed: completed.length,
    };
  }, [activities, pending.length, noResponse.length]);

  const calendarRows = useMemo(
    () => rows.filter((a) => ['in_progress', 'completed'].includes(a.status) || (a.status === 'pending' && a.date >= today)),
    [rows, today]
  );

  const setStatus = async (id, status) => {
    const prev = activities;
    // Optimistic update
    setActivities((cur) => cur.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      const res = await axios.put(`/api/outreach/${id}/status`, { status });
      if (res.data?.activity) {
        const updated = mapActivity(res.data.activity);
        setActivities((cur) => cur.map((a) => (a.id === id ? updated : a)));
        setSelectedActivity((cur) => (cur?.id === id ? updated : cur));
      }
      toast.success(
        status === 'in_progress'
          ? 'Activity approved - faculty can now start'
          : status === 'pending'
            ? 'Activity reopened for approval'
            : status === 'no_response_reviewed'
              ? 'No response marked reviewed'
              : 'Activity rejected'
      );
    } catch (err) {
      console.error('Failed to update outreach status:', err);
      toast.error('Could not update activity — please retry');
      setActivities(prev); // revert
    }
  };

  const markReviewed = (id) => setStatus(id, 'no_response_reviewed');

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <ScrollReveal y={28} duration={800} blur={8} className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-750/10 sm:h-11 sm:w-11">
            <Tent className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0"><div className="kicker-label text-emerald-700 dark:text-emerald-400 mb-0.5">
              COMMUNITY ENGAGEMENT DECK
            </div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
                style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
              Outreach Activities
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
              Health camps &amp; community activities with GPS trails, geo-tagged photos and evidence reports.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Bento Deck */}
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-6">
        {/* Total activities */}
        <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-1 sm:rounded-3xl sm:p-5"
             style={{
               background: "linear-gradient(180deg, var(--glass-bg), var(--glass-soft-bg))",
               backdropFilter: "blur(20px)",
               border: "1px solid var(--glass-border)",
               boxShadow: "0 20px 48px -28px rgba(10,20,36,0.12)",
             }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#6366f1" }} />
          <div className="mb-4 flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 break-words text-[10px] font-extrabold uppercase leading-tight tracking-widest text-slate-400 dark:text-slate-500">Activities</span>
            <span className="text-indigo-500"><Tent className="h-4.5 w-4.5" /></span>
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 sm:text-3xl">{stats.total}</h3>
        </div>

        {/* Pending approvals */}
        <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-1 sm:rounded-3xl sm:p-5"
             style={{
               background: "linear-gradient(180deg, var(--glass-bg), var(--glass-soft-bg))",
               backdropFilter: "blur(20px)",
               border: "1px solid var(--glass-border)",
               boxShadow: "0 20px 48px -28px rgba(10,20,36,0.12)",
             }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#f59e0b" }} />
          <div className="mb-4 flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 break-words text-[10px] font-extrabold uppercase leading-tight tracking-widest text-slate-400 dark:text-slate-500">Awaiting Admin</span>
            <span className="text-amber-500"><Clock className="h-4.5 w-4.5" /></span>
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 sm:text-3xl">{stats.pending}</h3>
        </div>

        {/* Completed */}
        <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-1 sm:rounded-3xl sm:p-5"
             style={{
               background: "linear-gradient(180deg, var(--glass-bg), var(--glass-soft-bg))",
               backdropFilter: "blur(20px)",
               border: "1px solid var(--glass-border)",
               boxShadow: "0 20px 48px -28px rgba(10,20,36,0.12)",
             }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#4A74F0" }} />
          <div className="mb-4 flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 break-words text-[10px] font-extrabold uppercase leading-tight tracking-widest text-slate-400 dark:text-slate-500">Completed</span>
            <span className="text-emerald-500"><CheckCircle2 className="h-4.5 w-4.5" /></span>
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 sm:text-3xl">{stats.completed}</h3>
        </div>

        {/* No response */}
        <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-1 sm:rounded-3xl sm:p-5"
             style={{
               background: "linear-gradient(180deg, var(--glass-bg), var(--glass-soft-bg))",
               backdropFilter: "blur(20px)",
               border: "1px solid var(--glass-border)",
               boxShadow: "0 20px 48px -28px rgba(10,20,36,0.12)",
             }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#64748b" }} />
          <div className="mb-4 flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 break-words text-[10px] font-extrabold uppercase leading-tight tracking-widest text-slate-400 dark:text-slate-500">No Response</span>
            <span className="text-slate-500"><AlertTriangle className="h-4.5 w-4.5" /></span>
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 sm:text-3xl">{stats.noResponse}</h3>
        </div>

        {/* Participants reached */}
        <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-1 sm:rounded-3xl sm:p-5"
             style={{
               background: "linear-gradient(180deg, var(--glass-bg), var(--glass-soft-bg))",
               backdropFilter: "blur(20px)",
               border: "1px solid var(--glass-border)",
               boxShadow: "0 20px 48px -28px rgba(10,20,36,0.12)",
             }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#6F8DF0" }} />
          <div className="mb-4 flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 break-words text-[10px] font-extrabold uppercase leading-tight tracking-widest text-slate-400 dark:text-slate-500">Participants</span>
            <span className="text-cyan-500"><Users className="h-4.5 w-4.5" /></span>
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 sm:text-3xl">{stats.participants}</h3>
        </div>

        {/* Geo-tagged photos */}
        <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-1 sm:rounded-3xl sm:p-5"
             style={{
               background: "linear-gradient(180deg, var(--glass-bg), var(--glass-soft-bg))",
               backdropFilter: "blur(20px)",
               border: "1px solid var(--glass-border)",
               boxShadow: "0 20px 48px -28px rgba(10,20,36,0.12)",
             }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#a855f7" }} />
          <div className="mb-4 flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 break-words text-[10px] font-extrabold uppercase leading-tight tracking-widest text-slate-400 dark:text-slate-500">Evidence Photos</span>
            <span className="text-purple-500"><Camera className="h-4.5 w-4.5" /></span>
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 sm:text-3xl">{stats.photos}</h3>
        </div>
      </div>

      {/* Approval queue card */}
      {pending.length > 0 && (
        <div className="glass relative space-y-4 overflow-hidden p-4 sm:p-5"
             style={{ borderLeft: '4px solid #f59e0b' }}>
          <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <Clock className="h-4 w-4 text-amber-500 animate-pulse" aria-hidden="true" />
            Awaiting Admin Approval Queue ({pending.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 sm:gap-4">
            {pending.map((a) => (
              <div
                key={a.id}
                className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200/50 bg-slate-50/40 p-3 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/20 dark:hover:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between sm:p-4"
              >
                <div className="min-w-0"><div className="break-words font-semibold text-slate-800 dark:text-slate-100">{a.title}</div>
                  <div className="mt-1.5 break-words text-xs font-medium text-slate-450 dark:text-slate-500">
                    <span className="font-bold text-slate-600 dark:text-slate-350">{a.lead}</span> · {a.department} · {fmtDate(a.date)}
                  </div>
                  <div className="mt-1 flex min-w-0 items-start gap-1 text-xs font-medium text-slate-450 dark:text-slate-500">
                    <MapPin className="inline h-3.5 w-3.5 text-slate-400 dark:text-slate-600" aria-hidden="true" /> {a.location}
                  </div>
                </div>
                <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-auto">
                  <button
                    onClick={() => setStatus(a.id, 'in_progress')}
                    disabled={readOnly}
                    title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                    className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl text-white bg-emerald-700 shadow-sm shadow-emerald-600/10 transition-all duration-150 ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-800'}`}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setStatus(a.id, 'rejected')}
                    disabled={readOnly}
                    title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                    className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl text-white bg-rose-600 shadow-sm shadow-rose-650/10 transition-all duration-150 ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-700'}`}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No response queue card */}
      {noResponse.length > 0 && (
        <div className="glass relative space-y-4 overflow-hidden p-4 sm:p-5"
             style={{ borderLeft: '4px solid #64748b' }}>
          <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <AlertTriangle className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Not Responded / No Response Queue ({noResponse.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 sm:gap-4">
            {noResponse.map((a) => (
              <div
                key={a.id}
                className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/50 p-3 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/20 dark:hover:bg-slate-900/40 sm:p-4"
              >
                <div className="min-w-0">
                  <div className="break-words font-semibold text-slate-800 dark:text-slate-100">{a.title}</div>
                  <div className="mt-1.5 break-words text-xs font-medium text-slate-450 dark:text-slate-500">
                    <span className="font-bold text-slate-600 dark:text-slate-350">{a.lead}</span> · {a.department} · {fmtDate(a.date)}
                  </div>
                  <div className="mt-1 flex min-w-0 items-start gap-1 text-xs font-medium text-slate-450 dark:text-slate-500">
                    <MapPin className="mt-0.5 inline h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-600" aria-hidden="true" />
                    <span className="min-w-0 break-words">{a.location}</span>
                  </div>
                  <div className="mt-2 rounded-xl border border-slate-200/70 bg-white/70 p-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
                    {a.noResponseReason || 'HOD did not respond before scheduled activity date'}
                  </div>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 min-[460px]:grid-cols-2">
                  <button
                    onClick={() => setSelectedActivity(a)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Eye className="h-3.5 w-3.5" /> Details
                  </button>
                  <button
                    onClick={() => markReviewed(a.id)}
                    disabled={readOnly}
                    title={readOnly ? "Editing is disabled in Read-Only Mode." : undefined}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all ${readOnly ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-800'}`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Reviewed
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Control / Query Bar */}
      <ScrollReveal delay={100} y={16} blur={0} className="relative z-30 flex min-w-0 flex-col items-stretch justify-between gap-3 overflow-visible rounded-2xl border border-slate-200/50 bg-white/80 p-3 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:gap-4 sm:rounded-3xl sm:p-4">
        <div className="flex min-w-0 flex-col gap-3 min-[520px]:flex-row min-[520px]:items-center">
          <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider whitespace-nowrap">
            Filter Status
          </span>
          <OutreachSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All Statuses' },
              ...Object.entries(STATUS_META).map(([key, meta]) => ({ value: key, label: meta.label })),
            ]}
            className="w-full min-[520px]:w-56"
            placeholder="All Statuses"
          />

          <div className="flex w-full items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 min-[520px]:w-auto">
            <button
              onClick={() => setViewMode('calendar')}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all min-[520px]:flex-none ${
                viewMode === 'calendar'
                  ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <CalendarRange className="h-3.5 w-3.5" /> Calendar
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all min-[520px]:flex-none ${
                viewMode === 'list'
                  ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </div>

        <div className="relative w-full sm:w-auto">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-550"
            aria-hidden="true"
          />
          <input
            placeholder="Search activity, lead or location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="block w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs font-semibold text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-emerald-600 sm:w-64"
          />
        </div>
      </ScrollReveal>

      {/* Activities — calendar view */}
      {viewMode === 'calendar' && (
        <MonthCalendar
          month={calMonth}
          onMonthChange={setCalMonth}
          events={calendarRows}
          getDate={(a) => a.date}
          onDayClick={(dateKey, items) => {
            if (items.length === 1) setSelectedActivity(items[0]);
            else if (items.length > 1) setDayPicker({ dateKey, items });
          }}
          renderDay={({ items }) => (
            <>
              {/* Desktop View */}
              <div className="hidden md:block space-y-1">
                {items.slice(0, 2).map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold truncate ${
                      OUT_STATUS_CAL[a.status] || OUT_STATUS_CAL.pending
                    }`}
                    title={`${a.title} · ${STATUS_META[a.status]?.label || ''}`}
                  >
                    {a.title}
                  </div>
                ))}
                {items.length > 2 && (
                  <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 pl-1">
                    +{items.length - 2} more
                  </div>
                )}
              </div>

              {/* Mobile View */}
              <div className="block md:hidden mt-1 w-full">
                <div className="flex flex-wrap gap-0.5 justify-center items-center">
                  {items.slice(0, 4).map((a) => (
                    <span
                      key={a.id}
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${OUT_STATUS_DOT[a.status] || OUT_STATUS_DOT.pending}`}
                      title={`${a.title} · ${STATUS_META[a.status]?.label || ''}`}
                    />
                  ))}
                  {items.length > 4 && (
                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 leading-none ml-0.5">
                      +{items.length - 4}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
          legend={
            <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-semibold">
              {['pending', 'in_progress', 'completed'].map((key) => {
                const meta = STATUS_META[key];
                return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${OUT_STATUS_DOT[key]}`} />
                  {meta.label}
                </span>
                );
              })}
              <span className="text-slate-400 dark:text-slate-500 ml-2">
                Click an activity to open its evidence report
              </span>
            </div>
          }
        />
      )}

      {/* Activities Ledger Table */}
      {viewMode === 'list' && (
      <div className="glass overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Tent}
              title="No outreach activities"
              message="No activities match the current filters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max table-auto">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800">
                  <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Activity</th>
                  <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Lead</th>
                  <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Date</th>
                  <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Evidence</th>
                  <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Participants</th>
                  <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Status</th>
                  <th className="p-4 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                {rows.map((a) => {
                  const meta = STATUS_META[a.status];
                  const hasEvidence = a.gpsPoints > 0 || a.photos > 0;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedActivity(a)}
                      className="cursor-pointer transition-colors hover:bg-slate-55/65 dark:hover:bg-slate-800/25"
                    >
                      <td className="p-4 align-middle">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {a.title}
                        </div>
                        <div className="text-[10px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-wider mt-1 flex items-center gap-1.5">
                          <span>{a.type}</span> · <MapPin className="inline h-3.5 w-3.5 text-slate-400 dark:text-slate-600" aria-hidden="true" /> {a.location}
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex min-w-0 items-start gap-3 sm:items-center">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-semibold text-white shadow-sm shadow-teal-500/10">
                            {getInitials(a.lead)}
                          </div>
                          <div>
                            <div className="text-slate-800 dark:text-slate-200 font-semibold text-xs">{a.lead}</div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider mt-0.5">{a.department}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 align-middle text-slate-650 dark:text-slate-350 font-semibold text-xs">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                          {fmtDate(a.date)}
                        </span>
                      </td>
                      <td className="p-4 align-middle">
                        {hasEvidence ? (
                          <div className="flex items-center gap-3 text-xs">
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30"
                              title="GPS trail points captured live during the activity"
                            >
                              <Route className="h-3.5 w-3.5" aria-hidden="true" />
                              {a.gpsPoints}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30"
                              title="Geo-tagged, timestamped photos (AI tamper-checked)"
                            >
                              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                              {a.photos}
                            </span>
                            {a.hash && (
                              <span
                                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-450"
                                title="SHA-256 of the evidence bundle"
                              >
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                                {a.hash}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-4 align-middle text-slate-650 dark:text-slate-350 text-xs font-semibold">
                        {a.participants ? `${a.participants} reached` : '—'}
                      </td>
                      <td className="p-4 align-middle">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${meta.badge}`}
                        >
                          <meta.icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-4 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                        {a.status === 'completed' ? (
                          <button
                            onClick={() => {
                              downloadCsv(
                                `outreach_${(a.title || 'activity').toLowerCase().replace(/\s+/g, '-')}.csv`,
                                [a],
                                [
                                  { label: 'Title', get: (r) => r.title },
                                  { label: 'Type', get: (r) => r.type },
                                  { label: 'Lead', get: (r) => r.lead },
                                  { label: 'Department', get: (r) => r.department },
                                  { label: 'Date', get: (r) => r.date },
                                  { label: 'Location', get: (r) => r.location },
                                  { label: 'Participants Reached', get: (r) => r.participants },
                                  { label: 'Photos', get: (r) => r.photos },
                                  { label: 'GPS Points', get: (r) => r.gpsPoints },
                                  { label: 'Status', get: (r) => r.status },
                                ]
                              );
                              toast.success(`Evidence report for "${a.title}" downloaded`);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-emerald-350 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60 transition-all"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Report
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Day picker — shown when a calendar day holds multiple activities */}
      <OutreachDayModal
        open={!!dayPicker}
        onClose={() => setDayPicker(null)}
        dateKey={dayPicker?.dateKey}
        items={dayPicker?.items || []}
        onSelect={(a) => {
          setDayPicker(null);
          setSelectedActivity(a);
        }}
      />

      {/* Detail modal */}
      <OutreachDetailModal
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        activity={selectedActivity}
        readOnly={readOnly}
        onMarkReviewed={(activity) => markReviewed(activity.id)}
      />
    </ScrollReveal>
  );
}
