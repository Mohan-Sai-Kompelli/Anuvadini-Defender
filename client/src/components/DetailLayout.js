import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "./RequestCard";

// Shared header for full-page request-detail views: Back button (browser
// history, so it always lands back on whichever list/tab/filter the user
// came from) + kicker + title + status badge.
export const DetailHeader = ({ kicker, title, status, backTo }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          aria-label="Back"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div>
          {kicker && (
            <div className="kicker-label mb-1 text-emerald-700 dark:text-emerald-400">{kicker}</div>
          )}
          <h1
            className="text-xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
            style={{ fontFamily: "'Geist','Inter',sans-serif" }}
          >
            {title}
          </h1>
        </div>
      </div>
      {status && <StatusBadge status={status} />}
    </div>
  );
};

// A titled group of fields, with a divider under the heading — used to break
// a detail page into logical blocks (e.g. "Request", "Evidence", "Approval").
export const DetailSection = ({ title, icon: Icon, children, className = "" }) => (
  <div className={`rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5 ${className}`}>
    {title && (
      <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        {Icon && <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h2>
      </div>
    )}
    {children}
  </div>
);

// Single label/value pair. `full` spans both grid columns (for long text like
// descriptions/addresses); otherwise fields sit two-up on desktop.
export const DetailField = ({ label, children, full = false, icon: Icon }) => {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className={full ? "col-span-full" : ""}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <div className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
        {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
        <div className="min-w-0 whitespace-pre-wrap break-words">{children}</div>
      </div>
    </div>
  );
};

export const DetailGrid = ({ children }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
);
