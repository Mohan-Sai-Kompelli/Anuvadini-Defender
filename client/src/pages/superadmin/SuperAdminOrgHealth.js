import React, { useState, useEffect, useCallback } from 'react';
import {
  HeartPulse,
  RefreshCw,
  AlertTriangle,
  CircleSlash,
  Clock,
  CheckCircle2,
  Fingerprint,
} from 'lucide-react';
import { Card, EmptyState, SkeletonTable, StatCard, Button } from '../../components/ui';
import { orgHealthAPI } from '../../services/api';

const STATUS_META = {
  healthy: { label: 'Healthy', cls: 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400', Icon: CheckCircle2 },
  stale: { label: 'Stale (30+ days quiet)', cls: 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400', Icon: Clock },
  never_logged_in: { label: 'Never logged in', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', Icon: AlertTriangle },
  dormant: { label: 'Deactivated', cls: 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400', Icon: CircleSlash },
};

function fmtDate(ts) {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysAgoLabel(days) {
  if (days == null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.healthy;
  const { Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function MobileOrgHealthCard({ org }) {
  const biometrics = org.enabledBiometrics && org.enabledBiometrics.length > 0
    ? org.enabledBiometrics.join(', ')
    : '-';

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">{org.name}</p>
          {org.type ? <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{org.type}</p> : null}
        </div>
        <StatusBadge status={org.status} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Last Login</p>
          <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{fmtDate(org.lastLogin)}</p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{daysAgoLabel(org.daysSinceLogin)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Last Attendance Activity</p>
          <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{fmtDate(org.lastActivity)}</p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{daysAgoLabel(org.daysSinceActivity)}</p>
        </div>
      </div>

      <div className="flex min-w-0 items-start gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600 dark:border-slate-700/60 dark:text-slate-300">
        <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Biometrics Enabled</p>
          <p className="mt-1 break-words font-medium">{biometrics}</p>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminOrgHealth() {
  const [orgs, setOrgs] = useState([]);
  const [summary, setSummary] = useState({ total: 0, healthy: 0, stale: 0, neverLoggedIn: 0, dormant: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await orgHealthAPI.list();
      if (data.success) {
        setOrgs(data.organizations || []);
        setSummary(data.summary || { total: 0, healthy: 0, stale: 0, neverLoggedIn: 0, dormant: 0 });
      } else {
        setError(data.error || 'Failed to load organization health');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load organization health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <div className="rounded-md bg-primary-600 p-2.5 text-white shadow-elevation-1 dark:shadow-elevation-1-dark">
          <HeartPulse className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Organization Health</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
            Login recency, attendance activity recency, and biometric adoption per institution — spot churn before it's a support ticket.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Total institutions" value={summary.total} icon={HeartPulse} />
        <StatCard label="Healthy" value={summary.healthy} icon={CheckCircle2} />
        <StatCard label="Stale (30+ days)" value={summary.stale} icon={Clock} />
        <StatCard label="Never logged in / deactivated" value={summary.neverLoggedIn + summary.dormant} icon={CircleSlash} />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-danger-50 p-4 text-sm text-danger-700 ring-1 ring-danger-100 dark:bg-danger-900/30 dark:text-danger-400 dark:ring-danger-900/50">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <Card
        title={`${orgs.length} institutions`}
        action={<Button variant="outline" size="sm" onClick={load} icon={RefreshCw} disabled={loading}>Refresh</Button>}
        bodyClassName="p-0"
      >
        {loading && orgs.length === 0 ? (
          <SkeletonTable rows={8} cols={5} className="p-5" />
        ) : !loading && orgs.length === 0 ? (
          <EmptyState icon={HeartPulse} title="No institutions found" message="No organizations are registered on the network yet." />
        ) : (
          <>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60 sm:hidden">
              {orgs.map((o) => (
                <MobileOrgHealthCard key={o.id} org={o} />
              ))}
            </div>

            <div className="hidden max-h-[65vh] overflow-auto sm:block">
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-700">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Institution</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Last Login</th>
                  <th className="px-3 py-3">Last Attendance Activity</th>
                  <th className="px-5 py-3">
                    <Fingerprint className="mr-1 inline h-3.5 w-3.5" /> Biometrics Enabled
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                {orgs.map((o) => (
                  <tr key={o.id} className="align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40 motion-reduce:transition-none">
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {o.name}
                      <span className="block text-xs font-normal text-slate-400 dark:text-slate-500">{o.type}</span>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                      {fmtDate(o.lastLogin)}
                      <span className="block text-xs text-slate-400 dark:text-slate-500">{daysAgoLabel(o.daysSinceLogin)}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                      {fmtDate(o.lastActivity)}
                      <span className="block text-xs text-slate-400 dark:text-slate-500">{daysAgoLabel(o.daysSinceActivity)}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {o.enabledBiometrics && o.enabledBiometrics.length > 0 ? o.enabledBiometrics.join(', ') : '—'}
                    </td>
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
