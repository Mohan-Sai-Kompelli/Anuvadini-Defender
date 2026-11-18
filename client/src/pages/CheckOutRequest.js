import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Check, LogOut, X, CalendarDays, Clock, Lock, Eye } from "lucide-react";
import useCheakOutrequests from "../hooks/useCheakOutrequest";
import { useAuth } from "../contexts/AuthContext";
import { StatusBadge } from "../components/RequestCard";
import { ConfirmDialog, EmptyState } from "../components/ui";
import ScrollReveal from "../components/ScrollReveal";

const getInitials = (name) =>
  (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();


const CheckoutMobileCard = ({ request, readOnly, onApprove, onReject, onView }) => {
  const status = (request.status || "pending").toLowerCase();
  const isPending = status === "pending";
  const date = request.date ? new Date(request.date) : null;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white shadow-sm shadow-emerald-500/10">
          {getInitials(request.student?.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">
                {request.student?.fullName || "Unknown"}
              </p>
              <p className="mt-0.5 break-all font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                {request.student?.uid || "N/A"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={request.status} />
              {status === "rejected" && request.reson && (
                <span className="text-[10px] text-rose-500 font-semibold text-right max-w-[120px] break-words">
                  Note: {request.reson}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Departure Date</p>
        <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          {date ? format(date, "dd MMM yyyy") : "N/A"}
        </p>
      </div>

      <p className="mt-3 break-words text-sm text-slate-600 dark:text-slate-300">
        {request.details || "No checkout details provided."}
      </p>

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
          className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View Details
        </button>
      </div>
    </div>
  );
};
const CheakOutrequest = () => {
  const navigate = useNavigate();
  const { requests, updateCheakoutRequestStatus } = useCheakOutrequests();
  const { userType, viewAsOrg } = useAuth();
  const readOnly = userType === "superadmin" && !!viewAsOrg;

  const [approveId, setApproveId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const handleUpdateStatus = async (id, status, reason = "") => {
    setActionLoading(true);
    try {
      const res = await updateCheakoutRequestStatus(id, status, reason);
      // Only celebrate a real change — a read-only block / failure returns falsy
      // and the guard already showed its own message.
      if (res) {
        toast.success(
          `Request ${
            status === "approved" ? "approved" : "rejected"
          } successfully!`
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

  const [statusFilter, setStatusFilter] = useState("all");

  const activeRequests = React.useMemo(() => {
    return (requests || []).filter((r) => (r.status || '').toLowerCase() !== 'cancelled');
  }, [requests]);

  const stats = React.useMemo(() => {
    let pending = 0, approved = 0, rejected = 0;
    activeRequests.forEach((r) => {
      const s = (r.status || 'pending').toLowerCase();
      if (s === 'pending' || s === 'submitted') pending++;
      else if (s === 'approved') approved++;
      else if (s === 'rejected') rejected++;
    });
    return { total: activeRequests.length, pending, approved, rejected };
  }, [activeRequests]);

  const filteredRequests = activeRequests.filter((r) => {
    const s = (r.status || 'pending').toLowerCase();
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return s === 'pending' || s === 'submitted';
    if (statusFilter === 'approved') return s === 'approved';
    if (statusFilter === 'rejected') return s === 'rejected';
    return true;
  });

  return (
    <ScrollReveal y={28} duration={800} blur={0} className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <div className="kicker-label mb-1 text-emerald-700 dark:text-emerald-400">
          CHECK OUT REQUEST APPROVALS
        </div>
        <h1
          className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
          style={{ fontFamily: "'Geist','Inter',sans-serif" }}
        >
          Check Out Request
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
          Review early check-out requests, duty reasons, and approval status.
        </p>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 p-1">
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
          <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">{stats.total}</p>
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
          <p className="mt-1 text-xl font-black text-amber-700 dark:text-amber-300">{stats.pending}</p>
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
          <p className="mt-1 text-xl font-black text-emerald-700 dark:text-emerald-300">{stats.approved}</p>
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
          <p className="mt-1 text-xl font-black text-rose-700 dark:text-rose-300">{stats.rejected}</p>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="min-h-[300px]">
        {filteredRequests.length === 0 ? (
          <div className="glass p-8">
            <EmptyState
              icon={LogOut}
              title="No checkout requests found"
              message="Checkout requests matching this filter will appear here."
            />
          </div>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {filteredRequests.map((request) => (
                <CheckoutMobileCard
                  key={request._id}
                  request={request}
                  readOnly={readOnly}
                  onApprove={(id) => setApproveId(id)}
                  onReject={(id) => setRejectId(id)}
                  onView={(req) => navigate(`/checkout-request/${req._id}`, { state: { request: req } })}
                />
              ))}
            </div>
            <div className="glass hidden overflow-hidden sm:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max table-auto">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800">
                    <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Student
                    </th>
                    <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      UID
                    </th>
                    <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Departure Date
                    </th>
                    <th className="p-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Checkout Details
                    </th>
                    <th className="p-4 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                  {filteredRequests.map((request) => (
                    <tr
                      key={request._id}
                      className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/25"
                    >
                      {/* Name & Avatar */}
                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white shadow-sm shadow-emerald-500/10">
                            {getInitials(request.student?.fullName)}
                          </div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {request.student?.fullName || "Unknown"}
                          </span>
                        </div>
                      </td>

                      {/* UID */}
                      <td className="p-4 align-middle text-slate-600 dark:text-slate-350 font-mono text-xs font-semibold">
                        {request.student?.uid || "N/A"}
                      </td>

                      {/* Date */}
                      <td className="p-4 align-middle text-slate-650 dark:text-slate-350">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-450 dark:text-slate-500" />
                          {format(new Date(request.date), "dd MMM yyyy")}
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="p-4 align-middle text-slate-600 dark:text-slate-300 max-w-xs truncate text-xs font-medium">
                        {request.details}
                      </td>

                      {/* Actions / Status */}
                      <td className="p-4 text-center align-middle">
                        <div className="flex items-center justify-center gap-2">
                          {request.status === "pending" ? (
                            readOnly ? (
                              <button
                                type="button"
                                onClick={() =>
                                  toast.error("Read-only institute view — exit it to make changes.", { id: "readonly-view" })
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
                                title="Editing is disabled in Read-Only Mode."
                              >
                                <Lock className="h-3.5 w-3.5" /> Read-only
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setApproveId(request._id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100/80 transition-all dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                                  aria-label="Approve checkout"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectId(request._id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100/80 transition-all dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-900/40"
                                  aria-label="Reject checkout"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            )
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <StatusBadge status={request.status} />
                              {request.status === "rejected" && request.reson && (
                                <span className="text-[10px] text-rose-500 font-semibold max-w-[150px] break-words">
                                  Note: {request.reson}
                                </span>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            aria-label="View request details"
                            title="View details"
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                            onClick={() => navigate(`/checkout-request/${request._id}`, { state: { request } })}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Approve confirmation */}
      <ConfirmDialog
        open={approveId !== null}
        title="Approve checkout request?"
        message="The student will be notified that their checkout has been approved."
        confirmLabel="Approve"
        loading={actionLoading}
        onConfirm={() => handleUpdateStatus(approveId, "approved")}
        onCancel={() => setApproveId(null)}
      />

      {/* Reject confirmation with reason */}
      <ConfirmDialog
        open={rejectId !== null}
        variant="danger"
        title="Reject checkout request?"
        confirmLabel="Reject"
        loading={actionLoading}
        message={
          <span className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">
              Provide a reason for the rejection (optional).
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

export default CheakOutrequest;
