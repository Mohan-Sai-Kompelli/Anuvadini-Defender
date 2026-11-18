import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  KeyRound, Building2, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle,
  ChevronsUpDown, Activity, Clock, Monitor, ScrollText,
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { sessionsAPI } from '../../services/api';

/* ───────────────────────── helpers ───────────────────────── */

const ROLE_LABEL = { superadmin: 'Super Admin', hoi: 'Admin', hod: 'HOD', organization: 'Admin' };

const STATUS_FILTERS = [
  { value: '', label: 'All sessions' },
  { value: 'active', label: 'Active now' },
  { value: 'ended', label: 'Ended' },
];

const initialsOf = (name) =>
  (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

const fmtTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
};

const fmtDuration = (ms) => {
  if (ms == null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

/* Session status chip: green while active; the kick reason stands out in red. */
const StatusChip = ({ item }) => {
  if (item.active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        <Activity className="h-3 w-3" /> Active
      </span>
    );
  }
  const kicked = item.logoutReason === 'logged_in_another_device';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
        kicked
          ? 'bg-red-100 font-bold text-red-700 dark:bg-red-500/15 dark:text-red-400'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
      }`}
    >
      {kicked && <AlertTriangle className="h-3 w-3" />}
      {item.logoutReasonLabel}
    </span>
  );
};

/* ───────────────────────── page ───────────────────────── */

const SuperAdminSessions = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [kickedTotal, setKickedTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [institutes, setInstitutes] = useState([]);
  const [instituteId, setInstituteId] = useState('');
  const [status, setStatus] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize: 25 };
      if (instituteId) params.instituteId = instituteId;
      if (status) params.status = status;
      const data = await sessionsAPI.list(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setActiveTotal(data.activeTotal || 0);
      setKickedTotal(data.kickedTotal || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('[sessions] load failed', err);
      toast.error('Failed to load login sessions');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, instituteId, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const data = await sessionsAPI.institutes();
        const list = Array.isArray(data) ? data : data.items || data.organizations || [];
        setInstitutes(list);
      } catch (_e) { /* filter is optional */ }
    })();
  }, []);

  useEffect(() => { setPage(1); }, [instituteId, status]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const closeOnOutsideClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    };
    const closeOnEscape = (e) => {
      if (e.key === 'Escape') setFilterOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filterOpen]);

  const selectedInstituteName = institutes.find((o) => (o._id || o.id) === instituteId)?.name || 'All institutes';
  const selectInstitute = (value) => {
    setInstituteId(value);
    setFilterOpen(false);
  };

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden sm:space-y-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400 sm:h-11 sm:w-11">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-xl">Login Sessions</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
              Every administrative login session (Super Admin, Admin, HOD). Admin accounts allow only ONE
              active session — a login on a second device terminates the first. Faculty and students are
              not restricted and don't appear here.
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

      {/* Summary + filters */}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(170px,230px))_minmax(280px,1fr)]">
        <div className="min-w-0">
          <StatCard label="Sessions (filtered)" value={total} icon={ScrollText} accent="info" />
        </div>
        <div className="min-w-0">
          <StatCard label="Active now" value={activeTotal} icon={Activity} accent="success" />
        </div>
        <div className="min-w-0">
          <StatCard label="Terminated by new login" value={kickedTotal} icon={AlertTriangle} accent="danger" />
        </div>
        <div className="min-w-0">
          <Card className="relative z-20 flex min-h-[112px] min-w-0 flex-col justify-center gap-2 overflow-visible p-4">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Building2 className="h-3.5 w-3.5" /> Filters
            </label>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="relative min-w-0 flex-1" ref={filterRef}>
                <button
                  type="button"
                  onClick={() => setFilterOpen((open) => !open)}
                  className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-left text-sm text-slate-800 shadow-sm outline-none transition hover:bg-slate-50 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-750"
                  aria-haspopup="listbox"
                  aria-expanded={filterOpen}
                  aria-label="Filter by institute"
                >
                  <span className="min-w-0 flex-1 truncate">{selectedInstituteName}</span>
                </button>
                <ChevronsUpDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                {filterOpen && (
                  <div
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 text-sm text-slate-800 shadow-elevation-4 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={instituteId === ''}
                      onClick={() => selectInstitute('')}
                      className={`block w-full truncate px-3 py-2 text-left transition hover:bg-primary-50 dark:hover:bg-slate-800 ${instituteId === '' ? 'bg-primary-600 text-white hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-600' : ''}`}
                    >
                      All institutes
                    </button>
                    {institutes.map((o) => {
                      const value = o._id || o.id;
                      const active = instituteId === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => selectInstitute(value)}
                          title={o.name}
                          className={`block w-full truncate px-3 py-2 text-left transition hover:bg-primary-50 dark:hover:bg-slate-800 ${active ? 'bg-primary-600 text-white hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-600' : ''}`}
                        >
                          {o.name || 'Unnamed institute'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Filter by session status"
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition hover:bg-slate-50 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </Card>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={KeyRound}
            title="No login sessions yet"
            message="Administrative logins (Super Admin, Admin, HOD) will appear here with their device, IP, duration and how each session ended."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Institute</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Login</th>
                  <th className="px-4 py-3">Logout</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                      item.logoutReason === 'logged_in_another_device'
                        ? 'border-l-4 border-l-red-400 bg-red-50/50 dark:border-l-red-500/70 dark:bg-red-500/5'
                        : item.active
                          ? 'border-l-4 border-l-emerald-400 dark:border-l-emerald-500/70'
                          : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                          {initialsOf(item.user)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{item.user}</p>
                          <p className="truncate text-xs text-slate-400">{ROLE_LABEL[item.role] || item.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-slate-600 dark:text-slate-300" title={item.institute}>
                      {item.institute}
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <span className="inline-flex max-w-full items-center gap-1 text-xs text-slate-500 dark:text-slate-400" title={item.device || ''}>
                        <Monitor className="h-3.5 w-3.5 flex-none" />
                        <span className="truncate">{item.device || '—'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{item.ip || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{fmtTime(item.loginAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{item.active ? '—' : fmtTime(item.logoutAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" /> {fmtDuration(item.durationMs)}</span>
                    </td>
                    <td className="px-4 py-3"><StatusChip item={item} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span className="min-w-[7rem] text-center text-sm text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Footnote */}
      <p className="flex flex-wrap items-center justify-center gap-1.5 px-2 pt-2 text-center text-xs leading-5 text-slate-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        "Logged in From Another Device" means the single-active-session policy terminated the older
        session automatically; the previous device was shown a security notice and returned to Login.
      </p>
    </div>
  );
};

export default SuperAdminSessions;
