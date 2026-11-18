import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Globe, Building2, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle,
  ChevronsUpDown, ArrowDown, LogIn, LogOut as LogOutIcon, MapPin, Network,
  Smartphone, Wifi, Signal,
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { ipLogsAPI } from '../../services/api';

/* ───────────────────────── helpers ───────────────────────── */

const EVENT_META = {
  login: { label: 'Login', icon: LogIn, cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  in: { label: 'Check-in', icon: MapPin, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  out: { label: 'Check-out', icon: LogOutIcon, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

const EVENT_FILTERS = [
  { value: '', label: 'All events' },
  { value: 'login', label: 'Logins' },
  { value: 'in', label: 'Check-ins' },
  { value: 'out', label: 'Check-outs' },
];

const initialsOf = (name) =>
  (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

const fmtTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleString(undefined, {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
};

const EventBadge = ({ event }) => {
  const meta = EVENT_META[event] || EVENT_META.in;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
};

/** "Manufacturer Model" label for a device, or null when nothing was reported. */
const deviceLabel = (manufacturer, model) => {
  const parts = [manufacturer, model].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
};

/* Current device + local IP / network type; on a device change, the RED
 * "Previous Device ↓ Current Device ↓ Device Changed" flag. */
const DeviceCell = ({ item }) => {
  const current = deviceLabel(item.manufacturer, item.deviceModel);
  const previous = deviceLabel(item.previousDeviceManufacturer, item.previousDeviceModel)
    || (item.previousDeviceId ? `ID ${item.previousDeviceId}` : null);

  const network = item.networkType === 'wifi'
    ? { icon: Wifi, label: item.localIp ? `WiFi · ${item.localIp}` : 'WiFi' }
    : item.networkType === 'mobile'
      ? { icon: Signal, label: 'Mobile data' }
      : null;
  const NetworkIcon = network?.icon;

  return (
    <div className="inline-flex min-w-0 flex-col items-start gap-1">
      {item.deviceChanged ? (
        <div className="inline-flex flex-col items-start gap-0.5">
          <span className="text-xs text-slate-500 line-through dark:text-slate-400">{previous || 'Unknown device'}</span>
          <ArrowDown className="h-3 w-3 text-red-500" />
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 dark:text-red-400">
            <Smartphone className="h-3.5 w-3.5" /> {current || 'Unknown device'}
          </span>
          <ArrowDown className="h-3 w-3 text-red-500" />
          <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" /> Device Changed
          </span>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm text-slate-700 dark:text-slate-200">
          <Smartphone className="h-3.5 w-3.5 text-slate-400" /> {current || '—'}
        </span>
      )}
      {item.androidVersion && (
        <span className="text-[11px] text-slate-400">Android {item.androidVersion}</span>
      )}
      {network && (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          <NetworkIcon className="h-3 w-3" /> {network.label}
        </span>
      )}
    </div>
  );
};

/* Previous IP ↓ Current IP ↓ "IP Changed" — the informational warning block. */
const IpCell = ({ item }) => {
  if (!item.ipChanged) {
    return (
      <span className="font-mono text-sm text-slate-700 dark:text-slate-200">
        {item.publicIp || 'Unknown'}
      </span>
    );
  }
  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <span className="font-mono text-xs text-slate-500 line-through dark:text-slate-400">{item.previousIp}</span>
      <ArrowDown className="h-3 w-3 text-amber-500" />
      <span className="font-mono text-sm font-semibold text-amber-700 dark:text-amber-400">{item.publicIp || 'Unknown'}</span>
      <ArrowDown className="h-3 w-3 text-amber-500" />
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" /> IP Changed
      </span>
    </div>
  );
};

/* ───────────────────────── page ───────────────────────── */

const SuperAdminIpTracking = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [changedTotal, setChangedTotal] = useState(0);
  const [deviceChangedTotal, setDeviceChangedTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [institutes, setInstitutes] = useState([]);
  const [instituteId, setInstituteId] = useState('');
  const [event, setEvent] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize: 25 };
      if (instituteId) params.instituteId = instituteId;
      if (event) params.event = event;
      if (changedOnly) params.changedOnly = 'true';
      const data = await ipLogsAPI.list(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setChangedTotal(data.changedTotal || 0);
      setDeviceChangedTotal(data.deviceChangedTotal || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('[ip-tracking] load failed', err);
      toast.error('Failed to load IP activity');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, instituteId, event, changedOnly]);

  useEffect(() => { load(); }, [load]);

  // Institute filter options (best-effort).
  useEffect(() => {
    (async () => {
      try {
        const data = await ipLogsAPI.institutes();
        const list = Array.isArray(data) ? data : data.items || data.organizations || [];
        setInstitutes(list);
      } catch (_e) { /* filter is optional */ }
    })();
  }, []);

  // Reset to page 1 whenever any filter changes.
  useEffect(() => { setPage(1); }, [instituteId, event, changedOnly]);

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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400 sm:h-11 sm:w-11">
            <Globe className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-xl">Device &amp; IP Tracking</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
              The public IP, local IP, network and physical device every login, check-in and check-out
              came from. A different IP is an amber warning; a different phone — even on the same WiFi —
              is a red flag. Informational only, nothing was blocked.
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

      {/* 4 Stat Cards Row */}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events (filtered)" value={total} icon={Network} accent="info" />
        <StatCard label="IP changes (filtered)" value={changedTotal} icon={AlertTriangle} accent="warning" />
        <StatCard label="Device changes (filtered)" value={deviceChangedTotal} icon={Smartphone} accent="danger" />
        <StatCard
          label="Flagged rate"
          value={total > 0 ? `${Math.round(((changedTotal + deviceChangedTotal) / total) * 100)}%` : '0%'}
          icon={Globe}
          accent="violet"
        />
      </div>

      {/* Sleek Compact Horizontal Filter Toolbar */}
      <Card noPadding className="relative z-20 overflow-visible px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
            <Building2 className="h-3.5 w-3.5 text-sky-500" /> Filters
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1 sm:justify-end">
            {/* Institute Filter */}
            <div className="relative min-w-0 flex-1 sm:flex-none sm:w-60" ref={filterRef}>
              <button
                type="button"
                onClick={() => setFilterOpen((open) => !open)}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-semibold text-slate-800 shadow-2xs outline-none transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                aria-haspopup="listbox"
                aria-expanded={filterOpen}
                aria-label="Filter by institute"
              >
                <span className="truncate">{selectedInstituteName}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
              {filterOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-xs text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={instituteId === ''}
                    onClick={() => selectInstitute('')}
                    className={`block w-full truncate px-3 py-1.5 text-left transition hover:bg-sky-50 dark:hover:bg-slate-800 ${instituteId === '' ? 'bg-sky-600 text-white font-bold dark:bg-sky-600' : ''}`}
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
                        className={`block w-full truncate px-3 py-1.5 text-left transition hover:bg-sky-50 dark:hover:bg-slate-800 ${active ? 'bg-sky-600 text-white font-bold dark:bg-sky-600' : ''}`}
                      >
                        {o.name || 'Unnamed institute'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Event Filter */}
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              aria-label="Filter by event type"
              className="h-9 sm:w-40 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs outline-none transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
            >
              {EVENT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            {/* Changed only toggle */}
            <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={(e) => setChangedOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-400 cursor-pointer"
              />
              IP / device changes only
            </label>
          </div>
        </div>
      </Card>

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
            icon={Globe}
            title="No tracking activity yet"
            message="When employees log in or mark attendance, the device and IP each action came from shows up here."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Employee ID</th>
                  <th className="px-4 py-3">Institute</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Device / Network</th>
                  <th className="px-4 py-3">Public IP</th>
                  <th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                      item.deviceChanged
                        ? 'border-l-4 border-l-red-500 bg-red-50/60 dark:border-l-red-500/80 dark:bg-red-500/5'
                        : item.ipChanged
                          ? 'border-l-4 border-l-amber-400 bg-amber-50/60 dark:border-l-amber-500/70 dark:bg-amber-500/5'
                          : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                          {initialsOf(item.personName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{item.personName}</p>
                          {(item.designation || item.department) && (
                            <p className="truncate text-xs text-slate-400">
                              {[item.designation, item.department].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{item.uid || '—'}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-slate-600 dark:text-slate-300" title={item.institute}>
                      {item.institute}
                    </td>
                    <td className="px-4 py-3"><EventBadge event={item.event} /></td>
                    <td className="px-4 py-3"><DeviceCell item={item} /></td>
                    <td className="px-4 py-3"><IpCell item={item} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{fmtTime(item.time)}</td>
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
        IP and device telemetry are reported by the app (the IP falls back to the connection address
        server-side). A change is a warning only — logins and attendance are never blocked because of it —
        and every device change is also recorded in the Audit Trail.
      </p>
    </div>
  );
};

export default SuperAdminIpTracking;
