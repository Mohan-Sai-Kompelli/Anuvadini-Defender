import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  MapPinOff,
  RefreshCw,
  AlertTriangle,
  LogOut,
  LogIn,
} from 'lucide-react';
import { Button, Card, EmptyState, StatCard, SkeletonTable } from '../components/ui';

function fmt(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-GB', { hour12: false });
}

function TypeBadge({ type }) {
  if (type === 'exit') {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-danger-50 px-2 py-0.5 text-xs font-medium text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
        <LogOut className="h-3 w-3" /> Left premises
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/30 dark:text-success-400">
      <LogIn className="h-3 w-3" /> Returned
    </span>
  );
}

function BreachMobileCard({ alert }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">{alert.name}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{fmt(alert.at)}</p>
        </div>
        <TypeBadge type={alert.type} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>{alert.department || '—'}</span>
        {alert.distanceM != null && <span>{Math.round(alert.distanceM)}m from premises</span>}
      </div>
    </div>
  );
}

export default function GeofenceBreachLog() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/portal/geofence-alerts', { params: { limit: 200 } });
      if (res.data?.success) {
        setAlerts(res.data.data || []);
      } else {
        setError(res.data?.error || 'Failed to load geofence alerts');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load geofence alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Who's leaving campus most often — the signal this page exists to surface.
  const topOffenders = useMemo(() => {
    const byStudent = new Map();
    for (const a of alerts) {
      if (a.type !== 'exit') continue;
      const key = a.studentId || a.name;
      const cur = byStudent.get(key) || { name: a.name, department: a.department, count: 0 };
      cur.count += 1;
      byStudent.set(key, cur);
    }
    return [...byStudent.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [alerts]);

  const exitCount = alerts.filter((a) => a.type === 'exit').length;
  const enterCount = alerts.filter((a) => a.type === 'enter').length;

  return (
    <div className="w-full min-w-0 space-y-4 overflow-visible sm:space-y-6">
      {/* Header */}
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <div className="rounded-md bg-primary-600 p-2.5 text-white shadow-elevation-1 dark:shadow-elevation-1-dark">
          <MapPinOff className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Geofence Breach Log</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
            Every confirmed premises exit/re-entry while on duty, most recent first. Entries auto-expire after 7 days.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Total events (7d)" value={alerts.length} icon={MapPinOff} />
        <StatCard label="Premises exits" value={exitCount} icon={LogOut} />
        <StatCard label="Returns" value={enterCount} icon={LogIn} />
      </div>

      {topOffenders.length > 0 && (
        <Card title="Most frequent exits" bodyClassName="p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {topOffenders.map((o) => (
              <span
                key={o.name}
                className="inline-flex items-center gap-1.5 rounded-pill bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {o.name}
                <span className="rounded-pill bg-danger-100 px-1.5 py-0.5 text-[10px] font-bold text-danger-700 dark:bg-danger-900/40 dark:text-danger-400">
                  {o.count}
                </span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-danger-50 p-4 text-sm text-danger-700 ring-1 ring-danger-100 dark:bg-danger-900/30 dark:text-danger-400 dark:ring-danger-900/50">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Table */}
      <Card
        title={`${alerts.length} events`}
        action={
          <Button variant="outline" size="sm" onClick={load} icon={RefreshCw} disabled={loading}>
            Refresh
          </Button>
        }
        bodyClassName="p-0"
      >
        {loading && alerts.length === 0 ? (
          <SkeletonTable rows={8} cols={4} className="p-5" />
        ) : !loading && alerts.length === 0 ? (
          <EmptyState
            icon={MapPinOff}
            title="No geofence breaches"
            message="No staff member has left the premises while on duty in the last 7 days."
          />
        ) : (
          <>
            <div className="space-y-3 p-3 sm:hidden">
              {alerts.map((a) => <BreachMobileCard key={a.id} alert={a} />)}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-700">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3">When</th>
                    <th className="px-3 py-3">Staff</th>
                    <th className="px-3 py-3">Department</th>
                    <th className="px-3 py-3">Event</th>
                    <th className="px-5 py-3">Distance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                  {alerts.map((a) => (
                    <tr key={a.id} className="align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40 motion-reduce:transition-none">
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600 dark:text-slate-300">{fmt(a.at)}</td>
                      <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">{a.name}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{a.department || '—'}</td>
                      <td className="px-3 py-3"><TypeBadge type={a.type} /></td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                        {a.distanceM != null ? `${Math.round(a.distanceM)}m` : '—'}
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
