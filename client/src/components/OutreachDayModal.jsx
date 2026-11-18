import React from 'react';
import { X, MapPin, Users, Calendar, ChevronRight, Tent } from 'lucide-react';

// Status palette mirrors the calendar dots so the picker reads consistently.
const STATUS_DOT = {
  pending: 'bg-amber-500',
  in_progress: 'bg-sky-500',
  completed: 'bg-emerald-500',
  rejected: 'bg-rose-500',
};
const STATUS_LABEL = {
  pending: 'Pending approval',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = String(iso).length <= 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * OutreachDayModal — shown when a calendar day holds more than one activity.
 * Lists that day's activities; picking one calls onSelect(item) so the parent
 * can open the full evidence/detail modal for that specific activity.
 */
export default function OutreachDayModal({ open, onClose, dateKey, items = [], onSelect }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col dark:bg-slate-900"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-100 p-2.5 dark:bg-emerald-950/40">
              <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100">
                {fmtDate(dateKey)}
              </h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {items.length} activities scheduled · select one to view details
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2" data-lenis-prevent>
          {items.map((a) => (
            <button
              key={a.id}
              onClick={() => onSelect && onSelect(a)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
                <Tent className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{a.title}</span>
                  {a.status && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[a.status] || STATUS_DOT.pending}`} />
                      {STATUS_LABEL[a.status] || a.status}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {a.type && <span className="font-semibold">{a.type}</span>}
                  {a.location && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {a.location}
                    </span>
                  )}
                  {a.participants > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {a.participants}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 dark:text-slate-600" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
