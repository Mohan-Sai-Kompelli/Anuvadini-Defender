import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowDownLeft, ArrowUpRight, CalendarDays } from 'lucide-react';
import { SkeletonCard } from '../../components/ui';

const monthLabel = (m) => {
  if (!m) return '';
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// status → cell styling
const CELL = {
  present: 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30',
  absent: 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30',
  leave: 'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
  weekend: 'bg-slate-50 text-slate-450 dark:bg-slate-850/40 dark:text-slate-500 border-slate-100 dark:border-slate-800/40',
  none: 'bg-white text-slate-300 dark:bg-slate-900 dark:text-slate-700 border-slate-100 dark:border-slate-800/40',
};

const FacultyCalendar = () => {
  const [month, setMonth] = useState('');
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get('/api/portal/me');
        setMonth(data.context?.latestActivityMonth || new Date().toISOString().slice(0, 7));
      } catch {
        setMonth(new Date().toISOString().slice(0, 7));
      }
    })();
  }, []);

  const load = useCallback(async (m) => {
    if (!m) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/portal/my/attendance', { params: { month: m } });
      const map = {};
      (res.data.rows || []).forEach((r) => { map[r.date] = r; });
      setByDate(map);
    } catch {
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (month) load(month);
  }, [month, load]);

  // Build the grid for the selected month.
  const [y, mm] = (month || '2026-01').split('-').map(Number);
  const firstDow = new Date(y, mm - 1, 1).getDay();
  const daysInMonth = new Date(y, mm, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(y, mm - 1, d).getDay();
    const row = byDate[dateStr];
    let status = 'none';
    if (row) status = row.status;
    else if (dow === 0) status = 'weekend';
    cells.push({ d, dateStr, status, row, isToday: dateStr === today });
  }

  const counts = Object.values(byDate).reduce(
    (a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; },
    {}
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header section */}
      <div className="relative overflow-hidden rounded-[1.35rem] border border-emerald-900/10 bg-gradient-to-br from-[#18233D] via-[#315CE8] to-[#0B1220] p-4 text-white shadow-lg shadow-emerald-950/15 sm:rounded-3xl sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #4A74F0, #6F8DF0, #2748C4)' }} />
        <div className="relative z-10 flex w-full flex-col items-stretch justify-between gap-5 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-col items-center gap-3 text-center md:flex-row md:text-left">
            <div className="h-12 w-12 rounded-2xl sm:h-14 sm:w-14 bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <CalendarDays className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                Visual Calendar
              </span>
              <h1 className="mt-1.5 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">My Calendar</h1>
              <p className="mx-auto mt-2 max-w-[17rem] text-xs font-semibold leading-5 text-emerald-100/75 md:mx-0 md:max-w-none">
                {monthLabel(month)} · visual attendance map
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md sm:w-auto sm:min-w-[18rem]">
            <label className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200/90">Select Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-white/10 bg-white/15 px-3 py-2 text-sm font-bold text-white outline-none backdrop-blur placeholder-white/70 focus:ring-2 focus:ring-emerald-400 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* Legend + counts */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:text-xs">
        <span className="flex min-h-8 items-center gap-1.5 rounded-full bg-white px-2.5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800"><span className={`h-3 w-3 rounded ${CELL.present}`} /> Present ({counts.present || 0})</span>
        <span className="flex min-h-8 items-center gap-1.5 rounded-full bg-white px-2.5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800"><span className={`h-3 w-3 rounded ${CELL.absent}`} /> Absent ({counts.absent || 0})</span>
        <span className="flex min-h-8 items-center gap-1.5 rounded-full bg-white px-2.5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800"><span className={`h-3 w-3 rounded ${CELL.leave}`} /> Leave ({counts.leave || 0})</span>
        <span className="flex min-h-8 items-center gap-1.5 rounded-full bg-white px-2.5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800"><span className={`h-3 w-3 rounded ${CELL.weekend}`} /> Sunday</span>
      </div>

      <div className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white p-3 shadow-xl shadow-slate-250/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-3xl sm:p-6">
        {loading ? (
          <SkeletonCard />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-center text-[9px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-550 sm:text-[11px]">{w}</div>
              ))}
              {cells.map((c, i) =>
                c == null ? (
                  <div key={`e${i}`} />
                ) : (
                  <div
                    key={c.dateStr}
                    title={c.row ? `${c.dateStr}: ${c.status}${c.row.firstIn ? ` · in ${c.row.firstIn}` : ''}${c.row.lastOut ? ` · out ${c.row.lastOut}` : ''}` : c.dateStr}
                    className={`relative flex aspect-square min-h-9 flex-col items-center justify-center rounded-xl border text-xs font-bold transition-all duration-200 hover:scale-[1.02] hover:shadow-sm sm:min-h-12 sm:text-sm ${CELL[c.status]} ${c.isToday ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
                  >
                    <span>{c.d}</span>
                    {c.row?.firstIn && (
                      <span className="mt-0.5 hidden items-center gap-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 min-[430px]:inline-flex">
                        <ArrowDownLeft className="h-2.5 w-2.5" aria-hidden="true" />{c.row.firstIn}
                      </span>
                    )}
                    {c.row?.lastOut && (
                      <span className="hidden items-center gap-0.5 text-[9px] font-medium text-rose-500 dark:text-rose-400 min-[430px]:inline-flex">
                        <ArrowUpRight className="h-2.5 w-2.5" aria-hidden="true" />{c.row.lastOut}
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

      <p className="mx-auto max-w-xs text-center text-[11px] leading-5 text-slate-400 dark:text-slate-500 sm:max-w-none sm:text-xs">
        Tap a day for check-in / check-out details. Data captured via the mobile app.
      </p>
    </div>
  );
};

export default FacultyCalendar;

