import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  GraduationCap,
  CalendarDays,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PlayCircle,
  Clock,
  MapPin,
  Camera,
  Timer,
  Download,
  Eye,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, EmptyState, StatCard, SkeletonCard } from '../components/ui';
import TeachingDetailModal from '../components/TeachingDetailModal';
import { fetchEvidence } from '../lib/teachingLog';
import { downloadCsv } from '../lib/csvExport';

// Teaching log rows come live from GET /api/class-checkins/log, which is
// role-scoped on the backend: Admin sees every faculty's classes, a HOD sees only
// their own department's (via deptScopeIds). No client-side scoping needed.

const cap = (value) => {
  if (typeof value !== 'string' || !value) return '';
  return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
};

// Map a backend /api/class-checkins/log row to the table's shape.
const mapRow = (r) => ({
  id: r.timetableId,
  timetableId: r.timetableId,
  faculty: r.faculty,
  department: r.department,
  subject: r.subject,
  type: cap(r.type),
  room: r.room,
  scheduled: `${r.start} – ${r.end}`,
  start: r.start,
  end: r.end,
  actualStart: r.actualStart,
  actualEnd: r.actualEnd,
  durationMin: r.durationMin,
  scheduledMin: r.scheduledMin,
  geoVerified: r.geoVerified,
  selfie: r.selfie,
  selfieUrl: r.selfieUrl || null,
  photoCount: r.photoCount || 0,
  geo: r.geo || null,
  note: r.note || null,
  headcount: r.headcount != null ? r.headcount : null,
  faceVerified: !!r.faceVerified,
  status: r.status,
});

