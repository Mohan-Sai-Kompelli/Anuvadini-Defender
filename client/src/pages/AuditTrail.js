import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { auditAPI } from '../services/api';
import { Button, Card, EmptyState, SkeletonTable } from '../components/ui';

// Outcome → semantic tone + icon.
const OUTCOME = {
  success: {
    cls: 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    Icon: CheckCircle2,
  },
  failure: {
    cls: 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
    Icon: XCircle,
  },
  flagged: {
    cls: 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    Icon: ShieldAlert,
  },
  info: {
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    Icon: Info,
  },
};

// Friendly labels for the known action codes.
const ACTION_LABEL = {
  'attendance.face_verify': 'Face verification',
  'attendance.liveness': 'Liveness check',
  'attendance.marked': 'Attendance marked',
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
  const d = new Date(ts);
  return d.toLocaleString('en-GB', { hour12: false });
}

function AuditSelect({ value, options, onChange, placeholder = 'Select' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => String(option.value) === String(value));

  return (
    <div
      className={`relative mt-1 min-w-0 ${open ? 'z-[120]' : 'z-0'}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[2.75rem] w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[999] mt-1 max-h-[min(18rem,45vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-elevation-3 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-elevation-3-dark"
          data-lenis-prevent
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={option.value || '__all'}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full min-w-0 px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-800 hover:bg-primary-50 hover:text-primary-700 dark:text-slate-100 dark:hover:bg-slate-800'
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
function AuditMobileCard({ entry }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">{ACTION_LABEL[entry.action] || entry.action}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{fmt(entry.at)}</p>
        </div>
        <OutcomeBadge outcome={entry.outcome} />
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Actor</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="capitalize">{entry.actorType}</span>{entry.actorLabel ? ` - ${entry.actorLabel}` : ''}
        </p>
      </div>
    </div>
  );
}
export default function AuditTrail() {
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
      const data = await auditAPI.query({ action: action || undefined, outcome: outcome || undefined, page, limit: 50 });
      if (data && data.success) {
        setEntries(data.entries || []);
        const p = data.pagination || {};
        setPagination({
          page: p.page ?? 1,
          pages: p.pages ?? 1,
          total: p.total ?? 0,
          limit: p.limit ?? 50,
        });
      } else {
        setError((data && data.error) || 'Failed to load audit trail');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, [action, outcome, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [action, outcome]);

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[34rem] w-full min-w-0 flex-col gap-4 overflow-hidden sm:gap-6">
      {/* Header */}
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <div className="rounded-md bg-primary-600 p-2.5 text-white shadow-elevation-1 dark:shadow-elevation-1-dark">
          <ScrollText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Audit Trail</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
            Tamper-evident log of verifications, logins, and flags. Each entry is hashed.
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="relative z-30 overflow-visible" bodyClassName="overflow-visible p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,20rem)_minmax(0,1fr)] md:items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Action</label>
            <AuditSelect
              value={action}
              onChange={setAction}
              placeholder="All actions"
              options={[
                { value: '', label: 'All actions' },
                ...ACTIONS.map((a) => ({ value: a, label: ACTION_LABEL[a] })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Outcome</label>
            <AuditSelect
              value={outcome}
              onChange={setOutcome}
              placeholder="All outcomes"
              options={[
                { value: '', label: 'All outcomes' },
                ...OUTCOMES.map((o) => ({ value: o, label: o })),
              ]}
            />
          </div>
          <div className="flex w-full justify-stretch md:justify-end">
            <Button variant="outline" onClick={load} icon={RefreshCw} className="w-full justify-center sm:w-auto md:min-w-28">
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-danger-50 p-4 text-sm text-danger-700 ring-1 ring-danger-100 dark:bg-danger-900/30 dark:text-danger-400 dark:ring-danger-900/50">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Table */}
      <Card
        className="flex min-h-0 flex-1 flex-col"
        title={`${pagination.total} entries`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              icon={ChevronLeft}
              aria-label="Previous page"
            />
            <span>
              Page {page} / {pagination.pages || 1}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= (pagination.pages || 1) || loading}
              onClick={() => setPage((p) => p + 1)}
              icon={ChevronRight}
              aria-label="Next page"
            />
          </div>
        }
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        {loading && entries.length === 0 ? (
          <SkeletonTable rows={8} cols={4} className="p-5" />
        ) : !loading && entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit entries"
            message="No audit entries match this filter. Try a different action or outcome."
          />
        ) : (
          <><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:hidden" data-lenis-prevent>{entries.map((e) => <AuditMobileCard key={e._id} entry={e} />)}</div><div className="hidden min-h-0 flex-1 overflow-auto sm:block" data-lenis-prevent><table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-700">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Outcome</th>
                  <th className="px-5 py-3">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                {entries.map((e) => (
                  <tr
                    key={e._id}
                    className="align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40 motion-reduce:transition-none"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600 dark:text-slate-300">{fmt(e.at)}</td>
                    <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {ACTION_LABEL[e.action] || e.action}
                    </td>
                    <td className="px-3 py-3">
                      <OutcomeBadge outcome={e.outcome} />
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      <span className="capitalize">{e.actorType}</span>
                      {e.actorLabel ? (
                        <span className="block text-xs text-slate-400 dark:text-slate-500">{e.actorLabel}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div></>
        )}
      </Card>
    </div>
  );
}

