import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  CalendarCheck,
  FileText,
  LogIn,
  LogOut,
  MessageSquare,
  Paperclip,
  Check,
  Ban,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { DetailHeader, DetailSection, DetailGrid, DetailField } from "../components/DetailLayout";
import ImageLightbox from "../components/ImageLightbox";
import ScrollReveal from "../components/ScrollReveal";
import { Button, ConfirmDialog, EmptyState } from "../components/ui";

const TYPE_LABEL = {
  missing_check_in: "Missing Check-In",
  missing_check_out: "Missing Check-Out",
  both: "Missing Check-In & Check-Out",
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—");

const getEvidenceUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base =
    axios.defaults.baseURL ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
};

const RegularizationDetail = () => {
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
  const [remarks, setRemarks] = useState("");
  const [evidenceLoadFailed, setEvidenceLoadFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (request) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get("/api/regularization/org");
        if (cancelled) return;
        const found = (data.requests || []).find((r) => r._id === id);
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

  const handleAction = async (type) => {
    if (type === "reject" && !remarks.trim()) {
      toast.error("Remarks are required for rejection.");
      return;
    }
    setActionLoading(true);
    try {
      const { data } = await axios.post(`/api/regularization/org/${id}/action`, {
        action: type,
        adminRemarks: remarks,
      });
      if (data.success) {
        toast.success(`Request ${type}d successfully`);
        setRequest((prev) => ({ ...prev, status: type === "approve" ? "approved" : "rejected", adminRemarks: remarks }));
        setConfirmAction(null);
        setRemarks("");
      }
    } catch (err) {
      if (err?.code !== "ERR_READ_ONLY_VIEW") {
        toast.error(err?.response?.data?.error || `Failed to ${type} request`);
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
        <EmptyState icon={FileText} title="Request not found" message="This regularization request could not be loaded." />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => navigate("/regularization")}>
            Back to Regularization
          </Button>
        </div>
      </div>
    );
  }

  const isPending = (request.status || "pending").toLowerCase() === "pending";
  // Current uploads carry evidenceData (base64, works from any machine);
  // evidenceUrl is only for records saved before that change, and is only
  // readable from whichever machine originally saved the file to disk.
  const isPdf = request.evidenceData
    ? request.evidenceData.startsWith("data:application/pdf")
    : (request.evidenceUrl || "").endsWith(".pdf");
  const evidenceUrl = request.evidenceData || getEvidenceUrl(request.evidenceUrl);
  const hasEvidence = !!(request.evidenceData || request.evidenceUrl);

  return (
    <ScrollReveal y={20} duration={600} blur={0} className="w-full min-w-0 space-y-4 sm:space-y-6">
      <DetailHeader
        kicker="ATTENDANCE REGULARIZATION"
        title={request.student?.fullName || "Regularization Request"}
        status={request.status}
        backTo="/regularization"
      />

      <DetailSection title="Request Details" icon={CalendarCheck}>
        <DetailGrid>
          <DetailField label="Employee">{request.student?.fullName || "Unknown"}</DetailField>
          {request.student?.uid && <DetailField label="Employee ID">{request.student.uid}</DetailField>}
          <DetailField label="Date">{fmtDate(request.date)}</DetailField>
          <DetailField label="Type">{TYPE_LABEL[request.type] || request.type}</DetailField>
          <DetailField label="Requested Check-In" icon={LogIn}>{fmtTime(request.requestedCheckInTime)}</DetailField>
          <DetailField label="Requested Check-Out" icon={LogOut}>{fmtTime(request.requestedCheckOutTime)}</DetailField>
          <DetailField label="Reason Type" icon={MessageSquare}>{request.reasonType}</DetailField>
          <DetailField label="Description" full>{request.description || "—"}</DetailField>
        </DetailGrid>
      </DetailSection>

      {hasEvidence && (
        <DetailSection title="Evidence" icon={Paperclip}>
          {isPdf ? (
            <a
              href={evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <FileText className="h-4 w-4" /> View PDF Document
            </a>
          ) : evidenceLoadFailed ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
              <Paperclip className="h-4 w-4 shrink-0" />
              <span>
                Evidence image could not be loaded.{" "}
                <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400">
                  Try opening directly
                </a>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setLightboxOpen(true)} className="transition hover:opacity-90 active:scale-95 focus:outline-none">
              <img
                src={evidenceUrl}
                alt="Evidence"
                onError={() => setEvidenceLoadFailed(true)}
                className="max-h-56 w-auto rounded-xl border border-slate-200 object-contain shadow-sm dark:border-slate-700"
              />
            </button>
          )}
        </DetailSection>
      )}

      {request.status !== "pending" && (
        <DetailSection title="Admin Action">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {request.status === "approved" ? "Approved" : "Rejected"} by {request.actionBy || "—"} on {fmtDate(request.actionDate)}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Admin Remarks</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{request.adminRemarks || "No remarks provided."}</p>
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
              <Button variant="danger" icon={Ban} onClick={() => setConfirmAction("reject")}>
                Reject
              </Button>
            </div>
          )}
        </DetailSection>
      )}

      <ConfirmDialog
        open={confirmAction === "approve"}
        title="Approve request?"
        message="This will create the employee's missing attendance record(s) for the requested date. You can leave optional remarks."
        confirmLabel="Approve"
        loading={actionLoading}
        onConfirm={() => handleAction("approve")}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "reject"}
        variant="danger"
        title="Reject request?"
        confirmLabel="Reject"
        loading={actionLoading}
        message={
          <span className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">Provide a reason for rejecting this regularization request.</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Reason for rejection (required)..."
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </span>
        }
        onConfirm={() => handleAction("reject")}
        onCancel={() => {
          setConfirmAction(null);
          setRemarks("");
        }}
      />

      {lightboxOpen && (
        <ImageLightbox
          photos={[{ image: evidenceUrl, label: "Evidence" }]}
          index={0}
          onClose={() => setLightboxOpen(false)}
          onIndexChange={() => {}}
        />
      )}
    </ScrollReveal>
  );
};

export default RegularizationDetail;
