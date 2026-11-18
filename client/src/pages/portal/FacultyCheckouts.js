import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { LogOut } from 'lucide-react';
import { Card, EmptyState, SkeletonTable } from '../../components/ui';

const statusBadge = (s) => {
  const map = {
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400',
    rejected: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/50 dark:bg-rose-950/30 dark:text-rose-455',
    pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/50 dark:bg-amber-950/30 dark:text-amber-400',
  };
  return map[(s || '').toLowerCase()] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-350';
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const FacultyCheckouts = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/portal/my/checkouts');
        setData(res.data.data || []);
      } catch {
        toast.error('Failed to load check-out requests');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-[#18233D] via-[#315CE8] to-[#0B1220] shadow-lg p-6 text-white">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #4A74F0, #6F8DF0, #2748C4)' }} />
        <div className="relative flex flex-col md:flex-row items-center gap-6 justify-between w-full z-10">
          <div className="flex flex-col md:flex-row items-center gap-4.5 text-center md:text-left">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <LogOut className="h-7 w-7 rotate-180" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                Check-out Tracker
              </span>
              <h1 className="text-2xl font-black tracking-tight text-white mt-1.5 leading-none font-display">My Check-out Requests</h1>
              <p className="mt-2 text-xs text-emerald-100/70 font-medium">
                Early check-out requests you've raised · approved by your HOD / Admin
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-250/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        {loading ? (
          <div className="p-5"><SkeletonTable rows={5} /></div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No check-out requests" description="You haven't raised any early check-out requests." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Reason / Details</th>
                  <th className="px-5 py-3 font-semibold">Applied On</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {data.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{fmt(c.date)}</td>
                    <td className="px-5 py-3 max-w-md truncate text-slate-750 dark:text-slate-250">{c.details || '—'}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{fmt(c.appliedOn)}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge(c.status)}`}>{c.status}</span>
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

export default FacultyCheckouts;
