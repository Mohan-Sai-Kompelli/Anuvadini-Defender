import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ScanFace,
  MapPin,
  ImageOff,
  Activity,
  Info,
  ChevronDown,
  UserX,
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../components/ui';

// Every row here is a blocked anti-spoof (fake face) attempt recorded live by
// the server's PAD model at check-in/class-checkin/spot-check time — see
// GET /api/attendance/spoof-attempts (server/routes/attendance.js), backed by
// the SpoofAttempt collection. There is no "accepted" bucket: a SpoofAttempt
// row only exists BECAUSE the attempt was blocked, so every item below is
// either "rejected" (fake, didn't match the enrolled face) or "flagged"
// (fake AND matched the enrolled identity — the more serious case, someone
// replaying the genuine person's own face).
const EVENT_LABEL = {
  in: 'Check-in',
  out: 'Check-out',
  class: 'Class check-in',
  spotcheck: 'Spot-check',
};

const DECISION_META = {
  rejected: {
    label: 'Blocked',
    icon: XCircle,
    badge: 'bg-danger-50 text-danger-700 dark:bg-danger-900/40 dark:text-danger-400',
  },
  flagged: {
    label: 'Flagged for review',
    icon: AlertTriangle,
    badge: 'bg-warning-50 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400',
  },
  // A genuine LIVE face (PAD correctly scored it 'real' — this is NOT a
  // screen/photo replay) that simply isn't the account owner's. Recorded as a
  // SecurityEvent, not a SpoofAttempt (see GET /api/attendance/spoof-attempts),
  // and kept visually distinct here so it doesn't read as "the same kind of
  // blocked fake" as the other two — it's a different person, not a replay.
  impersonation: {
    label: 'Different person (impersonation)',
    icon: UserX,
    badge: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  },
};

const GPS_LABEL = {
  present: { text: 'Recorded', cls: 'text-slate-600 dark:text-slate-300' },
  '—': { text: 'Not captured', cls: 'text-slate-400 dark:text-slate-500' },
};

