import React, { useMemo } from 'react';
import {
  X,
  BookOpen,
  FlaskConical,
  Stethoscope,
  Landmark,
  Camera,
  CheckCircle2,
  XCircle,
  MapPin,
  Coffee,
  Sun,
  PartyPopper,
  CalendarDays,
} from 'lucide-react';
import { buildEvidence } from './ClassEvidenceModal';

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const LUNCH_HOUR = 13;
const fmtHour = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;

const TYPE = {
  lecture: { icon: BookOpen, tint: 'text-primary-700 dark:text-primary-300', block: 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200' },
  practical: { icon: FlaskConical, tint: 'text-warning-600 dark:text-warning-300', block: 'border-warning-300 bg-warning-50 text-warning-800 dark:border-warning-700 dark:bg-warning-900/40 dark:text-warning-200' },
  clinical: { icon: Stethoscope, tint: 'text-success-700 dark:text-success-300', block: 'border-success-300 bg-success-50 text-success-800 dark:border-success-700 dark:bg-success-900/40 dark:text-success-200' },
  activity: { icon: Landmark, tint: 'text-slate-600 dark:text-slate-300', block: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300' },
};

const STATUS_BLOCK = {
  conducted: 'border-success-400 bg-success-50 text-success-800 ring-1 ring-success-300/60 dark:border-success-600 dark:bg-success-900/30 dark:text-success-200',
  missed: 'border-danger-400 bg-danger-50 text-danger-800 ring-1 ring-danger-300/60 dark:border-danger-600 dark:bg-danger-900/30 dark:text-danger-200',
};

/**
 * Full single-day schedule laid out exactly like the weekly timetable, but
 * horizontal: one date row with a column per time period. Each past slot's
 * conducted/missed status is derived from the same deterministic evidence used
 * by the weekly grid (seeded by slot id + short date), so the colours stay in
 * sync. Sunday renders as a holiday.
 * props: { open, onClose, date, dayIdx, dateLabel, classes, onOpenEvidence }
 */
export default function DayScheduleModal({ open, onClose, date, dayIdx, dateLabel, classes, liveRows, onOpenEvidence }) {
  const isSunday = dayIdx === 6;

  const byHour = useMemo(() => {
    const now = new Date();
    const seedLabel = date
      ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : dateLabel;
    const fmt = (n) => (n == null ? '' : Number(n).toFixed(5));
    const map = {};
    (classes || []).forEach((cls) => {
      const hour = parseInt(cls.start.slice(0, 2), 10);
      const end = date ? new Date(date) : new Date();
      const [hh, mm] = cls.end.split(':').map(Number);
      end.setHours(hh, mm, 0, 0);
      const past = end < now;
      // Prefer the REAL class-checkin row; fall back to deterministic evidence.
      const real = liveRows && liveRows[cls.id];
      let ev = null;
      if (real && real.status && real.status !== 'upcoming') {
        ev = {
          status: real.status === 'missed' ? 'missed' : 'conducted',
          geo: { lat: real.geo ? fmt(real.geo.latitude) : '', lng: real.geo ? fmt(real.geo.longitude) : '' },
        };
      } else if (past) {
        const b = buildEvidence({ id: cls.id, type: cls.type, room: cls.room, dateLabel: seedLabel, start: cls.start, end: cls.end });
        ev = { status: b.status === 'missed' ? 'missed' : 'conducted', geo: { lat: b.geo.lat, lng: b.geo.lng } };
      }
      (map[hour] = map[hour] || []).push({ cls, past: past || !!ev, ev });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, date, dateLabel, liveRows]);

  if (!open) return null;

  const all = Object.values(byHour).flat();
  const conducted = all.filter((i) => i.ev && i.ev.status !== 'missed').length;
  const missed = all.filter((i) => i.ev && i.ev.status === 'missed').length;

  // Day / weekday split for the leading row-header cell.
  const weekday = date ? date.toLocaleDateString('en-GB', { weekday: 'long' }) : '';
  const dayNum = date ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        data-lenis-prevent
        className="animate-fade-in-up relative max-h-[88vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white p-6 shadow-elevation-3 dark:bg-slate-800 dark:shadow-elevation-3-dark"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 p-2.5 text-white shadow-elevation-2">
              <CalendarDays className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{dateLabel}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isSunday ? 'Sunday · Holiday' : `${all.length} classes · ${conducted} conducted · ${missed} missed`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isSunday ? (
          <div className="animate-fade-in-up rounded-lg border border-rose-200 bg-gradient-to-b from-rose-50 to-amber-50 p-12 text-center dark:border-rose-800 dark:from-rose-900/20 dark:to-amber-900/10">
            <Sun className="mx-auto mb-2 h-12 w-12 animate-float text-amber-400" aria-hidden="true" />
            <PartyPopper className="mx-auto mb-3 h-7 w-7 animate-bounce text-rose-400" aria-hidden="true" />
            <p className="text-lg font-bold text-rose-600 dark:text-rose-300">Holiday</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sunday — no classes scheduled. Enjoy the day off!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] table-fixed border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800">
                  <th className="w-28 border border-slate-200 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Date
                  </th>
                  {HOURS.map((hour) => {
                    const isLunch = hour === LUNCH_HOUR;
                    return (
                      <th
                        key={hour}
                        className={`border border-slate-200 px-2 py-2 text-center text-xs font-semibold dark:border-slate-700 ${
                          isLunch ? 'text-amber-600 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {fmtHour(hour)}
                        <div className="text-[10px] font-normal opacity-60">{fmtHour(hour + 1)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {/* Leading cell — the selected date */}
                  <td className="border border-slate-200 bg-primary-50 px-2 py-3 align-top dark:border-slate-700 dark:bg-primary-900/20">
                    <div className="text-sm font-bold text-primary-700 dark:text-primary-200">{weekday}</div>
                    <div className="text-xs font-medium text-primary-600 dark:text-primary-300">{dayNum}</div>
                  </td>
                  {HOURS.map((hour) => {
                    if (hour === LUNCH_HOUR) {
                      return (
                        <td key={hour} className="border border-slate-200 p-1 align-middle dark:border-slate-700">
                          <div className="relative flex h-full min-h-[5rem] flex-col items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-amber-100 via-orange-100 to-amber-100 px-1 py-2 text-center dark:from-amber-900/30 dark:via-orange-900/30 dark:to-amber-900/30">
                            <div className="animate-wave absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent dark:via-white/10" />
                            <Coffee className="relative z-10 mb-1 h-4 w-4 animate-float text-amber-600 dark:text-amber-300" aria-hidden="true" />
                            <span className="relative z-10 text-[10px] font-semibold leading-tight text-amber-700 dark:text-amber-300">
                              Lunch<br />Break
                            </span>
                          </div>
                        </td>
                      );
                    }
                    const items = byHour[hour] || [];
                    return (
                      <td key={hour} className="border border-slate-200 p-1 align-top dark:border-slate-700">
                        <div className="min-h-[5rem] space-y-1">
                          {items.length === 0 ? (
                            <div className="flex h-20 items-center justify-center text-[10px] text-slate-300 dark:text-slate-600">—</div>
                          ) : (
                            items.map(({ cls, past, ev }) => {
                              const meta = TYPE[cls.type] || TYPE.lecture;
                              const missedSlot = ev && ev.status === 'missed';
                              const conductedSlot = ev && ev.status !== 'missed';
                              const block = conductedSlot ? STATUS_BLOCK.conducted : missedSlot ? STATUS_BLOCK.missed : meta.block;
                              return (
                                <button
                                  key={cls.id}
                                  type="button"
                                  disabled={!past}
                                  onClick={() => past && onOpenEvidence && onOpenEvidence(cls)}
                                  className={`block w-full rounded-md border px-1.5 py-1 text-left transition-all ${block} ${
                                    past ? 'cursor-pointer hover:shadow-elevation-2' : 'cursor-default'
                                  }`}
                                >
                                  <div className="flex items-start gap-1 text-[11px] font-semibold leading-tight">
                                    <meta.icon className={`mt-0.5 h-3 w-3 shrink-0 ${meta.tint}`} aria-hidden="true" />
                                    <span className={`min-w-0 flex-1 break-words ${meta.tint}`}>{cls.subject}</span>
                                    {conductedSlot && <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success-600 dark:text-success-400" />}
                                    {missedSlot && <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-danger-500" />}
                                    {!past && <Camera className="mt-0.5 h-3 w-3 shrink-0 text-slate-400 opacity-70" />}
                                  </div>
                                  <div className="truncate text-[10px] opacity-80">{cls.faculty}</div>
                                  <div className="truncate text-[10px] opacity-70">{cls.start}–{cls.end} · {cls.room}</div>
                                  <div className={`mt-0.5 flex items-center gap-0.5 truncate font-mono text-[9px] ${conductedSlot ? 'text-success-700/90 dark:text-success-300/90' : 'text-slate-400'}`}>
                                    <MapPin className="h-2 w-2 shrink-0" aria-hidden="true" />
                                    {conductedSlot ? `${ev.geo.lat}, ${ev.geo.lng}` : cls.room}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
          Same status as the weekly timetable · tap a completed class to view its photos &amp; geolocation
        </p>
      </div>
    </div>
  );
}