const STATUS_META = {
  conducted: {
    label: 'Conducted',
    icon: CheckCircle2,
    badge: 'bg-success-50 text-success-700 dark:bg-success-900/40 dark:text-success-400',
  },
  ongoing: {
    label: 'Ongoing',
    icon: PlayCircle,
    badge: 'bg-info-50 text-info-700 dark:bg-info-900/40 dark:text-info-300',
  },
  deviation: {
    label: 'Duration deviation',
    icon: AlertTriangle,
    badge: 'bg-warning-50 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400',
  },
  missed: {
    label: 'Missed',
    icon: XCircle,
    badge: 'bg-danger-50 text-danger-700 dark:bg-danger-900/40 dark:text-danger-400',
  },
  // Faculty was on approved leave that day — excused, not missed.
  leave: {
    label: 'On leave',
    icon: CalendarDays,
    badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  },
  upcoming: {
    label: 'Upcoming',
    icon: Timer,
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function TeachingLogSelect({ value, options, onChange, placeholder = 'Select', className = '' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => String(option.value) === String(value));

  return (
    <div className={`relative min-w-0 ${open ? 'z-[120]' : 'z-0'} ${className}`}  onBlur={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[2.65rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
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
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full min-w-0 px-3 py-2 text-left text-sm transition ${
                  isSelected
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
export default function TeachingLog() {
  const [date, setDate] = useState(todayISO());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Live, role-scoped teaching log for the chosen day.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await axios.get('/api/class-checkins/log', { params: { date } });
        if (alive) setAllRows((res.data.rows || []).map(mapRow));
      } catch (err) {
        console.error('Failed to load teaching log:', err);
        if (alive) {
          setAllRows([]);
          toast.error('Failed to load teaching log');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          (r.faculty || '').toLowerCase().includes(q) ||
          (r.subject || '').toLowerCase().includes(q) ||
          (r.department || '').toLowerCase().includes(q)
        );
      }),
    [allRows, query, statusFilter]
  );

  const stats = useMemo(() => {
    const conducted = allRows.filter((r) => r.status === 'conducted').length;
    const ongoing = allRows.filter((r) => r.status === 'ongoing').length;
    const deviation = allRows.filter((r) => r.status === 'deviation').length;
    const missed = allRows.filter((r) => r.status === 'missed').length;
    return { scheduled: allRows.length, conducted, ongoing, deviation, missed };
  }, [allRows]);

  // Open a row's detail modal, fetching its full uploaded evidence (all photos,
  // note, geo) so the modal shows the real check-in rather than a preview.
  const openRow = useCallback(
    async (r) => {
      setSelectedRow(r);
      setSelectedEvidence(null);
      if (['conducted', 'deviation', 'ongoing'].includes(r.status) || r.selfie) {
        const ev = await fetchEvidence(r.timetableId, new Date(`${date}T00:00:00`), 'org');
        // Ignore a stale response if the user has since opened a different row.
        setSelectedRow((cur) => {
          if (cur && cur.timetableId === r.timetableId) setSelectedEvidence(ev);
          return cur;
        });
      }
    },
    [date]
  );

  const handleExport = useCallback(() => {
    if (rows.length === 0) {
      toast.error('No teaching log entries to export');
      return;
    }
    downloadCsv(
      `teaching-log_${date}.csv`,
      rows,
      [
        { label: 'Faculty', get: (r) => r.faculty },
        { label: 'Department', get: (r) => r.department },
        { label: 'Subject', get: (r) => r.subject },
        { label: 'Type', get: (r) => r.type },
        { label: 'Room', get: (r) => r.room },
        { label: 'Scheduled', get: (r) => r.scheduled },
        { label: 'Actual Start', get: (r) => r.actualStart || '' },
        { label: 'Actual End', get: (r) => r.actualEnd || '' },
        { label: 'Status', get: (r) => r.status },
        { label: 'Geo Verified', get: (r) => (r.geoVerified ? 'yes' : 'no') },
        { label: 'Face Verified', get: (r) => (r.faceVerified ? 'yes' : 'no') },
        { label: 'Headcount', get: (r) => r.headcount ?? '' },
      ]
    );
    toast.success('Teaching log exported');
  }, [rows, date]);

  return (
    <div className="min-h-screen min-w-0 space-y-4 overflow-hidden bg-slate-50 p-3 dark:bg-slate-900 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-primary-600 p-2.5 text-white">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
              Teaching Log
            </h1>
            <p className="max-w-[18rem] text-sm text-slate-500 dark:text-slate-400 sm:max-w-none">
              Scheduled vs. actually conducted classes — verified by geo-tagged classroom selfies.
            </p>
          </div>
        </div>
        <Button variant="outline" icon={Download} onClick={handleExport} className="w-full sm:w-auto">
          Export log
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Scheduled today" value={stats.scheduled} icon={CalendarDays} />
        <StatCard label="Conducted" value={stats.conducted} icon={CheckCircle2} />
        <StatCard label="Ongoing" value={stats.ongoing} icon={PlayCircle} />
        <StatCard label="Duration deviations" value={stats.deviation} icon={AlertTriangle} />
        <div className="col-span-1 sm:col-span-2 lg:col-span-1">
          <StatCard label="Missed" value={stats.missed} icon={XCircle} />
        </div>
      </div>

      {/* Filters */}
      <Card className="relative z-30 overflow-visible" bodyClassName="overflow-visible">
        <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
          <div className="min-w-0 w-full sm:w-auto">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Date
            </label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 min-h-[2.65rem] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:w-44"
            />
          </div>
          <div className="min-w-0 w-full sm:w-auto">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Status
            </label>
            <TeachingLogSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All statuses' },
                ...Object.entries(STATUS_META).map(([key, meta]) => ({ value: key, label: meta.label })),
              ]}
              className="mt-1 w-full sm:w-48"
              placeholder="All statuses"
            />
          </div>
          <div className="relative min-w-0 w-full sm:ml-auto sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              placeholder="Search faculty / subject / dept"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-[2.65rem] w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </Card>

      {/* Log table */}
      {loading ? (
        <SkeletonCard />
      ) : (
      <Card bodyClassName="!p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No classes match"
            message={
              allRows.length === 0
                ? 'No classes are scheduled for this day in your scope.'
                : 'Adjust the filters to see the teaching log for this day.'
            }
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Faculty</th>
                    <th className="px-3 py-3">Class</th>
                    <th className="px-3 py-3">Scheduled</th>
                    <th className="px-3 py-3">Actual</th>
                    <th className="px-3 py-3">Duration</th>
                    <th className="px-3 py-3">Evidence</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {rows.map((r) => {
                    const meta = STATUS_META[r.status] || STATUS_META.upcoming;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => openRow(r)}
                        className="cursor-pointer transition-colors hover:bg-teal-50/60 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {r.faculty}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {r.department}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-slate-700 dark:text-slate-200">{r.subject}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {r.type} · {r.room}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                          {r.scheduled}
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                          {r.actualStart ? `${r.actualStart} – ${r.actualEnd || '…'}` : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {r.durationMin != null ? (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium ${
                                Math.abs(r.durationMin - r.scheduledMin) > 15
                                  ? 'text-warning-600 dark:text-warning-400'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <Timer className="h-3 w-3" aria-hidden="true" />
                              {r.durationMin} / {r.scheduledMin} min
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 text-xs ${
                                r.geoVerified
                                  ? 'text-success-600 dark:text-success-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                              {r.geoVerified ? 'Geo' : '—'}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-xs ${
                                r.selfie
                                  ? 'text-success-600 dark:text-success-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                              {r.selfie ? 'Selfie' : '—'}
                            </span>
                            {r.selfie && (
                              <Button
                                size="sm"
                                variant="outline"
                                icon={Eye}
                                onClick={(e) => { e.stopPropagation(); openRow(r); }}
                                title="View uploaded photos, note & geolocation"
                              >
                                View
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
                          >
                            <meta.icon className="h-3 w-3" aria-hidden="true" />
                            <span className="truncate">{meta.label}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="block space-y-3 bg-slate-50/60 p-3 dark:bg-slate-950/20 lg:hidden">
              {rows.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.upcoming;
                return (
                  <div
                    key={r.id}
                    onClick={() => openRow(r)}
                    className="flex min-w-0 cursor-pointer flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition-colors active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70 dark:active:bg-slate-800/60"
                  >
                    {/* Faculty name, department & status badge */}
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-extrabold leading-snug text-slate-800 dark:text-slate-100">{r.faculty}</h3>
                        <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400 dark:text-slate-500">{r.department}</p>
                      </div>
                      <span className={`inline-flex max-w-[8.5rem] shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.badge}`}>
                        <meta.icon className="h-3 w-3" aria-hidden="true" />
                        <span className="truncate">{meta.label}</span>
                      </span>
                    </div>

                    {/* Class details block */}
                    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-slate-100/60 bg-slate-50/80 p-3 dark:border-slate-800/40 dark:bg-slate-950/40">
                      <h4 className="truncate text-xs font-bold text-slate-700 dark:text-slate-300">{r.subject}</h4>
                      <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {r.type} · {r.room || 'No room'}
                      </p>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-[10px] text-slate-600 dark:text-slate-400 min-[380px]:grid-cols-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <Clock size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate">Sch: {r.scheduled}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <PlayCircle size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate">Act: {r.actualStart ? `${r.actualStart}–${r.actualEnd || '…'}` : '—'}</span>
                      </div>
                      {r.durationMin != null ? (
                        <div className={`flex items-center gap-1.5 font-semibold ${
                          Math.abs(r.durationMin - r.scheduledMin) > 15 ? 'text-warning-600 dark:text-warning-400' : ''
                        }`}>
                          <Timer size={12} className="text-slate-400 shrink-0" />
                          <span>Dur: {r.durationMin} / {r.scheduledMin}m</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Timer size={12} className="shrink-0" />
                          <span>Dur: —</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-0.5 font-bold ${
                          r.geoVerified ? 'text-success-600 dark:text-success-400' : 'text-slate-400 dark:text-slate-500'
                        }`}>
                          <MapPin size={11} /> Geo
                        </span>
                        <span className={`inline-flex items-center gap-0.5 font-bold ${
                          r.selfie ? 'text-success-600 dark:text-success-400' : 'text-slate-400 dark:text-slate-500'
                        }`}>
                          <Camera size={11} /> Selfie
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
      )}

      {/* Teaching detail modal */}
      <TeachingDetailModal
        open={!!selectedRow}
        onClose={() => { setSelectedRow(null); setSelectedEvidence(null); }}
        row={selectedRow}
        realEvidence={selectedEvidence}
        dateLabel={new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      />
    </div>
  );
}
