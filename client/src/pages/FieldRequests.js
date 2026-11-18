import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Check,
  Eye,
  FileText,
  FilterX,
  Image as ImageIcon,
  RefreshCw,
  X,
  Lock,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { parseISO } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/RequestCard';
import { isCustomTimeWindow, formatISTMonthDay, formatISTClockTime, formatISTFullDate } from '../utils/formatRequestWindow';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  SkeletonTable,
} from '../components/ui';

const API_BASE_URL = '/api';

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

const NO_RESPONSE_REASON = 'Admin did not respond before the field duty start date';

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const isFutureOrToday = (dateStr) => {
  if (!dateStr) return false;
  try {
    const date = parseISO(dateStr);
    date.setHours(0, 0, 0, 0);
    return date >= startOfToday();
  } catch {
    return false;
  }
};

const isActionablePending = (request) =>
  request?.status?.toLowerCase() === 'pending' && isFutureOrToday(request.startDate);


function FieldRequestSelect({ value, options, onChange, placeholder = 'Select', className = '' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => String(option.value) === String(value));
  const containerRef = React.useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative min-w-0 ${open ? 'z-[120]' : 'z-0'} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[2.65rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-800 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[999] mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-elevation-3 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-elevation-3-dark"
          data-lenis-prevent
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full min-w-0 px-3.5 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-800 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-slate-800'
                }`}
                role="option"
                aria-selected={isSelected}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
const FieldRequestMobileCard = ({ request, summary, readOnly, onAction, startLabel, endLabel }) => {
  const canReview = isActionablePending(request);

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">
            {request.student?.fullName || 'Unknown'}
          </p>
          <p className="mt-0.5 break-all text-xs font-semibold text-slate-500 dark:text-slate-400">
            {request.student?.uid || request.student?.email || 'N/A'}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Event</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">
          {request.eventTitle || 'No event title'}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">Start</p>
          <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{startLabel}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">End</p>
          <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{endLabel}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold dark:bg-slate-800">
          {request.days || '-'} days
        </span>
        {request.evidence?.length > 0 && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            {request.evidence.length} evidence photo{request.evidence.length > 1 ? 's' : ''}
          </span>
        )}
        {summary ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold dark:bg-slate-800">
            {summary.photos} photos · {summary.docs} docs
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold dark:bg-slate-800">No report</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {canReview && !readOnly && (
          <>
            <button
              type="button"
              onClick={() => onAction(request, 'approve')}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onAction(request, 'reject')}
              className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm"
            >
              Reject
            </button>
          </>
        )}
        {canReview && readOnly && (
          <button
            type="button"
            onClick={() => toast.error('Read-only institute view - exit it to make changes.', { id: 'readonly-view' })}
            className="col-span-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
          >
            Read-only
          </button>
        )}
        <button
          type="button"
          onClick={() => onAction(request, 'view')}
          className={`${canReview && !readOnly ? 'col-span-2' : 'col-span-2'} rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200`}
        >
          View Details
        </button>
      </div>
    </div>
  );
};
const FieldRequests = () => {
  const navigate = useNavigate();
  const { userType, viewAsOrg } = useAuth();
  const readOnly = userType === 'superadmin' && !!viewAsOrg;
  const [fieldRequests, setFieldRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dialog states (approve/reject confirmation only — "view" navigates to a
  // full detail page instead of opening a dialog).
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState(''); // 'approve' | 'reject'
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Filter states
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [noResponseOpen, setNoResponseOpen] = useState(false);

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAuthToken = () =>
    localStorage.getItem('token') || sessionStorage.getItem('token');

  const apiCall = async (url, options = {}) => {
    const token = getAuthToken();
    const config = {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };
    try {
      const response = await axios(url, config);
      return response.data;
    } catch (err) {
      console.error('API call failed:', err);
      throw err.response?.data || err;
    }
  };

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiCall(`${API_BASE_URL}/field-requests/all`);
      if (res.success) {
        setFieldRequests(res.data.requests || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load out reach duty requests');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAction = (request, action) => {
    if (action === 'view') {
      navigate(`/field-requests/${request._id}`, { state: { request } });
      return;
    }
    setSelectedRequest(request);
    setActionType(action);
    setDialogOpen(true);
    setRejectionReason('');
  };

  const confirmAction = async () => {
    if (!selectedRequest) return;
    setActionLoading(true);
    try {
      const payload = {
        status: actionType === 'approve' ? 'approved' : 'rejected',
      };
      if (actionType === 'reject' && rejectionReason.trim()) {
        payload.reson = rejectionReason.trim();
      }

      const response = await apiCall(
        `${API_BASE_URL}/field-requests/update-status/${selectedRequest._id}`,
        { method: 'PUT', data: payload }
      );

      if (response.success) {
        toast.success(
          `Request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`
        );
        setDialogOpen(false);
        await loadRequests();
      }
    } catch (err) {
      setError(err.message || 'Failed to update request');
      toast.error(err.message || 'Failed to update request');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return formatISTFullDate(dateStr);
  };

  // Outreach can be a same-day custom "out at X, back at Y" window (mobile
  // bakes the exact time into startDate/endDate) — show the clock time too in
  // that case, not just the date, otherwise the time-out/time-in gets lost.
  const formatRequestDate = (request, field) => {
    const dateStr = request?.[field];
    if (!dateStr) return 'N/A';
    if (isCustomTimeWindow(request.startDate, request.endDate)) {
      return `${formatISTMonthDay(dateStr)}, ${formatISTClockTime(dateStr)}`;
    }
    return formatDate(dateStr);
  };

  const filterRequests = (requests) => {
    let filtered = requests.filter((req) => req.status?.toLowerCase() !== 'cancelled');
    if (statusFilter !== 'all') {
      filtered = filtered.filter(
        (req) => req.status?.toLowerCase() === statusFilter
      );
    }
    if (dateFilter) {
      filtered = filtered.filter((req) => {
        try {
          const start = parseISO(req.startDate);
          const end = parseISO(req.endDate);
          const day = parseISO(dateFilter);
          return day >= new Date(start.setHours(0, 0, 0, 0)) &&
            day <= new Date(end.setHours(23, 59, 59, 999));
        } catch {
          return true;
        }
      });
    }
    return filtered;
  };

  const reportSummary = (request) => {
    const r = request.report || {};
    const photos = r.photos?.length || 0;
    const docs = r.documents?.length || 0;
    if (!r.submittedAt && !photos && !docs && !r.notes) return null;
    return { photos, docs, notes: r.notes, submittedAt: r.submittedAt };
  };

  const activeFieldRequests = React.useMemo(() => {
    return fieldRequests.filter((req) => req.status?.toLowerCase() !== 'cancelled');
  }, [fieldRequests]);

  const requestStats = {
    total: activeFieldRequests.length,
    pending: activeFieldRequests.filter((req) => isActionablePending(req)).length,
    approved: activeFieldRequests.filter((req) => req.status?.toLowerCase() === 'approved').length,
    rejected: activeFieldRequests.filter((req) => req.status?.toLowerCase() === 'rejected').length,
    noResponse: activeFieldRequests.filter((req) => req.status?.toLowerCase() === 'no_response').length,
    visible: filterRequests(activeFieldRequests).length,
  };

  const noResponseRequests = fieldRequests.filter((req) => req.status?.toLowerCase() === 'no_response');
  const renderRequestsTable = (requests) => {
    const filtered = filterRequests(requests);

    if (filtered.length === 0) {
      return (
        <Card bodyClassName="!p-0">
          <EmptyState
            icon={Briefcase}
            title={statusFilter === 'pending' ? 'No pending requests' : 'No out reach duty requests found'}
            message="Adjust the filters or check back later."
          />
        </Card>
      );
    }

    return (
      <>
        <div className="space-y-3 sm:hidden">
          {filtered.map((request) => {
            const summary = reportSummary(request);
            return (
              <FieldRequestMobileCard
                key={request._id}
                request={request}
                summary={summary}
                readOnly={readOnly}
                onAction={handleRequestAction}
                startLabel={formatRequestDate(request, 'startDate')}
                endLabel={formatRequestDate(request, 'endDate')}
              />
            );
          })}
        </div>
        <Card bodyClassName="!p-0 hidden sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="bg-slate-100 text-left dark:bg-slate-800">
                {['Staff', 'Event', 'Start', 'End', 'Days', 'Status', 'Event Info', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map((request) => {
                const summary = reportSummary(request);
                const canReview = isActionablePending(request);
                return (
                  <tr
                    key={request._id}
                    className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {request.student?.fullName || 'Unknown'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {request.student?.uid || request.student?.email}
                      </div>
                    </td>
                    <td
                      className="max-w-[200px] truncate px-4 py-3 text-slate-700 dark:text-slate-200"
                      title={request.eventTitle}
                    >
                      {request.eventTitle || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatRequestDate(request, 'startDate')}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatRequestDate(request, 'endDate')}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {request.days || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-2 text-xs">
                        {request.evidence?.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="Evidence submitted with request">
                            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {request.evidence.length}
                          </span>
                        )}
                        {summary?.photos > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {summary.photos}
                          </span>
                        )}
                        {summary?.docs > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                            {summary.docs}
                          </span>
                        )}
                        {!request.evidence?.length && summary?.photos === 0 && summary?.docs === 0 && summary?.notes && (
                          <span>Report</span>
                        )}
                        {!request.evidence?.length && !summary && (
                          <span className="text-xs text-slate-400">No evidence</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {canReview && (
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
                                className="flex h-8 w-8 items-center justify-center rounded-md bg-success-50 text-success-600 transition-colors hover:bg-success-100 dark:bg-success-900/30 dark:text-success-400 dark:hover:bg-success-900/50"
                                onClick={() => handleRequestAction(request, 'approve')}
                              >
                                <Check className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label="Reject request"
                                className="flex h-8 w-8 items-center justify-center rounded-md bg-danger-50 text-danger-600 transition-colors hover:bg-danger-100 dark:bg-danger-900/30 dark:text-danger-400 dark:hover:bg-danger-900/50"
                                onClick={() => handleRequestAction(request, 'reject')}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </>
                          )
                        )}
                        <button
                          type="button"
                          aria-label="View details"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                          onClick={() => handleRequestAction(request, 'view')}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </Card>
      </>
    );
  };

  const renderRequestDetails = (request) =>
    request && (
      <span className="block space-y-1 text-left text-sm">
        <span className="block">
          <strong>Staff:</strong> {request.student?.fullName}
        </span>
        <span className="block">
          <strong>UID:</strong> {request.student?.uid}
        </span>
        <span className="block">
          <strong>Event:</strong> {request.eventTitle}
        </span>
        <span className="block">
          <strong>Period:</strong> {formatRequestDate(request, 'startDate')} -{' '}
          {formatRequestDate(request, 'endDate')}
        </span>
        <span className="block">
          <strong>Days:</strong> {request.days || '-'}
        </span>
        <span className="block">
          <strong>Reason:</strong> {request.reason}
        </span>
        {request.notes && (
          <span className="block">
            <strong>Notes:</strong> {request.notes}
          </span>
        )}
        {request.location && (
          <span className="block">
            <strong>Location:</strong> {request.location}
          </span>
        )}
        {request.accompaniedBy && (
          <span className="block">
            <strong>Accompanied By:</strong> {request.accompaniedBy}
          </span>
        )}
        <span className="flex items-center gap-2">
          <strong>Status:</strong> <StatusBadge status={request.status} />
        </span>
        {request.status?.toLowerCase() === 'no_response' && (
          <>
            <span className="block rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
              <strong>No Response Reason:</strong>{' '}
              {request.noResponseReason || NO_RESPONSE_REASON}
            </span>
            <span className="block">
              <strong>Submitted On:</strong> {formatDate(request.createdAt)}
            </span>
            <span className="block">
              <strong>No Response Marked At:</strong> {formatDate(request.noResponseAt)}
            </span>
            <span className="block">
              <strong>Reviewed:</strong> {request.noResponseReviewed ? `Yes (${formatDate(request.noResponseReviewedAt)})` : 'No'}
            </span>
          </>
        )}
      </span>
    );

  if (loading) {
    return (
      <div className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
        <Card>
          <SkeletonTable rows={6} cols={6} />
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
      <div className="min-w-0">
        <div className="kicker-label mb-1 text-emerald-700 dark:text-emerald-400">
          OUT REACH DUTY APPROVALS
        </div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Out Reach Duty
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
          Review off-campus duty requests, event dates, field reports, and approval status.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5 p-1">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            statusFilter === 'all'
              ? '!border-2 !border-emerald-500 bg-white shadow-md scale-[1.02] dark:bg-slate-900'
              : 'border border-slate-200/70 bg-white hover:scale-[1.01] dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total</p>
          <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">{requestStats.total}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            statusFilter === 'pending'
              ? '!border-2 !border-amber-500 bg-amber-50 shadow-md scale-[1.02] dark:bg-amber-950/30'
              : 'border border-amber-100 bg-amber-50/70 hover:scale-[1.01] dark:border-amber-900/30 dark:bg-amber-950/20'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Pending</p>
          <p className="mt-1 text-xl font-black text-amber-700 dark:text-amber-300">{requestStats.pending}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('approved')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            statusFilter === 'approved'
              ? '!border-2 !border-emerald-500 bg-emerald-50 shadow-md scale-[1.02] dark:bg-emerald-950/30'
              : 'border border-emerald-100 bg-emerald-50/70 hover:scale-[1.01] dark:border-emerald-900/30 dark:bg-emerald-950/20'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Approved</p>
          <p className="mt-1 text-xl font-black text-emerald-700 dark:text-emerald-300">{requestStats.approved}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('rejected')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            statusFilter === 'rejected'
              ? '!border-2 !border-rose-500 bg-rose-50 shadow-md scale-[1.02] dark:bg-rose-950/30'
              : 'border border-rose-100 bg-rose-50/70 hover:scale-[1.01] dark:border-rose-900/30 dark:bg-rose-950/20'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600">Rejected</p>
          <p className="mt-1 text-xl font-black text-rose-700 dark:text-rose-300">{requestStats.rejected}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('no_response')}
          className={`block w-full text-left transition-all rounded-2xl cursor-pointer p-3 focus:outline-none ${
            statusFilter === 'no_response'
              ? '!border-2 !border-slate-500 bg-slate-100 shadow-md scale-[1.02] dark:bg-slate-800'
              : 'border border-slate-200 bg-slate-100/70 hover:scale-[1.01] dark:border-slate-700 dark:bg-slate-800'
          }`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">No Response</p>
          <p className="mt-1 text-xl font-black text-slate-800 dark:text-slate-100">{requestStats.noResponse}</p>
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-danger-50 p-4 text-sm text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card className="relative z-30 overflow-visible rounded-[24px]" bodyClassName="!p-4 sm:!p-5 overflow-visible">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(10rem,14rem)_minmax(10rem,14rem)_auto_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Status
            </label>
            <FieldRequestSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'no_response', label: 'No Response' },
              ]}
              placeholder="All Status"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Filter by Date
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={INPUT_CLASSES}
            />
          </div>

          <Button
            className="w-full sm:w-auto"
            variant="outline"
            icon={FilterX}
            onClick={() => {
              setStatusFilter('all');
              setDateFilter('');
            }}
          >
            Clear Filters
          </Button>

          <Button className="w-full sm:w-auto" icon={RefreshCw} onClick={loadRequests}>
            Refresh
          </Button>
        </div>
      </Card>

      {noResponseRequests.length > 0 && (
        <Card className="border-rose-200 dark:border-rose-900/50" bodyClassName="!p-0">
          <button
            type="button"
            onClick={() => setNoResponseOpen((o) => !o)}
            aria-expanded={noResponseOpen}
            className="flex w-full flex-wrap items-center justify-between gap-3 rounded-3xl bg-rose-50/70 p-4 text-left transition-colors hover:bg-rose-100/70 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 sm:p-5"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-extrabold text-rose-800 dark:text-rose-300 sm:text-lg">
                  No Response Requests ({noResponseRequests.length})
                </h2>
                <p className="text-xs font-semibold text-rose-600/80 dark:text-rose-400/80">
                  Past pending field duty requests where Admin did not respond before the start date.
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-rose-500 transition-transform dark:text-rose-400 ${noResponseOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {noResponseOpen && (
          <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 lg:grid-cols-2">
            {noResponseRequests.map((request) => (
              <div
                key={request._id}
                className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4 dark:border-rose-900/40 dark:bg-rose-950/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      {request.student?.fullName || 'Unknown'}
                    </p>
                    <p className="break-all text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {request.student?.uid || request.student?.email || 'N/A'}
                    </p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-slate-800 dark:text-slate-100">{request.eventTitle || 'No event title'}</p>
                  <p>Start: {formatRequestDate(request, 'startDate')}</p>
                  <p>End: {formatRequestDate(request, 'endDate')}</p>
                  <p>Days: {request.days || '-'}</p>
                  <p className="rounded-xl bg-white p-3 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-rose-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-rose-900/40">
                    {request.noResponseReason || NO_RESPONSE_REASON}
                  </p>
                  {request.noResponseReviewed && (
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Reviewed on {formatDate(request.noResponseReviewedAt)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRequestAction(request, 'view')}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-rose-700 shadow-sm transition hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-slate-700"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  View Details
                </button>
              </div>
            ))}
          </div>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 sm:text-lg">Out Reach Duty Requests</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{requestStats.visible} shown</span>
        </div>
        {renderRequestsTable(fieldRequests)}
      </div>

      {/* Approve / Reject confirmation */}
      <ConfirmDialog
        open={dialogOpen && (actionType === 'approve' || actionType === 'reject')}
        title={actionType === 'approve' ? 'Approve Request' : 'Reject Request'}
        variant={actionType === 'reject' ? 'danger' : 'primary'}
        confirmLabel={actionType === 'approve' ? 'Approve' : 'Reject'}
        loading={actionLoading}
        message={
          <span className="block space-y-3">
            {renderRequestDetails(selectedRequest)}
            {actionType === 'reject' && (
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="Please provide a reason for rejection..."
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-danger-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            )}
          </span>
        }
        onConfirm={confirmAction}
        onCancel={() => setDialogOpen(false)}
      />

    </div>
  );
};

export default FieldRequests;
