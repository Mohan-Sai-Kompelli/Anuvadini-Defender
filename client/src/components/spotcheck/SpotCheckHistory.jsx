import React, { useState } from 'react';
import axios from 'axios';
import {
  Zap, ChevronDown, CheckCircle2, XCircle, Clock, Loader2, Hand, Cpu,
} from 'lucide-react';
import { EmptyState } from '../ui';

const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const rateColor = (r) =>
  r >= 0.8 ? 'text-emerald-600' : r >= 0.5 ? 'text-emerald-600' : 'text-rose-600';

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '—';
const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

// One expandable session row. Fetches the round roster the first time it opens.
// `rounds` arrive newest-first, so index 0 is the most recent session (#SC001).
function SessionRow({ round, index }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const resolved = round.responded + round.missed;
  const rate = resolved ? round.responded / resolved : 0;
  const label = `#SC${String(index + 1).padStart(3, '0')}`;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      setLoading(true);
      try {
        const res = await axios.get(`/api/spot-checks/round/${round.roundId}`);
        setData(res.data);
      } catch {
        setData({ checks: [] });
      } finally {
        setLoading(false);
      }
    }
  };

  const responders = (data?.checks || []).filter((c) => c.status === 'responded');
  const missers = (data?.checks || []).filter((c) => c.status === 'missed');
  const awaiting = (data?.checks || []).filter((c) => c.status === 'pending');

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Zap className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Spot-Check {label}</span>
            <span className="inline-flex items-center gap-1 rounded-pill bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {round.triggeredBy === 'manual' ? <Hand className="h-2.5 w-2.5" /> : <Cpu className="h-2.5 w-2.5" />}
              {round.triggeredBy === 'manual' ? 'Manual' : 'Auto'}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" /> {fmtDateTime(round.issuedAt)}
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <div className={`text-lg font-bold tabular-nums ${rateColor(rate)}`}>{pct(rate)}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">response</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
            {round.responded}/{round.issued}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">responded</div>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/30">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading session insights…
            </div>
          ) : (
            <div className="space-y-4">
              {/* Insight chips */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Issued', round.issued, 'text-slate-800 dark:text-slate-100'],
                  ['Responded', round.responded, 'text-emerald-600'],
                  ['Missed', round.missed, 'text-rose-600'],
                  ['Awaiting', round.pending, 'text-amber-600'],
                ].map(([l, v, cls]) => (
                  <div key={l} className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900">
                    <div className={`text-xl font-bold tabular-nums ${cls}`}>{v}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{l}</div>
                  </div>
                ))}
              </div>

              {/* Response rate bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Session response rate · {round.windowMinutes ? `${round.windowMinutes}m window` : 'window'}</span>
                  <span className={`font-bold ${rateColor(rate)}`}>{pct(rate)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(rate * 100)}%` }} />
                </div>
              </div>

              {/* Who responded / who missed */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Responded ({responders.length})
                  </div>
                  <ul data-lenis-prevent className="max-h-56 space-y-1 overflow-y-auto overscroll-contain pr-1.5">
                    {responders.length === 0 ? (
                      <li className="text-xs text-slate-400">Nobody responded.</li>
                    ) : (
                      responders.map((c) => (
                        <li key={c._id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-slate-700 dark:text-slate-200">{c.student?.fullName || 'Unknown'}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{fmtTime(c.respondedAt)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                    <XCircle className="h-3.5 w-3.5" /> Missed ({missers.length})
                  </div>
                  <ul data-lenis-prevent className="max-h-56 space-y-1 overflow-y-auto overscroll-contain pr-1.5">
                    {missers.length === 0 && awaiting.length === 0 ? (
                      <li className="text-xs text-slate-400">No misses 🎉</li>
                    ) : (
                      <>
                        {missers.map((c) => (
                          <li key={c._id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-slate-700 dark:text-slate-200">{c.student?.fullName || 'Unknown'}</span>
                            {c.markedAfterMiss && (
                              <span className="shrink-0 rounded-pill bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-900/30">
                                proxy suspect
                              </span>
                            )}
                          </li>
                        ))}
                        {awaiting.map((c) => (
                          <li key={c._id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-slate-500 dark:text-slate-400">{c.student?.fullName || 'Unknown'}</span>
                            <span className="shrink-0 text-[10px] text-amber-500">awaiting</span>
                          </li>
                        ))}
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SpotCheckHistory({ rounds = [] }) {
  if (!rounds.length) {
    return (
      <EmptyState title="No spot-check sessions" message="No spot-check rounds in this period. Send a spot-check to start one." />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Showing {rounds.length} spot-check{rounds.length === 1 ? '' : 's'} — click to expand
      </p>
      {rounds.map((r, i) => (
        <SessionRow key={r.roundId} round={r} index={i} />
      ))}
    </div>
  );
}
