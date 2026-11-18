import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ClipboardCheck, Search, ChevronLeft, ChevronRight, X, AlertTriangle, FileText, CheckCircle2,
  CalendarCheck, Clock, CheckSquare, XSquare, Building2, User
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { regularizationAPI as api } from '../../services/api';

const STATUS_MAP = {
  pending: { label: 'Pending', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  approved: { label: 'Approved', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  rejected: { label: 'Rejected', chip: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  cancelled: { label: 'Cancelled', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

const TYPE_MAP = {
  missing_check_in: 'Missing Check-In',
  missing_check_out: 'Missing Check-Out',
  both: 'Missing Check-In & Check-Out',
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtTimeOnly = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const getEvidenceUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base =
    axios.defaults.baseURL ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

const SuperAdminRegularization = () => {
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  
  // Modals
  const [viewRequest, setViewRequest] = useState(null);
  const [evidenceLoadFailed, setEvidenceLoadFailed] = useState(false);
  const [actionModal, setActionModal] = useState(null); // { type: 'approve'|'reject', reqId }
  const [remarks, setRemarks] = useState('');

  const fetchStats = async () => {
    try {
      const res = await api.superAdminStats();
      if (res.success) setStats(res.stats);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRequests = async (currentPage = page) => {
    try {
      setLoading(true);
      const res = await api.superAdminList({ page: currentPage, pageSize: 20, status: statusFilter, search });
      if (res.success) {
        setRequests(res.requests);
        setTotalItems(res.total);
      }
    } catch (e) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchRequests(1);
    setPage(1);
  }, [statusFilter]);

  // Support search on Enter key
  const handleSearchKey = (e) => {
    if (e.key === 'Enter') {
      fetchRequests(1);
      setPage(1);
    }
  };

  const handleAction = async () => {
    if (actionModal.type === 'reject' && !remarks.trim()) {
      return toast.error('Remarks are required for rejection.');
    }
    
    try {
      const res = await api.superAdminAction(actionModal.reqId, {
        action: actionModal.type,
        adminRemarks: remarks
      });
      if (res.success) {
        toast.success(`Request ${actionModal.type}d successfully`);
        setActionModal(null);
        setViewRequest(null);
        setRemarks('');
        fetchStats();
        fetchRequests(page);
      }
    } catch (e) {
      toast.error(e.response?.data?.error || `Failed to ${actionModal.type} request`);
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8 fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-primary-500" />
          Attendance Regularization
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Review and approve manual attendance adjustments requested by staff.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={stats.total} icon={FileText} accent="info" />
        <StatCard label="Pending" value={stats.pending} icon={AlertTriangle} accent="warning" />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} accent="success" />
        <StatCard label="Rejected" value={stats.rejected} icon={XSquare} accent="danger" />
      </div>

      {/* Toolbar */}
      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 w-full md:w-auto">
          {['all', 'pending', 'approved', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </Card>

      {/* Data Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Employee</th>
                <th className="py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Date</th>
                <th className="py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Type</th>
                <th className="py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Reason</th>
                <th className="py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Status</th>
                <th className="py-3 px-4 font-medium text-slate-500 dark:text-slate-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500">Loading requests...</td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12">
                    <EmptyState
                      icon={FileText}
                      title="No requests found"
                      description="No regularization requests match your filters."
                    />
                  </td>
                </tr>
              ) : (
                requests.map(r => (
                  <tr key={r._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/25 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-200">
                        {r.student?.fullName || 'Unknown'}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3" />
                        {r.organization?.name || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">
                      {fmtDate(r.date)}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {TYPE_MAP[r.type] || r.type}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-slate-700 dark:text-slate-300 font-medium text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        {r.reasonType}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold ${STATUS_MAP[r.status]?.chip || STATUS_MAP.pending.chip}`}>
                        {STATUS_MAP[r.status]?.label || 'Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => { setViewRequest(r); setEvidenceLoadFailed(false); }}
                        className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 px-3 py-1.5 rounded bg-primary-50 dark:bg-primary-500/10 hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalItems > 20 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, totalItems)} of {totalItems}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => { setPage(p => p - 1); fetchRequests(page - 1); }}
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page * 20 >= totalItems}
                onClick={() => { setPage(p => p + 1); fetchRequests(page + 1); }}
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Review Modal */}
      {viewRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Review Regularization Request</h2>
              <button onClick={() => setViewRequest(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 flex-1 overflow-y-auto bg-white dark:bg-slate-900">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Employee</p>
                  <p className="font-medium text-slate-900 dark:text-white">{viewRequest.student?.fullName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{viewRequest.organization?.name}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold ${STATUS_MAP[viewRequest.status]?.chip}`}>
                    {STATUS_MAP[viewRequest.status]?.label}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border border-slate-100 dark:border-slate-800 rounded-lg p-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Date</p>
                  <p className="font-medium text-slate-900 dark:text-white">{fmtDate(viewRequest.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Request Type</p>
                  <p className="font-medium text-slate-900 dark:text-white">{TYPE_MAP[viewRequest.type]}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Requested Check-In</p>
                  <p className="font-medium text-slate-900 dark:text-white flex items-center gap-1">
                    <Clock className="h-3 w-3 text-emerald-500" />
                    {fmtTimeOnly(viewRequest.requestedCheckInTime)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Requested Check-Out</p>
                  <p className="font-medium text-slate-900 dark:text-white flex items-center gap-1">
                    <Clock className="h-3 w-3 text-red-500" />
                    {fmtTimeOnly(viewRequest.requestedCheckOutTime)}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Reason: {viewRequest.reasonType}</h3>
                <div className="p-3 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 rounded-lg text-sm border border-amber-100 dark:border-amber-500/20">
                  {viewRequest.description}
                </div>
              </div>

              {viewRequest.evidenceUrl && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Evidence / Proof</h3>
                  {viewRequest.evidenceUrl.endsWith('.pdf') ? (
                    <a
                      href={getEvidenceUrl(viewRequest.evidenceUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <FileText className="h-4 w-4" /> View PDF Document
                    </a>
                  ) : evidenceLoadFailed ? (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span>
                        Evidence image could not be loaded.{' '}
                        <a
                          href={getEvidenceUrl(viewRequest.evidenceUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary-600 underline hover:text-primary-700 dark:text-primary-400"
                        >
                          Try opening directly
                        </a>
                      </span>
                    </div>
                  ) : (
                    <img
                      src={getEvidenceUrl(viewRequest.evidenceUrl)}
                      alt="Evidence"
                      className="max-h-64 rounded-lg border border-slate-200 dark:border-slate-700 object-cover"
                      onError={() => setEvidenceLoadFailed(true)}
                    />
                  )}
                </div>
              )}

              {viewRequest.status !== 'pending' && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 mb-2">
                  <p className="text-xs text-slate-500 mb-1">Action taken by {viewRequest.actionBy} on {fmtDate(viewRequest.actionDate)}</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Admin Remarks:</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{viewRequest.adminRemarks || 'No remarks provided.'}</p>
                </div>
              )}
            </div>

            {viewRequest.status === 'pending' ? (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-end gap-3 rounded-b-xl shrink-0">
                <button
                  onClick={() => setActionModal({ type: 'reject', reqId: viewRequest._id })}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20"
                >
                  Reject
                </button>
                <button
                  onClick={() => setActionModal({ type: 'approve', reqId: viewRequest._id })}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700"
                >
                  Approve Request
                </button>
              </div>
            ) : (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-end rounded-b-xl shrink-0">
                <button
                  onClick={() => setViewRequest(null)}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-slate-700 bg-slate-150 hover:bg-slate-200 dark:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Action Modal (Approve/Reject confirmation) */}
      {actionModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {actionModal.type === 'approve' ? 'Approve Request' : 'Reject Request'}
              </h3>
              <p className="text-sm text-slate-500">
                {actionModal.type === 'approve' 
                  ? 'This will update the employee\'s attendance record for the requested date. You can leave optional remarks.' 
                  : 'Please provide a reason for rejecting this regularization request.'}
              </p>
              
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={actionModal.type === 'reject' ? "Reason for rejection (Required)..." : "Optional remarks..."}
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary-500 min-h-[100px]"
              />

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => { setActionModal(null); setRemarks(''); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAction}
                  className={`px-4 py-2 rounded-lg text-sm font-bold text-white ${
                    actionModal.type === 'approve' 
                      ? 'bg-emerald-600 hover:bg-emerald-700' 
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  Confirm {actionModal.type === 'approve' ? 'Approval' : 'Rejection'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SuperAdminRegularization;
