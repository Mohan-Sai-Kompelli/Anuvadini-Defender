import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ShieldAlert, ShieldX, Building2, Clock, MapPin, ChevronLeft, ChevronRight,
  RefreshCw, UserX, Gauge, Image as ImageIcon, AlertTriangle, ChevronsUpDown, Smartphone,
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { spoofAttemptsAPI } from '../../services/api';

/* ───────────────────────── helpers ───────────────────────── */

const TYPE_LABEL = { in: 'Check-in', out: 'Check-out', checkin: 'Check-in', checkout: 'Check-out', spotcheck: 'Spot-check', class: 'Class' };

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

// MiniFASNet "real" probability (0..1) → a fake-confidence percent for display.
const fakeConfidence = (score) =>
  typeof score === 'number' ? Math.round((1 - Math.max(0, Math.min(1, score))) * 100) : null;

/* ───────────────────────── evidence image ───────────────────────── */

const EvidenceImage = ({ item }) => {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400 dark:bg-slate-800">
        <ImageIcon className="h-7 w-7" />
        <span className="text-xs">No image</span>
      </div>
    );
  }
  return (
    <img
      src={spoofAttemptsAPI.imageSrc(item)}
      alt={`Spoof attempt by ${item.personName}`}
      loading="lazy"
      onError={() => setErrored(true)}
      className="h-full w-full object-cover"
    />
  );
};

/* ───────────────────────── page ───────────────────────── */

const SuperAdminSpoofAttempts = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [institutes, setInstitutes] = useState([]);
  const [instituteId, setInstituteId] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize: 24 };
      if (instituteId) params.instituteId = instituteId;
      const data = await spoofAttemptsAPI.list(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('[spoof-attempts] load failed', err);
      toast.error('Failed to load fake-attendance attempts');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, instituteId]);

  useEffect(() => { load(); }, [load]);

  // Institute filter options (best-effort).
  useEffect(() => {
    (async () => {
      try {
        const data = await spoofAttemptsAPI.institutes();
        const list = Array.isArray(data) ? data : data.items || data.organizations || [];
        setInstitutes(list);
      } catch (_e) { /* filter is optional */ }
    })();
  }, []);

  // Reset to page 1 whenever the institute filter changes.
  useEffect(() => { setPage(1); }, [instituteId]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) setFilterOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFilterOpen(false);
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400 sm:h-11 sm:w-11">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-xl">Fake Attendance Attempts</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
              Faces the anti-spoof model caught as a phone-screen or photo replay — blocked, not marked.
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
      <div className="grid max-w-5xl min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,320px)_minmax(280px,560px)]">
        <div className="min-w-0">
          <StatCard label="Fake attempts (filtered)" value={total} icon={ShieldX} accent="danger" />
        </div>
        <div className="min-w-0">
          <Card className="relative z-20 flex min-h-[112px] min-w-0 flex-col justify-center gap-2 overflow-visible p-4">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Building2 className="h-3.5 w-3.5" /> Institute
            </label>
            <div className="relative min-w-0" ref={filterRef}>
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
              <ChevronsUpDown className="pointer-events-none absolute right-3 top-5 h-4 w-4 text-slate-400" aria-hidden="true" />

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
          </Card>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,260px),320px))] gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ShieldAlert}
            title="No fake attempts detected"
            message="When someone tries to mark attendance with a video or photo on a screen, the blocked attempt shows up here with the captured evidence."
          />
        </Card>
      ) : (
        <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,260px),320px))] gap-4">
          {items.map((item) => {
            const conf = fakeConfidence(item.score);
            return (
              <Card
                key={item.id}
                className="group overflow-hidden border-l-4 border-red-400 p-0 transition hover:shadow-lg dark:border-red-500/60"
              >
                {/* Evidence image — click to view full size */}
                <button
                  type="button"
                  onClick={() => navigate(`/superadmin/spoof-attempts/${item.id}`, { state: { item } })}
                  aria-label={`View full-size evidence photo for ${item.personName}`}
                  className="relative aspect-[3/4] w-full overflow-hidden bg-slate-100 text-left dark:bg-slate-800"
                >
                  <EvidenceImage item={item} />
                  {item.kind === 'impersonation' ? (
                    <span
                      className="absolute left-2 top-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md bg-orange-600/90 px-2 py-0.5 text-[10px] font-bold text-white shadow sm:text-[11px]"
                      title="A genuine, LIVE face was captured — it just doesn't match this account's enrolled identity (e.g. a friend checking in on someone else's behalf). Not a screen/photo replay."
                    >
                      <UserX className="h-3 w-3" /> IMPERSONATION
                    </span>
                  ) : (
                    <span className="absolute left-2 top-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md bg-red-600/90 px-2 py-0.5 text-[10px] font-bold text-white shadow sm:text-[11px]">
                      <ShieldX className="h-3 w-3" /> FAKE
                    </span>
                  )}
                  {conf != null && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white sm:text-[11px]">
                      <Gauge className="h-3 w-3" /> {conf}%
                    </span>
                  )}
                  {item.matched && (
                    <span className="absolute bottom-2 left-2 right-2 inline-flex items-center justify-center gap-1 rounded-md bg-amber-500/90 px-2 py-1 text-[10px] font-bold leading-tight text-white shadow sm:text-[11px]" title="The replayed face also matched the enrolled identity - likely an impersonation of the genuine person.">
                      <UserX className="h-3 w-3" /> Identity matched
                    </span>
                  )}
                </button>

                {/* Meta */}
                <div className="min-w-0 space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      {initialsOf(item.personName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.personName}</p>
                      {item.uid && <p className="truncate text-xs text-slate-400">{item.uid}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {TYPE_LABEL[item.type] || item.type}
                    </span>
                  </div>

                  <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Building2 className="h-3.5 w-3.5 flex-none" /> <span className="min-w-0 truncate">{item.institute}</span>
                  </p>
                  {item.deviceModel && (
                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" title="Device this capture came from — a repeat pattern on one model may be a camera-specific false positive, not a real spoof.">
                      <Smartphone className="h-3.5 w-3.5 flex-none" />
                      <span className="min-w-0 truncate">{item.manufacturer ? `${item.manufacturer} ` : ''}{item.deviceModel}</span>
                    </p>
                  )}
                  <p className="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    <Clock className="mt-0.5 h-3.5 w-3.5 flex-none" /> <span className="min-w-0 break-words">{fmtTime(item.time)}</span>
                  </p>
                  {item.latitude != null && item.longitude != null && (
                    <a
                      href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                    >
                      <MapPin className="h-3.5 w-3.5" /> View location
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
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
        Detected on-server by the MiniFASNet anti-spoof model at face-verification time.
      </p>
    </div>
  );
};

export default SuperAdminSpoofAttempts;
