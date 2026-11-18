import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, X, GitPullRequestClosed, AlertTriangle, Paperclip, Info } from 'lucide-react';
import { Card, EmptyState, SkeletonTable } from '../../components/ui';
import { openLeaveAttachment } from '../../utils/downloadAttachment';
import { buildLeaveDetailTooltip } from '../../components/RequestCard';

const statusBadge = (status) => {
  const map = {
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400',
    rejected: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/50 dark:bg-rose-950/30 dark:text-rose-455',
    pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/50 dark:bg-amber-950/30 dark:text-amber-400',
  };
  return map[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-350';
};

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const FacultyLeaves = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/portal/my/leaves');
      setData(res.data.data || []);
    } catch {
      toast.error('Failed to load leaves');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate || !form.reason.trim()) {
      toast.error('Please fill start date, end date and reason');
      return;
    }
    const todayStr = getTodayString();
    if (form.startDate < todayStr) {
      toast.error('Start date cannot be in the past');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      toast.error('End date cannot be before start date');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post('/api/leaves/apply', {
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
      });
      toast.success('Leave request submitted');
      setShowForm(false);
      setForm({ startDate: '', endDate: '', reason: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit leave');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-[#18233D] via-[#315CE8] to-[#0B1220] shadow-lg p-6 text-white">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #4A74F0, #6F8DF0, #2748C4)' }} />
        <div className="relative flex flex-col md:flex-row items-center gap-6 justify-between w-full z-10">
          <div className="flex flex-col md:flex-row items-center gap-4.5 text-center md:text-left">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <GitPullRequestClosed className="h-7 w-7" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                Leave Tracker
              </span>
              <h1 className="text-2xl font-black tracking-tight text-white mt-1.5 leading-none font-display">My Leaves</h1>
              <p className="mt-2 text-xs text-emerald-100/70 font-medium">
                Apply for leave and track approval status from your HOD / Admin
              </p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 text-xs font-bold text-white shadow-md shadow-amber-650/20 hover:from-amber-600 hover:to-amber-700 active:scale-95 transition-all cursor-pointer">
            <Plus className="h-4 w-4" /> Apply for Leave
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-250/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        {loading ? (
          <div className="p-5"><SkeletonTable rows={5} /></div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No leave requests" description="You haven't applied for any leave yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Applied On</th>
                  <th className="px-5 py-3 font-semibold">From</th>
                  <th className="px-5 py-3 font-semibold">To</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Attachments</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {data.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{fmt(l.appliedOn)}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{fmt(l.from)}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{fmt(l.to)}</td>
                    <td className="px-5 py-3 max-w-xs text-slate-750 dark:text-slate-250">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {l.leaveType && (
                          <span className="inline-flex items-center rounded-pill bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {l.leaveType}
                          </span>
                        )}
                        {l.isEmergency && (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Emergency
                          </span>
                        )}
                        {buildLeaveDetailTooltip(l) && (
                          <span title={buildLeaveDetailTooltip(l)} className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                            <Info className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                      <p className="truncate">{l.reason || '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      {l.attachments?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {l.attachments.map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              onClick={() => openLeaveAttachment(att.url, att.originalName)}
                              className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-400"
                              title={att.originalName}
                            >
                              <Paperclip className="h-3 w-3" aria-hidden="true" />
                              {att.category === 'medical' ? 'Medical' : 'Doc'}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge(l.status)}`}>{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Apply leave modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl bg-white shadow-2xl shadow-slate-950/30 border border-slate-200/60 p-6 dark:bg-slate-900 dark:border-slate-800 backdrop-blur-md transition-all duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <GitPullRequestClosed className="h-5 w-5 text-emerald-600 dark:text-emerald-450" /> Apply for Leave
              </h3>
              <button onClick={() => setShowForm(false)} className="rounded-xl p-2 text-slate-550 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">From Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => form.startDate !== e.target.value && setForm((f) => ({ ...f, startDate: e.target.value }))} min={getTodayString()} className="input mt-1.5 w-full rounded-xl border border-slate-250 bg-slate-50/50 px-3.5 py-2 text-sm font-semibold text-slate-805 focus:outline-none dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 [color-scheme:light] dark:[color-scheme:dark]" required />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">To Date</label>
                  <input type="date" value={form.endDate} onChange={(e) => form.endDate !== e.target.value && setForm((f) => ({ ...f, endDate: e.target.value }))} min={form.startDate || getTodayString()} className="input mt-1.5 w-full rounded-xl border border-slate-250 bg-slate-50/50 px-3.5 py-2 text-sm font-semibold text-slate-805 focus:outline-none dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 [color-scheme:light] dark:[color-scheme:dark]" required />
                </div>
              </div>.
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Reason / Details</label>
                <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} className="input mt-1.5 w-full rounded-xl border border-slate-250 bg-slate-50/50 px-3.5 py-2 text-sm font-medium text-slate-800 focus:outline-none dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="State reason for leave" required />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-250 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-300 transition-all">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold disabled:opacity-40 transition-all cursor-pointer">{submitting ? 'Submitting…' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyLeaves;
