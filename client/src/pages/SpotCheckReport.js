import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ShieldCheck, Repeat, EyeOff, Zap, RefreshCw, Search, Activity, Send, X,
  Download, Printer, ChevronRight, Clock, AlertTriangle, CheckCircle2, XCircle,
  LayoutDashboard, MapPin, History, Users,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { StatCard, Card, EmptyState, SkeletonTable } from '../components/ui';
import { staffAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import SpotCheckCampusMap from '../components/spotcheck/SpotCheckCampusMap';
import SpotCheckHistory from '../components/spotcheck/SpotCheckHistory';
import SpotCheckStaffTable from '../components/spotcheck/SpotCheckStaffTable';
 
// The four-tab layout for the spot-check console.
const TABS = [
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { key: 'map', label: 'Campus Map', Icon: MapPin },
  { key: 'history', label: 'Check History', Icon: History },
  { key: 'staff', label: 'Staff Compliance', Icon: Users },
];

const pctStr = (v) => `${Math.round((v || 0) * 100)}%`;
const FLAG_LABEL = {
  repeat_offender: 'Repeat offender',
  on_miss_streak: 'On miss streak',
  proxy_suspect: 'Proxy suspect',
  never_responds: 'Never responds',
};
const flagColor = (f) =>
  f === 'proxy_suspect' || f === 'never_responds'
    ? 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400'
    : 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';

const statusBadge = (rate) =>
  rate >= 0.8
    ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400'
    : rate >= 0.5
    ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
    : 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400';

const periodRate = (d) => {
  const resolved = d.responded + d.missed;
  return resolved ? d.responded / resolved : 0;
};

// --- formatting + CSV helpers (used by the table, drill-down and export) ---
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
const fmtSec = (s) => (s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const avgSec = (ms) => (ms != null ? fmtSec(Math.round(ms / 1000)) : '—');

// Per-check status presentation for the drill-down timeline.
const STATUS_META = {
  responded: { label: 'On time', cls: 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400', Icon: CheckCircle2, iconCls: 'text-success-500' },
  missed: { label: 'Missed', cls: 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400', Icon: XCircle, iconCls: 'text-danger-500' },
  pending: { label: 'Awaiting', cls: 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400', Icon: Clock, iconCls: 'text-warning-500' },
};

// Flat CSV of the per-person report — all the detail the table can't fit.
const CSV_COLUMNS = [
  ['name', 'Name'], ['uid', 'UID'], ['department', 'Department'],
  ['totalIssued', 'Issued'], ['responded', 'Responded'], ['missed', 'Missed'], ['pending', 'Awaiting'],
  ['responseRate', 'Response Rate %'], ['missRate', 'Miss Rate %'],
  ['currentMissStreak', 'Current Miss Streak'], ['longestMissStreak', 'Longest Miss Streak'],
  ['markedAfterMissCount', 'Marked After Miss'], ['avgLatencySec', 'Avg Response (s)'],
  ['lastRespondedAt', 'Last Responded'], ['lastMissedAt', 'Last Missed'], ['flags', 'Flags'],
];
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ymdOnly = (d) => (d ? `="${new Date(d).toISOString().slice(0, 10)}"` : '');
const buildCsv = (rows) => {
  const header = CSV_COLUMNS.map(([, label]) => label).join(',');
  const body = rows.map((u) =>
    CSV_COLUMNS.map(([key]) => {
      switch (key) {
        case 'responseRate': return Math.round((u.responseRate || 0) * 100);
        case 'missRate': return Math.round((u.missRate || 0) * 100);
        case 'avgLatencySec': return u.avgLatencyMs != null ? Math.round(u.avgLatencyMs / 1000) : '';
        case 'lastRespondedAt': return ymdOnly(u.lastRespondedAt);
        case 'lastMissedAt': return ymdOnly(u.lastMissedAt);
        case 'flags': return (u.flags || []).map((f) => FLAG_LABEL[f] || f).join('; ');
        default: return u[key];
      }
    }).map(csvCell).join(',')
  );
  return [header, ...body].join('\n');
};

// Today / This week / This month roll-up card: Sent · Marked · Missed · Awaiting.
const PeriodCard = ({ label, sub, data }) => {
  const rate = periodRate(data);
  const cell = (n, lbl, cls) => (
    <div className="text-center">
      <div className={`text-xl font-bold tabular-nums sm:text-2xl ${cls}`}>{n}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{lbl}</div>
    </div>
  );
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</h3>
          {sub ? <p className="text-[11px] text-slate-400">{sub}</p> : null}
        </div>
        <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-bold ${statusBadge(rate)}`}>{pctStr(rate)}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1">
        {cell(data.sent, 'Sent', 'text-slate-800 dark:text-slate-100')}
        {cell(data.responded, 'Marked', 'text-success-600')}
        {cell(data.missed, 'Missed', 'text-danger-600')}
        {cell(data.pending, 'Awaiting', 'text-warning-600')}
      </div>
    </div>
  );
};

const SpotCheckReport = () => {
  const { role } = useAuth();
  const isHod = role === 'hod';
  const ymd = (d) => d.toISOString().slice(0, 10);

  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return ymd(d); });
  const [to, setTo] = useState(() => ymd(new Date()));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [q, setQ] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  // Spot-check sending
  const [dialogOpen, setDialogOpen] = useState(false);
  const [onlyCheckedIn, setOnlyCheckedIn] = useState(true);
  const [windowMin, setWindowMin] = useState(15);
  const [selected, setSelected] = useState(() => new Set());
  // Specific-staff targeting (searchable roster picker)
  const [specificMode, setSpecificMode] = useState(false);
  const [roster, setRoster] = useState([]);
  const [rosterQuery, setRosterQuery] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [rosterLoading, setRosterLoading] = useState(false);
  // Per-person drill-down (the detailed history modal)
  const [drillUser, setDrillUser] = useState(null); // clicked report row (carries the stats)
  const [drillData, setDrillData] = useState(null); // fetched per-check timeline
  const [drillLoading, setDrillLoading] = useState(false);

  const load = useCallback(async (f, t) => {
    setLoading(true);
    try {
      const res = await axios.get('/api/spot-checks/report', { params: { from: f, to: t } });
      setReport(res.data);
      // Returned (not just set as state) so a caller that needs it RIGHT NOW
      // -- Export, which must never build a file from state that's still one
      // filter change behind a not-yet-finished background fetch -- can use
      // the fresh value directly instead of racing React's async state update.
      return res.data;
    } catch {
      toast.error('Failed to load spot-check report');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(from, to); }, [load, from, to]);

  // Lazy-load the staff roster the first time "specific staff" is chosen.
  useEffect(() => {
    if (!specificMode || roster.length) return;
    let alive = true;
    setRosterLoading(true);
    staffAPI
      .list({ limit: 500 })
      .then((res) => { if (alive) setRoster(res?.students || []); })
      .catch(() => {})
      .finally(() => { if (alive) setRosterLoading(false); });
    return () => { alive = false; };
  }, [specificMode, roster.length]);

  // Send a spot-check round. `body` may carry { studentIds } to target specific
  // staff, or { onlyCheckedIn } to sweep everyone (on duty) in scope.
  const trigger = async (body) => {
    setRunning(true);
    try {
      const res = await axios.post('/api/spot-checks/trigger', { windowMinutes: windowMin, ...body });
      const issued = res.data?.issued ?? res.data?.targets?.length ?? 0; // records created
      const notified = res.data?.notified ?? issued; // pushes actually sent (target had an FCM token)
      if (issued === 0) {
        toast(`No staff matched — ${body.studentIds ? 'selection' : onlyCheckedIn ? 'nobody is checked in' : 'no active staff'}`);
      } else if (notified === 0) {
        toast.error(
          `${issued} staff selected, but none has the mobile app registered — no push sent. They must log into the app (with the server reachable) first.`,
          { duration: 7000 },
        );
      } else if (notified < issued) {
        toast.success(`Spot-check sent to ${notified} of ${issued} — ${issued - notified} have no app registered`);
      } else {
        toast.success(`Spot-check sent — ${notified} ${isHod ? 'department ' : ''}staff notified to verify attendance`);
      }
      setSelected(new Set());
      setPicked(new Set());
      setDialogOpen(false);
      setTimeout(() => load(from, to), 800);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start spot-check');
    } finally {
      setRunning(false);
    }
  };

  const summary = report?.summary || {};
  const users = (report?.users || []).filter(
    (u) => u.name.toLowerCase().includes(q.toLowerCase()) || (u.uid || '').includes(q)
  );
  const trend = (report?.trend || []).map((t) => ({ date: t.date.slice(5), Responded: t.responded, Missed: t.missed }));

  // --- period roll-ups (Sent / Marked / Missed / Awaiting) from the daily trend ---
  const rawTrend = report?.trend || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgoStr = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const monthPrefix = todayStr.slice(0, 7);
  const aggPeriod = (pred) =>
    rawTrend.reduce(
      (acc, t) => {
        if (!pred(t.date)) return acc;
        acc.sent += t.issued || 0;
        acc.responded += t.responded || 0;
        acc.missed += t.missed || 0;
        acc.pending += Math.max(0, (t.issued || 0) - (t.responded || 0) - (t.missed || 0));
        return acc;
      },
      { sent: 0, responded: 0, missed: 0, pending: 0 },
    );
  const periods = [
    { key: 'today', label: 'Today', sub: todayStr, data: aggPeriod((dt) => dt === todayStr) },
    { key: 'week', label: 'This week', sub: 'last 7 days', data: aggPeriod((dt) => dt >= weekAgoStr && dt <= todayStr) },
    { key: 'month', label: 'This month', sub: monthPrefix, data: aggPeriod((dt) => dt.startsWith(monthPrefix)) },
  ];

  const repeatOffenders = report?.repeatOffenders || [];
  const rounds = report?.rounds || [];

  // Open a person's full spot-check timeline. The clicked row already carries
  // the aggregate stats; we fetch only the per-check history.
  const openDrill = async (u) => {
    setDrillUser(u);
    setDrillData(null);
    setDrillLoading(true);
    try {
      const res = await axios.get(`/api/spot-checks/student/${u.student}`, { params: { from, to } });
      setDrillData(res.data);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setDrillLoading(false);
    }
  };
  const closeDrill = () => { setDrillUser(null); setDrillData(null); };

  // Download the (currently-filtered) per-person report as CSV. Re-fetches
  // FRESH for the current from/to instead of trusting `users` (component
  // state) -- state can be one filter change behind if Export is clicked
  // before the background fetch for a just-changed date range finishes,
  // which would silently export the PREVIOUS range's data.
  const exportCsv = async () => {
    const loadingToast = toast.loading('Preparing export\u2026');
    try {
      const fresh = await load(from, to);
      const freshUsers = (fresh?.users || []).filter(
        (u) => u.name.toLowerCase().includes(q.toLowerCase()) || (u.uid || '').includes(q)
      );
      if (!freshUsers.length) { toast('Nothing to export', { id: loadingToast }); return; }
      const blob = new Blob(['\uFEFF' + buildCsv(freshUsers)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spot-check-compliance_${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded', { id: loadingToast });
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed \u2014 please try again', { id: loadingToast });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-md sm:h-12 sm:w-12">
              <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-xl">Spot-Check Compliance</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isHod ? 'Department' : 'Institution'} - who responds to random attendance checks
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            {selected.size > 0 && (
              <button
                onClick={() => trigger({ studentIds: [...selected] })}
                disabled={running}
                className="btn-secondary col-span-2 flex items-center justify-center gap-1.5 sm:col-span-1"
              >
                <Send className="h-4 w-4" /> Spot-check selected ({selected.size})
              </button>
            )}
            <button onClick={exportCsv} disabled={loading || !users.length} className="btn-secondary flex items-center justify-center gap-1.5" title="Download the per-person report as CSV">
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button onClick={() => window.print()} className="btn-secondary flex items-center justify-center gap-1.5" title="Print / Save as PDF">
              <Printer className="h-4 w-4" /> Print
            </button>
            <button onClick={() => setDialogOpen(true)} disabled={running} className="btn-primary col-span-2 flex items-center justify-center gap-1.5 sm:col-span-1">
              <Zap className="h-4 w-4" /> {running ? 'Sending...' : 'Send spot-check'}
            </button>
          </div>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_auto_minmax(14rem,1fr)] lg:items-end">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 w-full" />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 w-full" />
          </div>
          <button onClick={() => load(from, to)} className="btn-secondary flex w-full items-center justify-center gap-1.5 sm:w-auto">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / UID" className="input w-full pl-9" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Overall Response Rate" value={pctStr(summary.overallResponseRate)} icon={ShieldCheck} accent="success"
          deltaLabel={`${summary.responded || 0} of ${(summary.responded || 0) + (summary.missed || 0)} responded`} />
        <StatCard label="Total Spot-Checks" value={summary.totalChecks ?? 0} icon={Activity} accent="info" deltaLabel={`${summary.totalRounds || 0} rounds`} />
        <StatCard label="Repeat Offenders" value={report?.repeatOffenders?.length ?? 0} icon={Repeat} accent="warning" deltaLabel="missed repeatedly" />
        <StatCard label="Proxy Suspects" value={report?.proxySuspects?.length ?? 0} icon={EyeOff} accent="danger" deltaLabel="marked but not present" />
      </div>

      {/* ── Tab bar ── */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex sm:flex-wrap">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
              activeTab === key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
      <>
      {/* Sent vs marked roll-up — today / this week / this month */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Summary · sent vs marked vs missed
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {periods.map((p) => (
            <PeriodCard key={p.key} label={p.label} sub={p.sub} data={p.data} />
          ))}
        </div>
      </div>

      <Card title="Daily Responses vs Misses">
        {trend.length === 0 ? (
          <EmptyState title="No spot-checks" description="No spot-check rounds in this period. Click ‘Run spot-check now’ to start one." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Responded" fill="#8FD13C" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Missed" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {repeatOffenders.length > 0 && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-warning-600" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Repeat Offenders</span>
              <span className="rounded-pill bg-warning-50 px-2 py-0.5 text-xs font-bold text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                {repeatOffenders.length}
              </span>
            </div>
          }
        >
          <p className="mb-3 text-xs text-slate-400">
            Ranked worst-first — missed at least {Math.round((report?.thresholds?.missRateThreshold ?? 0.4) * 100)}% of their
            resolved checks (min {report?.thresholds?.minIssued ?? 3}). Click anyone to see every check.
          </p>
          <ul className="space-y-2">
            {repeatOffenders.map((u, i) => (
              <li key={u.student}>
                <button
                  onClick={() => openDrill(u)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition-colors hover:border-primary-300 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger-50 text-xs font-bold text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800 dark:text-slate-100">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.uid}{u.department ? ` · ${u.department}` : ''}</div>
                  </div>
                  <div className="hidden gap-1.5 sm:flex">
                    {u.markedAfterMissCount > 0 && (
                      <span className="rounded-pill bg-danger-50 px-2 py-0.5 text-[10px] font-semibold text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
                        proxy suspect
                      </span>
                    )}
                    {u.currentMissStreak >= 3 && (
                      <span className="rounded-pill bg-warning-50 px-2 py-0.5 text-[10px] font-semibold text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                        streak {u.currentMissStreak}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums text-danger-600">{pctStr(u.missRate)}</div>
                    <div className="text-[10px] text-slate-400">{u.missed} missed</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      </>
      )}

      {/* ── CAMPUS MAP TAB ── */}
      {activeTab === 'map' && <SpotCheckCampusMap rounds={rounds} fmtDateTime={fmtDateTime} />}

      {/* ── CHECK HISTORY TAB ── */}
      {activeTab === 'history' && <SpotCheckHistory rounds={rounds} />}

      {/* ── STAFF COMPLIANCE TAB ── */}
      {activeTab === 'staff' && (
      <SpotCheckStaffTable users={users} loading={loading} onSelect={openDrill} />
      )}

      {/* Send spot-check dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !running && setDialogOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <ShieldCheck className="h-5 w-5 text-primary-600" /> Send spot-check
              </h2>
              <button onClick={() => setDialogOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Targeted {isHod ? 'department ' : ''}staff get a push and must open the app and verify their
              face within the window — a successful check marks their attendance.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500">Who to check</label>
                <div className="mt-1 grid grid-cols-1 gap-2">
                  <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${!specificMode && onlyCheckedIn ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                    <input type="radio" checked={!specificMode && onlyCheckedIn} onChange={() => { setSpecificMode(false); setOnlyCheckedIn(true); }} />
                    <span><b>Only staff checked in today</b> — verify on-duty staff are really present</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${!specificMode && !onlyCheckedIn ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                    <input type="radio" checked={!specificMode && !onlyCheckedIn} onChange={() => { setSpecificMode(false); setOnlyCheckedIn(false); }} />
                    <span><b>All active staff</b> — also nudges those who haven’t checked in yet</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${specificMode ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                    <input type="radio" checked={specificMode} onChange={() => setSpecificMode(true)} />
                    <span><b>Specific staff</b> — pick exactly who to check{picked.size ? ` (${picked.size})` : ''}</span>
                  </label>
                </div>
              </div>

              {specificMode && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-2.5 py-1.5 dark:border-slate-700">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={rosterQuery}
                      onChange={(e) => setRosterQuery(e.target.value)}
                      placeholder="Search staff by name / UID / dept"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                  <div data-lenis-prevent className="max-h-48 overflow-y-auto p-1">
                    {rosterLoading ? (
                      <div className="px-2 py-3 text-center text-xs text-slate-400">Loading staff…</div>
                    ) : (
                      roster
                        .filter((s) => `${s.fullName} ${s.uid} ${s.department || ''}`.toLowerCase().includes(rosterQuery.toLowerCase()))
                        .slice(0, 100)
                        .map((s) => {
                          const on = picked.has(s._id);
                          return (
                            <label key={s._id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => setPicked((p) => { const n = new Set(p); on ? n.delete(s._id) : n.add(s._id); return n; })}
                              />
                              <span className="flex-1 truncate text-slate-800 dark:text-slate-100">{s.fullName}</span>
                              <span className="text-xs text-slate-400">{s.uid}{s.department ? ` · ${s.department}` : ''}</span>
                            </label>
                          );
                        })
                    )}
                    {!rosterLoading && roster.length === 0 && (
                      <div className="px-2 py-3 text-center text-xs text-slate-400">No staff found.</div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500">Response window (minutes)</label>
                <input
                  type="number" min={1} max={120} value={windowMin}
                  onChange={(e) => setWindowMin(Math.max(1, Number(e.target.value) || 15))}
                  className="input mt-1 w-32"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDialogOpen(false)} disabled={running} className="btn-secondary">Cancel</button>
              <button
                onClick={() => (specificMode ? trigger({ studentIds: [...picked] }) : trigger({ onlyCheckedIn }))}
                disabled={running || (specificMode && picked.size === 0)}
                className="btn-primary flex items-center gap-1.5"
              >
                <Send className="h-4 w-4" /> {running ? 'Sending…' : specificMode ? `Send to ${picked.size}` : 'Send now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-person drill-down — every spot-check this person was sent */}
      {drillUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeDrill}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            {/* header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{drillUser.name}</h2>
                <p className="text-xs text-slate-400">
                  {drillUser.uid}{drillUser.department ? ` · ${drillUser.department}` : ''} · {from} → {to}
                </p>
                {drillUser.flags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {drillUser.flags.map((f) => (
                      <span key={f} className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold ${flagColor(f)}`}>{FLAG_LABEL[f] || f}</span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={closeDrill} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            {/* stat chips */}
            <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-5 sm:grid-cols-3 dark:border-slate-800">
              {[
                ['Miss rate', pctStr(drillUser.missRate), drillUser.missRate >= 0.4 ? 'text-danger-600' : 'text-slate-800 dark:text-slate-100'],
                ['Missed', `${drillUser.missed} / ${drillUser.responded + drillUser.missed}`, 'text-danger-600'],
                ['Current streak', drillUser.currentMissStreak, drillUser.currentMissStreak >= 3 ? 'text-danger-600' : 'text-slate-800 dark:text-slate-100'],
                ['Longest streak', drillUser.longestMissStreak, 'text-slate-800 dark:text-slate-100'],
                ['Marked after miss', drillUser.markedAfterMissCount, drillUser.markedAfterMissCount > 0 ? 'text-danger-600' : 'text-slate-800 dark:text-slate-100'],
                ['Avg response', avgSec(drillUser.avgLatencyMs), 'text-slate-800 dark:text-slate-100'],
              ].map(([label, val, cls]) => (
                <div key={label}>
                  <div className={`text-lg font-bold tabular-nums ${cls}`}>{val}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                </div>
              ))}
            </div>

            {/* timeline */}
            <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto p-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Every spot-check{drillData?.timeline ? ` (${drillData.timeline.length})` : ''}
              </h3>
              {drillLoading ? (
                <SkeletonTable rows={5} />
              ) : !drillData?.timeline?.length ? (
                <EmptyState title="No checks" description="No spot-checks were issued to this person in the selected range." />
              ) : (
                <ul className="space-y-1.5">
                  {drillData.timeline.map((c) => {
                    const m = STATUS_META[c.status] || STATUS_META.pending;
                    const Icon = m.Icon;
                    return (
                      <li key={c.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                        <Icon className={`h-4 w-4 shrink-0 ${m.iconCls}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{fmtDateTime(c.issuedAt)}</div>
                          <div className="text-[11px] text-slate-400">
                            {c.triggeredBy === 'auto' ? 'Auto' : 'Manual'}{c.windowMinutes ? ` · ${c.windowMinutes}m window` : ''}
                            {c.status === 'responded' && c.responseSec != null ? ` · answered in ${fmtSec(c.responseSec)}` : ''}
                          </div>
                        </div>
                        {c.status === 'missed' && c.markedAfterMiss && (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-danger-50 px-2 py-0.5 text-[10px] font-semibold text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
                            <AlertTriangle className="h-3 w-3" /> marked attendance anyway
                          </span>
                        )}
                        <span className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpotCheckReport;
