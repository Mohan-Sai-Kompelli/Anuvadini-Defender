import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ShieldCheck, Download } from 'lucide-react';
import { EmptyState, StatCard, SkeletonTable } from '../../components/ui';
import { CalendarCheck, CalendarX, Percent, Clock } from 'lucide-react';

const monthLabel = (m) => {
  if (!m) return '';
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const statusBadge = (status) => {
  const map = {
    present: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400',
    absent: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/50 dark:bg-rose-950/30 dark:text-rose-400',
    leave: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/50 dark:bg-amber-950/30 dark:text-amber-400',
  };
  return map[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-350';
};

const FacultyAttendance = () => {
  const [month, setMonth] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
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
      const [att, sum] = await Promise.all([
        axios.get('/api/portal/my/attendance', { params: { month: m } }),
        axios.get('/api/portal/my/summary', { params: { month: m } }),
      ]);
      setRows(att.data.rows || []);
      setSummary(sum.data.summary);
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (month) load(month);
  }, [month, load]);

  const exportCsv = () => {
    if (!rows.length) return;
    const header = ['Date', 'Check-in', 'Check-out', 'Hours', 'Method', 'FaceVerified', 'Status'];
    const body = rows.map((r) =>
      [(r.date ? `="${r.date}"` : ''), r.firstIn || '', r.lastOut || '', r.hoursWorked ?? '', r.method || '', r.faceVerified ? 'yes' : 'no', r.status].join(',')
    );
    const csv = [header.join(','), ...body].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `my_attendance_${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
              <CalendarCheck className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                Attendance Log
              </span>
              <h1 className="mt-1.5 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">My Attendance</h1>
              <p className="mt-2 text-xs text-emerald-100/70 font-medium">
                {monthLabel(month)} · recorded via the mobile app
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md sm:w-auto sm:min-w-[18rem]">
            <label className="col-span-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200/90">Select Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-white/10 bg-white/15 px-3 py-2 text-sm font-bold text-white outline-none backdrop-blur placeholder-white/70 focus:ring-2 focus:ring-emerald-400 [color-scheme:dark]"
            />
            <button 
              onClick={exportCsv} 
              className="flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/15 px-3 text-xs font-bold text-white transition-all hover:bg-white/20 active:scale-95 disabled:opacity-40" 
              disabled={!rows.length}
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Present Days" value={summary?.presentDays ?? 0} icon={CalendarCheck} accent="success" />
        <StatCard label="Absent Days" value={summary?.absentDays ?? 0} icon={CalendarX} accent="danger" />
        <StatCard label="Attendance Rate" value={`${summary?.attendanceRate ?? 0}%`} icon={Percent} accent="primary" />
        <StatCard label="Avg In / Out" value={`${summary?.avgInTime ?? '—'} · ${summary?.avgOutTime ?? '—'}`} icon={Clock} accent="info" />
      </div>

      <div className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-xl sm:rounded-3xl shadow-slate-250/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        {loading ? (
          <div className="p-5"><SkeletonTable rows={6} /></div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No attendance" description="No check-ins recorded for this month." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Check-in</th>
                  <th className="px-5 py-3 font-semibold">Check-out</th>
                  <th className="px-5 py-3 font-semibold">Hours</th>
                  <th className="px-5 py-3 font-semibold">Method</th>
                  <th className="px-5 py-3 font-semibold">Verified</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {rows.map((r) => (
                  <tr key={r.date} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' })}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.firstIn || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.lastOut || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.hoursWorked != null ? `${r.hoursWorked}h` : '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.firstIn || r.method ? 'Face' : '—'}</td>
                    <td className="px-5 py-3">
                      {r.faceVerified ? (
                        <span className="inline-flex items-center gap-1 text-success-600"><ShieldCheck className="h-3.5 w-3.5" /> Yes</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge(r.status)}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacultyAttendance;

