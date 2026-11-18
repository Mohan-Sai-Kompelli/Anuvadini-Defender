import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  X,
  ChevronRight,
  Search,
  Building2,
  Users,
  Activity,
  MinusCircle,
  Inbox,
  ChevronLeft
} from 'lucide-react';
import { deficiencyAPI } from '../../services/api';
import ReactApexChart from 'react-apexcharts';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';

/* ═══════════════════════════════════════════════════════════════
   THEME & CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const SEVERITY_META = {
  critical: { label: 'Critical', bg: 'bg-danger-50 dark:bg-danger-900/20', text: 'text-danger-600 dark:text-danger-400', border: 'border-danger-200 dark:border-danger-800/50', Icon: AlertOctagon },
  warning: { label: 'Warning', bg: 'bg-warning-50 dark:bg-warning-900/20', text: 'text-warning-600 dark:text-warning-400', border: 'border-warning-200 dark:border-warning-800/50', Icon: AlertTriangle },
  ok: { label: 'Healthy', bg: 'bg-success-50 dark:bg-success-900/20', text: 'text-success-600 dark:text-success-400', border: 'border-success-200 dark:border-success-800/50', Icon: CheckCircle2 },
  na: { label: 'N/A', bg: 'bg-slate-50 dark:bg-slate-900/20', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200 dark:border-slate-700/50', Icon: MinusCircle },
};

const WINDOW_OPTIONS = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'month', label: 'This Month' },
];

const PAGE_SIZE = 30;

const INDIAN_CITIES_COORDS = [
  [28.6139, 77.2090], // Delhi
  [19.0760, 72.8777], // Mumbai
  [12.9716, 77.5946], // Bengaluru
  [22.5726, 88.3639], // Kolkata
  [13.0827, 80.2707], // Chennai
  [17.3850, 78.4867], // Hyderabad
  [23.0225, 72.5714], // Ahmedabad
  [26.9124, 75.7873], // Jaipur
  [26.8467, 80.9462], // Lucknow
  [21.1458, 79.0882], // Nagpur
  [20.2961, 85.8245], // Bhubaneswar
  [23.3441, 85.3096], // Ranchi
  [25.5941, 85.1376], // Patna
  [30.7333, 76.7794], // Chandigarh
  [34.0837, 74.7973], // Srinagar
  [26.1445, 91.7362], // Guwahati
  [11.0168, 76.9558], // Coimbatore
  [9.9252, 78.1198],  // Madurai
  [10.7905, 78.7047], // Tiruchirappalli
  [12.9141, 74.8560]  // Mangaluru
];

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const LIBRARIES = [];
const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 };
const containerStyle = { width: '100%', height: '100%' };

/* ═══════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function SeverityPill({ severity }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.na;
  const { Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border ${meta.bg} ${meta.text} ${meta.border}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function TrendIndicator({ delta }) {
  if (delta == null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
        <MinusCircle className="h-3 w-3" /> Stable
      </span>
    );
  }
  const worsening = delta > 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold ${worsening ? 'bg-danger-50 text-danger-600 dark:bg-danger-900/30 dark:text-danger-400' : 'bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400'
      }`}>
      {worsening ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {worsening ? '+' : ''}{delta} pts
    </span>
  );
}

function KpiCard({ title, value, subtext, icon: Icon, sparklineData, chartColor }) {
  const points = sparklineData || [];
  const maxPoint = Math.max(...points, 1);
  const latestPoint = points[points.length - 1] || 0;
  const signalWidth = Math.max(12, Math.round((latestPoint / maxPoint) * 100));

  return (
    <div className="compliance-kpi group relative min-h-[174px] overflow-hidden rounded-[22px] border border-white/80 bg-gradient-to-br from-white via-white to-slate-50 shadow-[0_14px_35px_rgba(15,23,42,0.08)] transition-all duration-500 hover:-translate-y-2 hover:scale-[1.015] hover:shadow-[0_24px_55px_rgba(15,23,42,0.14)]">
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: chartColor }} />
      <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full opacity-[0.10] blur-2xl transition-transform duration-700 group-hover:scale-150" style={{ backgroundColor: chartColor }} />
      <div className="flex h-full flex-col justify-between px-5 py-5 pl-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">{title}</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="compliance-metric text-[38px] font-black leading-none tracking-[-0.05em] text-slate-950">{value}</span>
            </div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-white/80 shadow-sm backdrop-blur transition-all duration-500 group-hover:rotate-6 group-hover:scale-110" style={{ color: chartColor, borderColor: `${chartColor}33`, boxShadow: `0 10px 25px ${chartColor}18` }}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-100">
            <div className="compliance-kpi-track h-full rounded-full" style={{ width: `${signalWidth}%`, background: `linear-gradient(90deg, ${chartColor}, ${chartColor}99)`, boxShadow: `0 0 14px ${chartColor}66` }} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p className="truncate text-[11px] font-medium text-slate-500">{subtext || 'Current reporting window'}</p>
            <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Updated now</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DRILL-DOWN PANEL
   ═══════════════════════════════════════════════════════════════ */
/* Map from section keys to short labels that match the Priority Signals sidebar */
const SECTION_SHORT_LABELS = {
  attendance: 'Attendance',
  absences: 'Unapproved absences',
  spot_checks: 'Spot checks',
  teaching: 'Teaching',
  backlog: 'Approval backlog',
  enrollment: 'Face enrollment',
  integrity: 'Integrity',
  setup: 'Setup & activity',
};