function VerificationSelect({ value, options, onChange, placeholder = 'Select', className = '' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => String(option.value) === String(value));

  return (
    <div className={`relative min-w-0 ${className}`} onBlur={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[2.65rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-800 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-elevation-3 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-elevation-3-dark"
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full min-w-0 px-3.5 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-800 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-slate-800'
                }`}
                role="option"
                aria-selected={isSelected}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
function VerificationAttemptCard({ attempt }) {
  const meta = DECISION_META[attempt.decision];
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">{attempt.staff}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{attempt.time} · {attempt.event}</p>
        </div>
        <span className={`inline-flex max-w-[8.75rem] shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.badge}`}>
          <meta.icon className="h-3 w-3" aria-hidden="true" />
          {meta.label}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">Real-face score</p>
          <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">
            {attempt.score != null ? `${(attempt.score * 100).toFixed(0)}%` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">Identity match</p>
          <p className={`mt-1 font-bold ${attempt.matched ? 'text-danger-600 dark:text-danger-400' : 'text-slate-700 dark:text-slate-200'}`}>
            {attempt.matched ? 'Matched enrolled face' : 'No match'}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">GPS</p>
          <p className={`mt-1 font-bold ${(GPS_LABEL[attempt.gps] || GPS_LABEL['—']).cls}`}>
            {(GPS_LABEL[attempt.gps] || GPS_LABEL['—']).text}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">Model</p>
          <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">{attempt.model || '—'}</p>
        </div>
      </div>
    </div>
  );
}

export default function VerificationEngine() {
  const [query, setQuery] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('all');
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get('/api/attendance/spoof-attempts', { params: { pageSize: 100 } });
        if (cancelled) return;
        const items = (res.data?.items || []).map((r) => ({
          id: r.id,
          time: r.time ? new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
          staff: r.staff || 'Unknown',
          event: EVENT_LABEL[r.type] || 'Check-in',
          score: r.score,
          matched: r.matched,
          model: r.model,
          gps: r.latitude != null && r.longitude != null ? 'present' : '—',
          // A different-person impersonation gets its own decision bucket —
          // it's not a replay attack at all, so it shouldn't read as just
          // another "Blocked"/"Flagged" fake. Otherwise: blocked-and-matched
          // (same person's face replayed) is the more serious case → flagged
          // for review; plain replay otherwise just rejected.
          decision: r.kind === 'impersonation' ? 'impersonation' : r.matched ? 'flagged' : 'rejected',
        }));
        setAttempts(items);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load spoof attempts:', err);
          setError('Could not load verification attempts.');
          toast.error('Could not load verification attempts');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(
    () =>
      attempts.filter((a) => {
        if (decisionFilter !== 'all' && a.decision !== decisionFilter) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return a.staff.toLowerCase().includes(q) || a.event.toLowerCase().includes(q);
      }),
    [attempts, query, decisionFilter]
  );

  const stats = useMemo(() => {
    const rejected = attempts.filter((a) => a.decision === 'rejected').length;
    const flagged = attempts.filter((a) => a.decision === 'flagged').length;
    const impersonation = attempts.filter((a) => a.decision === 'impersonation').length;
    const gpsFlags = attempts.filter((a) => a.gps === 'present').length;
    return { total: attempts.length, rejected, flagged, impersonation, gpsFlags };
  }, [attempts]);

  return (
    <div className="w-full min-w-0 space-y-4 overflow-hidden sm:space-y-6">
      {/* Header */}
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <div className="rounded-lg bg-primary-600 p-2.5 text-white">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Verification Engine
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
            Attendance/class/spot-check attempts the server's anti-spoof model blocked as a fake
            (replayed photo or screen) face — pulled live from the fraud-detection log.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Blocked attempts" value={stats.total} icon={Activity} />
        <StatCard label="Blocked, no identity match" value={stats.rejected} icon={XCircle} />
        <StatCard label="Flagged — matched enrolled face" value={stats.flagged} icon={AlertTriangle} />
        <StatCard label="Different person (impersonation)" value={stats.impersonation} icon={UserX} />
        <StatCard label="With GPS on record" value={stats.gpsFlags} icon={MapPin} />
      </div>

      {/* Scope note */}
      <div className="flex items-start gap-2 rounded-md bg-info-50 p-3 text-xs text-info-700 dark:bg-info-900/30 dark:text-info-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Every row here is a blocked attempt — the mark itself never went through. "Flagged"
          means the fake face also matched the enrolled identity (someone replaying the genuine
          person's own face); "Blocked" means it didn't match anyone. "Different person" is not a
          replay at all — a genuine live face that simply isn't the account owner's.
        </span>
      </div>

      {/* Filters */}
      <Card className="relative z-30 !overflow-visible" bodyClassName="overflow-visible">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(11rem,14rem)_1fr] sm:items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Decision
            </label>
            <VerificationSelect
              value={decisionFilter}
              onChange={setDecisionFilter}
              options={[
                { value: 'all', label: 'All decisions' },
                ...Object.entries(DECISION_META).map(([key, meta]) => ({ value: key, label: meta.label })),
              ]}
              placeholder="All decisions"
            />
          </div>
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              placeholder="Search staff / event"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </Card>

      {/* Attempts table */}
      <Card className="relative z-0" bodyClassName="!p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading verification attempts…</div>
        ) : error ? (
          <EmptyState icon={XCircle} title="Couldn't load data" message={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No blocked attempts"
            message={attempts.length === 0 ? 'No fake-face attempts have been blocked yet.' : 'No attempts match the current filters.'}
          />
        ) : (
          <>
            <div className="space-y-3 p-3 sm:hidden">
              {rows.map((a) => <VerificationAttemptCard key={a.id} attempt={a} />)}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-3 py-3">Staff</th>
                  <th className="px-3 py-3">Event</th>
                  <th className="px-3 py-3">
                    <ScanFace className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    Real-face score
                  </th>
                  <th className="px-3 py-3">Identity match</th>
                  <th className="px-3 py-3">
                    <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    GPS
                  </th>
                  <th className="px-3 py-3">
                    <ImageOff className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    Model
                  </th>
                  <th className="px-5 py-3">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {rows.map((a) => {
                  const meta = DECISION_META[a.decision];
                  const gps = GPS_LABEL[a.gps] || GPS_LABEL['—'];
                  return (
                    <tr
                      key={a.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{a.time}</td>
                      <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {a.staff}
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{a.event}</td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {a.score != null ? `${(a.score * 100).toFixed(0)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-xs font-medium ${
                            a.matched
                              ? 'text-danger-600 dark:text-danger-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {a.matched ? 'Matched enrolled face' : 'No match'}
                        </span>
                      </td>
                      <td className={`px-3 py-3 text-xs font-medium ${gps.cls}`}>{gps.text}</td>
                      <td className="px-3 py-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {a.model || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
                        >
                          <meta.icon className="h-3 w-3" aria-hidden="true" />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
