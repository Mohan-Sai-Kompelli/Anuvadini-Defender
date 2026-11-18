import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CalendarDays } from 'lucide-react';
import { Card, EmptyState, SkeletonTable } from '../../components/ui';

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const FacultyHolidays = () => {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/holidays');
        const list = res.data.holidays || res.data.data || [];
        setHolidays([...list].sort((a, b) => new Date(a.date) - new Date(b.date)));
      } catch {
        toast.error('Failed to load holidays');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const now = new Date();
  const upcoming = holidays.filter((h) => new Date(h.date) >= new Date(now.toDateString()));

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-[#18233D] via-[#315CE8] to-[#0B1220] shadow-lg p-6 text-white">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #4A74F0, #6F8DF0, #2748C4)' }} />
        <div className="relative flex flex-col md:flex-row items-center gap-6 justify-between w-full z-10">
          <div className="flex flex-col md:flex-row items-center gap-4.5 text-center md:text-left">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <CalendarDays className="h-7 w-7" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                Institutional Calendar
              </span>
              <h1 className="text-2xl font-black tracking-tight text-white mt-1.5 leading-none font-display">Holidays</h1>
              <p className="mt-2 text-xs text-emerald-100/70 font-medium">
                Government &amp; institutional holidays — plan your leave around these
              </p>
            </div>
          </div>
        </div>
      </div>

      {!loading && upcoming[0] && (
        <div className="overflow-hidden rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-4 shadow-sm border-l-4 border-l-emerald-500 dark:border-emerald-900/40 dark:bg-emerald-950/10 dark:shadow-none flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">Next Holiday</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {upcoming[0].name} · {fmt(upcoming[0].date)}
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-250/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        {loading ? (
          <div className="p-5"><SkeletonTable rows={6} /></div>
        ) : holidays.length === 0 ? (
          <div className="p-5"><EmptyState title="No holidays" description="No holidays configured." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Holiday</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {holidays.map((h, i) => {
                  const past = new Date(h.date) < new Date(now.toDateString());
                  return (
                    <tr key={h._id || i} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${past ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3 font-medium text-slate-850 dark:text-slate-150">{fmt(h.date)}</td>
                      <td className="px-5 py-3 text-slate-750 dark:text-slate-250">{h.name}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-pill bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-650 dark:bg-slate-800/40 dark:text-slate-350">
                          {h.organization ? 'Institutional' : 'Government'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacultyHolidays;