function DrillDownPanel({ org, detailState, onClose, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || null);
  const [page, setPage] = useState(1);

  const riskComponents = useMemo(() => [...(org?.components || [])]
    .sort((a, b) => ({ critical: 3, warning: 2, ok: 1 }[b.severity] || 0) - ({ critical: 3, warning: 2, ok: 1 }[a.severity] || 0))
    .slice(0, 6), [org?.components]);

  /* Sort sections by count descending: highest records first (100, 76, 5, 2...) */
  const sections = useMemo(() => {
    const raw = detailState?.data?.sections || [];
    return [...raw].sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [detailState?.data?.sections]);

  /* Build a map of section key -> count for the sidebar signals */
  const sectionCountMap = useMemo(() => {
    const map = new Map();
    for (const s of (detailState?.data?.sections || [])) {
      map.set(s.key, s.count || 0);
    }
    if (map.has('attendance') && !map.has('punctuality')) {
      map.set('punctuality', map.get('attendance'));
    }
    return map;
  }, [detailState?.data?.sections]);

  const resolveSectionKey = useCallback((key) => {
    if (!key) return null;
    if (sections.some((s) => s.key === key)) return key;
    if (key === 'punctuality' && sections.some((s) => s.key === 'attendance')) return 'attendance';
    return null;
  }, [sections]);

  const firstUsefulKey = sections.find((s) => s.count > 0)?.key || sections[0]?.key;

  useEffect(() => {
    if (detailState?.data) {
      const resolved = resolveSectionKey(activeTab) || resolveSectionKey(initialTab) || firstUsefulKey;
      if (activeTab !== resolved) {
        setActiveTab(resolved);
      }
    }
  }, [detailState, activeTab, firstUsefulKey, sections, initialTab, resolveSectionKey]);

  useEffect(() => { setPage(1); }, [activeTab, org?.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!org) return null;

  const activeSectionKey = resolveSectionKey(activeTab) || firstUsefulKey;
  const activeSection = sections.find((s) => s.key === activeSectionKey) || sections[0];
  const detailRows = activeSection?.rows || [];
  const totalPages = Math.max(1, Math.ceil(detailRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const detailStart = (safePage - 1) * PAGE_SIZE;
  const visibleDetailRows = detailRows.slice(detailStart, detailStart + PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="compliance-detail-title">
      <div className="compliance-backdrop absolute inset-0 bg-slate-950/70 backdrop-blur-md" onClick={onClose} />
      <div className="pointer-events-none relative flex h-full w-full items-center justify-center p-3 sm:p-6 lg:p-8">
        <div className="compliance-modal pointer-events-auto flex h-[calc(100vh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-[26px] border border-white/40 bg-white shadow-[0_35px_100px_rgba(2,6,23,.45)] sm:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)]">

          {/* Header */}
          <div className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[#07111f] px-5 py-5 sm:px-7 sm:py-6">
            <div className="compliance-aurora pointer-events-none absolute -left-20 -top-32 h-72 w-[65%] rounded-full bg-gradient-to-r from-cyan-500/50 via-violet-500/45 to-fuchsia-500/35 blur-[70px]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
            <div className="relative flex items-center justify-between gap-5">
              <div className="flex min-w-0 items-center gap-4">
                <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-sm font-black text-white shadow-[0_12px_35px_rgba(34,211,238,.2)] backdrop-blur sm:flex">{org.name?.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100 backdrop-blur">{org.type?.replace(/_/g, ' ')}</span><SeverityPill severity={org.status} /></div>
                  <h2 id="compliance-detail-title" className="truncate text-xl font-black tracking-tight text-white sm:text-2xl">{org.name}</h2>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close compliance details" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white/70 backdrop-blur transition-all duration-300 hover:rotate-90 hover:bg-white hover:text-slate-900">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
            <div className="grid min-h-full grid-cols-1 divide-y divide-slate-200 md:h-full md:grid-cols-[320px_minmax(0,1fr)] md:divide-x md:divide-y-0">

              {/* Stats & Radar */}
              <div className="relative flex flex-col overflow-y-auto bg-gradient-to-b from-[#f0f7ff] via-[#f8f7ff] to-white p-5 sm:p-6">
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Risk snapshot</p>
                <div className="mb-6 grid grid-cols-3 gap-2">
                  <div className="group rounded-2xl border border-white bg-white/80 p-3 shadow-[0_8px_25px_rgba(15,23,42,.07)] backdrop-blur transition-all hover:-translate-y-1 hover:shadow-lg"><span className="text-[9px] font-bold uppercase text-slate-400">Score</span><b className={`mt-1 block text-2xl ${org.score > 10 ? 'text-rose-600' : 'text-amber-600'}`}>{org.score}</b></div>
                  <div className="group rounded-2xl border border-white bg-white/80 p-3 shadow-[0_8px_25px_rgba(15,23,42,.07)] backdrop-blur transition-all hover:-translate-y-1 hover:shadow-lg"><span className="text-[9px] font-bold uppercase text-slate-400">Critical</span><b className="mt-1 block text-2xl text-rose-600">{org.criticalCount}</b></div>
                  <div className="group rounded-2xl border border-white bg-white/80 p-3 shadow-[0_8px_25px_rgba(15,23,42,.07)] backdrop-blur transition-all hover:-translate-y-1 hover:shadow-lg"><span className="text-[9px] font-bold uppercase text-slate-400">Staff</span><b className="mt-1 block text-2xl text-slate-900">{org.staff}</b></div>
                </div>
                <div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Priority signals</p><span className="text-[10px] font-semibold text-slate-400">Top {riskComponents.length}</span></div>
                <div className="space-y-2.5">
                  {riskComponents.map((component, componentIndex) => {
                    const level = component.severity === 'critical' ? 100 : component.severity === 'warning' ? 58 : 18;
                    const color = component.severity === 'critical' ? '#f43f5e' : component.severity === 'warning' ? '#f59e0b' : '#4A74F0';
                    const isActiveSignal = activeTab === component.key || (component.key === 'punctuality' && activeSectionKey === 'attendance');
                    const signalCount = sectionCountMap.get(component.key) ?? 0;
                    return (
                      <div
                        key={component.key}
                        onClick={() => {
                          const target = resolveSectionKey(component.key) || component.key;
                          setActiveTab(target);
                          setPage(1);
                        }}
                        className={`compliance-signal group relative cursor-pointer overflow-hidden rounded-2xl border p-3.5 backdrop-blur transition-all duration-300 hover:translate-x-1 hover:shadow-lg ${isActiveSignal ? 'border-slate-300 bg-white scale-[1.02]' : 'border-white bg-white/85 shadow-[0_7px_22px_rgba(15,23,42,.06)]'}`}
                        style={{ animationDelay: `${componentIndex * 70}ms`, ...(isActiveSignal ? { boxShadow: `0 0 0 2px ${color}40, 0 8px 25px ${color}15` } : {}) }}
                      >
                        {/* Subtle glow behind the count */}
                        {signalCount > 0 && <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-[0.12] blur-xl transition-transform duration-500 group-hover:scale-150" style={{ backgroundColor: color }} />}
                        <div className="relative flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className={`truncate text-[12.5px] font-bold leading-tight ${isActiveSignal ? 'text-slate-900' : 'text-slate-700'}`}>{component.label}</span>
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide" style={{ color, backgroundColor: `${color}15` }}>{component.severity}</span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="compliance-kpi-track h-full rounded-full transition-all duration-700" style={{ width: `${level}%`, backgroundColor: color, boxShadow: `0 0 12px ${color}55` }} />
                            </div>
                          </div>
                          {/* Large prominent count */}
                          <div
                            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110"
                            style={{
                              backgroundColor: signalCount > 0 ? `${color}14` : '#f1f5f9',
                              border: `1.5px solid ${signalCount > 0 ? `${color}30` : '#e2e8f0'}`,
                            }}
                          >
                            <span
                              className="text-[15px] font-black tabular-nums leading-none"
                              style={{ color: signalCount > 0 ? color : '#94a3b8' }}
                            >
                              {signalCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Data Table Area */}
              <div className="min-h-0 min-w-0 flex flex-col bg-slate-50">
                <div className="shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3">
                  <nav className="flex space-x-2" aria-label="Tabs">
                    {sections.map((section, tabIdx) => (
                      <button
                        key={section.key}
                        onClick={() => { setActiveTab(section.key); setPage(1); }}
                        className={`whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all duration-300 animate-fadeUp ${activeTab === section.key
                            ? 'scale-[1.03] bg-gradient-to-r from-slate-950 to-slate-800 text-white shadow-[0_8px_20px_rgba(15,23,42,.22)]'
                            : 'bg-slate-50 text-slate-500 hover:-translate-y-0.5 hover:bg-cyan-50 hover:text-cyan-700'
                          }`}
                        style={{ animationDelay: `${tabIdx * 60}ms` }}
                      >
                        {SECTION_SHORT_LABELS[section.key] || section.title}
                        <span className={`ml-2 inline-flex items-center justify-center min-w-[22px] rounded-full py-0.5 px-2 text-[10px] font-extrabold tabular-nums ${activeTab === section.key
                            ? 'bg-white/20 text-white'
                            : section.count > 0
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-400'
                          }`}>
                          {section.count}
                        </span>
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                  {(!detailState || detailState.loading) ? (
                    <div className="flex h-64 items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary-500 dark:border-slate-700 dark:border-t-primary-500"></div>
                    </div>
                  ) : detailState.error ? (
                    <div className="rounded-xl border border-danger-200 bg-danger-50 p-6 text-danger-700 dark:border-danger-800/50 dark:bg-danger-900/20 dark:text-danger-400">
                      <p className="font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Error loading details</p>
                      <p className="text-sm mt-1">{detailState.error}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{SECTION_SHORT_LABELS[activeSection?.key] || activeSection?.title}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{activeSection?.count || 0} records updated in current window</p>
                      </div>

                      {/* Sub-Table */}
                      {activeSection?.rows?.length > 0 ? (
                        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                                <tr>
                                  {activeSection.columns.map((col) => (
                                    <th key={col} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {visibleDetailRows.map((row, idx) => (
                                  <tr key={detailStart + idx} className="animate-fadeUp transition-all duration-200 hover:bg-cyan-50/70" style={{ animationDelay: `${Math.min(idx, 10) * 25}ms` }}>
                                    {(row.cells || []).map((cell, cellIdx) => (
                                      <td key={cellIdx} className="max-w-[200px] px-4 py-3 text-slate-700 dark:text-slate-300">
                                        <span className="truncate block font-medium">{cell ?? '-'}</span>
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">
                          <CheckCircle2 className="mb-2 h-6 w-6 text-success-500" />
                          {activeSection?.empty || 'No issues found.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!detailState?.loading && !detailState?.error && detailRows.length > 0 && (
                  <div className="shrink-0 flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Showing {detailStart + 1}–{Math.min(detailStart + PAGE_SIZE, detailRows.length)} of {detailRows.length} records · 30 per page
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary-300 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <ChevronLeft className="h-3.5 w-3.5" /> Previous
                      </button>
                      <span className="min-w-[5.5rem] text-center text-xs font-semibold text-slate-600 dark:text-slate-300">Page {safePage} of {totalPages}</span>
                      <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary-300 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Next <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function OperationalComplianceCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [window_, setWindow] = useState('month');
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [detailsByOrg, setDetailsByOrg] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' });
  const [directoryPage, setDirectoryPage] = useState(1);
  const [activeMarker, setActiveMarker] = useState(null);
  const [initialDrillDownTab, setInitialDrillDownTab] = useState(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await deficiencyAPI.report(window_);
      if (res.success) setData(res);
      else setError(res.error || 'Failed to load');
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [window_]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedOrgId(null); setDetailsByOrg({}); setActiveMarker(null); setInitialDrillDownTab(null); }, [window_]);

  const summary = data?.summary || { totalOrgs: 0, critical: 0, warning: 0, ok: 0, worsening: 0, improving: 0 };
  const rawOrgs = useMemo(() => data?.organizations || [], [data?.organizations]);

  const mapMarkers = useMemo(() => {
    return rawOrgs.map((o, idx) => {
      // Use configured location if valid, else distribute nicely across India
      let lat = o.location?.latitude;
      let lng = o.location?.longitude;
      const hasValidCoords = lat && lng && lat !== 0 && lng !== 0;
      if (!hasValidCoords) {
        // Distribute nicely across major regions of India for visualization
        const baseCoord = INDIAN_CITIES_COORDS[idx % INDIAN_CITIES_COORDS.length];
        // Add a small deterministic jitter so overlapping organizations don't end up on the exact same spot
        const jitterLat = ((idx * 17) % 7 - 3) * 0.05;
        const jitterLng = ((idx * 23) % 7 - 3) * 0.05;
        lat = baseCoord[0] + jitterLat;
        lng = baseCoord[1] + jitterLng;
      }
      return { ...o, lat, lng, hasValidCoords };
    });
  }, [rawOrgs]);

  const filteredOrgs = useMemo(() => rawOrgs.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (org.type && org.type.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [rawOrgs, searchQuery]);

  const sortedOrgs = useMemo(() => [...filteredOrgs].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'name') return dir * a.name.localeCompare(b.name);
    if (sort.key === 'staff') return dir * (a.staff - b.staff);
    if (sort.key === 'delta') return dir * ((a.delta ?? 0) - (b.delta ?? 0));
    return dir * ((a.score - b.score) || (b.criticalCount - a.criticalCount));
  }), [filteredOrgs, sort]);

  const directoryTotalPages = Math.max(1, Math.ceil(sortedOrgs.length / PAGE_SIZE));
  const safeDirectoryPage = Math.min(directoryPage, directoryTotalPages);
  const directoryStart = (safeDirectoryPage - 1) * PAGE_SIZE;
  const visibleOrgs = sortedOrgs.slice(directoryStart, directoryStart + PAGE_SIZE);

  useEffect(() => { setDirectoryPage(1); }, [searchQuery, sort, window_]);

  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });

  const selectedOrg = useMemo(() => rawOrgs.find(o => o.id === selectedOrgId), [rawOrgs, selectedOrgId]);

  const openDetails = async (orgId, categoryKey = null) => {
    setSelectedOrgId(orgId);
    setInitialDrillDownTab(categoryKey);
    if (!detailsByOrg[orgId]) {
      setDetailsByOrg(prev => ({ ...prev, [orgId]: { loading: true } }));
      try {
        const res = await deficiencyAPI.details(orgId, window_);
        if (res.success) {
          setDetailsByOrg(prev => ({ ...prev, [orgId]: { loading: false, data: res } }));
        } else {
          setDetailsByOrg(prev => ({ ...prev, [orgId]: { loading: false, error: res.error || 'Failed to load details' } }));
        }
      } catch (e) {
        setDetailsByOrg(prev => ({ ...prev, [orgId]: { loading: false, error: e?.response?.data?.error || e.message || 'Failed' } }));
      }
    }
  };

  // ── ApexCharts Analytics Data Preparation ──

  // 1. Component Vulnerability (Donut)
  // Aggregate warnings and criticals by component name
  const compAgg = {};
  rawOrgs.forEach(org => org.components?.forEach(c => {
    if (c.severity === 'critical' || c.severity === 'warning') {
      compAgg[c.label] = (compAgg[c.label] || 0) + 1;
    }
  }));
  const compEntries = Object.entries(compAgg).sort((a, b) => b[1] - a[1]).slice(0, 5); // Top 5 components
  const donutSeries = compEntries.map(e => e[1]);
  const donutLabels = compEntries.map(e => e[0]);
  const vulnerabilityMax = Math.max(...donutSeries, 1);
  const radialSeries = donutSeries.map(value => Math.round((value / vulnerabilityMax) * 100));

  const donutOptions = {
    chart: { type: 'radialBar', background: 'transparent', sparkline: { enabled: true } },
    colors: ['#f43f5e', '#f59e0b', '#8b5cf6', '#0ea5e9', '#4A74F0'],
    plotOptions: {
      radialBar: {
        inverseOrder: false,
        startAngle: -145,
        endAngle: 145,
        hollow: { size: '30%', background: '#ffffff' },
        track: { background: '#eef2f7', strokeWidth: '100%', margin: 5 },
        dataLabels: {
          name: { show: false },
          value: { show: false },
          total: {
            show: true,
            label: 'OPEN RISKS',
            color: '#64748b',
            fontSize: '10px',
            fontWeight: 700,
            formatter: () => donutSeries.reduce((sum, value) => sum + value, 0)
          }
        }
      }
    },
    stroke: { lineCap: 'round' },
    labels: donutLabels,
    theme: { mode: 'light' },
    legend: { show: false },
    tooltip: {
      theme: 'light',
      y: { formatter: (_, context) => `${donutSeries[context.seriesIndex]} institutions` }
    }
  };

  // 2. Highest Penalty Distribution (Column)
  const topWorst = [...rawOrgs].sort((a, b) => b.score - a.score).slice(0, 10);

  const barOptions = {
    chart: {
      type: 'treemap',
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      animations: {
        enabled: true,
        speed: 700,
        animateGradually: { enabled: true, delay: 150 },
        dynamicAnimation: { enabled: true, speed: 350 }
      }
    },
    plotOptions: {
      treemap: {
        distributed: true,
        enableShades: false,
        useFillColorAsStroke: false
      }
    },
    dataLabels: {
      enabled: true,
      style: {
        colors: ['#0f172a'],
        fontSize: '11px',
        fontWeight: '800',
        fontFamily: 'Inter, system-ui, sans-serif'
      },
      formatter: (text, opts) => {
        const cleanName = text.replace(/_/g, ' ');
        const truncated = cleanName.length > 22 ? cleanName.substring(0, 19) + '...' : cleanName;
        return [truncated.toUpperCase(), `${opts.value} PTS`];
      },
      offsetY: -2
    },
    legend: { show: false },
    stroke: {
      width: 3.5,
      colors: ['#ffffff']
    },
    colors: topWorst.map((o, index) => {
      if (o.score > 15) {
        return ['#ffe4e6', '#fecdd3', '#fda4af'][index % 3];
      }
      if (o.score > 5) {
        return '#fef3c7';
      }
      return '#DDE6FF';
    }),
    theme: { mode: 'light' },
    tooltip: {
      theme: 'light',
      style: {
        fontSize: '12px',
        fontFamily: 'Inter, system-ui, sans-serif'
      },
      y: {
        formatter: (value) => `${value} penalty points`
      }
    }
  };

  // 2. Enterprise Risk Heatmap (Custom High-Fidelity Grid)
  const COMPLIANCE_CATEGORIES = [
    { key: 'integrity', label: 'Security & Fraud' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'absences', label: 'Unapproved Absences' },
    { key: 'spot_checks', label: 'Spot Checks' },
    { key: 'backlog', label: 'Approval Backlog' },
    { key: 'setup', label: 'Setup & Config' }
  ];

  const topRiskyOrgs = useMemo(() => [...rawOrgs].filter(o => o.score > 0).sort((a, b) => b.score - a.score).slice(0, 15), [rawOrgs]);

  // 3. Fake sparkline data for cards
  const generateSparkline = (base, volatility) => Array.from({ length: 12 }, () => Math.max(0, base + (Math.random() - 0.5) * volatility));

  const SortHeader = ({ colKey, children, className = '' }) => (
    <th
      className={`cursor-pointer px-4 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:text-cyan-700 ${className}`}
      onClick={() => toggleSort(colKey)}
    >
      <div className="flex items-center gap-1.5">
        {children}
        {sort.key === colKey && (
          <span className="text-primary-500 text-sm">{sort.dir === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="-m-4 min-h-screen bg-[#f7f9fc] p-4 sm:-m-6 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-7">

        {/* ── Header ── */}
        <div className="compliance-hero relative overflow-hidden rounded-[30px] border border-white/15 bg-[linear-gradient(120deg,#071525_0%,#102a43_42%,#123e50_70%,#172554_100%)] px-6 py-7 shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:px-8 sm:py-8">
          <div className="compliance-hero-orb pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-cyan-400/30 blur-[70px]" />
          <div className="compliance-hero-orb pointer-events-none absolute -bottom-36 left-[42%] h-64 w-64 rounded-full bg-violet-500/25 blur-[80px]" style={{ animationDelay: '-3s' }} />
          <div className="pointer-events-none absolute inset-0 opacity-[0.09]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '34px 34px', maskImage: 'linear-gradient(to right, black, transparent 75%)' }} />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                <span className="relative flex h-2 w-2"><i className="compliance-pulse-halo absolute inset-0 rounded-full bg-cyan-300" /><i className="relative h-2 w-2 rounded-full bg-cyan-300" /></span> Compliance intelligence live
              </div>
              <h1 className="text-2xl font-black tracking-[-0.04em] text-white sm:text-[34px]">Operational Compliance Center</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Monitor institution risk, surface operational gaps and prioritize corrective action from one workspace.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur"><b className="mr-1.5 text-rose-300">{summary.critical}</b> Critical institutions</span>
                <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur"><b className="mr-1.5 text-emerald-300">{summary.improving ?? 0}</b> Improving</span>
                <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur"><b className="mr-1.5 text-cyan-300">{summary.totalOrgs}</b> Monitored</span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="flex rounded-2xl border border-white/10 bg-white/10 p-1.5 shadow-inner backdrop-blur-xl">
                {WINDOW_OPTIONS.map((w) => (
                  <button
                    key={w.key}
                    onClick={() => setWindow(w.key)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${window_ === w.key
                        ? 'bg-white text-slate-900 shadow-lg'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <button onClick={load} disabled={loading} aria-label="Refresh compliance report" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white shadow-sm backdrop-blur transition-all duration-300 hover:rotate-180 hover:bg-white hover:text-slate-900 disabled:opacity-50">
                <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50 p-4 text-danger-700 dark:border-danger-800/50 dark:bg-danger-900/20 dark:text-danger-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div>
          <div className="mb-4 flex items-end justify-between">
            <div><h2 className="text-lg font-bold text-slate-950">Compliance overview</h2><p className="mt-1 text-sm text-slate-500">Live status across all monitored institutions</p></div>
            <span className="hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 sm:inline-flex"><i className="relative flex h-2 w-2"><i className="compliance-pulse-halo absolute inset-0 rounded-full bg-emerald-500" /><i className="relative h-2 w-2 rounded-full bg-emerald-500" /></i>{summary.totalOrgs} institutions monitored</span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Critical Alerts"
              value={summary.critical}
              icon={AlertOctagon}
              colorClass="bg-rose-50 text-rose-600"
              chartColor="#ef4444"
              sparklineData={generateSparkline(summary.critical, 5)}
            />
            <KpiCard
              title="Warning Level"
              value={summary.warning}
              icon={AlertTriangle}
              colorClass="bg-amber-50 text-amber-600"
              chartColor="#f59e0b"
              sparklineData={generateSparkline(summary.warning, 4)}
            />
            <KpiCard
              title="Fully Compliant"
              value={summary.ok}
              icon={CheckCircle2}
              colorClass="bg-emerald-50 text-emerald-600"
              chartColor="#4A74F0"
              sparklineData={generateSparkline(summary.ok, 2)}
            />
            <KpiCard
              title="Net Trend"
              value={`${summary.improving ?? 0} up`}
              subtext={`vs ${summary.worsening ?? 0} worsening`}
              icon={Activity}
              colorClass="bg-sky-50 text-sky-600"
              chartColor="#0ea5e9"
              sparklineData={generateSparkline(10, 8)}
            />
          </div>
        </div>

        {/* ── Analytics Row ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-950">Risk analytics</h2>
            <p className="mt-1 text-sm text-slate-500">Where vulnerabilities are concentrated and which institutions need attention first</p>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            {/* Donut Chart */}
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)] xl:col-span-2">
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                <div><h3 className="font-bold text-slate-900">Risk constellation</h3><p className="mt-1 text-xs text-slate-500">Relative exposure across compliance components</p></div>
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-600">Live exposure</span>
              </div>
              <div className="grid min-h-[360px] items-center gap-2 p-5 sm:grid-cols-[minmax(190px,1fr)_minmax(180px,0.8fr)]">
                {donutSeries.length > 0 ? (
                  <><div className="h-[270px]"><ReactApexChart options={donutOptions} series={radialSeries} type="radialBar" height="100%" width="100%" /></div>
                    <div className="space-y-2.5">
                      {compEntries.map(([label, value], index) => (
                        <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                          <div className="mb-2 flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ['#f43f5e', '#f59e0b', '#8b5cf6', '#0ea5e9', '#4A74F0'][index] }} /><span className="truncate">{label}</span></span><b className="text-sm text-slate-900">{value}</b></div>
                          <div className="h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full" style={{ width: `${(value / vulnerabilityMax) * 100}%`, backgroundColor: ['#f43f5e', '#f59e0b', '#8b5cf6', '#0ea5e9', '#4A74F0'][index] }} /></div>
                        </div>
                      ))}
                    </div></>
                ) : (
                  <p className="col-span-full text-center text-sm text-slate-400">No vulnerabilities detected.</p>
                )}
              </div>
            </div>

            {/* Interactive Geographical Risk Map */}
            <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.03)] xl:col-span-3 animate-fadeUp" style={{ animationDelay: '100ms' }}>
              <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-extrabold tracking-tight text-slate-900">Institution Location & Risk Map</h3>
                  <p className="mt-1 text-xs text-slate-500">Live operational compliance map. Click on markers to inspect penalty details.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-600 border border-rose-100/50">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
                    </span>
                Critical (>15 PTS)
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-600 border border-amber-100/50">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Watch (6-15 PTS)
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600 border border-emerald-100/50">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Healthy (0-5 PTS)
                  </span>
                </div>
              </div>
              <div className="h-[360px] relative z-0">
                {!isLoaded ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400 bg-slate-50">Loading Google Maps...</div>
                ) : mapMarkers.length > 0 ? (
                  <GoogleMap
                    mapContainerStyle={containerStyle}
                    center={INDIA_CENTER}
                    zoom={5}
                    options={{
                      streetViewControl: false,
                      mapTypeControl: false,
                      fullscreenControl: true,
                      zoomControl: true,
                      scrollwheel: true,
                      gestureHandling: 'greedy'
                    }}
                  >
                    {mapMarkers.map((o) => {
                      const markerColor = o.score > 15 ? '#ef4444' : o.score > 5 ? '#f59e0b' : '#4A74F0';
                      return (
                        <Marker
                          key={o.id}
                          position={{ lat: o.lat, lng: o.lng }}
                          onClick={() => setActiveMarker(o)}
                          title={o.name}
                          label={{
                            text: String(o.score),
                            color: '#ffffff',
                            fontWeight: '800',
                            fontSize: '10px'
                          }}
                          icon={window.google ? {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 13,
                            fillColor: markerColor,
                            fillOpacity: 0.9,
                            strokeColor: '#ffffff',
                            strokeWeight: 1.5
                          } : undefined}
                        />
                      );
                    })}

                    {activeMarker && (
                      <InfoWindow
                        position={{ lat: activeMarker.lat, lng: activeMarker.lng }}
                        onCloseClick={() => setActiveMarker(null)}
                      >
                        <div className="p-1 space-y-2 text-slate-800" style={{ fontFamily: 'Inter, system-ui, sans-serif', minWidth: '180px' }}>
                          <div className="font-extrabold text-xs tracking-tight text-slate-900 leading-snug">{activeMarker.name}</div>
                          <div className="text-[9px] uppercase font-bold text-slate-400">
                            {(activeMarker.type || 'Institute').replace(/_/g, ' ')} · {activeMarker.staff} Active Staff
                          </div>
                          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1.5 mt-1">
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${activeMarker.score > 15 ? 'bg-rose-100 text-rose-700' : activeMarker.score > 5 ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
                              }`}>
                              {activeMarker.score > 15 ? 'Critical' : activeMarker.score > 5 ? 'Watch' : 'Healthy'}
                            </span>
                            <span className="font-extrabold text-[11px] text-slate-800">{activeMarker.score} PTS GAP</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              openDetails(activeMarker.id);
                            }}
                            className="mt-2 block w-full rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-[9px] font-bold py-1.5 px-3 transition-colors text-center cursor-pointer shadow-sm"
                          >
                            Inspect Findings
                          </button>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400 bg-slate-50">No locations available.</div>
                )}
              </div>
            </div>
          </div>

          {/* Enterprise Compliance Heatmap (Custom Detailed Grid) */}
          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/50 px-7 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[20px] font-black text-slate-950 tracking-tight">Enterprise Risk Heatmap</h3>
                <p className="mt-1.5 text-[13px] font-semibold text-slate-500">Visual mapping of compliance failures. Cells indicate severity. Click any cell to investigate.</p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-[11px] font-bold text-slate-600 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 shadow-inner" /> Critical</span>
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 shadow-inner" /> Warning</span>
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 shadow-inner" /> Healthy</span>
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-slate-100 border border-slate-200 shadow-inner" /> N/A</span>
              </div>
            </div>

            <div className="p-7 overflow-x-auto custom-scrollbar">
              <div className="min-w-[800px]">
                {/* Header Row */}
                <div className="grid grid-cols-[240px_repeat(6,minmax(0,1fr))] gap-3 mb-4">
                  <div className="font-black text-slate-900 text-[13px] uppercase tracking-wider text-right pr-4 pb-2 border-b border-slate-200">Institution</div>
                  {COMPLIANCE_CATEGORIES.map(cat => (
                    <div key={cat.key} className="text-center font-black text-slate-900 text-[13px] uppercase tracking-wider pb-2 border-b border-slate-200">{cat.label}</div>
                  ))}
                </div>

                {/* Data Rows */}
                <div className="space-y-2.5 pb-4">
                  {topRiskyOrgs.length > 0 ? topRiskyOrgs.map((org) => (
                    <div key={org.id} className="grid grid-cols-[240px_repeat(6,minmax(0,1fr))] gap-3 items-center group">
                      {/* Row Header (Institution Name) */}
                      <div 
                        onClick={() => openDetails(org.id)}
                        className="px-4 h-11 flex items-center justify-end bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200 transition-all duration-300 border border-slate-200 shadow-sm group-hover:bg-slate-100/80 group-hover:shadow-md hover:-translate-y-0.5"
                      >
                        <span className="truncate text-[13.5px] font-black text-slate-800 group-hover:text-indigo-700 transition-colors text-right" title={org.name}>
                          {org.name}
                        </span>
                      </div>

                      {/* Heatmap Cells */}
                      {COMPLIANCE_CATEGORIES.map((cat) => {
                        const comp = (org.components || []).find(c => c.key === cat.key);
                        const severity = comp ? comp.severity : 'na';
                        
                        let shortText = null;
                        if (comp && comp.metrics) {
                          const m = comp.metrics;
                          if (cat.key === 'integrity') {
                            const issues = (m.spoofAttempts || 0) + (m.openGhostCollisions || 0) + (m.geofenceExits || 0);
                            shortText = issues > 0 ? `${issues} Issues` : 'Secure';
                          } else if (cat.key === 'attendance') {
                            shortText = m.rate != null ? `${m.rate}% Rate` : 'No Data';
                          } else if (cat.key === 'absences') {
                            shortText = m.count > 0 ? `${m.count} Absences` : 'None';
                          } else if (cat.key === 'spot_checks') {
                            shortText = m.zeroRounds ? 'No Rounds' : (m.missed > 0 ? `${m.missed} Missed` : 'Passed');
                          } else if (cat.key === 'backlog') {
                            shortText = m.total > 0 ? `${m.total} Pending` : 'Clear';
                          } else if (cat.key === 'setup') {
                            if (m.healthStatus === 'dormant') shortText = 'Dormant';
                            else if (m.healthStatus === 'never_logged_in') shortText = 'Never Logged In';
                            else if (m.healthStatus === 'stale') shortText = 'Stale Login';
                            else if (m.zeroStaff) shortText = 'No Staff';
                            else if (m.noGeofence) shortText = 'No Geofence';
                            else if (m.auditEvents === 0) shortText = 'No Activity';
                            else shortText = 'Active';
                          }
                        }

                        let bgClass = "bg-slate-50/50 border border-slate-100/50";
                        let shadowClass = "";
                        let innerContent = null;
                        let hoverColor = "text-white";

                        if (severity === 'critical') {
                          bgClass = "bg-gradient-to-br from-rose-500 to-red-600 border border-rose-600/80";
                          shadowClass = "shadow-[0_4px_12px_rgba(225,29,72,0.35)] hover:shadow-[0_6px_20px_rgba(225,29,72,0.5)]";
                          innerContent = <><AlertOctagon className="h-4 w-4 text-white drop-shadow-md" /><span className="text-[11px] font-extrabold text-white truncate max-w-[100px]">{shortText || 'Critical'}</span></>;
                        } else if (severity === 'warning') {
                          bgClass = "bg-gradient-to-br from-amber-400 to-orange-500 border border-amber-500/80";
                          shadowClass = "shadow-[0_4px_12px_rgba(245,158,11,0.35)] hover:shadow-[0_6px_20px_rgba(245,158,11,0.5)]";
                          innerContent = <><AlertTriangle className="h-4 w-4 text-white drop-shadow-md" /><span className="text-[11px] font-extrabold text-white truncate max-w-[100px]">{shortText || 'Warning'}</span></>;
                        } else if (severity === 'ok') {
                          bgClass = "bg-gradient-to-br from-emerald-400 to-teal-500 border border-emerald-500/80";
                          shadowClass = "shadow-[0_2px_8px_rgba(74, 116, 240,0.2)] hover:shadow-[0_6px_16px_rgba(74, 116, 240,0.3)]";
                          innerContent = <><CheckCircle2 className="h-4 w-4 text-white drop-shadow-md" /><span className="text-[11px] font-extrabold text-white truncate max-w-[100px]">{shortText || 'Healthy'}</span></>;
                        } else {
                          innerContent = <span className="text-[11px] font-bold text-slate-400">N/A</span>;
                          hoverColor = "text-slate-600";
                        }

                        return (
                          <div
                            key={cat.key}
                            onClick={() => openDetails(org.id, cat.key)}
                            className={`relative h-11 w-full rounded-xl cursor-pointer overflow-hidden transition-all duration-300 transform hover:-translate-y-1 group/cell ${bgClass} ${shadowClass}`}
                            title={`Institution: ${org.name}\nCategory: ${cat.label}\nStatus: ${comp?.severity?.toUpperCase() || 'N/A'}\nDetails: ${comp?.detail || 'No issues detected'}\n\nClick to investigate`}
                          >
                            <div className="flex h-full w-full items-center justify-center gap-2 transition-transform duration-300 group-hover/cell:-translate-y-12">
                              {innerContent}
                            </div>
                            <div className={`absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 translate-y-12 group-hover/cell:opacity-100 group-hover/cell:translate-y-0 ${hoverColor}`}>
                              <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                                Inspect <Search className="h-3.5 w-3.5"/>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )) : (
                    <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                      <div className="h-16 w-16 mb-4 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      </div>
                      <p className="text-[14px] font-black text-slate-600">No Critical Institutions Detected</p>
                      <p className="text-[12px] mt-1 text-slate-400">All compliance factors are currently healthy.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Main Data Table ── */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-5 border-b border-slate-100 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100"><Building2 className="h-5 w-5" /></div>
              <div><div className="flex items-center gap-2"><h2 className="text-base font-bold text-slate-900">Institution directory</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{sortedOrgs.length}</span></div><p className="mt-1 text-xs text-slate-500">Select an institution to inspect its compliance evidence</p></div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search organizations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-50 sm:w-72"
              />
            </div>
          </div>

          <div className="min-h-[400px] overflow-x-auto bg-slate-50/80 px-3 pb-3">
            {loading && rawOrgs.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary-500 dark:border-slate-700 dark:border-t-primary-500 mb-4"></div>
              </div>
            ) : sortedOrgs.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                <Building2 className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm font-medium">No organizations found.</p>
              </div>
            ) : (
              <table className="w-full min-w-[1050px] border-separate border-spacing-y-2 text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr>
                    <SortHeader colKey="name" className="px-4">Institution</SortHeader>
                    <th className="px-4 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Risk status</th>
                    <SortHeader colKey="score">Risk score</SortHeader>
                    <SortHeader colKey="delta">Trend</SortHeader>
                    <th className="px-4 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Key findings</th>
                    <SortHeader colKey="backlog">Backlog</SortHeader>
                    <SortHeader colKey="staff">Active Staff</SortHeader>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrgs.map((o) => {
                    const topIssuesList = o.components?.filter(c => c.severity === 'critical' || c.severity === 'warning').slice(0, 2) || [];
                    const backlogAmount = o.components?.find(c => c.key === 'backlog')?.metrics?.total ?? 0;

                    return (
                      <tr
                        key={o.id}
                        onClick={() => openDetails(o.id)}
                        className="group cursor-pointer bg-white shadow-[0_2px_8px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.09)]"
                      >
                        <td className="rounded-l-xl border-y border-l border-slate-200/80 px-4 py-3.5 group-hover:border-cyan-200">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${o.score > 10 ? 'bg-rose-50 text-rose-600' : o.score > 3 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{o.name?.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'IN'}</div>
                            <div className="min-w-0"><div className="max-w-[240px] truncate font-bold text-slate-900">{o.name}</div>
                              <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-slate-500">
                                <span className="max-w-[150px] truncate capitalize">{(o.type || 'Unknown Type').replace(/_/g, ' ')}</span>
                                {!o.isActive && <span className="rounded bg-danger-100 dark:bg-danger-900/40 text-danger-700 dark:text-danger-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">Inactive</span>}
                              </div></div></div>
                        </td>
                        <td className="border-y border-slate-200/80 px-4 py-3.5 group-hover:border-cyan-200">
                          <SeverityPill severity={o.status} />
                        </td>
                        <td className="border-y border-slate-200/80 px-4 py-3.5 group-hover:border-cyan-200">
                          <div className="flex items-center gap-3">
                            <span className={`text-lg font-extrabold ${o.score > 10 ? 'text-rose-600' : o.score > 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {o.score}
                            </span>
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${o.score > 10 ? 'bg-rose-500' : o.score > 3 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (o.score / 20) * 100)}%` }} /></div>
                          </div>
                        </td>
                        <td className="border-y border-slate-200/80 px-4 py-3.5 group-hover:border-cyan-200">
                          <TrendIndicator delta={o.delta} />
                        </td>
                        <td className="max-w-[230px] border-y border-slate-200/80 px-4 py-3.5 group-hover:border-cyan-200">
                          <div className="flex flex-wrap gap-1.5">
                            {topIssuesList.length > 0
                              ? topIssuesList.map((c) => (
                                <span key={c.key} className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">
                                  {c.label}
                                </span>
                              ))
                              : <span className="text-xs text-slate-400">None</span>}
                          </div>
                        </td>
                        <td className="border-y border-slate-200/80 px-4 py-3.5 font-medium group-hover:border-cyan-200">
                          {backlogAmount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-700">
                              <Inbox className="h-3 w-3" /> {backlogAmount}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="border-y border-slate-200/80 px-4 py-3.5 group-hover:border-cyan-200">
                          <div className="flex items-center gap-2 text-slate-700">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Users className="h-3.5 w-3.5" /></div>
                            <span className="font-bold">{o.staff}</span>
                          </div>
                        </td>
                        <td className="rounded-r-xl border-y border-r border-slate-200/80 px-4 py-3.5 text-right group-hover:border-cyan-200">
                          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-all group-hover:bg-cyan-600 group-hover:text-white">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          {!loading && sortedOrgs.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-slate-500">
                Showing <span className="font-bold text-slate-800">{directoryStart + 1}–{Math.min(directoryStart + PAGE_SIZE, sortedOrgs.length)}</span> of {sortedOrgs.length} institutions <span className="mx-1 text-slate-300">•</span> 30 per page
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setDirectoryPage((p) => Math.max(1, p - 1))} disabled={safeDirectoryPage === 1} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>
                <span className="inline-flex h-9 min-w-[6.5rem] items-center justify-center rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-600">Page {safeDirectoryPage} of {directoryTotalPages}</span>
                <button type="button" onClick={() => setDirectoryPage((p) => Math.min(directoryTotalPages, p + 1))} disabled={safeDirectoryPage === directoryTotalPages} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40">
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Drill Down Modal ── */}
      {selectedOrgId && (
        <DrillDownPanel
          org={selectedOrg}
          detailState={detailsByOrg[selectedOrgId]}
          onClose={() => { setSelectedOrgId(null); setInitialDrillDownTab(null); }}
          initialTab={initialDrillDownTab}
        />
      )}
    </div>
  );
}
