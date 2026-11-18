import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Share of present among marked people -> tint level. */
const tone = (c) => {
  if (!c || c.total === 0) return null;
  const r = c.present / c.total;
  if (r >= 0.85) return { bg: 'var(--accent-soft)', bd: 'var(--accent-border)', label: 'High' };
  if (r >= 0.6) return { bg: '#fdf6df', bd: '#f0e1a8', label: 'Medium' };
  return { bg: '#fbeceb', bd: '#f1c9c5', label: 'Low' };
};

/** Month view of organisation-wide attendance with keyboard navigation and a detail strip. */
const AttendanceCalendar = () => {
  const reduce = useReducedMotion();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [dir, setDir] = useState(1);
  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [focusDay, setFocusDay] = useState(now.getDate());
  const gridRef = useRef(null);

  const load = useCallback(() => {
    let live = true;
    setLoading(true); setFailed(false);
    const last = new Date(cursor.y, cursor.m + 1, 0).getDate();
    axios.get('/api/attendance/reports/range', { params: { start: ymd(cursor.y, cursor.m, 1), end: ymd(cursor.y, cursor.m, last) } })
      .then((res) => {
        if (!live) return;
        const agg = {};
        (res.data.students || []).forEach((s) => {
          Object.entries(s.cells || {}).forEach(([d, v]) => {
            if (!v) return;
            const a = agg[d] || (agg[d] = { present: 0, absent: 0, leave: 0, total: 0 });
            if (v === 'P') a.present += 1; else if (v === 'A') a.absent += 1; else if (v === 'L') a.leave += 1;
            a.total += 1;
          });
        });
        setDays(agg); setLoading(false);
      })
      .catch(() => { if (live) { setFailed(true); setLoading(false); setDays({}); } });
    return () => { live = false; };
  }, [cursor]);
  useEffect(() => load(), [load]);

  const info = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    return { offset: (first.getDay() + 6) % 7, count: new Date(cursor.y, cursor.m + 1, 0).getDate() };
  }, [cursor]);

  const go = (delta) => {
    setDir(delta); setSelected(null);
    setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    setFocusDay(1);
  };

  const onKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = focusDay + step;
    if (next < 1 || next > info.count) return;
    setFocusDay(next);
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-day="${next}"]`)?.focus());
  };

  const title = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selKey = selected ? ymd(cursor.y, cursor.m, selected) : null;
  const sel = selKey ? days[selKey] : null;
  const todayKey = ymd(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <section className="app-card p-5" aria-labelledby="att-cal">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 id="att-cal" className="text-[15px] font-semibold text-[color:var(--app-text)]">Attendance calendar</h2>
          <p className="text-[12px] text-[color:var(--app-text-2)]">Share of the team present each day.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="app-btn app-btn--ghost !px-2" onClick={() => go(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[128px] text-center text-[13px] font-semibold text-[color:var(--app-text)]" aria-live="polite">{title}</span>
          <button type="button" className="app-btn app-btn--ghost !px-2" onClick={() => go(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${cursor.y}-${cursor.m}`}
            initial={reduce ? false : { opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 * dir }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--app-muted)]" aria-hidden="true">
              {WEEK.map((w) => <span key={w}>{w}</span>)}
            </div>
            <div ref={gridRef} role="grid" aria-label={title} onKeyDown={onKey} className="mt-1.5 grid grid-cols-7 gap-1.5" style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .2s' }}>
              {Array.from({ length: info.offset }).map((_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: info.count }, (_, i) => i + 1).map((d) => {
                const key = ymd(cursor.y, cursor.m, d);
                const c = days[key];
                const t = tone(c);
                const on = selected === d;
                return (
                  <button
                    key={d} type="button" role="gridcell" data-day={d}
                    tabIndex={focusDay === d ? 0 : -1}
                    aria-selected={on}
                    aria-label={`${d} ${title}${c ? `, ${c.present} present, ${c.absent} absent, ${c.leave} on leave` : ', no data'}`}
                    onClick={() => { setSelected(on ? null : d); setFocusDay(d); }}
                    className="app-focus relative flex aspect-square min-h-[40px] flex-col items-center justify-center rounded-lg border text-[12.5px] font-medium text-[color:var(--app-text)] transition-colors duration-150 hover:brightness-95"
                    style={{ background: t ? t.bg : 'transparent', borderColor: on ? 'var(--accent)' : t ? t.bd : 'var(--app-border)', boxShadow: on ? '0 0 0 2px var(--accent-soft)' : 'none' }}
                  >
                    <span className="tnum">{d}</span>
                    {key === todayKey && <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[color:var(--app-text-2)]">
        {[['var(--accent-soft)', 'var(--accent-border)', '85% or more present'], ['#fdf6df', '#f0e1a8', '60 to 84%'], ['#fbeceb', '#f1c9c5', 'Below 60%']].map(([bg, bd, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border" style={{ background: bg, borderColor: bd }} aria-hidden="true" />{l}</span>
        ))}
      </div>

      <div className="mt-3 min-h-[44px] rounded-xl bg-[color:var(--app-bg)] px-3.5 py-2.5 text-[13px]" aria-live="polite">
        {failed ? (
          <span className="text-[color:var(--app-text-2)]">Calendar could not be loaded. <button type="button" className="app-focus rounded font-medium text-[color:var(--accent)] underline" onClick={load}>Try again</button></span>
        ) : selected && sel ? (
          <span className="text-[color:var(--app-text)]"><strong>{selected} {title}:</strong> <span className="tnum">{sel.present}</span> present, <span className="tnum">{sel.absent}</span> absent, <span className="tnum">{sel.leave}</span> on leave of <span className="tnum">{sel.total}</span>.</span>
        ) : selected ? (
          <span className="text-[color:var(--app-text-2)]">No attendance is recorded for this day yet.</span>
        ) : (
          <span className="text-[color:var(--app-text-2)]">Select a day to see who was present, absent, or on leave.</span>
        )}
      </div>
    </section>
  );
};

export default AttendanceCalendar;
