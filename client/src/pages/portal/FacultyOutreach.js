import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  HeartHandshake,
  MapPin,
  Users,
  Camera,
  Navigation,
  CheckCircle2,
  CalendarDays,
  ChevronRight,
  Sparkles,
  Clock,
  XCircle,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { CalendarRange, List } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { StatCard } from '../../components/ui';
import OutreachDetailModal from '../../components/OutreachDetailModal';
import OutreachDayModal from '../../components/OutreachDayModal';
import MonthCalendar from '../../components/MonthCalendar';

// Sample shown only if the API returns nothing (keeps the demo non-empty).
const SAMPLE = [
  { id: 'o1', title: 'Community Awareness Drive', type: 'Health Camp', location: 'Community Centre', date: '2026-05-28', start: '09:00', end: '13:00', participants: 84, gpsPoints: 36, photos: 12, status: 'completed' },
  { id: 'o2', title: 'School Awareness Drive', type: 'Awareness Drive', location: 'Govt. School, Sokhada', date: '2026-05-15', start: '10:00', end: '12:30', participants: 120, gpsPoints: 22, photos: 9, status: 'completed' },
  { id: 'o3', title: 'Lifestyle Workshop', type: 'Workshop', location: 'Community Hall', date: '2026-04-30', start: '08:30', end: '11:00', participants: 56, gpsPoints: 18, photos: 7, status: 'completed' },
  { id: 'o4', title: 'Tribal Area Medicinal Plant Survey', type: 'Field Survey', location: 'Jambughoda Forest', date: '2026-04-18', start: '07:30', end: '14:00', participants: 24, gpsPoints: 64, photos: 21, status: 'completed' },
  { id: 'o5', title: 'World Health Day Nukkad Natak', type: 'Public Outreach', location: 'Mandvi Market', date: '2026-04-07', start: '17:00', end: '19:00', participants: 210, gpsPoints: 14, photos: 11, status: 'completed' },
  { id: 'o6', title: 'Geriatric Wellness Camp', type: 'Health Camp', location: 'Old Age Home, Akota', date: '2026-03-22', start: '09:30', end: '12:30', participants: 48, gpsPoints: 20, photos: 8, status: 'completed' },
];

const TYPE_TINT = {
  'Health Camp': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/20',
  'Awareness Drive': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20',
  Workshop: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100 dark:border-amber-900/20',
  'Field Survey': 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-100 dark:border-sky-900/20',
  'Public Outreach': 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-100 dark:border-rose-900/20',
};

const STATUS_DOT = {
  pending: 'bg-amber-500',
  in_progress: 'bg-sky-500',
  completed: 'bg-emerald-500',
  rejected: 'bg-rose-500',
  no_response: 'bg-slate-500',
  no_response_reviewed: 'bg-slate-400',
};

