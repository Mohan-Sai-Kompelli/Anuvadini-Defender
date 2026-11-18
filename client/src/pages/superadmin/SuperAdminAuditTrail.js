import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  ScrollText,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldX,
  CheckCircle2,
  XCircle,
  Info,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Card, EmptyState, SkeletonTable, Button } from '../../components/ui';
import { superAdminAuditAPI } from '../../services/api';

const OUTCOME = {
  success: { cls: 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400', Icon: CheckCircle2 },
  failure: { cls: 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400', Icon: XCircle },
  flagged: { cls: 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400', Icon: ShieldAlert },
  info: { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', Icon: Info },
};

const ACTION_LABEL = {
  'attendance.face_verify': 'Face verification',
  'attendance.liveness': 'Liveness check',
  'attendance.marked': 'Attendance marked',
  'attendance.injection_risk': 'Injection risk flagged',
  'attendance.unapproved_absence': 'Unapproved absence',
  'auth.org_login': 'Organization login',
  'spot_check.missed': 'Spot-check missed',
  'leave.auto_marked': 'Leave auto-marked',
  'leave.status_updated': 'Leave decision',
};

const ACTIONS = Object.keys(ACTION_LABEL);
const OUTCOMES = ['success', 'failure', 'flagged', 'info'];

function OutcomeBadge({ outcome }) {
  const meta = OUTCOME[outcome] || OUTCOME.info;
  const { Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
      <Icon className="h-3 w-3" /> {outcome}
    </span>
  );
}

function fmt(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-GB', { hour12: false });
}

function Select({ value, options, onChange, placeholder = 'Select' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value));
  return (
    <div className={`relative mt-1 min-w-0 ${open ? 'z-[120]' : 'z-0'}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button
        type="button"
        onClick={() => setOpen((c) => !c)}
        className="flex min-h-[2.75rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-[999] mt-1 max-h-[min(18rem,45vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-elevation-3 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-elevation-3-dark" role="listbox">
          {options.map((o) => {
            const isSelected = String(o.value) === String(value);
            return (
              <button
                key={o.value || '__all'}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`block w-full min-w-0 px-3 py-2.5 text-left text-sm transition ${isSelected ? 'bg-primary-600 text-white' : 'text-slate-800 hover:bg-primary-50 hover:text-primary-700 dark:text-slate-100 dark:hover:bg-slate-800'}`}
                role="option"
                aria-selected={isSelected}
              >
                <span className="block truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VerifyButton({ id }) {
  const [state, setState] = useState('idle'); // idle | checking | valid | invalid
  const run = async () => {
    setState('checking');
    try {
      const res = await superAdminAuditAPI.verify(id);
      setState(res?.valid ? 'valid' : 'invalid');
      if (!res?.valid) toast.error('Integrity check FAILED — this record may have been altered.');
    } catch (e) {
      setState('idle');
      toast.error('Could not verify this entry');
    }
  };
  if (state === 'valid') {
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-success-600 dark:text-success-400"><ShieldCheck className="h-3.5 w-3.5" /> Verified</span>;
  }
  if (state === 'invalid') {
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-danger-600 dark:text-danger-400"><ShieldX className="h-3.5 w-3.5" /> Tampered</span>;
  }
  return (
    <button
      onClick={run}
      disabled={state === 'checking'}
      className="text-xs font-semibold text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
    >
      {state === 'checking' ? 'Checking…' : 'Verify hash'}
    </button>
  );
}

function MobileAuditEntry({ entry }) {
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">When</p>
          <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{fmt(entry.at)}</p>
        </div>
        <OutcomeBadge outcome={entry.outcome} />
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Institution</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">
          {entry.organizationName || '-'}
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Action</p>
          <p className="mt-1 break-words text-sm font-medium text-slate-900 dark:text-slate-100">
            {ACTION_LABEL[entry.action] || entry.action}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Actor</p>
          <p className="mt-1 text-sm font-medium capitalize text-slate-700 dark:text-slate-200">{entry.actorType || 'System'}</p>
          {entry.actorLabel ? <p className="mt-0.5 break-words text-xs text-slate-400 dark:text-slate-500">{entry.actorLabel}</p> : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Integrity</span>
        <VerifyButton id={entry._id} />
      </div>
    </div>
  );
}

export default function SuperAdminAuditTrail() {
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await superAdminAuditAPI.query({ action: action || undefined, outcome: outcome || undefined, page, limit: 50 });
      if (data && data.success) {
        setEntries(data.entries || []);
        const p = data.pagination || {};
        setPagination({ page: p.page ?? 1, pages: p.pages ?? 1, total: p.total ?? 0, limit: p.limit ?? 50 });
      } else {
        setError((data && data.error) || 'Failed to load audit trail');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, [action, outcome, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [action, outcome]);

  return (
    <div className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <div className="rounded-md bg-primary-600 p-2.5 text-white shadow-elevation-1 dark:shadow-elevation-1-dark">
          <ScrollText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Audit Trail</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
            Network-wide, tamper-evident log across every institution. Each entry is HMAC-hashed — click "Verify hash" to confirm a specific row hasn't been altered.
          </p>
        </div>
      </div>

      <Card className="relative z-30 overflow-visible" bodyClassName="overflow-visible p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,20rem)_auto] md:items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Action</label>
            <Select value={action} onChange={setAction} placeholder="All actions" options={[{ value: '', label: 'All actions' }, ...ACTIONS.map((a) => ({ value: a, label: ACTION_LABEL[a] }))]} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Outcome</label>
            <Select value={outcome} onChange={setOutcome} placeholder="All outcomes" options={[{ value: '', label: 'All outcomes' }, ...OUTCOMES.map((o) => ({ value: o, label: o }))]} />
          </div>
          <Button variant="outline" onClick={load} icon={RefreshCw} className="w-full md:w-auto md:self-end">Refresh</Button>
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-danger-50 p-4 text-sm text-danger-700 ring-1 ring-danger-100 dark:bg-danger-900/30 dark:text-danger-400 dark:ring-danger-900/50">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <Card
        title={`${pagination.total} entries`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Button variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} icon={ChevronLeft} aria-label="Previous page" />
            <span>Page {page} / {pagination.pages || 1}</span>
            <Button variant="ghost" size="sm" disabled={page >= (pagination.pages || 1) || loading} onClick={() => setPage((p) => p + 1)} icon={ChevronRight} aria-label="Next page" />
          </div>
        }
        bodyClassName="p-0"
      >
        {loading && entries.length === 0 ? (
          <SkeletonTable rows={8} cols={5} className="p-5" />
        ) : !loading && entries.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit entries" message="No audit entries match this filter." />
        ) : (
          <>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60 sm:hidden">
              {entries.map((e) => (
                <MobileAuditEntry key={e._id} entry={e} />
              ))}
            </div>

            <div className="hidden max-h-[65vh] overflow-auto sm:block">
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-700">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-3 py-3">Institution</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Outcome</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-5 py-3">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                {entries.map((e) => (
                  <tr key={e._id} className="align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40 motion-reduce:transition-none">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600 dark:text-slate-300">{fmt(e.at)}</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{e.organizationName || '—'}</td>
                    <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">{ACTION_LABEL[e.action] || e.action}</td>
                    <td className="px-3 py-3"><OutcomeBadge outcome={e.outcome} /></td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                      <span className="capitalize">{e.actorType}</span>
                      {e.actorLabel ? <span className="block text-xs text-slate-400 dark:text-slate-500">{e.actorLabel}</span> : null}
                    </td>
                    <td className="px-5 py-3"><VerifyButton id={e._id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
