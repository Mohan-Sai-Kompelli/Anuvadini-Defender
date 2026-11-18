import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  ClipboardCheck, Users, Percent, LogOut as LogOutIcon, Flag, FileWarning, CheckCircle2,
  RefreshCw, Play, Search, ChevronLeft, ChevronRight, ChevronsUpDown, Bell, X,
  AlertTriangle, FileText, Printer, Download, MessageSquarePlus, BadgeCheck, Eye,
  Building2, SlidersHorizontal, ArrowUpDown, Clock,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList, Cell,
} from 'recharts';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { checkoutComplianceAPI as api } from '../../services/api';
import { useTheme } from '../../ThemeContext';

/* ─────────────────── validated chart palette (dataviz six-checks) ───────────────────
 * Passes lightness band, chroma floor, CVD separation and 3:1 contrast on BOTH
 * the light (#fff) and dark (#1e293b) card surfaces:
 *   check-ins  #3b82f6 (blue-500)   missed  #d97706 (amber-600)  [ΔE 121 protan]
 *   status     normal #2748C4 · warning #d97706 · high #ef4444
 * Status colors are always paired with a text label + count, never color alone. */
const C_CHECKINS = '#3b82f6';
const C_MISSED = '#d97706';
const RISK = {
  normal: { color: '#2748C4', label: 'Normal', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  warning: { color: '#d97706', label: 'Warning', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  high: { color: '#ef4444', label: 'High Risk', chip: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
};
const MEMO_STATUS = {
  pending: { label: 'Pending', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', next: 'issued', nextLabel: 'Issue' },
  issued: { label: 'Issued', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', next: 'acknowledged', nextLabel: 'Mark Acknowledged' },
  acknowledged: { label: 'Acknowledged', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', next: 'closed', nextLabel: 'Close' },
  closed: { label: 'Closed', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', next: null },
};
const FLAG_STATUS = {
  active: { label: 'Active', chip: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  memo_issued: { label: 'Memo Issued', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  resolved: { label: 'Resolved', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

/* ─────────────────────────── helpers ─────────────────────────── */

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtTimeOnly = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};
const shortDay = (ymd) => {
  const dt = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? ymd : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};
const initialsOf = (name) =>
  (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

const RiskBadge = ({ level }) => {
  const r = RISK[level] || RISK.normal;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${r.chip}`}>
      {level === 'high' && <AlertTriangle className="h-3 w-3" />}
      {r.label}
    </span>
  );
};

/* Print-window "PDF": opens a print-styled document; the browser's native
 * print dialog provides both Print and Save-as-PDF (no PDF dependency). */
function openPrintWindow(title, bodyHtml) {
  const w = window.open('', '_blank', 'width=840,height=900');
  if (!w) {
    toast.error('Pop-up blocked — allow pop-ups to print/download');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 48px; line-height: 1.55; }
    .head { text-align: center; border-bottom: 3px double #111; padding-bottom: 12px; margin-bottom: 20px; }
    .head h1 { margin: 0; font-size: 20px; letter-spacing: 1px; }
    .head p { margin: 2px 0 0; font-size: 12px; color: #444; }
    .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 18px; }
    h2 { font-size: 15px; text-decoration: underline; text-align: center; margin: 18px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }
    th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
    th { background: #f2f2f2; }
    .warn { border: 1px solid #b91c1c; background: #fef2f2; padding: 12px 14px; font-size: 13px; margin: 14px 0; }
    .sign { margin-top: 56px; display: flex; justify-content: space-between; font-size: 13px; }
    .muted { color: #555; font-size: 12px; }
    @media print { body { margin: 24px; } }
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

const memoBodyHtml = (memo) => `
  <div class="head"><h1>ANUVADINI</h1>
    <p>Attendance Compliance Cell — Official Warning Memo</p></div>
  <div class="meta"><span><strong>Ref. No.:</strong> ${memo.referenceNumber}</span>
    <span><strong>Date:</strong> ${fmtDate(memo.issuedAt || memo.createdAt)}</span></div>
  <table>
    <tr><th style="width:32%">Organization</th><td>${memo.organizationName || '—'}</td></tr>
    <tr><th>Employee Name</th><td>${memo.studentName || '—'}</td></tr>
    <tr><th>Employee ID</th><td>${memo.uid || '—'}</td></tr>
    <tr><th>Department / Designation</th><td>${[memo.department, memo.designation].filter(Boolean).join(' / ') || '—'}</td></tr>
  </table>
  <h2>Subject: ${memo.issueType}</h2>
  <table>
    <tr><th>Analysis Window</th><td>Last ${memo.attendanceSummary?.windowDays ?? '—'} days</td></tr>
    <tr><th>Working Days (Check-In marked)</th><td>${memo.attendanceSummary?.totalCheckIns ?? '—'}</td></tr>
    <tr><th>Checkout NOT marked (violations)</th><td>${memo.violationCount} day(s) — ${memo.attendanceSummary?.missedPct ?? 0}%</td></tr>
    <tr><th>Violation Dates</th><td>${(memo.violationDates || []).join(', ') || '—'}</td></tr>
    <tr><th>Risk Level</th><td>${(memo.attendanceSummary?.riskLevel || '').toUpperCase() || '—'}</td></tr>
  </table>
  <div class="warn"><strong>Warning:</strong> ${memo.warningMessage}</div>
  <div class="sign">
    <span class="muted">Status: ${memo.status.toUpperCase()}${memo.autoGenerated ? ' (auto-generated by rule)' : ''}</span>
    <span><strong>Issued By:</strong><br/>${memo.issuedBy}</span>
  </div>`;

const flagReportHtml = (detail) => {
  const f = detail.flag;
  return `
  <div class="head"><h1>ANUVADINI</h1>
    <p>Attendance Compliance Cell — Red Flag Report</p></div>
  <div class="meta"><span><strong>Employee:</strong> ${f.studentName || '—'} (${f.uid || '—'})</span>
    <span><strong>Generated:</strong> ${fmtDateTime(new Date())}</span></div>
  <table>
    <tr><th style="width:32%">Organization</th><td>${f.organizationName || '—'}</td></tr>
    <tr><th>Department / Designation</th><td>${[f.department, f.designation].filter(Boolean).join(' / ') || '—'}</td></tr>
    <tr><th>Risk Level / Score</th><td>${(f.riskLevel || '').toUpperCase()} — ${f.riskScore}/100</td></tr>
    <tr><th>Reason</th><td>${f.reason}</td></tr>
    <tr><th>Missed Checkouts</th><td>${f.missedCount} of ${f.totalCheckIns} working days (${f.missedPct}%) in ${f.windowDays} days</td></tr>
    <tr><th>Frequency</th><td>≈ ${f.frequencyPerWeek} per week</td></tr>
    <tr><th>Last Incident</th><td>${f.lastIncidentDate || '—'}</td></tr>
    <tr><th>Status</th><td>${(FLAG_STATUS[f.status]?.label || f.status).toUpperCase()}</td></tr>
  </table>
  <h2>Attendance History (analysis window)</h2>
  <table><tr><th>Date</th><th>Check-In</th><th>Check-Out</th><th>Result</th></tr>
    ${(detail.attendanceDays || []).map((d) => `<tr><td>${d.date}</td><td>${fmtTimeOnly(d.checkIn)}</td>
      <td>${d.checkOut ? fmtTimeOnly(d.checkOut) : '—'}</td>
      <td>${d.missedCheckout ? '<strong style="color:#b91c1c">MISSED CHECKOUT</strong>' : 'Complete'}</td></tr>`).join('')}
  </table>
  ${detail.memos?.length ? `<h2>Memos Issued</h2><table><tr><th>Reference</th><th>Status</th><th>Date</th></tr>
    ${detail.memos.map((m) => `<tr><td>${m.referenceNumber}</td><td>${m.status.toUpperCase()}</td><td>${fmtDate(m.issuedAt || m.createdAt)}</td></tr>`).join('')}</table>` : ''}
  ${f.remarks?.length ? `<h2>Remarks</h2><table><tr><th>Remark</th><th>By</th><th>At</th></tr>
    ${f.remarks.map((r) => `<tr><td>${r.text}</td><td>${r.by}</td><td>${fmtDateTime(r.at)}</td></tr>`).join('')}</table>` : ''}
  <div class="sign"><span class="muted">System-generated compliance report</span><span><strong>Anuvadini Super Admin</strong></span></div>`;
};

/* ─────────────────────────── charts ─────────────────────────── */

const useChartTheme = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return {
    grid: dark ? '#334155' : '#e2e8f0',
    tick: dark ? '#94a3b8' : '#64748b',
    tooltip: {
      backgroundColor: dark ? '#0f172a' : '#ffffff',
      border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
      borderRadius: 10,
      color: dark ? '#e2e8f0' : '#0f172a',
      fontSize: 12,
    },
  };
};

const TrendChart = ({ data }) => {
  const t = useChartTheme();
  const series = useMemo(() => data.map((d) => ({ ...d, label: shortDay(d.date) })), [data]);
  if (!series.length) {
    return <p className="flex h-56 items-center justify-center text-sm text-slate-400">No attendance in the analysis window yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.grid }} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={t.tooltip} labelStyle={{ color: t.tooltip.color, fontWeight: 600 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        <Line type="monotone" dataKey="checkIns" name="Check-ins" stroke={C_CHECKINS} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="missed" name="Missed checkouts" stroke={C_MISSED} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

/* Risk distribution as labeled status rows (label + count never color-alone). */
const RiskDistribution = ({ data }) => {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div className="space-y-3 pt-1">
      {data.map((d) => {
        const r = RISK[d.level] || RISK.normal;
        const pct = Math.round((d.count / total) * 100);
        return (
          <div key={d.level}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
                {r.label}
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{d.count} <span className="font-normal text-slate-400">({pct}%)</span></span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: r.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TopOffendersChart = ({ data }) => {
  const t = useChartTheme();
  if (!data.length) {
    return <p className="flex h-56 items-center justify-center text-sm text-slate-400">No missed checkouts detected. 🎉</p>;
  }
  const rows = data.map((d) => ({ ...d, shortName: d.name.length > 16 ? `${d.name.slice(0, 15)}…` : d.name }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 34, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={t.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.grid }} />
        <YAxis type="category" dataKey="shortName" width={110} tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={t.tooltip}
          labelStyle={{ color: t.tooltip.color, fontWeight: 600 }}
          formatter={(v, _n, p) => [`${v} of ${p.payload.total} days (${p.payload.pct}%)`, 'Missed checkouts']}
        />
        <Bar dataKey="missed" name="Missed checkouts" radius={[0, 4, 4, 0]} barSize={16}>
          {rows.map((r, i) => <Cell key={i} fill={RISK[r.riskLevel]?.color || C_MISSED} />)}
          <LabelList dataKey="missed" position="right" style={{ fontSize: 11, fill: t.tick }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/* ─────────────────────────── shared bits ─────────────────────────── */

const Pagination = ({ page, totalPages, setPage }) => (
  totalPages > 1 ? (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-3 sm:gap-3">
      <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <ChevronLeft className="h-4 w-4" /> Prev
      </button>
      <span className="min-w-[7rem] text-center text-sm text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        Next <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  ) : null
);

const Modal = ({ title, onClose, children, wide = false }) => (
  <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`my-6 w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} rounded-2xl bg-white shadow-2xl dark:bg-slate-900`}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h3 className="min-w-0 truncate text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
    </div>
  </div>
);

const inputCls =
  'min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const btnPrimary =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50';
const btnGhost =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

/* ═══════════════════════════ PAGE ═══════════════════════════ */

const TABS = [
  { id: 'overview', label: 'Overview', icon: ClipboardCheck },
  { id: 'flags', label: 'Red Flags', icon: Flag },
  { id: 'memos', label: 'Memos', icon: FileText },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

const SuperAdminAttendanceCompliance = () => {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  // notifications
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState({ items: [], unread: 0 });
  const notifRef = useRef(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api.overview();
      setOverview(data);
    } catch (e) {
      console.error('[compliance] overview failed', e);
      toast.error('Failed to load compliance overview');
    }
  }, []);

  const loadNotifs = useCallback(async () => {
    try {
      const data = await api.notifications({ pageSize: 15 });
      setNotifs({ items: data.items || [], unread: data.unread || 0 });
    } catch (_e) { /* non-fatal */ }
  }, []);

  useEffect(() => { loadOverview(); loadNotifs(); }, [loadOverview, loadNotifs]);

  useEffect(() => {
    if (!notifOpen) return undefined;
    const close = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [notifOpen]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const { summary } = await api.analyze();
      toast.success(
        `Analysis complete — ${summary.employeesAnalyzed} employees, ${summary.flagged} new flag(s), ${summary.escalated} escalated`,
        { duration: 6000 }
      );
      await Promise.all([loadOverview(), loadNotifs()]);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  // Bump to force child tables to reload after an analysis run / action.
  const [refreshKey, setRefreshKey] = useState(0);

  const cards = overview?.cards;

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden sm:space-y-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400 sm:h-11 sm:w-11">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-xl">Attendance Compliance</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
              Employees who check in but don't check out — analyzed daily, red-flagged against your
              thresholds, and manageable end-to-end with official warning memos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          {/* Notifications bell */}
          <div className="relative" ref={notifRef}>
            <button onClick={() => { setNotifOpen((o) => !o); }} className={btnGhost} aria-label="Compliance notifications">
              <Bell className="h-4 w-4" />
              {notifs.unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {notifs.unread > 99 ? '99+' : notifs.unread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-elevation-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Notifications</span>
                  {notifs.unread > 0 && (
                    <button
                      onClick={async () => { await api.markNotificationsRead(); loadNotifs(); }}
                      className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.items.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet</p>
                  ) : (
                    notifs.items.map((n) => (
                      <div key={n._id} className={`border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800 ${n.read ? 'opacity-70' : 'bg-primary-50/40 dark:bg-primary-500/5'}`}>
                        <div className="flex items-start gap-2">
                          {n.riskLevel && <span className="mt-1 h-2 w-2 flex-none rounded-full" style={{ backgroundColor: RISK[n.riskLevel]?.color }} />}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-4 text-slate-800 dark:text-slate-100">{n.title}</p>
                            <p className="mt-0.5 text-xs leading-4 text-slate-500 dark:text-slate-400">{n.message}</p>
                            {n.actionRequired && (
                              <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">Action: {n.actionRequired}</p>
                            )}
                            <p className="mt-0.5 text-[10px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button onClick={runAnalysis} disabled={analyzing} className={btnPrimary}>
            {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {analyzing ? 'Analyzing…' : 'Run Analysis Now'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex min-w-0 flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
              tab === id
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab cards={cards} overview={overview} refreshKey={refreshKey} />
      )}
      {tab === 'flags' && <RedFlagsTab refreshKey={refreshKey} onChanged={() => { loadOverview(); loadNotifs(); setRefreshKey((k) => k + 1); }} />}
      {tab === 'memos' && <MemosTab refreshKey={refreshKey} onChanged={() => { loadOverview(); loadNotifs(); }} />}
      {tab === 'settings' && <SettingsTab onSaved={loadOverview} />}
    </div>
  );
};

/* ═══════════════ Overview tab ═══════════════ */

const OverviewTab = ({ cards, overview, refreshKey }) => (
  <>
    {/* Cards */}
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Total Employees" value={cards ? cards.totalEmployees : '…'} icon={Users} accent="info" />
      <StatCard label="Compliance %" value={cards ? `${cards.compliancePct}%` : '…'} icon={Percent} accent="success" />
      <StatCard label="Missing Checkout Cases" value={cards ? cards.missingCheckoutCases : '…'} icon={LogOutIcon} accent="warning" />
      <StatCard label="Active Red Flags" value={cards ? cards.activeRedFlags : '…'} icon={Flag} accent="danger" />
      <StatCard label="Pending Memos" value={cards ? cards.pendingMemos : '…'} icon={FileWarning} accent="warning" />
      <StatCard label="Resolved Cases" value={cards ? cards.resolvedCases : '…'} icon={CheckCircle2} accent="success" />
    </div>

    {/* Charts */}
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="min-w-0 p-4 xl:col-span-2">
        <h3 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          Daily check-ins vs missed checkouts
          <span className="ml-2 font-normal text-slate-400">last {overview?.config?.windowDays ?? 30} days</span>
        </h3>
        <TrendChart data={overview?.charts?.dailyTrend || []} />
      </Card>
      <Card className="min-w-0 p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">Risk distribution</h3>
        <RiskDistribution data={overview?.charts?.riskDistribution || []} />
        <h3 className="mb-1 mt-6 text-sm font-bold text-slate-800 dark:text-slate-100">Top missed checkouts</h3>
        <TopOffendersChart data={overview?.charts?.topOffenders || []} />
      </Card>
    </div>

    {/* Per-employee table */}
    <RecordsTable refreshKey={refreshKey} />
  </>
);

const RecordsTable = ({ refreshKey }) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState('');
  const [sort, setSort] = useState('missed');
  const [dir, setDir] = useState('desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.records({ page, pageSize: 15, search: search || undefined, risk: risk || undefined, sort, dir });
      setRows(data.items || []);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      toast.error('Failed to load compliance records');
    } finally {
      setLoading(false);
    }
  }, [page, search, risk, sort, dir]);

  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [search, risk]);

  const headerBtn = (key, label) => (
    <button
      onClick={() => { if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSort(key); setDir('desc'); } }}
      className={`inline-flex items-center gap-1 ${sort === key ? 'text-primary-600 dark:text-primary-400' : ''}`}
    >
      {label} <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Employee compliance records</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / ID / department"
              className={`${inputCls} w-64 max-w-full pl-9`}
            />
          </div>
          <select value={risk} onChange={(e) => setRisk(e.target.value)} className={inputCls} aria-label="Filter by risk">
            <option value="">All risk levels</option>
            <option value="high">High Risk</option>
            <option value="warning">Warning</option>
            <option value="normal">Normal</option>
          </select>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No compliance records" message="Run the analysis (button top-right) to compute checkout compliance for every employee." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                <th className="px-4 py-3">{headerBtn('name', 'Employee')}</th>
                <th className="px-4 py-3">Institute</th>
                <th className="px-4 py-3">{headerBtn('checkins', 'Check-ins')}</th>
                <th className="px-4 py-3">{headerBtn('missed', 'Missed')}</th>
                <th className="px-4 py-3">{headerBtn('pct', 'Missed %')}</th>
                <th className="px-4 py-3">{headerBtn('last', 'Last Missed')}</th>
                <th className="px-4 py-3">{headerBtn('risk', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${r.riskLevel === 'high' ? 'bg-red-50/50 dark:bg-red-500/5' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">{initialsOf(r.name)}</div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{r.name}</p>
                        <p className="truncate text-xs text-slate-400">{[r.uid, r.department].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[150px] truncate px-4 py-2.5 text-slate-600 dark:text-slate-300" title={r.institute}>{r.institute}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{r.totalCheckIns}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{r.missedCheckouts}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{r.missedPct}%</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{r.lastMissedDate || '—'}</td>
                  <td className="px-4 py-2.5"><RiskBadge level={r.riskLevel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pb-3"><Pagination page={page} totalPages={totalPages} setPage={setPage} /></div>
    </Card>
  );
};

/* ═══════════════ Red Flags tab ═══════════════ */

const RedFlagsTab = ({ refreshKey, onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('open');
  const [risk, setRisk] = useState('');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.redFlags({ page, pageSize: 15, status: status || undefined, risk: risk || undefined, search: search || undefined });
      setRows(data.items || []);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      toast.error('Failed to load red flags');
    } finally {
      setLoading(false);
    }
  }, [page, status, risk, search]);

  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [status, risk, search]);

  return (
    <>
      <Card className="min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Red flags</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee" className={`${inputCls} w-56 max-w-full pl-9`} />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls} aria-label="Filter by status">
              <option value="open">Open (active + memo issued)</option>
              <option value="active">Active</option>
              <option value="memo_issued">Memo Issued</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </select>
            <select value={risk} onChange={(e) => setRisk(e.target.value)} className={inputCls} aria-label="Filter by risk">
              <option value="">All risk</option>
              <option value="high">High Risk</option>
              <option value="warning">Warning</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Flag} title="No red flags" message="Employees crossing the configured missed-checkout thresholds will be flagged here automatically." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Missed</th>
                  <th className="px-4 py-3">Frequency</th>
                  <th className="px-4 py-3">Last Incident</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f._id} className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${f.riskLevel === 'high' && f.status !== 'resolved' ? 'border-l-4 border-l-red-500 bg-red-50/50 dark:border-l-red-500/80 dark:bg-red-500/5' : ''}`}>
                    <td className="px-4 py-2.5">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{f.studentName || '—'}</p>
                      <p className="truncate text-xs text-slate-400">{[f.uid, f.department, f.designation].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{f.missedCount}<span className="font-normal text-slate-400"> / {f.totalCheckIns} ({f.missedPct}%)</span></td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">≈ {f.frequencyPerWeek}/week</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{f.lastIncidentDate || '—'}</td>
                    <td className="px-4 py-2.5"><RiskBadge level={f.riskLevel} /></td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{f.riskScore}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${FLAG_STATUS[f.status]?.chip}`}>{FLAG_STATUS[f.status]?.label || f.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setDetailId(f._id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        <Eye className="h-3.5 w-3.5" /> View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pb-3"><Pagination page={page} totalPages={totalPages} setPage={setPage} /></div>
      </Card>

      {detailId && (
        <FlagDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => { load(); onChanged(); }}
        />
      )}
    </>
  );
};

const FlagDetailModal = ({ id, onClose, onChanged }) => {
  const [detail, setDetail] = useState(null);
  const [remark, setRemark] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.redFlag(id);
      setDetail(data);
    } catch (e) {
      toast.error('Failed to load red flag details');
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!detail) {
    return (
      <Modal title="Red Flag Details" onClose={onClose} wide>
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>
      </Modal>
    );
  }

  const f = detail.flag;
  const open = f.status !== 'resolved';

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Red Flag — ${f.studentName || f.uid || 'Employee'}`} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Employee + risk summary */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">{initialsOf(f.studentName)}</div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{f.studentName || '—'}</p>
                <p className="truncate text-xs text-slate-400">
                  {[f.uid, f.department, f.designation].filter(Boolean).join(' · ')} · {f.organizationName || '—'}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                ['Missed', `${f.missedCount} / ${f.totalCheckIns}`],
                ['Missed %', `${f.missedPct}%`],
                ['Frequency', `≈ ${f.frequencyPerWeek}/wk`],
                ['Window', `${f.windowDays} days`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{v}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <RiskBadge level={f.riskLevel} />
              <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${FLAG_STATUS[f.status]?.chip}`}>{FLAG_STATUS[f.status]?.label}</span>
            </div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Risk score</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full" style={{ width: `${f.riskScore}%`, backgroundColor: RISK[f.riskLevel]?.color }} />
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{f.riskScore}</span>
            </div>
            <p className="mt-2 text-xs leading-4 text-slate-500 dark:text-slate-400">{f.reason}</p>
            <p className="mt-1 text-[11px] text-slate-400">Last incident: {f.lastIncidentDate || '—'}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {open && (
            <button className={btnPrimary} disabled={busy} onClick={() => { setMemoText(''); setShowMemo(true); }}>
              <FileWarning className="h-4 w-4" /> Issue Memo
            </button>
          )}
          {open && (
            <button className={btnGhost} disabled={busy} onClick={() => setShowResolve(true)}>
              <BadgeCheck className="h-4 w-4" /> Mark Resolved
            </button>
          )}
          <button className={btnGhost} onClick={() => openPrintWindow(`Red Flag Report — ${f.uid || ''}`, flagReportHtml(detail))}>
            <Download className="h-4 w-4" /> Download Report
          </button>
        </div>

        {showMemo && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
            <p className="mb-2 text-xs font-semibold text-amber-800 dark:text-amber-300">Warning message (leave blank for the standard Anuvadini wording):</p>
            <textarea value={memoText} onChange={(e) => setMemoText(e.target.value)} rows={3} className={`${inputCls} w-full`} placeholder="Standard warning will be used if left empty…" />
            <div className="mt-2 flex gap-2">
              <button className={btnPrimary} disabled={busy}
                onClick={() => act(() => api.issueMemo(f._id, memoText.trim() ? { warningMessage: memoText.trim() } : {}), 'Memo issued').then(() => setShowMemo(false))}>
                Confirm &amp; Issue
              </button>
              <button className={btnGhost} onClick={() => setShowMemo(false)}>Cancel</button>
            </div>
          </div>
        )}

        {showResolve && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
            <p className="mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">Resolution note (optional):</p>
            <textarea value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} rows={2} className={`${inputCls} w-full`} />
            <div className="mt-2 flex gap-2">
              <button className={btnPrimary} disabled={busy}
                onClick={() => act(() => api.resolveFlag(f._id, resolveNote.trim() || undefined), 'Red flag resolved').then(() => setShowResolve(false))}>
                Confirm Resolve
              </button>
              <button className={btnGhost} onClick={() => setShowResolve(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Violation dates */}
        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Missed checkout dates ({f.violationDates?.length || 0})</h4>
          <div className="flex flex-wrap gap-1.5">
            {(f.violationDates || []).map((d) => (
              <span key={d} className="rounded-md bg-red-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-400">{d}</span>
            ))}
          </div>
        </div>

        {/* Attendance history */}
        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Attendance history (analysis window)</h4>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <th className="px-3 py-2">Date</th><th className="px-3 py-2">Check-In</th><th className="px-3 py-2">Check-Out</th><th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {detail.attendanceDays.map((d) => (
                  <tr key={d.date} className={`border-t border-slate-100 dark:border-slate-800 ${d.missedCheckout ? 'bg-red-50/60 dark:bg-red-500/5' : ''}`}>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-600 dark:text-slate-300">{d.date}</td>
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{fmtTimeOnly(d.checkIn)}</td>
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{d.checkOut ? fmtTimeOnly(d.checkOut) : '—'}</td>
                    <td className="px-3 py-1.5">
                      {d.missedCheckout
                        ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400"><AlertTriangle className="h-3 w-3" /> Missed checkout</span>
                        : <span className="text-xs text-emerald-600 dark:text-emerald-400">Complete</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Previous warnings + memo status */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Memos for this employee</h4>
            {detail.memos.length === 0 ? (
              <p className="text-xs text-slate-400">No memos issued yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {detail.memos.map((m) => (
                  <li key={m._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{m.referenceNumber}</span>
                    <span className={`rounded-md px-1.5 py-0.5 font-semibold ${MEMO_STATUS[m.status]?.chip}`}>{MEMO_STATUS[m.status]?.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Previous flags</h4>
            {detail.previousFlags.length === 0 ? (
              <p className="text-xs text-slate-400">No previous red flags.</p>
            ) : (
              <ul className="space-y-1.5">
                {detail.previousFlags.map((p) => (
                  <li key={p._id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{p.missedCount} missed / {p.windowDays}d</span>
                    <span className="text-slate-400"> — {fmtDate(p.createdAt)} · {FLAG_STATUS[p.status]?.label || p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Remarks */}
        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Remarks</h4>
          {f.remarks?.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {f.remarks.map((r, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
                  <p className="text-slate-700 dark:text-slate-200">{r.text}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{r.by} · {fmtDateTime(r.at)}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add a remark…" className={`${inputCls} flex-1`} />
            <button
              className={btnGhost}
              disabled={busy || !remark.trim()}
              onClick={() => act(() => api.addRemark(f._id, remark.trim()), 'Remark added').then(() => setRemark(''))}
            >
              <MessageSquarePlus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>

        {f.status === 'resolved' && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            Resolved {fmtDateTime(f.resolvedAt)} by {f.resolvedBy}{f.resolutionNote ? ` — ${f.resolutionNote}` : ''}
          </p>
        )}
      </div>
    </Modal>
  );
};

/* ═══════════════ Memos tab ═══════════════ */

const MemosTab = ({ refreshKey, onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [byStatus, setByStatus] = useState({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [previewId, setPreviewId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.memos({ page, pageSize: 15, status: status || undefined, search: search || undefined });
      setRows(data.items || []);
      setByStatus(data.byStatus || {});
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      toast.error('Failed to load memos');
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [status, search]);

  const chips = [
    ['', `All (${Object.values(byStatus).reduce((a, b) => a + b, 0)})`],
    ['pending', `Pending (${byStatus.pending || 0})`],
    ['issued', `Issued (${byStatus.issued || 0})`],
    ['acknowledged', `Acknowledged (${byStatus.acknowledged || 0})`],
    ['closed', `Closed (${byStatus.closed || 0})`],
  ];

  return (
    <>
      <Card className="min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Memo management</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee / reference no." className={`${inputCls} w-64 max-w-full pl-9`} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map(([v, label]) => (
              <button key={v} onClick={() => setStatus(v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${status === v ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={FileText} title="No memos" message="Issue a memo from a red flag, or enable the auto-memo rule in Settings." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Violations</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m._id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{m.referenceNumber}</span>
                      {m.autoGenerated && <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">AUTO</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{m.studentName || '—'}</p>
                      <p className="truncate text-xs text-slate-400">{[m.uid, m.organizationName].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{m.violationCount} in {m.attendanceSummary?.windowDays}d</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{fmtDate(m.createdAt)}</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${MEMO_STATUS[m.status]?.chip}`}>{MEMO_STATUS[m.status]?.label}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setPreviewId(m._id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pb-3"><Pagination page={page} totalPages={totalPages} setPage={setPage} /></div>
      </Card>

      {previewId && <MemoPreviewModal id={previewId} onClose={() => setPreviewId(null)} onChanged={() => { load(); onChanged(); }} />}
    </>
  );
};

const MemoPreviewModal = ({ id, onClose, onChanged }) => {
  const [memo, setMemo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.memo(id);
      setMemo(data.memo);
    } catch (e) {
      toast.error('Failed to load memo');
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!memo) {
    return <Modal title="Memo" onClose={onClose} wide><div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Modal>;
  }
  const st = MEMO_STATUS[memo.status];

  return (
    <Modal title={`Memo ${memo.referenceNumber}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${st?.chip}`}>{st?.label}</span>
          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} onClick={() => openPrintWindow(memo.referenceNumber, memoBodyHtml(memo))}>
              <Printer className="h-4 w-4" /> Print
            </button>
            <button className={btnGhost} onClick={() => openPrintWindow(memo.referenceNumber, memoBodyHtml(memo))}>
              <Download className="h-4 w-4" /> Download PDF
            </button>
            {st?.next && (
              <button className={btnPrimary} disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  await api.setMemoStatus(memo._id, st.next);
                  toast.success(`Memo ${st.next}`);
                  await load();
                  onChanged();
                } catch (e) {
                  toast.error(e.response?.data?.error || 'Failed to update memo');
                } finally {
                  setBusy(false);
                }
              }}>
                {st.nextLabel}
              </button>
            )}
          </div>
        </div>

        {/* In-app official preview */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 font-serif text-sm leading-6 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          <div className="border-b-4 border-double border-slate-900 pb-3 text-center dark:border-slate-100">
            <p className="text-base font-bold tracking-wide">ANUVADINI</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Attendance Compliance Cell — Official Warning Memo</p>
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
            <span><strong>Ref. No.:</strong> {memo.referenceNumber}</span>
            <span><strong>Date:</strong> {fmtDate(memo.issuedAt || memo.createdAt)}</span>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div><dt className="inline font-bold">Organization: </dt><dd className="inline">{memo.organizationName || '—'}</dd></div>
            <div><dt className="inline font-bold">Employee: </dt><dd className="inline">{memo.studentName || '—'} ({memo.uid || '—'})</dd></div>
            <div><dt className="inline font-bold">Department: </dt><dd className="inline">{memo.department || '—'}</dd></div>
            <div><dt className="inline font-bold">Designation: </dt><dd className="inline">{memo.designation || '—'}</dd></div>
          </dl>
          <p className="mt-4 text-center text-sm font-bold underline">Subject: {memo.issueType}</p>
          <p className="mt-3 text-xs">
            <strong>Violations:</strong> {memo.violationCount} missed checkout(s) out of {memo.attendanceSummary?.totalCheckIns} working days
            ({memo.attendanceSummary?.missedPct}%) in the last {memo.attendanceSummary?.windowDays} days.
          </p>
          <p className="mt-1 text-xs"><strong>Violation dates:</strong> {(memo.violationDates || []).join(', ') || '—'}</p>
          <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            <strong>Warning: </strong>{memo.warningMessage}
          </div>
          <div className="mt-6 flex items-end justify-between text-xs">
            <span className="text-slate-400">{memo.autoGenerated ? 'Auto-generated by compliance rule' : 'Issued manually'}</span>
            <span className="text-right"><strong>Issued By:</strong><br />{memo.issuedBy}</span>
          </div>
        </div>

        {/* Status trail */}
        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Status history</h4>
          <ul className="space-y-1">
            {(memo.statusHistory || []).map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="h-3 w-3" /> {MEMO_STATUS[s.status]?.label || s.status} — {fmtDateTime(s.at)} by {s.by}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
};

/* ═══════════════ Settings tab ═══════════════ */

const SettingsTab = ({ onSaved }) => {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getConfig();
        setCfg(data.config);
      } catch (e) {
        toast.error('Failed to load configuration');
      }
    })();
  }, []);

  if (!cfg) return <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />;

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <Card className="max-w-2xl p-5">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Compliance rules</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Applied by the nightly analysis and the "Run Analysis Now" button. Example: with the defaults,
        <strong> 5 missed checkouts in 30 days = High Risk</strong>.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">🟡 Warning at (missed checkouts)</span>
          <input type="number" min={1} max={100} value={cfg.warnMissedCount} onChange={(e) => set('warnMissedCount', e.target.value)} className={`${inputCls} w-full`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">🔴 High risk / red flag at</span>
          <input type="number" min={1} max={100} value={cfg.highMissedCount} onChange={(e) => set('highMissedCount', e.target.value)} className={`${inputCls} w-full`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Analysis window (days)</span>
          <input type="number" min={7} max={365} value={cfg.windowDays} onChange={(e) => set('windowDays', e.target.value)} className={`${inputCls} w-full`} />
        </label>
      </div>
      <label className="mt-4 flex cursor-pointer select-none items-start gap-2.5">
        <input type="checkbox" checked={!!cfg.autoIssueMemo} onChange={(e) => set('autoIssueMemo', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400" />
        <span>
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Auto-generate memo on high-risk red flag</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">The memo is created as <strong>Pending</strong> for your review — nothing is sent automatically.</span>
        </span>
      </label>
      <div className="mt-5">
        <button className={btnPrimary} disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const data = await api.saveConfig({
              warnMissedCount: Number(cfg.warnMissedCount),
              highMissedCount: Number(cfg.highMissedCount),
              windowDays: Number(cfg.windowDays),
              autoIssueMemo: !!cfg.autoIssueMemo,
            });
            setCfg(data.config);
            toast.success('Configuration saved — run the analysis to apply it');
            onSaved();
          } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to save configuration');
          } finally {
            setBusy(false);
          }
        }}>
          Save Configuration
        </button>
      </div>
    </Card>
  );
};

export default SuperAdminAttendanceCompliance;
