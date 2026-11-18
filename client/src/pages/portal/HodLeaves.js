import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlertTriangle, Paperclip, Info } from 'lucide-react';
import { Card, EmptyState, SkeletonTable } from '../../components/ui';
import { openLeaveAttachment } from '../../utils/downloadAttachment';
import { buildLeaveDetailTooltip } from '../../components/RequestCard';

const STATUSES = ['pending', 'approved', 'rejected', 'all'];

const statusBadge = (status) => {
  const map = {
    approved: 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    rejected: 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
    pending: 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
  };
  return map[status] || 'bg-slate-100 text-slate-600';
};

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const HodLeaves = () => {
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (st) => {
    setLoading(true);
    try {
      const res = await axios.get('/api/portal/hod/leaves', { params: st === 'all' ? {} : { status: st } });
      setData(res.data.data || []);
    } catch {
      toast.error('Failed to load leave requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Leave Requests</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Department members' leave applications</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                status === s
                  ? 'bg-white text-primary-700 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <Card noPadding>
        {loading ? (
          <div className="p-5"><SkeletonTable rows={5} /></div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No requests" description={`No ${status === 'all' ? '' : status} leave requests.`} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Member</th>
                  <th className="px-5 py-3 font-semibold">Designation</th>
                  <th className="px-5 py-3 font-semibold">From</th>
                  <th className="px-5 py-3 font-semibold">To</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Attachments</th>
                  <th className="px-5 py-3 font-semibold">Applied</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {data.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {l.memberName}
                      <span className="ml-1 text-xs text-slate-400">({l.memberUid})</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{l.designation || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{fmt(l.from)}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{fmt(l.to)}</td>
                    <td className="px-5 py-3 max-w-xs text-slate-700 dark:text-slate-200">
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
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{fmt(l.appliedOn)}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge(l.status)}`}>{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default HodLeaves;
