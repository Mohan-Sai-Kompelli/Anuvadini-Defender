import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { LogOut, Image as ImageIcon, Check, X as XIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { DetailHeader, DetailSection, DetailGrid, DetailField } from "../components/DetailLayout";
import ImageLightbox from "../components/ImageLightbox";
import ScrollReveal from "../components/ScrollReveal";
import { Button, ConfirmDialog, EmptyState } from "../components/ui";

const CheckoutRequestDetail = () => {
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
  const [rejectReason, setRejectReason] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    if (request) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get("/api/get-cheakout-request", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (cancelled) return;
        const found = (Array.isArray(res.data) ? res.data : []).find((r) => r._id === id);
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
      await axios.put(`/api/update-cheakout-request-status/${id}`, { requestId: id, status, reson: reason });
      toast.success(`Request ${status === "approved" ? "approved" : "rejected"} successfully!`);
      setRequest((prev) => ({ ...prev, status, reson: reason }));
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
        <EmptyState icon={LogOut} title="Request not found" message="This checkout request could not be loaded." />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => navigate("/checkout-request")}>
            Back to Checkout Requests
          </Button>
        </div>
      </div>
    );
  }

  const isPending = (request.status || "pending").toLowerCase() === "pending";
  const evidence = request.evidence || [];

  return (
    <ScrollReveal y={20} duration={600} blur={0} className="w-full min-w-0 space-y-4 sm:space-y-6">
      <DetailHeader kicker="CHECKOUT REQUEST" title={request.student?.fullName || "Checkout Request"} status={request.status} backTo="/checkout-request" />

      <DetailSection title="Request Details" icon={LogOut}>
        <DetailGrid>
          <DetailField label="Student">{request.student?.fullName || "Unknown"}</DetailField>
          {request.student?.uid && <DetailField label="UID">{request.student.uid}</DetailField>}
          <DetailField label="Departure Date">
            {request.date ? format(new Date(request.date), "dd MMM yyyy") : "N/A"}
          </DetailField>
          <DetailField label="Checkout Details" full>{request.details || "No checkout details provided."}</DetailField>
          {request.status === "rejected" && request.reson && (
            <DetailField label="Rejection Note" full>{request.reson}</DetailField>
          )}
        </DetailGrid>
      </DetailSection>

      {evidence.length > 0 && (
        <DetailSection title={`Evidence (${evidence.length})`} icon={ImageIcon}>
          <div className="flex flex-wrap gap-3">
            {evidence.map((p, i) => {
              const src = typeof p === "string" ? p : (p?.image || p?.url || p?.uri || "");
              const label = typeof p === "string" ? `Evidence ${i + 1}` : (p?.label || `Evidence ${i + 1}`);
              return (
                <button
                  key={p._id || i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  title={label}
                  className="transition hover:opacity-90 active:scale-95 focus:outline-none"
                >
                  <img
                    src={src}
                    alt={label}
                    className="h-24 w-24 rounded-md border border-slate-200 object-cover shadow-sm hover:shadow-md dark:border-slate-700"
                  />
                </button>
              );
            })}
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
        title="Approve checkout request?"
        message="The student will be notified that their checkout has been approved."
        confirmLabel="Approve"
        loading={actionLoading}
        onConfirm={() => handleUpdateStatus("approved")}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "reject"}
        variant="danger"
        title="Reject checkout request?"
        confirmLabel="Reject"
        loading={actionLoading}
        message={
          <span className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">Provide a reason for the rejection (optional).</span>
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

      {lightboxIndex !== null && (
        <ImageLightbox
          photos={evidence}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </ScrollReveal>
  );
};

export default CheckoutRequestDetail;
