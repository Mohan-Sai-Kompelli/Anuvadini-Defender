import React, { useEffect } from "react";
import { X } from "lucide-react";

// Full-screen zoom viewer for a set of { image, label } photos, with
// keyboard + arrow-button navigation. Shared by outreach/checkout evidence
// and event-day report photos.
const ImageLightbox = ({ photos, index, onClose, onIndexChange }) => {
  useEffect(() => {
    if (!photos?.length) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && photos.length > 1) {
        onIndexChange(index === 0 ? photos.length - 1 : index - 1);
      } else if (e.key === "ArrowRight" && photos.length > 1) {
        onIndexChange(index === photos.length - 1 ? 0 : index + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [photos, index, onClose, onIndexChange]);

  if (!photos?.length) return null;
  const current = photos[index] || {};
  const imgSrc = typeof current === "string" ? current : (current?.image || current?.url || current?.uri || "");
  const imgLabel = typeof current === "string" ? null : current?.label;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 transition-all duration-300 animate-fade-in">
      <div className="absolute inset-0 cursor-zoom-out" onClick={onClose} aria-hidden="true" />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/60 text-white transition-all hover:bg-slate-800/80 focus:outline-none ring-1 ring-white/10"
        aria-label="Close image preview"
      >
        <X className="h-6 w-6" />
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => onIndexChange(index === 0 ? photos.length - 1 : index - 1)}
          className="absolute left-6 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/60 text-white transition-all hover:bg-slate-800/80 focus:outline-none ring-1 ring-white/10"
          aria-label="Previous image"
        >
          <span className="text-2xl font-bold">&larr;</span>
        </button>
      )}
      <div className="relative flex max-h-[85vh] max-w-[90vw] flex-col items-center justify-center overflow-hidden">
        <img
          src={imgSrc}
          alt={imgLabel || `Photo ${index + 1}`}
          className="max-h-[75vh] max-w-full select-none rounded-lg object-contain shadow-2xl transition-all duration-350"
        />
        {imgLabel && (
          <p className="mt-4 max-w-[80vw] rounded-full bg-slate-900/75 px-4 py-2 text-center text-sm font-semibold text-slate-100">
            {imgLabel}
          </p>
        )}
        <p className="mt-2 font-mono text-xs text-slate-400">
          Image {index + 1} of {photos.length}
        </p>
      </div>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => onIndexChange(index === photos.length - 1 ? 0 : index + 1)}
          className="absolute right-6 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/60 text-white transition-all hover:bg-slate-800/80 focus:outline-none ring-1 ring-white/10"
          aria-label="Next image"
        >
          <span className="text-2xl font-bold">&rarr;</span>
        </button>
      )}
    </div>
  );
};

export default ImageLightbox;
