import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  ShieldX, Smartphone, RefreshCw, ChevronLeft, ChevronRight, Building2,
  Globe, Clock, Gauge, AlertTriangle,
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { blockedDevicesAPI } from '../../services/api';

/* ───────────────────────── helpers ───────────────────────── */

const fmtTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
};

// Risk score → colour band for the pill.
const riskClass = (score) => {
  if (score >= 60) return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400';
  if (score >= 30) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
};

/* ───────────────────────── page ───────────────────────── */

const SuperAdminBlockedDevices = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [distinctDevices, setDistinctDevices] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [institutes, setInstitutes] = useState([]);
  const [instituteId, setInstituteId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize: 25 };
      if (instituteId) params.instituteId = instituteId;
      const data = await blockedDevicesAPI.list(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setDistinctDevices(data.distinctDeviceCount || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('[blocked-devices] load failed', err);
      toast.error('Failed to load blocked devices');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, instituteId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const data = await blockedDevicesAPI.institutes();
        const list = Array.isArray(data) ? data : data.items || data.organizations || [];
        setInstitutes(list);
      } catch (_e) { /* filter optional */ }
    })();
  }, []);

  useEffect(() => { setPage(1); }, [instituteId]);

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden sm:space-y-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400 sm:h-11 sm:w-11">
            <ShieldX className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-xl">
              Blocked Devices
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" title="Security blocks" />
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
              Devices the mobile security gate blocked for failing an enterprise policy
              (Developer Options, USB Debugging, root, emulator, integrity, hooking, cloning).
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:w-auto sm:self-start"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary + filter */}
      <div className="grid max-w-4xl min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Block events (filtered)" value={total} icon={ShieldX} accent="danger" />
        <StatCard label="Distinct devices" value={distinctDevices} icon={Smartphone} accent="warning" />
        <Card className="flex min-h-[112px] flex-col justify-center gap-2 p-4">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Building2 className="h-3.5 w-3.5" /> Institute
          </label>
          <select
            value={instituteId}
            onChange={(e) => setInstituteId(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">All institutes</option>
            {institutes.map((o) => (
              <option key={o._id || o.id} value={o._id || o.id}>{o.name || 'Unnamed institute'}</option>
            ))}
          </select>
        </Card>
      </div>

      {/* Table */}
      <Card className="min-w-0 overflow-hidden p-0">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShieldX}
            title="No blocked devices"
            description="No device has been blocked by the security gate in this window."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Reason(s)</th>
                  <th className="px-4 py-3"><span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" />Public IP</span></th>
                  <th className="px-4 py-3"><span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />Risk</span></th>
                  <th className="px-4 py-3"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />When</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{r.employeeName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{r.employeeId} · {r.institute}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                        <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                        {r.deviceName}
                      </div>
                      <div className="text-xs text-slate-400" title={r.deviceId}>
                        {r.platform} {r.osVersion} · {String(r.deviceId).slice(0, 12)}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {(r.blockedBecause.length ? r.blockedBecause : r.reasons).map((reason, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {reason}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs text-slate-600 dark:text-slate-300">{r.publicIp}</td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${riskClass(r.riskScore)}`}>
                        {r.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{fmtTime(r.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminBlockedDevices;
