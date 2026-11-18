import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  FileText,
  AlertTriangle,
  UserCheck,
  Phone,
  MapPin,
  CalendarClock,
  Paperclip,
  Check,
  X as XIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { DetailHeader, DetailSection, DetailGrid, DetailField } from "../components/DetailLayout";
import AttachmentPreview from "../components/AttachmentPreview";
import ScrollReveal from "../components/ScrollReveal";
import { Button, ConfirmDialog, EmptyState } from "../components/ui";

const calculateDays = (startDay, endDay) => {
  const start = new Date(startDay);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDay);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
};

const LeaveRequestDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { userType, viewAsOrg } = useAuth();
  const readOnly = userType === "superadmin" && !!viewAsOrg;

  const [request, setRequest] = useState(location.state?.request || null);
  const [loading, setLoading] = useState(!location.state?.request);
  const [notFound, setNotFound] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'approve' | 'reject' | null
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (request) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get("/api/get-leave-requests");
        if (cancelled) return;
        const found = (Array.isArray(data) ? data : []).find((r) => r._id === id);
        if (found) setRequest(found);
        else setNotFound(true);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, request]);

  const handleUpdateStatus = async (status, reason = "") => {
    setActionLoading(true);
    try {
      await axios.put(`/api/leave-requests/update-status/${id}`, { status, reson: reason });
      toast.success(`Request ${status === "approved" ? "approved" : "rejected"} successfully!`);
      setRequest((prev) => ({ ...prev, status }));
      setConfirmAction(null);
      setRejectReason("");
    } catch (err) {
      if (err?.code !== "ERR_READ_ONLY_VIEW") {
        toast.error(err?.response?.data?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-sm font-semibold text-slate-400">
        Loading request…
      </div>
    );
  }

  if (notFound || !request) {
    return (
      <div className="glass p-8">
        <EmptyState
          icon={FileText}
          title="Request not found"
          message="This leave request could not be loaded. It may have been removed."
        />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => navigate("/leave-request")}>
            Back to Leave Requests
          </Button>
        </div>
      </div>
    );
  }

  const isPending = (request.status || "pending").toLowerCase() === "pending";

  return (
    <ScrollReveal y={20} duration={600} blur={0} className="w-full min-w-0 space-y-4 sm:space-y-6">
      <DetailHeader kicker="LEAVE REQUEST" title={request.student?.fullName || "Leave Request"} status={request.status} backTo="/leave-request" />

      {request.isEmergency && (
        <div className="flex items-center gap-2 rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3 text-danger-700 dark:border-danger-900/40 dark:bg-danger-900/20 dark:text-danger-400">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-bold">Marked as Emergency Leave</p>
        </div>
      )}

      <DetailSection title="Request Details" icon={FileText}>
        <DetailGrid>
          <DetailField label="Employee">{request.student?.fullName || "Unknown"}</DetailField>
          {request.student?.uid && <DetailField label="Employee ID">{request.student.uid}</DetailField>}
          {(request.leaveTypeName || request.leaveTypeCode) && (
            <DetailField label="Leave Type">{request.leaveTypeName || request.leaveTypeCode}</DetailField>
          )}
          <DetailField label="Dates & Duration" icon={CalendarClock}>
            {request.leaveDates?.start && request.leaveDates?.end
              ? `${format(new Date(request.leaveDates.start), "dd-MM-yyyy")} to ${format(new Date(request.leaveDates.end), "dd-MM-yyyy")} · ${calculateDays(request.leaveDates.start, request.leaveDates.end)} day(s)`
              : "—"}
            {request.dayPortion === "half"
              ? ` (Half day — ${request.halfDayType === "second" ? "second half" : "first half"})`
              : ""}
          </DetailField>
          <DetailField label="Reason" full>{request.leaveDetails || request.reason || "No reason provided"}</DetailField>
          {request.description && <DetailField label="Detailed Description" full>{request.description}</DetailField>}
          {request.comments && <DetailField label="Additional Comments" full>{request.comments}</DetailField>}
          <DetailField label="Covering Colleague" icon={UserCheck}>
            {request.delegate?.fullName
              ? `${request.delegate.fullName}${request.delegate.uid ? ` (${request.delegate.uid})` : ""}`
              : "Not assigned"}
          </DetailField>
          {request.contactNumber && (
            <DetailField label="Emergency Contact" icon={Phone}>{request.contactNumber}</DetailField>
          )}
          {request.addressDuringLeave && (
            <DetailField label="Address During Leave" icon={MapPin} full>{request.addressDuringLeave}</DetailField>
          )}
          {request.expectedReturnDate && (
            <DetailField label="Expected Return Date">{format(new Date(request.expectedReturnDate), "dd-MM-yyyy")}</DetailField>
          )}
        </DetailGrid>
      </DetailSection>

      {request.attachments?.length > 0 && (
        <DetailSection title={`Attachments (${request.attachments.length})`} icon={Paperclip}>
          <div className="flex flex-wrap gap-3">
            {request.attachments.map((att) => (
              <AttachmentPreview key={String(att.id || att._id)} att={att} requestId={request._id} />
            ))}
          </div>
        </DetailSection>
      )}

      {isPending && (
        <DetailSection title="Approval">
          {readOnly ? (
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Read-only institute view — exit it to approve or reject.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button variant="success" icon={Check} onClick={() => setConfirmAction("approve")}>
                Approve
              </Button>
              <Button variant="danger" icon={XIcon} onClick={() => setConfirmAction("reject")}>
                Reject
              </Button>
            </div>
          )}
        </DetailSection>
      )}

      <ConfirmDialog
        open={confirmAction === "approve"}
        title="Approve leave request?"
        message="The employee will be notified that their leave has been approved."
        confirmLabel="Approve"
        loading={actionLoading}
        onConfirm={() => handleUpdateStatus("approved")}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "reject"}
        variant="danger"
        title="Reject leave request?"
        confirmLabel="Reject"
        loading={actionLoading}
        message={
          <span className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">Provide a reason for the rejection.</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </span>
        }
        onConfirm={() => handleUpdateStatus("rejected", rejectReason)}
        onCancel={() => {
          setConfirmAction(null);
          setRejectReason("");
        }}
      />
    </ScrollReveal>
  );
};

export default LeaveRequestDetail;
