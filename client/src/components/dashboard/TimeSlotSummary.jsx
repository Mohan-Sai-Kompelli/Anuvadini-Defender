import React, { useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Calendar, Clock, Download, Filter, LogIn, LogOut, UserX } from 'lucide-react';
import { useCountAnimation } from '../../hooks/useCountAnimation';

gsap.registerPlugin(useGSAP);

const TONE = {
  ok: { color: '#24804a', soft: 'rgba(36, 128, 74, 0.10)', border: 'rgba(36, 128, 74, 0.22)' },
  warn: { color: '#b7791f', soft: 'rgba(183, 121, 31, 0.11)', border: 'rgba(183, 121, 31, 0.26)' },
  err: { color: '#c43d42', soft: 'rgba(196, 61, 66, 0.09)', border: 'rgba(196, 61, 66, 0.22)' },
};

const checkInStatus = (name) => {
  if (name === 'Before 9:00' || name === '9:00-9:29') return { label: 'On time', tone: 'ok' };
  if (name === '9:30-9:59') return { label: 'Late', tone: 'warn' };
  return { label: 'Very late', tone: 'err' };
};
const checkOutStatus = (name) => {
  if (name === 'Before 4:30 PM' || name === '4:30-4:59 PM') return { label: 'Early leave', tone: 'err' };
  if (name === '5:00-5:29 PM') return { label: 'Early', tone: 'warn' };
  return { label: 'On time', tone: 'ok' };
};

