import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  BookOpen,
  FlaskConical,
  Stethoscope,
  Landmark,
  Clock,
  Coffee,
  Camera,
  CheckCircle2,
  XCircle,
  MapPin,
  CalendarSearch,
  ChevronLeft,
  ChevronRight,
  Sun,
  PartyPopper,
  CalendarRange,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, EmptyState, SkeletonCard } from '../../components/ui';
import ClassEvidenceModal, { buildEvidence } from '../../components/ClassEvidenceModal';
import DayScheduleModal from '../../components/DayScheduleModal';
import { fetchWeekLog, fetchEvidence, ymd } from '../../lib/teachingLog';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [...DAYS, 'Sun'];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const LUNCH_HOUR = 13;
const fmtHour = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;

const TYPE = {
  lecture: { icon: BookOpen, tint: 'text-primary-700 dark:text-primary-300', cls: 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200' },
  practical: { icon: FlaskConical, tint: 'text-warning-600 dark:text-warning-300', cls: 'border-warning-300 bg-warning-50 text-warning-800 dark:border-warning-700 dark:bg-warning-900/40 dark:text-warning-200' },
  clinical: { icon: Stethoscope, tint: 'text-success-700 dark:text-success-300', cls: 'border-success-300 bg-success-50 text-success-800 dark:border-success-700 dark:bg-success-900/40 dark:text-success-200' },
  activity: { icon: Landmark, tint: 'text-slate-600 dark:text-slate-300', cls: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300' },
};

const STATUS_BLOCK = {
  conducted: 'border-success-400 bg-success-50 text-success-800 ring-1 ring-success-300/60 dark:border-success-600 dark:bg-success-900/30 dark:text-success-200',
  missed: 'border-danger-400 bg-danger-50 text-danger-800 ring-1 ring-danger-300/60 dark:border-danger-600 dark:bg-danger-900/30 dark:text-danger-200',
};

function CameraBadge({ ev, conducted, missed, start }) {
  const [errored, setErrored] = useState(false);
  return (
    <span className="group/cam relative ml-auto flex shrink-0 items-center gap-1">
      {conducted && <CheckCircle2 className="h-3.5 w-3.5 text-success-600 dark:text-success-400" aria-label="Conducted" />}
      {missed && <XCircle className="h-3.5 w-3.5 text-danger-500 dark:text-danger-400" aria-label="Missed" />}
      <Camera
        className={`h-4 w-4 ${conducted ? 'text-success-600 dark:text-success-400' : missed ? 'text-danger-500' : 'text-slate-400 opacity-70'}`}
        aria-hidden="true"
      />
      {conducted && ev && (
        <span className="pointer-events-none absolute right-0 top-6 z-30 hidden w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-elevation-3 group-hover/cam:block dark:border-slate-700 dark:bg-slate-800">
          {errored ? (
            <span className="flex aspect-[3/2] w-full items-center justify-center rounded bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
              <Camera className="h-5 w-5" />
            </span>
          ) : (
            <img src={ev.photos[0].uri} alt="Uploaded geo-tagged selfie" onError={() => setErrored(true)} className="aspect-[3/2] w-full rounded object-cover" />
          )}
          <span className="mt-1 block text-center text-[10px] font-medium text-slate-500 dark:text-slate-400">Geo-tagged selfie · {start}</span>
        </span>
      )}
    </span>
  );
}

const FacultyTimetable = () => {
  const { user } = useAuth();
  const [apiRows, setApiRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evidenceData, setEvidenceData] = useState(null);
  const [dayView, setDayView] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [logMap, setLogMap] = useState({});

  // The faculty's own weekly schedule — served live from the SAME Timetable
  // collection the Admin/HOD dashboard reads (filtered to this faculty on the
  // backend), so it's always in sync with the institute timetable.
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/portal/my/timetable');
        setApiRows(res.data.rows || []);
      } catch {
        toast.error('Failed to load timetable');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = apiRows;
  const showLoading = loading;

  const at = (day, hour) => rows.filter((r) => r.day === day && parseInt(r.start.slice(0, 2), 10) === hour);

  const weekDates = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return ALL_DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [weekOffset]);
  const weekLabel = `${weekDates[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekDates[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayKind = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === startOfToday.getTime()) return 'today';
    return d < startOfToday ? 'past' : 'future';
  };

  const isPast = (cls, date) => {
    const end = new Date(date);
    const [hh, mm] = cls.end.split(':').map(Number);
    end.setHours(hh, mm, 0, 0);
    return end < new Date();
  };

  const labelOf = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Real class-checkin status (conducted/missed/ongoing) for the visible week.
  useEffect(() => {
    if (!rows.length) return undefined;
    let alive = true;
    fetchWeekLog(weekDates.slice(0, 6), 'faculty').then((m) => {
      if (alive) setLogMap(m);
    });
    return () => {
      alive = false;
    };
  }, [weekOffset, rows.length, weekDates]);

  // Card status/geo/selfie — REAL when available, else deterministic preview.
  const cellEvidence = (cls, date) => {
    const real = logMap[`${cls.id}_${ymd(date)}`];
    if (real && real.status && real.status !== 'upcoming') {
      const fmt = (n) => (n == null ? '' : Number(n).toFixed(5));
      return {
        status: real.status === 'missed' ? 'missed' : 'conducted',
        geo: { lat: real.geo ? fmt(real.geo.latitude) : '', lng: real.geo ? fmt(real.geo.longitude) : '' },
        photos: [{ uri: real.selfieUrl || '' }],
      };
    }
    if (isPast(cls, date)) {
      const b = buildEvidence({ id: cls.id, type: cls.type, room: cls.room, dateLabel: labelOf(date), start: cls.start, end: cls.end });
      return { status: b.status === 'missed' ? 'missed' : 'conducted', geo: { lat: b.geo.lat, lng: b.geo.lng }, photos: [{ uri: b.photos[0].uri }] };
    }
    return null;
  };

  const openEvidence = async (cls, date) => {
    const real = await fetchEvidence(cls.id, date, 'faculty');
    setEvidenceData({
      id: cls.id,
      subject: cls.subject,
      faculty: user?.name || user?.fullName || 'You',
      type: cls.type,
      room: cls.room,
      dateLabel: labelOf(date),
      start: cls.start,
      end: cls.end,
      realEvidence: real,
    });
  };

  const openDayView = async (dateStr) => {
    if (!dateStr) return;
    const date = new Date(`${dateStr}T00:00:00`);
    const dayIdx = (date.getDay() + 6) % 7;
    const dayClasses = dayIdx > 5 ? [] : rows.filter((r) => r.day === dayIdx);
    setDayView({
      date,
      dayIdx,
      dateLabel: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
      classes: dayClasses,
      liveRows: null,
    });
    if (dayClasses.length) {
      const map = await fetchWeekLog([date], 'faculty');
      const byTt = {};
      Object.values(map).forEach((r) => {
        byTt[r.timetableId] = r;
      });
      setDayView((dv) => (dv && dv.date === date ? { ...dv, liveRows: byTt } : dv));
    }
  };


  const renderClassCard = (c, date, compact = false) => {
    const t = TYPE[c.type] || TYPE.lecture;
    const ev = cellEvidence(c, date);
    const missed = ev && ev.status === 'missed';
    const conducted = ev && ev.status !== 'missed';
    const block = conducted ? STATUS_BLOCK.conducted : missed ? STATUS_BLOCK.missed : t.cls;
    const Wrapper = ev ? 'button' : 'div';
    return (
      <Wrapper
        key={c.id}
        {...(ev ? { onClick: () => openEvidence(c, date) } : {})}
        className={`hover-lift block w-full rounded-xl border px-3 py-2 text-left transition-all ${compact ? 'sm:px-2 sm:py-1.5' : ''} ${ev ? 'cursor-pointer hover:shadow-elevation-2' : ''} ${block}`}
        title={`${c.subject} � ${c.room}${ev ? ' � view uploaded photos, note & geolocation' : ''}`}
      >
        <div className="flex items-start gap-2 text-xs font-semibold">
          <t.icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${t.tint}`} />
          <span className={`min-w-0 flex-1 break-words ${t.tint}`}>{c.subject}</span>
          <CameraBadge ev={ev} conducted={conducted} missed={missed} start={c.start} />
        </div>
        <div className="mt-1 text-[11px] font-semibold opacity-75">{c.start}-{c.end} � {c.room}</div>
        <div className={`mt-1 flex items-center gap-1 truncate font-mono text-[10px] ${conducted ? 'text-success-700/90 dark:text-success-300/90' : 'text-slate-400 dark:text-slate-500'}`}>
          <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {conducted ? `${ev.geo.lat}, ${ev.geo.lng}` : c.room}
        </div>
      </Wrapper>
    );
  };
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header section */}
      <div className="relative overflow-hidden rounded-[1.35rem] border border-emerald-900/10 bg-gradient-to-br from-[#18233D] via-[#315CE8] to-[#0B1220] p-4 text-white shadow-lg shadow-emerald-950/15 sm:rounded-3xl sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #4A74F0, #6F8DF0, #2748C4)' }} />
        <div className="relative z-10 flex w-full flex-col items-stretch justify-between gap-5 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-col items-center gap-3 text-center md:flex-row md:text-left">
            <div className="h-12 w-12 rounded-2xl sm:h-14 sm:w-14 bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <CalendarRange className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                Academic Timetable
              </span>
              <h1 className="mt-1.5 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">My Timetable</h1>
              <p className="mx-auto mt-2 max-w-[17rem] text-xs font-semibold leading-5 text-emerald-100/75 md:mx-0 md:max-w-none">
                Your weekly teaching schedule · Academic Year 2024-25 · {rows.length} classes/week
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/10 p-3 text-[10px] backdrop-blur-md sm:flex sm:flex-wrap sm:items-center sm:justify-center">
            {Object.entries(TYPE).map(([k, v]) => (
              <span key={k} className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-full border px-2 py-1 font-semibold ${v.cls}`}>
                <v.icon className="h-3 w-3" /> {k[0].toUpperCase() + k.slice(1)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Controls — week navigation + jump to a specific day */}
      <div className="grid gap-3 rounded-[1.35rem] border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid gap-2 sm:flex sm:items-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Week</span>
          <div className="inline-grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="rounded-full p-1.5 text-slate-500 transition hover:bg-white hover:text-emerald-600 dark:hover:bg-slate-700 dark:hover:text-emerald-400"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-0 px-2 text-center text-xs font-bold sm:min-w-[10.5rem] sm:text-sm text-slate-800 dark:text-slate-100">{weekLabel}</span>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="rounded-full p-1.5 text-slate-500 transition hover:bg-white hover:text-emerald-600 dark:hover:bg-slate-700 dark:hover:text-emerald-400"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-white dark:text-emerald-400 dark:hover:bg-slate-700"
              >
                Today
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-2 sm:flex sm:items-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Go to date</span>
          <label className="inline-flex min-h-12 w-full items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50/50 px-3.5 py-2 text-sm font-semibold sm:w-auto text-emerald-800 focus-within:ring-2 focus-within:ring-emerald-500 dark:border-emerald-800/85 dark:bg-emerald-950/20 dark:text-emerald-300 cursor-pointer transition-all hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
            <CalendarSearch className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <input type="date" onChange={(e) => openDayView(e.target.value)} className="min-w-0 flex-1 bg-transparent font-semibold text-emerald-800 focus:outline-none dark:text-emerald-355 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer" aria-label="Open a specific day's timetable" />
          </label>
        </div>
      </div>

      {showLoading ? (
        <SkeletonCard />
      ) : rows.length === 0 ? (
        <Card><EmptyState title="No classes assigned" description="You have no timetable slots yet. Your Admin/HOD assigns classes on the Timetable page." /></Card>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {ALL_DAYS.map((dayLabel, dayIdx) => {
              const date = weekDates[dayIdx];
              const isSunday = dayIdx === 6;
              const kind = dayKind(date);
              const isToday = !isSunday && kind === 'today';
              const isPastDay = !isSunday && kind === 'past';
              const dayClasses = isSunday
                ? []
                : rows
                    .filter((r) => r.day === dayIdx)
                    .sort((a, b) => a.start.localeCompare(b.start));

              return (
                <section
                  key={dayLabel}
                  className={`overflow-hidden rounded-[1.35rem] border bg-white shadow-sm dark:bg-slate-900 ${
                    isToday
                      ? 'border-emerald-300 ring-1 ring-emerald-200 dark:border-emerald-800 dark:ring-emerald-900/40'
                      : isSunday
                      ? 'border-rose-100 dark:border-rose-900/40'
                      : 'border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${
                      isToday
                        ? 'border-emerald-200 bg-emerald-600 text-white dark:border-emerald-800'
                        : isSunday
                        ? 'border-rose-100 bg-gradient-to-r from-rose-50 to-amber-50 text-rose-600 dark:border-rose-900/40 dark:from-rose-950/30 dark:to-amber-950/20 dark:text-rose-300'
                        : isPastDay
                        ? 'border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-850/60 dark:text-slate-400'
                        : 'border-slate-100 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                  >
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wider">{dayLabel}</p>
                      <p className="text-sm font-extrabold">{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    {isToday && (
                      <span className="rounded-full bg-white/20 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                        Today
                      </span>
                    )}
                  </div>

                  {isSunday ? (
                    <div className="flex min-h-[9rem] flex-col items-center justify-center gap-2 bg-gradient-to-b from-rose-50 via-amber-50 to-white px-4 py-6 text-center dark:from-rose-950/30 dark:via-amber-950/20 dark:to-slate-900">
                      <Sun className="h-8 w-8 animate-float text-amber-400" aria-hidden="true" />
                      <PartyPopper className="h-5 w-5 animate-bounce text-rose-400" aria-hidden="true" />
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
                        Holiday
                      </span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">No classes</span>
                    </div>
                  ) : dayClasses.length > 0 ? (
                    <div className="space-y-2 p-3">
                      {dayClasses.map((c) => renderClassCard(c, date))}
                    </div>
                  ) : (
                    <div className="flex min-h-[5.5rem] items-center justify-center px-4 py-5 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
                      No classes scheduled
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-250/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-3xl md:block">
            <div className="overflow-x-auto">
            <table className="min-w-[64rem] w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800">
                  <th className="w-20 border-b border-r border-slate-200 px-2 py-3 dark:border-slate-700">
                    <Clock className="mx-auto h-4 w-4 text-slate-400" />
                  </th>
                  {ALL_DAYS.map((d, i) => {
                    const isSunday = i === 6;
                    const kind = dayKind(weekDates[i]);
                    const isToday = !isSunday && kind === 'today';
                    const isPastDay = !isSunday && kind === 'past';
                    return (
                      <th
                        key={d}
                        className={`relative border-b border-r border-slate-200 px-2 py-3 text-center last:border-r-0 dark:border-slate-700 ${
                          isToday
                            ? 'bg-gradient-to-b from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-700/20'
                            : isSunday
                            ? 'animate-pulse bg-gradient-to-b from-rose-50 to-amber-50 dark:from-rose-900/30 dark:to-amber-900/20'
                            : isPastDay
                            ? 'bg-slate-50 opacity-70 dark:bg-slate-800/60'
                            : ''
                        }`}
                      >
                        <div
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isToday ? 'text-white/90' : isSunday ? 'text-rose-600 dark:text-rose-300' : isPastDay ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {d}
                        </div>
                        <div
                          className={`text-sm font-bold ${
                            isToday ? 'text-white' : isSunday ? 'text-rose-600 dark:text-rose-300' : isPastDay ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {weekDates[i].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                        {isToday && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
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
                            <Coffee className="h-5 w-5 animate-float" aria-hidden="true" /> Lunch Break · 1:00 – 2:00 PM
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
                        const kind = dayKind(weekDates[dayIdx]);
                        const isToday = kind === 'today';
                        const isPastDay = kind === 'past';
                        return (
                          <td
                            key={dayIdx}
                            className={`h-16 border-b border-r p-1 align-top transition-opacity dark:border-slate-700/60 ${
                              isToday
                                ? 'border-emerald-250 bg-emerald-50/40 shadow-[inset_0_0_0_1px_rgba(74, 116, 240,0.15)] dark:border-emerald-800/60 dark:bg-emerald-950/10'
                                : 'border-slate-100'
                            } ${isPastDay ? 'opacity-55 grayscale-[0.25] hover:opacity-100 hover:grayscale-0' : ''}`}
                          >
                            <div className="space-y-1">
                              {at(dayIdx, hour).map((c) => {
                                const t = TYPE[c.type] || TYPE.lecture;
                                const ev = cellEvidence(c, weekDates[dayIdx]);
                                const missed = ev && ev.status === 'missed';
                                const conducted = ev && ev.status !== 'missed';
                                const block = conducted ? STATUS_BLOCK.conducted : missed ? STATUS_BLOCK.missed : t.cls;
                                const Wrapper = ev ? 'button' : 'div';
                                return (
                                  <Wrapper
                                    key={c.id}
                                    {...(ev ? { onClick: () => openEvidence(c, weekDates[dayIdx]) } : {})}
                                    className={`hover-lift block w-full rounded-md border px-2 py-1.5 text-left transition-all ${ev ? 'cursor-pointer hover:shadow-elevation-2' : ''} ${block}`}
                                    title={`${c.subject} · ${c.room}${ev ? ' — view uploaded photos, note & geolocation' : ''}`}
                                  >
                                    <div className="flex items-start gap-1 text-xs font-semibold">
                                      <t.icon className={`mt-0.5 h-3 w-3 shrink-0 ${t.tint}`} />
                                      <span className={`min-w-0 flex-1 truncate ${t.tint}`}>{c.subject}</span>
                                      <CameraBadge ev={ev} conducted={conducted} missed={missed} start={c.start} />
                                    </div>
                                    <div className="truncate text-[11px] opacity-70">{c.start}–{c.end} · {c.room}</div>
                                    <div className={`mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] ${conducted ? 'text-success-700/90 dark:text-success-300/90' : 'text-slate-400 dark:text-slate-500'}`}>
                                      <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                      {conducted ? `${ev.geo.lat}, ${ev.geo.lng}` : c.room}
                                    </div>
                                  </Wrapper>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                      {/* Sunday holiday column */}
                      {rowIdx === 0 && (
                        <td
                          rowSpan={HOURS.length}
                          className="relative overflow-hidden border-b border-l border-slate-200 bg-gradient-to-b from-rose-50 via-amber-50 to-rose-50 align-middle dark:border-slate-700 dark:from-rose-900/20 dark:via-amber-900/10 dark:to-rose-900/20"
                        >
                          <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center">
                            <Sun className="h-8 w-8 animate-float text-amber-400" aria-hidden="true" />
                            <PartyPopper className="h-5 w-5 animate-bounce text-rose-400" aria-hidden="true" />
                            <span className="rounded-pill bg-rose-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">Holiday</span>
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">No classes</span>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Synced with the institute timetable · conduct each class from the SAACMS mobile app (geo-tagged face check-in + selfie).
      </p>

      <ClassEvidenceModal
        open={!!evidenceData}
        onClose={() => setEvidenceData(null)}
        data={evidenceData}
        realEvidence={evidenceData?.realEvidence}
      />
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
    </div>
  );
};

export default FacultyTimetable;