const STATUS_META = {
  pending: {
    label: 'Awaiting approval',
    helper: 'Waiting for HOD/Admin action',
    Icon: Clock,
    cls: 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300',
  },
  in_progress: {
    label: 'Approved',
    helper: 'Approved for activity',
    Icon: CheckCircle2,
    cls: 'border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-900/30 dark:bg-sky-950/20 dark:text-sky-300',
  },
  completed: {
    label: 'Completed',
    helper: 'Evidence submitted',
    Icon: CheckCircle2,
    cls: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300',
  },
  rejected: {
    label: 'Rejected',
    helper: 'Request was rejected',
    Icon: XCircle,
    cls: 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300',
  },
  no_response: {
    label: 'No response',
    helper: 'HOD did not respond before the scheduled date',
    Icon: AlertTriangle,
    cls: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  no_response_reviewed: {
    label: 'No response reviewed',
    helper: 'Missed approval was reviewed by admin',
    Icon: ShieldCheck,
    cls: 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
  },
};

const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function FacultyOutreach() {
  const { user } = useAuth();
  const [active, setActive] = useState(null);
  const [dayPicker, setDayPicker] = useState(null); // { dateKey, items } when a day has multiple activities
  const [activities, setActivities] = useState(SAMPLE);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'calendar'
  const [calMonth, setCalMonth] = useState(new Date());

  // Load the faculty's OWN outreach activities from the DB; keep the sample as
  // a fallback so the page is never empty during a demo.
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/portal/my/outreach');
        const rows = res.data.data || [];
        if (rows.length) {
          setActivities(
            rows.map((r) => ({
              ...r,
              start: r.start || '09:00',
              end: r.end || '13:00',
              photos: r.photos || 0,
              gpsPoints: r.gpsPoints || 0,
            }))
          );
        }
      } catch {
        /* keep sample */
      }
    })();
  }, []);

  const OUTREACH = activities;

  const stats = useMemo(() => {
    const participants = OUTREACH.reduce((a, b) => a + (b.participants || 0), 0);
    const photos = OUTREACH.reduce((a, b) => a + (b.photos || 0), 0);
    const locations = new Set(OUTREACH.map((o) => o.location)).size;
    return { total: OUTREACH.length, participants, photos, locations };
  }, [OUTREACH]);

  // Open the dedicated outreach evidence modal — its counts (photos, GPS,
  // participants) mirror the card exactly so nothing mismatches.
  const openActivity = (a) =>
    setActive({
      ...a,
      lead: a.lead || user?.name || user?.fullName || 'You',
      department: a.department || user?.department || '',
      noResponseReason: a.noResponseReason || '',
      noResponseAt: a.noResponseAt || null,
      createdAt: a.createdAt || null,
    });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {/* Header section */}
      <div className="relative overflow-hidden rounded-[1.35rem] border border-emerald-900/10 bg-gradient-to-br from-[#18233D] via-[#315CE8] to-[#0B1220] p-4 text-white shadow-lg shadow-emerald-950/15 sm:rounded-3xl sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #4A74F0, #6F8DF0, #2748C4)' }} />
        <div className="relative z-10 flex w-full flex-col items-stretch justify-between gap-5 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-col items-center gap-3 text-center md:flex-row md:text-left">
            <div className="h-12 w-12 rounded-2xl sm:h-14 sm:w-14 bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <HeartHandshake className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                Community Field Work
              </span>
              <h1 className="mt-1.5 flex items-center justify-center gap-2 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl md:justify-start">
                Outreach Activities
                <Sparkles className="h-4 w-4 animate-float text-amber-400" aria-hidden="true" />
              </h1>
              <p className="mx-auto mt-2 max-w-[17rem] text-xs font-semibold leading-5 text-emerald-100/75 md:mx-0 md:max-w-none">
                Your community &amp; field work — geo-tagged, photo-verified evidence. Tap a card for details.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Activities" value={stats.total} icon={HeartHandshake} accent="success" />
        <StatCard label="People reached" value={stats.participants} icon={Users} accent="primary" />
        <StatCard label="Photos uploaded" value={stats.photos} icon={Camera} accent="info" />
        <StatCard label="Locations" value={stats.locations} icon={MapPin} accent="warning" />
      </div>

      {/* View toggle */}
      <div className="flex justify-stretch sm:justify-end">
        <div className="grid w-full grid-cols-2 items-center gap-1 rounded-2xl bg-slate-100 p-1 shadow-inner dark:bg-slate-800 sm:w-auto">
          <button
            onClick={() => setViewMode('cards')}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
              viewMode === 'cards'
                ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <List className="h-3.5 w-3.5" /> Cards
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
              viewMode === 'calendar'
                ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" /> Calendar
          </button>
        </div>
      </div>

      {/* Calendar view */}
      {viewMode === 'calendar' && (
        <MonthCalendar
          month={calMonth}
          onMonthChange={setCalMonth}
          events={OUTREACH}
          getDate={(a) => a.date}
          onDayClick={(dateKey, items) => {
            if (items.length === 1) openActivity(items[0]);
            else if (items.length > 1) setDayPicker({ dateKey, items });
          }}
          renderDay={({ items }) => (
            <>
              {/* Desktop View */}
              <div className="hidden md:block space-y-1">
                {items.slice(0, 2).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-bold truncate bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    title={a.title}
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
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[a.status] || 'bg-emerald-500'}`}
                      title={a.title}
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
            <p className="text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              Tap an activity to open its geo-tagged evidence
            </p>
          }
        />
      )}

      {/* Activity cards */}
      {viewMode === 'cards' && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {OUTREACH.map((a, i) => {
          const statusMeta = STATUS_META[a.status] || STATUS_META.completed;
          const StatusIcon = statusMeta.Icon;
          return (
            <button
              key={a.id}
              onClick={() => openActivity(a)}
              className={`hover-lift animate-fade-in-up stagger-${(i % 5) + 1} group flex min-w-0 flex-col rounded-[1.35rem] border border-slate-200 bg-white p-4 text-left transition-all sm:rounded-2xl sm:p-5 hover:shadow-xl hover:shadow-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-none`}
            >
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${TYPE_TINT[a.type] || 'bg-slate-100 text-slate-600'}`}>
                  {a.type}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${statusMeta.cls}`}>
                  <StatusIcon className="h-3.5 w-3.5" /> {statusMeta.label}
                </span>
              </div>

              <h3 className="mt-3 break-words text-sm font-extrabold leading-5 text-slate-900 dark:text-slate-100 sm:text-base">{a.title}</h3>
              <div className="mt-2 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p className="flex min-w-0 items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="min-w-0 break-words">{a.location}</span></p>
                <p className="flex min-w-0 items-start gap-1.5"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span>{fmtDate(a.date)} · {statusMeta.label}</span></p>
              </div>

              {(a.status === 'no_response' || a.status === 'no_response_reviewed') && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  {a.noResponseReason || statusMeta.helper}
                </div>
              )}

              {/* Evidence chips */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-150/70 pt-3 sm:pt-4 text-xs font-semibold dark:border-slate-800">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-100 px-2 py-1 text-slate-650 dark:bg-slate-800/40 dark:border-slate-850 dark:text-slate-350">
                  <Users className="h-3 w-3 text-emerald-500" /> {a.participants}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-100 px-2 py-1 text-slate-650 dark:bg-slate-800/40 dark:border-slate-850 dark:text-slate-350">
                  <Camera className="h-3 w-3 text-sky-500" /> {a.photos} photos
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-100 px-2 py-1 text-slate-650 dark:bg-slate-800/40 dark:border-slate-850 dark:text-slate-350">
                  <Navigation className="h-3 w-3 text-amber-500" /> {a.gpsPoints} GPS
                </span>
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1.5 dark:text-slate-600" aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>
      )}

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Evidence (geo-tagged photos, GPS trail &amp; notes) is captured live from the SAACMS mobile app and tamper-checked.
      </p>

      {/* Day picker — shown when a calendar day holds multiple activities */}
      <OutreachDayModal
        open={!!dayPicker}
        onClose={() => setDayPicker(null)}
        dateKey={dayPicker?.dateKey}
        items={dayPicker?.items || []}
        onSelect={(a) => {
          setDayPicker(null);
          openActivity(a);
        }}
      />

      <OutreachDetailModal open={!!active} onClose={() => setActive(null)} activity={active} />
    </div>
  );
}