/** Big number tile. `tone` colours the icon chip and the figure when `warn` is set. */
const Tile = ({ icon: Icon, label, value, hint, color, onClick, alert }) => (
  <button
    type="button"
    onClick={onClick}
    className="app-focus group relative flex items-center gap-4 overflow-hidden rounded-2xl border bg-[color:var(--app-card)] p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-20px_rgba(23,25,28,0.35)]"
    style={{ borderColor: alert ? `${color}40` : 'var(--app-border)' }}
  >
    <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.10] transition-opacity duration-300 group-hover:opacity-[0.2]" style={{ background: color, filter: 'blur(18px)' }} />
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18`, color }}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
    <span className="relative min-w-0">
      <span className="block text-[12px] font-medium text-[color:var(--app-text-2)]">{label}</span>
      <span className="mt-0.5 block text-[30px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: alert && Number(value) > 0 ? color : 'var(--app-text)' }}>{value}</span>
      <span className="mt-1 block truncate text-[11.5px] text-[color:var(--app-muted)]">{hint}</span>
    </span>
  </button>
);

const TimeSlotSummary = ({
  title,
  slotDate,
  slotWeek,
  slotMonth,
  slotMode,
  setSlotDate,
  setSlotWeek,
  setSlotMonth,
  setSlotMode,
  loadSlotSummaryForDate,
  handleDownload,
  slotTotals,
  noCheckInCount,
  slotSummary,
  navigate,
  type = 'checkin',
  hideFilters = false,
  className = '',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const root = useRef(null);
  const isCheckout = type === 'checkout';
  const word = isCheckout ? 'Check-outs' : 'Check-ins';
  const accent = isCheckout ? '#0f8fc9' : '#315ce8';
  const statusOf = isCheckout ? checkOutStatus : checkInStatus;
  const countOf = (s) => (isCheckout ? s.checkOut : s.checkIn);

  const { count: totalCount } = useCountAnimation(isCheckout ? slotTotals?.out : slotTotals?.in, 1200);
  const { count: noCount } = useCountAnimation(noCheckInCount, 1200);

  const slots = useMemo(() => slotSummary || [], [slotSummary]);
  const maxVal = Math.max(...slots.map(countOf), 1);
  const groups = useMemo(() => {
    const g = {};
    slots.forEach((s) => {
      const st = statusOf(s.name);
      g[st.label] = g[st.label] || { ...st, n: 0 };
      g[st.label].n += countOf(s);
    });
    return Object.values(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, isCheckout]);
  const groupTotal = groups.reduce((a, g) => a + g.n, 0);

  const periodLabel = slotMode === 'week' ? slotWeek : slotMode === 'month' ? slotMonth : slotDate;
  const go = (slot) => navigate(`/${isCheckout ? 'checkout' : 'checkin'}-details?date=${encodeURIComponent(slotDate)}&mode=${encodeURIComponent(slotMode)}&slot=${encodeURIComponent(slot)}`);

  // Bars and rows grow in whenever the data changes.
  useGSAP(() => {
    if (isLoading || !slots.length) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-row]', { y: 14, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06, clearProps: 'transform,opacity' });
      gsap.from('[data-bar]', { scaleX: 0, transformOrigin: 'left center', duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.1 });
      gsap.from('[data-seg]', { scaleX: 0, transformOrigin: 'left center', duration: 0.8, ease: 'power3.out', stagger: 0.1 });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [slots, isLoading], revertOnUpdate: true });

  const changeMode = async (mode) => {
    try {
      setIsLoading(true);
      setSlotMode(mode);
      await loadSlotSummaryForDate(mode === 'day' ? slotDate : mode === 'week' ? slotWeek : slotMonth, mode);
    } finally { setIsLoading(false); }
  };
  const changeValue = async (value) => {
    try {
      setIsLoading(true);
      if (slotMode === 'day') setSlotDate(value); else if (slotMode === 'week') setSlotWeek(value); else setSlotMonth(value);
      await loadSlotSummaryForDate(value, slotMode);
    } finally { setIsLoading(false); }
  };

  return (
    <div ref={root} className={`app-card relative flex flex-col overflow-hidden ${className}`}>
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00)` }} aria-hidden="true" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[color:var(--app-text)]">{title}</h3>
          <p className="mt-0.5 text-[12px] text-[color:var(--app-text-2)]">{slotMode === 'day' ? 'Day' : slotMode === 'week' ? 'Week' : 'Month'} view{periodLabel ? ` · ${periodLabel}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {!hideFilters && (
            <button type="button" className="app-btn app-btn--ghost" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
              <Filter className="h-4 w-4" aria-hidden="true" />{showFilters ? 'Hide' : 'Filter'}
            </button>
          )}
          <button type="button" className="app-btn app-btn--primary" onClick={handleDownload}>
            <Download className="h-4 w-4" aria-hidden="true" />Export
          </button>
        </div>
      </div>

      {/* Filters */}
      {!hideFilters && showFilters && (
        <div className="mx-5 mt-3 flex flex-wrap items-end gap-4 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-hover)]/60 p-3.5">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">Period</p>
            <div role="group" aria-label="Period" className="inline-flex rounded-[10px] border border-[color:var(--app-border)] bg-[color:var(--app-card)] p-0.5">
              {['day', 'week', 'month'].map((mode) => {
                const on = slotMode === mode;
                return (
                  <button key={mode} type="button" aria-pressed={on} onClick={() => changeMode(mode)} className="app-focus rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors" style={{ background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--app-text-2)' }}>
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-w-[180px] flex-1 sm:max-w-[240px]">
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]" htmlFor={`slot-date-${type}`}>
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />{slotMode === 'day' ? 'Date' : slotMode === 'week' ? 'Week' : 'Month'}
            </label>
            <input
              id={`slot-date-${type}`}
              className="app-input w-full"
              type={slotMode === 'day' ? 'date' : slotMode === 'week' ? 'week' : 'month'}
              value={slotMode === 'day' ? slotDate : slotMode === 'week' ? slotWeek : slotMonth}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => changeValue(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-1 gap-3 px-5 pt-4 sm:grid-cols-2">
        <Tile icon={isCheckout ? LogOut : LogIn} label={`Total ${word.toLowerCase()}`} value={totalCount} hint={`Recorded in this ${slotMode}`} color={accent} onClick={() => go('ALL')} />
        <Tile icon={UserX} label={`No ${isCheckout ? 'check-out' : 'check-in'}`} value={noCount} hint="Not recorded yet" color="#c43d42" alert onClick={() => go('NONE')} />
      </div>

      {/* Distribution */}
      {groupTotal > 0 && (
        <div className="px-5 pt-4" aria-label="Distribution">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--app-hover)]" role="img" aria-label={groups.map((g) => `${g.label} ${g.n}`).join(', ')}>
            {groups.filter((g) => g.n > 0).map((g) => <span key={g.label} data-seg className="h-full" style={{ width: `${(g.n / groupTotal) * 100}%`, background: TONE[g.tone].color }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[color:var(--app-text-2)]">
            {groups.map((g) => (
              <span key={g.label} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: TONE[g.tone].color }} />{g.label}<b className="tabular-nums text-[color:var(--app-text)]">{g.n}</b><span className="text-[color:var(--app-muted)] tabular-nums">({Math.round((g.n / groupTotal) * 100)}%)</span></span>
            ))}
          </div>
        </div>
      )}

      {/* Slots */}
      <div className="flex-1 px-5 pb-5 pt-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[color:var(--app-text-2)]" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--accent)] border-t-transparent" />Loading data…
          </div>
        ) : slots.length > 0 ? (
          <ul className="space-y-2">
            {slots.map((slot) => {
              const st = statusOf(slot.name); const t = TONE[st.tone]; const n = countOf(slot);
              return (
                <li key={slot.name} data-row>
                  <button
                    type="button"
                    onClick={() => go(slot.name)}
                    className="app-focus group flex w-full items-center gap-3 rounded-xl border bg-[color:var(--app-card)] px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_-18px_rgba(23,25,28,0.4)]"
                    style={{ borderColor: 'var(--app-border)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.background = t.soft; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.background = 'var(--app-card)'; }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: t.soft, color: t.color }}><Clock className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="w-[112px] shrink-0 text-[13px] font-semibold text-[color:var(--app-text)]">{slot.name}</span>
                    <span className="hidden h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-[color:var(--app-hover)] sm:block">
                      <span data-bar className="block h-full rounded-full" style={{ width: `${(n / maxVal) * 100}%`, background: t.color, opacity: n ? 1 : 0.25 }} />
                    </span>
                    <span className="ml-auto w-[88px] shrink-0 text-right text-[12.5px] tabular-nums text-[color:var(--app-text-2)] sm:ml-0"><b className="text-[15px] font-semibold text-[color:var(--app-text)]">{n}</b> {isCheckout ? 'out' : 'in'}</span>
                    <span className="w-[82px] shrink-0 rounded-full py-0.5 text-center text-[11px] font-semibold" style={{ background: t.soft, color: t.color }}>{st.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--app-hover)]"><Clock className="h-5 w-5 text-[color:var(--app-muted)]" aria-hidden="true" /></span>
            <p className="text-[13.5px] font-semibold text-[color:var(--app-text)]">No time-slot data</p>
            <p className="text-[12px] text-[color:var(--app-text-2)]">{isCheckout ? 'Check-out' : 'Check-in'} slot stats appear here once data is available.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeSlotSummary;
