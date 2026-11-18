import React, { useEffect, useState } from "react";
import axios from "axios";
import { FileText, AlertCircle } from "lucide-react";
import { openLeaveAttachment } from "../utils/downloadAttachment";
import ImageLightbox from "./ImageLightbox";

// The attachment route is auth-guarded, so a plain <img src> can't reach it —
// fetch the bytes as a blob (same axios instance carries the Bearer token)
// and render that as the thumbnail, matching how the mobile app shows these
// (RN <Image> with an explicit Authorization header).
const AttachmentPreview = ({ att, requestId }) => {
  const [imgSrc, setImgSrc] = useState(null);
  const [status, setStatus] = useState("loading"); // 'loading' | 'image' | 'file' | 'error'
  const [errorDetail, setErrorDetail] = useState("");
  const [showLightbox, setShowLightbox] = useState(false);
  const url = att.url || `/api/leaves/${requestId}/attachments/${att.id || att._id}`;

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setStatus("loading");

    // Non-image files (PDF/DOCX) — no point fetching a blob just to render an
    // icon, and known-good metadata means we can skip straight to the icon.
    const knownNonImage = att.mimeType && !att.mimeType.startsWith("image/");
    if (knownNonImage) {
      setStatus("file");
      return undefined;
    }

    axios
      .get(url, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        // Trust the actual response content-type over stored metadata — some
        // older records may have missing/stale mimeType.
        const contentType = res.data?.type || att.mimeType || "";
        if (contentType.startsWith("image/")) {
          objectUrl = URL.createObjectURL(res.data);
          setImgSrc(objectUrl);
          setStatus("image");
        } else {
          setStatus("file");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[AttachmentPreview] failed to load", url, err?.response?.status, err?.response?.data || err?.message);
        setErrorDetail(err?.response?.data?.error || err?.response?.status ? `Error ${err.response?.status}` : "Network error");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, att.mimeType]);

  if (status === "loading") {
    return <div className="h-20 w-20 animate-pulse rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />;
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={() => openLeaveAttachment(url, att.originalName)}
        title={`${att.originalName || "attachment"} — ${errorDetail}, click to retry opening directly`}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-danger-200 bg-danger-50 p-1 text-center hover:bg-danger-100 dark:border-danger-900/40 dark:bg-danger-950/20 dark:hover:bg-danger-950/30"
      >
        <AlertCircle className="h-6 w-6 text-danger-500" aria-hidden="true" />
        <span className="w-full truncate text-[10px] text-danger-600 dark:text-danger-400">Failed to load</span>
      </button>
    );
  }

  if (status === "image") {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowLightbox(true)}
          title={att.originalName}
          className="focus:outline-none transition hover:opacity-90 active:scale-95"
        >
          <img
            src={imgSrc}
            alt={att.originalName || "attachment"}
            className="h-20 w-20 rounded-md border border-slate-200 object-cover dark:border-slate-700"
          />
        </button>
        {showLightbox && (
          <ImageLightbox
            photos={[{ image: imgSrc, label: att.originalName }]}
            index={0}
            onClose={() => setShowLightbox(false)}
          />
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openLeaveAttachment(url, att.originalName)}
      title={att.originalName}
      className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 text-center hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800"
    >
      <FileText className="h-6 w-6 text-slate-400" aria-hidden="true" />
      <span className="w-full truncate text-[10px] text-slate-500 dark:text-slate-400">
        {att.originalName || "file"}
      </span>
    </button>
  );
};

export default AttachmentPreview;
