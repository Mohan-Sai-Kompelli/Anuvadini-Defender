import React, { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  List,
  CalendarDays,
  Wallet,
  FileCheck2,
  AlertCircle,
  AlertTriangle,
  Paperclip,
  Info,
  UserCheck,
  Eye,
} from "lucide-react";
import useLeaveRequests from "../hooks/useLeaveRequest";
import { useAuth } from "../contexts/AuthContext";
import RequestCard, { buildLeaveDetailTooltip } from "../components/RequestCard";
import LeaveCalendar from "../components/LeaveCalendar";
import ScrollReveal from "../components/ScrollReveal";
import { openLeaveAttachment } from "../utils/downloadAttachment";
import {
  ConfirmDialog,
  EmptyState,
  SkeletonTable,
} from "../components/ui";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const EMPTY_TITLES = {
  pending: "No pending requests",
  approved: "No approved requests",
  rejected: "No rejected requests",
};

const BalancePill = ({ used, total }) => {
  const left = total - used;
  const pct = Math.min(100, Math.round((used / total) * 100));
  const barColor =
    pct >= 80 ? "bg-rose-500" : pct >= 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
        {left} <span className="text-slate-400 dark:text-slate-500 font-normal">left</span>
      </div>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};


const LeaveRequestMobileCard = ({ request, calculateDays, readOnly, onApprove, onReject, onView }) => {
  const status = (request.status || "pending").toLowerCase();
  const isPending = status === "pending" || status === "submitted";
  const name = request.student?.fullName || "Unknown";
  const start = request.leaveDates?.start ? new Date(request.leaveDates.start) : null;
  const end = request.leaveDates?.end ? new Date(request.leaveDates.end) : null;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">{name}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {start && end ? `${calculateDays(request.leaveDates.start, request.leaveDates.end)} days` : "Leave request"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${
          status === "approved"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
            : status === "rejected"
            ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
            : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
        }`}>
          {status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(request.leaveTypeName || request.leaveTypeCode) && (
          <span className="inline-flex items-center rounded-pill bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {request.leaveTypeName || request.leaveTypeCode}
          </span>
        )}
        {request.isEmergency && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Emergency
          </span>
        )}
        {buildLeaveDetailTooltip(request) && (
          <span
            title={buildLeaveDetailTooltip(request)}
            className="inline-flex cursor-help items-center gap-1 rounded-pill bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950/30 dark:text-sky-400"
          >
            <Info className="h-3 w-3" aria-hidden="true" /> Details
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">Start</p>
          <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
            {start ? start.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">End</p>
          <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
            {end ? end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}
          </p>
        </div>
      </div>

      <p className="mt-3 break-words text-sm text-slate-600 dark:text-slate-300">
        {request.leaveDetails || request.reason || request.description || "No leave details provided."}
      </p>

      {request.attachments?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {request.attachments.map((att) => (
            <button
              key={String(att.id || att._id)}
              type="button"
              onClick={() =>
                openLeaveAttachment(
                  att.url || `/api/leaves/${request._id}/attachments/${att.id || att._id}`,
                  att.originalName
                )
              }
              className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-400"
              title={att.originalName}
            >
              <Paperclip className="h-3 w-3" aria-hidden="true" />
              {att.category === "medical" ? "Medical" : "Document"}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 dark:border-sky-900/50 dark:bg-sky-950/20">
        <UserCheck className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">Work covered by</p>
          <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
            {request.delegate?.fullName || "Not assigned"}
            {request.delegate?.uid ? ` · ${request.delegate.uid}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {isPending && (
          <>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onApprove(request._id)}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onReject(request._id)}
              className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onView(request)}
          className={`${isPending ? "col-span-2" : "col-span-2"} inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200`}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View Details
        </button>
      </div>
    </div>
  );
};
const LeaveRequest = () => {
  const {
    leaveRequests,
    loading,
    error,
    calculateDays,
    updateLeaveRequestStatus,
  } = useLeaveRequests();

  const { userType, viewAsOrg } = useAuth();
  const readOnly = userType === "superadmin" && !!viewAsOrg;

  const [activeTab, setActiveTab] = useState("all");
  const [viewMode, setViewMode] = useState("list");
  const navigate = useNavigate();
  const [approveId, setApproveId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [balances, setBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState(null);
  const [balancesYear, setBalancesYear] = useState(null);

  useEffect(() => {
    if (viewMode !== "balances" || balances.length > 0 || balancesLoading) return;
    let cancelled = false;
    (async () => {
      setBalancesLoading(true);
      setBalancesError(null);
      try {
        const res = await axios.get("/api/leave-balances");
        if (cancelled) return;
        setBalances(res.data?.balances || []);
        setBalancesYear(res.data?.year || null);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load leave balances:", err);
          setBalancesError("Could not load leave balances.");
        }
      } finally {
        if (!cancelled) setBalancesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewMode]);

  const handleUpdateStatus = async (id, status, reason = "") => {
    setActionLoading(true);
    try {
      const res = await updateLeaveRequestStatus(id, status, reason);
      // Only celebrate a real change — a read-only block / failure returns falsy
      // and the guard already showed its own message.
      if (res) {
        toast.success(
          `Request ${status === "approved" ? "approved" : "rejected"} successfully!`
        );
      }
      setApproveId(null);
      setRejectId(null);
      setRejectReason("");
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const normalizedStatus = (s) => (s || "pending").toLowerCase();
  const activeLeaveRequests = React.useMemo(() => {
    return leaveRequests.filter((req) => normalizedStatus(req.status) !== "cancelled");
  }, [leaveRequests]);

  const leaveStats = React.useMemo(() => {
    const total = activeLeaveRequests.length;
    let pending = 0, approved = 0, rejected = 0;
    activeLeaveRequests.forEach((req) => {
      const s = normalizedStatus(req.status);
      if (s === 'pending' || s === 'submitted') pending++;
      else if (s === 'approved') approved++;
      else if (s === 'rejected') rejected++;
    });
    return { total, pending, approved, rejected };
  }, [activeLeaveRequests]);

  const filteredRequests = activeLeaveRequests.filter((req) => {
    const s = normalizedStatus(req.status);
    if (activeTab === "all") return true;
    if (activeTab === "pending") return s === "pending" || s === "submitted";
    if (activeTab === "approved") return s === "approved";
    if (activeTab === "rejected") return s === "rejected";
    return true;
  });

  return (
    <ScrollReveal y={28} duration={800} blur={0} className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
      {/* Page Header */}
      <div className="min-w-0">
        <div className="kicker-label mb-1 text-emerald-700 dark:text-emerald-400">
          LEAVE REQUEST APPROVALS
        </div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
            style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
          Leave Request
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
          Review employee leave applications, quota balances, dates, and approval status.
        </p>
      </div>

      {/* KPI Cards */}
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
          <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">{leaveStats.total}</p>
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
          <p className="mt-1 text-xl font-black text-amber-700 dark:text-amber-300">{leaveStats.pending}</p>
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
          <p className="mt-1 text-xl font-black text-emerald-700 dark:text-emerald-300">{leaveStats.approved}</p>
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
          <p className="mt-1 text-xl font-black text-rose-700 dark:text-rose-300">{leaveStats.rejected}</p>
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : (
        <>
          {/* Dashboard Control Bar */}
          <ScrollReveal delay={100} y={16} blur={0} className="flex min-w-0 flex-col items-stretch justify-between gap-3 rounded-2xl border border-slate-200/50 bg-white/80 p-3 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:gap-4 sm:rounded-3xl sm:p-4">
            {viewMode === "list" && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 ${
                      activeTab === t.key
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-md"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
                <span className="w-full text-xs font-bold uppercase tracking-widest text-slate-400 sm:ml-2 sm:w-auto">
                  {filteredRequests.length} listed
                </span>
              </div>
            )}
            {viewMode !== "list" && <div />}

            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 sm:flex">
              {[
                { key: "list", label: "List", icon: List },
                { key: "calendar", label: "Calendar", icon: CalendarDays },
                { key: "balances", label: "Balances", icon: Wallet },
              ].map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setViewMode(v.key)}
                  className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 sm:gap-1.5 sm:px-3 sm:text-xs ${
                    viewMode === v.key
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md shadow-emerald-700/10"
                      : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <v.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {v.label}
                </button>
              ))}
            </div>
          </ScrollReveal>

          {/* Main Content Area */}
          <div className="min-h-[300px]">
            {loading ? (
              <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50">
                <SkeletonTable rows={5} cols={6} />
              </div>
            ) : (
              <ScrollReveal delay={150} y={24} blur={0}>
                {viewMode === "calendar" ? (
                  <div className="glass p-2 sm:p-6">
                    <LeaveCalendar requests={leaveRequests} />
                  </div>
                ) : viewMode === "balances" ? (
                  <div className="space-y-5">
                    {/* Balanced Info banner */}
                    <div className="flex items-start gap-3 rounded-2xl bg-sky-50 dark:bg-sky-950/20 p-4 border border-sky-100 dark:border-sky-900/35 text-sky-800 dark:text-sky-400">
                      <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <div className="text-xs font-semibold leading-relaxed">
                        Usage computed from approved leave requests{balancesYear ? ` for ${balancesYear}` : ""}.
                        Medical Leave (ML) is any approved request whose details mention medical/sick/hospital.
                      </div>
                    </div>

                    {balancesLoading ? (
                      <div className="glass p-8">
                        <SkeletonTable rows={4} cols={3} />
                      </div>
                    ) : balancesError ? (
                      <div className="glass p-8">
                        <EmptyState icon={AlertCircle} title="Couldn't load balances" message={balancesError} />
                      </div>
                    ) : balances.length === 0 ? (
                      <div className="glass p-8">
                        <EmptyState icon={Wallet} title="No staff found" message="No active staff to show leave balances for." />
                      </div>
                    ) : (
                      /* Balances Card Grid */
                      <div className="grid grid-cols-1 gap-3 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {balances.map((b) => (
                          <div key={b.id} className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-5 bento-hover-anuvadini"
                            style={{
                              background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.85))',
                              backdropFilter: 'blur(20px)',
                              border: '1px solid rgba(255,255,255,0.85)',
                              boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 20px 48px -28px rgba(10,20,36,0.12)',
                            }}>
                            {/* Accent line */}
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: '#4A74F0' }} />

                            <div className="flex items-start justify-between gap-3 mb-4">
                              <div>
                                <h3 className="font-extrabold text-[15px] text-slate-800 dark:text-slate-100">{b.name}</h3>
                                <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide mt-0.5">{b.department}</p>
                              </div>
                              {b.certs > 0 && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                                  <FileCheck2 className="h-3 w-3" />
                                  {b.certs} certs
                                </span>
                              )}
                            </div>

                            <div className="space-y-3 mt-1 flex-1">
                              <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Total Leave</span>
                                <BalancePill used={b.used} total={b.quota} />
                              </div>
                              <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Medical Leave (ML)</span>
                                <BalancePill used={b.medicalUsed} total={b.medicalQuota} />
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                              <span className="font-semibold uppercase tracking-wider">Last Leave:</span>
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {b.lastLeave
                                  ? new Date(b.lastLeave).toLocaleDateString("en-GB", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })
                                  : "—"}
                              </span>
                            </div>
                            <span className="shine-overlay-anuvadini rounded-3xl opacity-30" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : filteredRequests.length === 0 ? (
                  <div className="glass p-8">
                    <EmptyState
                      icon={ClipboardList}
                      title={EMPTY_TITLES[activeTab] || "No requests"}
                      message="New leave requests will appear here as employees submit them."
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 sm:hidden">
                      {filteredRequests.map((request) => (
                        <LeaveRequestMobileCard
                          key={request._id}
                          request={request}
                          calculateDays={calculateDays}
                          readOnly={readOnly}
                          onApprove={(id) => setApproveId(id)}
                          onReject={(id) => setRejectId(id)}
                          onView={(req) => navigate(`/leave-request/${req._id}`, { state: { request: req } })}
                        />
                      ))}
                    </div>
                    <div className="glass hidden overflow-hidden sm:block">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-max table-auto">
                        <thead>
                          <tr className="bg-slate-50/50 dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800">
                            <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                              Employee
                            </th>
                            <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                              Total Days
                            </th>
                            <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                              Start Date
                            </th>
                            <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                              End Date
                            </th>
                            <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                              Leave Details
                            </th>
                            <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                              Work Covered By
                            </th>
                            <th className="p-4 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                              Actions
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredRequests.map((request) => (
                            <RequestCard
                              key={request._id}
                              type="leave"
                              request={request}
                              calculateDays={calculateDays}
                              readOnly={readOnly}
                              onApprove={(id) => setApproveId(id)}
                              onReject={(id) => setRejectId(id)}
                              onView={(req) => navigate(`/leave-request/${req._id}`, { state: { request: req } })}
                            />
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  </>
                )}
              </ScrollReveal>
            )}
          </div>
        </>
      )}

      {/* Approve confirmation */}
      <ConfirmDialog
        open={approveId !== null}
        title="Approve leave request?"
        message="The employee will be notified that their leave has been approved."
        confirmLabel="Approve"
        loading={actionLoading}
        onConfirm={() => handleUpdateStatus(approveId, "approved")}
        onCancel={() => setApproveId(null)}
      />

      {/* Reject confirmation with reason */}
      <ConfirmDialog
        open={rejectId !== null}
        variant="danger"
        title="Reject leave request?"
        confirmLabel="Reject"
        loading={actionLoading}
        message={
          <span className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">
              Provide a reason for the rejection.
            </span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </span>
        }
        onConfirm={() => handleUpdateStatus(rejectId, "rejected", rejectReason)}
        onCancel={() => {
          setRejectId(null);
          setRejectReason("");
        }}
      />
    </ScrollReveal>
  );
};

export default LeaveRequest;
