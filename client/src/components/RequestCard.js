import React from "react";
import { format } from "date-fns";
import { Check, X, Lock, UserCheck, AlertTriangle, Paperclip, Info, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { openLeaveAttachment } from "../utils/downloadAttachment";

const READ_ONLY_MSG = "Read-only institute view — exit it to make changes.";

const STATUS_STYLES = {
  approved:
    "bg-success-50 text-success-700 dark:bg-success-900/40 dark:text-success-400",
  rejected:
    "bg-danger-50 text-danger-700 dark:bg-danger-900/40 dark:text-danger-400",
  pending:
    "bg-warning-50 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400",
  submitted:
    "bg-warning-50 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400",
  no_response:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_LABELS = {
  no_response: "No Response",
};

export const StatusBadge = ({ status }) => {
  const s = (status || "pending").toLowerCase();
  const cls = STATUS_STYLES[s] || STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {STATUS_LABELS[s] || s}
    </span>
  );
};

// Builds a plain-text tooltip covering the fields that don't have room for
// their own UI element (description, contact/address while away, comments,
// half-day portion, expected return) so nothing submitted on mobile is hidden.
export const buildLeaveDetailTooltip = (request) => {
  const lines = [];
  if (request.dayPortion === "half") {
    lines.push(`Half day (${request.halfDayType === "second" ? "second half" : "first half"})`);
  }
  if (request.description) lines.push(`Description: ${request.description}`);
  if (request.contactNumber) lines.push(`Contact: ${request.contactNumber}`);
  if (request.addressDuringLeave) lines.push(`Address during leave: ${request.addressDuringLeave}`);
  if (request.expectedReturnDate) {
    lines.push(`Expected return: ${format(new Date(request.expectedReturnDate), "dd-MM-yyyy")}`);
  }
  if (request.comments) lines.push(`Comments: ${request.comments}`);
  return lines.join("\n");
};

const getInitials = (name) =>
  (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const RequestCard = ({ type, request, calculateDays, onApprove, onReject, onView, readOnly = false }) => {
  const studentName = request.student?.fullName || "Unknown";

  return (
    <tr className="border-b border-slate-200 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60">
      {/* Student */}
      <td className="p-4 align-middle">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
            {getInitials(studentName)}
          </div>
          <span className="font-medium text-slate-800 dark:text-slate-100">
            {studentName}
          </span>
        </div>
      </td>

      {/* Days + Dates */}
      {type === "leave" && (
        <>
          <td className="p-4 align-middle text-slate-600 dark:text-slate-300">
            {calculateDays(request.leaveDates.start, request.leaveDates.end)}
          </td>
          <td className="p-4 align-middle text-slate-600 dark:text-slate-300">
            {format(new Date(request.leaveDates.start), "dd-MM-yyyy")}
          </td>
          <td className="p-4 align-middle text-slate-600 dark:text-slate-300">
            {format(new Date(request.leaveDates.end), "dd-MM-yyyy")}
          </td>
        </>
      )}

      {/* Reason */}
      <td className="max-w-xs p-4 align-middle text-slate-600 dark:text-slate-300">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {(request.leaveTypeName || request.leaveTypeCode) && (
            <span className="inline-flex items-center rounded-pill bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {request.leaveTypeName || request.leaveTypeCode}
            </span>
          )}
          {request.isEmergency && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-danger-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger-700 dark:bg-danger-900/40 dark:text-danger-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Emergency
            </span>
          )}
          {buildLeaveDetailTooltip(request) && (
            <span title={buildLeaveDetailTooltip(request)} className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </div>
        <p>{request.leaveDetails || request.reason || request.description}</p>
        {request.attachments?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
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
                className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-400"
                title={att.originalName}
              >
                <Paperclip className="h-3 w-3" aria-hidden="true" />
                {att.category === "medical" ? "Medical" : "Document"}
              </button>
            ))}
          </div>
        )}
      </td>

      {type === "leave" && (
        <td className="p-4 align-middle">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="max-w-[180px] truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {request.delegate?.fullName || "Not assigned"}
              </p>
              {request.delegate?.uid && (
                <p className="text-xs text-slate-400">{request.delegate.uid}</p>
              )}
            </div>
          </div>
        </td>
      )}

      {/* Status / Actions */}
      <td className="p-4 text-center align-middle">
        <div className="flex items-center justify-center gap-2">
          {request.status === "pending" ? (
            readOnly ? (
              <button
                type="button"
                onClick={() => toast.error(READ_ONLY_MSG, { id: "readonly-view" })}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
                title="Editing is disabled in Read-Only Mode."
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Read-only
              </button>
            ) : (
              <>
                <button
                  type="button"
                  aria-label="Approve request"
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-success-50 text-success-600 transition-colors hover:bg-success-100 dark:bg-success-900/30 dark:text-success-400 dark:hover:bg-success-900/50"
                  onClick={() => onApprove(request._id)}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Reject request"
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-danger-50 text-danger-600 transition-colors hover:bg-danger-100 dark:bg-danger-900/30 dark:text-danger-400 dark:hover:bg-danger-900/50"
                  onClick={() => onReject(request._id)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )
          ) : (
            <StatusBadge status={request.status} />
          )}
          <button
            type="button"
            aria-label="View request details"
            title="View details"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            onClick={() => onView && onView(request)}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default RequestCard;
