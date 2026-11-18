import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CalendarCheck, FileText, AlertTriangle, CheckCircle2, XSquare,
  Check, Ban, Eye, Lock, Paperclip
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card, EmptyState, SkeletonTable, StatCard, ConfirmDialog } from '../components/ui';
import ScrollReveal from '../components/ScrollReveal';

const STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const TYPE_LABEL = {
  missing_check_in: 'Missing Check-In',
  missing_check_out: 'Missing Check-Out',
  both: 'Missing Check-In & Check-Out',
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const AttendanceRegularization = () => {
  const navigate = useNavigate();
  const { userType, viewAsOrg } = useAuth();
  const readOnly = userType === 'superadmin' && !!viewAsOrg;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const [actionModal, setActionModal] = useState(null); // { type: 'approve'|'reject', id }
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/regularization/org');
      if (data.success) setRequests(data.requests || []);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to load regularization requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const activeRequests = React.useMemo(() => {
    return requests.filter((r) => (r.status || '').toLowerCase() !== 'cancelled');
  }, [requests]);

  const regStats = React.useMemo(() => {
    const total = activeRequests.length;
    let pending = 0, approved = 0, rejected = 0;
    activeRequests.forEach((r) => {
      const s = (r.status || 'pending').toLowerCase();
      if (s === 'pending') pending++;
      else if (s === 'approved') approved++;
      else if (s === 'rejected') rejected++;
    });
    return { total, pending, approved, rejected };
  }, [activeRequests]);

  const filteredRequests = activeRequests.filter((r) => {
    const s = (r.status || 'pending').toLowerCase();
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return s === 'pending';
    if (activeTab === 'approved') return s === 'approved';
    if (activeTab === 'rejected') return s === 'rejected';
    return true;
  });

  const handleAction = async () => {
    if (actionModal.type === 'reject' && !remarks.trim()) {
      toast.error('Remarks are required for rejection.');
      return;
    }
    setActionLoading(true);
    try {
      const { data } = await axios.post(`/api/regularization/org/${actionModal.id}/action`, {
        action: actionModal.type,
        adminRemarks: remarks,
      });
      if (data.success) {
        toast.success(`Request ${actionModal.type}d successfully`);
        setActionModal(null);
        setRemarks('');
        fetchRequests();
      }
    } catch (err) {
      if (err?.code === 'ERR_READ_ONLY_VIEW') {
        // read-only guard already toasted
      } else {
        toast.error(err?.response?.data?.error || `Failed to ${actionModal.type} request`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ScrollReveal y={28} duration={800} blur={0} className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
      <div className="min-w-0">
        <div className="kicker-label mb-1 text-emerald-700 dark:text-emerald-400">
          ATTENDANCE REGULARIZATION APPROVALS
        </div>
        <h1
          className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
          style={{ fontFamily: "'Geist','Inter',sans-serif" }}
        >
          Attendance Regularization
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
          Review and approve manual attendance adjustments requested by your staff for missed punches.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            activeTab === 'all'
              ? '!border-2 !border-emerald-500 bg-white shadow-md scale-[1.02] dark:bg-slate-900'
              : 'border border-slate-200/70 bg-white hover:scale-[1.01] dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total</p>
          <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">{regStats.total}</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            activeTab === 'pending'
              ? '!border-2 !border-amber-500 bg-amber-50 shadow-md scale-[1.02] dark:bg-amber-950/30'
              : 'border border-amber-100 bg-amber-50/70 hover:scale-[1.01] dark:border-amber-900/30 dark:bg-amber-950/20'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Pending</p>
          <p className="mt-1 text-xl font-black text-amber-700 dark:text-amber-300">{regStats.pending}</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('approved')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            activeTab === 'approved'
              ? '!border-2 !border-emerald-500 bg-emerald-50 shadow-md scale-[1.02] dark:bg-emerald-950/30'
              : 'border border-emerald-100 bg-emerald-50/70 hover:scale-[1.01] dark:border-emerald-900/30 dark:bg-emerald-950/20'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Approved</p>
          <p className="mt-1 text-xl font-black text-emerald-700 dark:text-emerald-300">{regStats.approved}</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rejected')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            activeTab === 'rejected'
              ? '!border-2 !border-rose-500 bg-rose-50 shadow-md scale-[1.02] dark:bg-rose-950/30'
              : 'border border-rose-100 bg-rose-50/70 hover:scale-[1.01] dark:border-rose-900/30 dark:bg-rose-950/20'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600">Rejected</p>
          <p className="mt-1 text-xl font-black text-rose-700 dark:text-rose-300">{regStats.rejected}</p>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/50 bg-white/80 p-3 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/80 sm:rounded-3xl sm:p-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
              activeTab === t.key
                ? 'bg-slate-900 text-white shadow-md dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          {filteredRequests.length} listed
        </span>
      </div>

      {loading ? (
        <div className="glass p-4">
          <SkeletonTable rows={5} cols={6} />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="glass p-8">
          <EmptyState
            icon={FileText}
            title="No requests found"
            message="Regularization requests submitted from the app will appear here."
          />
        </div>
      ) : (
        <Card noPadding className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max table-auto border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/60 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900">
                  <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Employee</th>
                  <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Date</th>
                  <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Type</th>
                  <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Reason</th>
                  <th className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Status</th>
                  <th className="p-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRequests.map((r) => (
                  <tr key={r._id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/25">
                    <td className="p-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-200">{r.student?.fullName || 'Unknown'}</div>
                      <div className="text-[11px] text-slate-500">{r.student?.uid}</div>
                    </td>
                    <td className="p-4 font-medium text-slate-600 dark:text-slate-300">{fmtDate(r.date)}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-300">{TYPE_LABEL[r.type] || r.type}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {r.reasonType}
                        </span>
                        {(r.evidenceData || r.evidenceUrl) && (
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" title="Evidence attached" />
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold ${STATUS_STYLE[r.status] || STATUS_STYLE.pending}`}>
                        {(r.status || 'pending').toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === 'pending' && (
                          readOnly ? (
                            <button
                              type="button"
                              onClick={() =>
                                toast.error('Read-only institute view — exit it to make changes.', { id: 'readonly-view' })
                              }
                              className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
                              title="Editing is disabled in Read-Only Mode."
                            >
                              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Read-only
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                aria-label="Approve request"
                                className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                                onClick={() => setActionModal({ type: 'approve', id: r._id })}
                              >
                                <Check className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label="Reject request"
                                className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-450 dark:hover:bg-rose-900/50"
                                onClick={() => setActionModal({ type: 'reject', id: r._id })}
                              >
                                <Ban className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </>
                          )
                        )}
                        <button
                          type="button"
                          aria-label="View details"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-450 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          onClick={() => navigate(`/regularization/${r._id}`, { state: { request: r } })}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={actionModal !== null}
        variant={actionModal?.type === 'reject' ? 'danger' : 'primary'}
        title={actionModal?.type === 'approve' ? 'Approve request?' : 'Reject request?'}
        confirmLabel={actionModal?.type === 'approve' ? 'Approve' : 'Reject'}
        loading={actionLoading}
        message={
          <span className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">
              {actionModal?.type === 'approve'
                ? "This will create the employee's missing attendance record(s) for the requested date. You can leave optional remarks."
                : 'Provide a reason for rejecting this regularization request.'}
            </span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={actionModal?.type === 'reject' ? 'Reason for rejection (required)...' : 'Optional remarks...'}
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </span>
        }
        onConfirm={handleAction}
        onCancel={() => {
          setActionModal(null);
          setRemarks('');
        }}
      />

    </ScrollReveal>
  );
};

export default AttendanceRegularization;
