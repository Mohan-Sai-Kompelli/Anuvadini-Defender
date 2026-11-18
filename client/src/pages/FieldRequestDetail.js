import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Briefcase,
  MapPin,
  UserCheck,
  FileText,
  Image as ImageIcon,
  Check,
  X as XIcon,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { DetailHeader, DetailSection, DetailGrid, DetailField } from "../components/DetailLayout";
import ImageLightbox from "../components/ImageLightbox";
import { describeRequestWindow, isCustomTimeWindow, isHalfDayWindow, formatISTFullDate } from "../utils/formatRequestWindow";
import ScrollReveal from "../components/ScrollReveal";
import { Button, ConfirmDialog, EmptyState } from "../components/ui";

const API_BASE_URL = '/api';
const NO_RESPONSE_REASON = "Admin did not respond before the field duty start date";

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  return formatISTFullDate(dateStr);
};

const FieldRequestDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { userType, viewAsOrg } = useAuth();
  const readOnly = userType === "superadmin" && !!viewAsOrg;

  const [request, setRequest] = useState(location.state?.request || null);
  const [loading, setLoading] = useState(!location.state?.request);
  const [notFound, setNotFound] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [lightbox, setLightbox] = useState(null); // { photos, index }

  const getAuthToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");
  const apiCall = async (url, options = {}) => {
    const token = getAuthToken();
    const config = {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
    };
    const response = await axios(url, config);
    return response.data;
  };

  useEffect(() => {
    if (request) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiCall(`${API_BASE_URL}/field-requests/all`);
        if (cancelled) return;
        const found = (res.data?.requests || []).find((r) => r._id === id);
        if (found) setRequest(found);
        else setNotFound(true);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleUpdateStatus = async (status) => {
    setActionLoading(true);
    try {
      const payload = { status };
      if (status === "rejected" && rejectionReason.trim()) payload.reson = rejectionReason.trim();
      const response = await apiCall(`${API_BASE_URL}/field-requests/update-status/${id}`, {
        method: "PUT",
        data: payload,
      });
      if (response.success) {
        toast.success(`Request ${status === "approved" ? "approved" : "rejected"} successfully!`);
        setRequest((prev) => ({ ...prev, status }));
        setConfirmAction(null);
        setRejectionReason("");
      }
    } catch (err) {
      toast.error(err.message || "Failed to update request");
    } finally {
      setActionLoading(false);
    }
  };

  const markReviewed = async () => {
    setActionLoading(true);
    try {
      const response = await apiCall(`${API_BASE_URL}/field-requests/${id}/mark-reviewed`, { method: "PATCH" });
      if (response.success) {
        toast.success("No-response request marked reviewed");
        setRequest(response.data?.request || { ...request, noResponseReviewed: true });
      }
    } catch (err) {
      toast.error(err.message || "Failed to mark request reviewed");
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
        <EmptyState icon={Briefcase} title="Request not found" message="This request could not be loaded." />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => navigate("/field-requests")}>
            Back to Out Reach Duty
          </Button>
        </div>
      </div>
    );
  }

  const status = (request.status || "pending").toLowerCase();
  const isNoResponse = status === "no_response";
  const canReview = status === "pending";
  const report = request.report || {};
  const reportPhotos = report.photos || [];
  const reportDocs = report.documents || [];

  return (
    <ScrollReveal y={20} duration={600} blur={0} className="w-full min-w-0 space-y-4 sm:space-y-6">
      <DetailHeader kicker="OUT REACH DUTY" title={request.eventTitle || "Out Reach Duty Request"} status={request.status} backTo="/field-requests" />

      {isNoResponse && (
        <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">No Response</p>
            <p className="text-xs font-semibold">{request.noResponseReason || NO_RESPONSE_REASON}</p>
          </div>
        </div>
      )}

      <DetailSection title="Request Details" icon={Briefcase}>
        <DetailGrid>
          <DetailField label="Staff">{request.student?.fullName || "Unknown"}</DetailField>
          {(request.student?.uid || request.student?.email) && (
            <DetailField label="UID / Email">{request.student?.uid || request.student?.email}</DetailField>
          )}
          <DetailField label="Event / Purpose">{request.eventTitle || "—"}</DetailField>
          <DetailField
            label={
              isHalfDayWindow(request.startDate, request.endDate)
                ? "Half Day"
                : isCustomTimeWindow(request.startDate, request.endDate)
                ? "Time Out — Time In"
                : "Dates & Duration"
            }
          >
            {describeRequestWindow(request.startDate, request.endDate)}
            {!isCustomTimeWindow(request.startDate, request.endDate) ? ` · ${request.days || "-"} day(s)` : ""}
          </DetailField>
          <DetailField label="Reason" full>{request.reason || "—"}</DetailField>
          {request.notes && <DetailField label="Notes" full>{request.notes}</DetailField>}
          {request.location && <DetailField label="Location" icon={MapPin}>{request.location}</DetailField>}
          {request.accompaniedBy && <DetailField label="Accompanied By" icon={UserCheck}>{request.accompaniedBy}</DetailField>}
          {isNoResponse && (
            <>
              <DetailField label="Submitted On">{formatDate(request.createdAt)}</DetailField>
              <DetailField label="No Response Marked At">{formatDate(request.noResponseAt)}</DetailField>
              <DetailField label="Reviewed">
                {request.noResponseReviewed ? `Yes (${formatDate(request.noResponseReviewedAt)})` : "No"}
              </DetailField>
            </>
          )}
        </DetailGrid>
      </DetailSection>

      {request.evidence?.length > 0 && (
        <DetailSection title={`Evidence Submitted With Request (${request.evidence.length})`} icon={ImageIcon}>
          <div className="flex flex-wrap gap-3">
            {request.evidence.map((p, i) => (
              <button
                key={p._id || i}
                type="button"
                onClick={() => setLightbox({ photos: request.evidence, index: i })}
                title={p.label || `Evidence ${i + 1}`}
                className="transition hover:opacity-90 active:scale-95 focus:outline-none"
              >
                <img
                  src={p.image}
                  alt={p.label || `Evidence ${i + 1}`}
                  className="h-24 w-24 rounded-md border border-slate-200 object-cover shadow-sm hover:shadow-md dark:border-slate-700"
                />
              </button>
            ))}
          </div>
        </DetailSection>
      )}

      {(report.submittedAt || report.notes || reportPhotos.length > 0 || reportDocs.length > 0) && (
        <DetailSection title="Event-Day Report" icon={FileText}>
          {report.submittedAt && (
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Uploaded {formatDate(report.submittedAt)}
            </p>
          )}
          {report.notes && (
            <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{report.notes}</p>
          )}
          {reportPhotos.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-3">
              {reportPhotos.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox({ photos: reportPhotos, index: i })}
                  title={p.label || `Photo ${i + 1}`}
                  className="transition hover:opacity-90 active:scale-95 focus:outline-none"
                >
                  <img
                    src={p.image}
                    alt={p.label || `Event ${i + 1}`}
                    className="h-24 w-24 rounded-md border border-slate-200 object-cover shadow-sm hover:shadow-md dark:border-slate-700"
                  />
                </button>
              ))}
            </div>
          )}
          {reportDocs.length > 0 && (
            <div className="space-y-1">
              {reportDocs.map((d, i) => (
                <a
                  key={i}
                  href={d.data}
                  download={d.name || `document-${i + 1}`}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:underline dark:text-primary-400"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {d.name || `Document ${i + 1}`}
                </a>
              ))}
            </div>
          )}
        </DetailSection>
      )}

      {(canReview || (isNoResponse && !request.noResponseReviewed)) && (
        <DetailSection title="Approval">
          {readOnly ? (
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Read-only institute view — exit it to make changes.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {canReview && (
                <>
                  <Button variant="success" icon={Check} onClick={() => setConfirmAction("approve")}>
                    Approve
                  </Button>
                  <Button variant="danger" icon={XIcon} onClick={() => setConfirmAction("reject")}>
                    Reject
                  </Button>
                </>
              )}
              {isNoResponse && !request.noResponseReviewed && (
                <Button icon={Check} loading={actionLoading} onClick={markReviewed}>
                  Mark Reviewed
                </Button>
              )}
            </div>
          )}
        </DetailSection>
      )}

      <ConfirmDialog
        open={confirmAction === "approve"}
        title="Approve Request"
        confirmLabel="Approve"
        loading={actionLoading}
        onConfirm={() => handleUpdateStatus("approved")}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "reject"}
        variant="danger"
        title="Reject Request"
        confirmLabel="Reject"
        loading={actionLoading}
        message={
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            placeholder="Please provide a reason for rejection..."
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-danger-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        }
        onConfirm={() => handleUpdateStatus("rejected")}
        onCancel={() => setConfirmAction(null)}
      />

      {lightbox && (
        <ImageLightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(i) => setLightbox((prev) => ({ ...prev, index: i }))}
        />
      )}
    </ScrollReveal>
  );
};

export default FieldRequestDetail;
