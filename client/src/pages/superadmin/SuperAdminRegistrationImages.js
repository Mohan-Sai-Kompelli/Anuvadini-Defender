import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Camera, Search, CheckCircle2, AlertCircle, User, ShieldCheck, X,
  Building2, ChevronRight, ChevronLeft, MapPin, Users, Image as ImageIcon,
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { superAdminRegistrationAPI } from '../../services/api';

// One staff member's enrolled-face card (read-only — click to view full size).
const StaffCard = ({ s, onView }) => {
  const [errored, setErrored] = useState(false);
  return (
    <button
      onClick={() => s.hasImage && onView(s)}
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white text-left shadow-sm transition-all hover:shadow-elevation-2 disabled:cursor-default dark:border-slate-700/60 dark:bg-slate-900"
      disabled={!s.hasImage}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {s.hasImage && !errored ? (
          <img
            src={superAdminRegistrationAPI.imageSrc(s.id, 0)}
            alt={s.fullName}
            loading="lazy"
            onError={() => setErrored(true)}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-300 dark:text-slate-600">
            <User className="h-12 w-12" />
            <span className="text-[11px] font-medium text-slate-400">No image</span>
          </div>
        )}
        <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          s.hasImage ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                     : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>
          {s.hasImage ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          {s.hasImage ? 'Enrolled' : 'Missing'}
        </span>
        {s.imageCount > 1 && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            <ImageIcon className="h-3 w-3" /> {s.imageCount}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-3">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{s.fullName}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
          {s.designation ? `${s.designation} · ` : ''}{s.uid}
        </p>
        {s.department ? <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{s.department}</p> : null}
      </div>
    </button>
  );
};

// Full-size viewer that cycles through all of one person's enrolled images.
const Lightbox = ({ person, onClose }) => {
  const [idx, setIdx] = useState(0);
  const [errored, setErrored] = useState(false);
  const count = person.imageCount || 0;
  const go = (delta) => { setErrored(false); setIdx((i) => (i + delta + count) % count); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-elevation-4 dark:bg-slate-900">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-slate-700/60 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{person.fullName}</h3>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {person.designation ? `${person.designation} · ` : ''}{person.uid}
              {person.department ? ` · ${person.department}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close image viewer"><X className="h-5 w-5" /></button>
        </div>
        <div className="relative flex items-center justify-center bg-slate-100 dark:bg-slate-800">
          {errored ? (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 text-slate-300 dark:text-slate-600">
              <User className="h-12 w-12" /><span className="text-xs">Image unavailable</span>
            </div>
          ) : (
            <img src={superAdminRegistrationAPI.imageSrc(person.id, idx)} alt={person.fullName} onError={() => setErrored(true)} className="max-h-[65vh] w-full object-contain" />
          )}
          {count > 1 && (
            <>
              <button onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/60 p-2 text-white hover:bg-slate-900/80"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/60 p-2 text-white hover:bg-slate-900/80"><ChevronRight className="h-5 w-5" /></button>
            </>
          )}
        </div>
        {count > 1 && (
          <div className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
            Image {idx + 1} of {count}
          </div>
        )}
      </div>
    </div>
  );
};

const SuperAdminRegistrationImages = () => {
  const [institutes, setInstitutes] = useState([]);
  const [instLoading, setInstLoading] = useState(true);
  const [selected, setSelected] = useState(null); // { id, name }
  const [staff, setStaff] = useState([]);
  const [summary, setSummary] = useState({ total: 0, withImage: 0 });
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all'); // all | enrolled | missing
  const [view, setView] = useState(null);

  const loadInstitutes = useCallback(async () => {
    setInstLoading(true);
    try {
      const res = await superAdminRegistrationAPI.institutes();
      setInstitutes(res.organizations || []);
    } catch {
      toast.error('Failed to load institutes');
    } finally {
      setInstLoading(false);
    }
  }, []);
  useEffect(() => { loadInstitutes(); }, [loadInstitutes]);

  const openInstitute = useCallback(async (inst) => {
    setSelected({ id: inst.id, name: inst.name });
    setStaff([]);
    setQ('');
    setTab('all');
    setLoading(true);
    try {
      const res = await superAdminRegistrationAPI.staff(inst.id);
      setStaff(res.staff || []);
      setSummary({ total: res.total || 0, withImage: res.withImage || 0 });
    } catch {
      toast.error('Failed to load registration images');
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = staff.filter((s) => {
    if (tab === 'missing' && s.hasImage) return false;
    if (tab === 'enrolled' && !s.hasImage) return false;
    const needle = q.trim().toLowerCase();
    if (needle && !(`${s.fullName} ${s.uid} ${s.designation || ''} ${s.department || ''}`.toLowerCase().includes(needle))) return false;
    return true;
  });

  const missing = summary.total - summary.withImage;
  const TABS = [
    { key: 'all', label: `All (${summary.total})` },
    { key: 'enrolled', label: `Enrolled (${summary.withImage})` },
    { key: 'missing', label: `Missing (${missing})` },
  ];

  // Header (shared by both views).
  const Header = (
    <div className="min-w-0">
      <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-xl">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-400 text-white shadow-md shadow-primary-600/30">
          <Camera className="h-5 w-5" />
        </span>
        <span className="min-w-0 truncate">Registration Images</span>
      </h1>
      <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
        View each faculty member's enrolled face image across the network (read-only)
      </p>
    </div>
  );

  // ── Institute picker ──────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="w-full min-w-0 space-y-5 overflow-x-hidden sm:space-y-6">
        {Header}
        {instLoading ? (
          <div className="grid min-w-0 grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="min-h-24 animate-pulse rounded-2xl border border-slate-200/70 bg-slate-100 dark:border-slate-700/60 dark:bg-slate-800" />
            ))}
          </div>
        ) : institutes.length === 0 ? (
          <Card><EmptyState title="No institutes" description="No organizations are registered yet." icon={Building2} /></Card>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {institutes.map((inst) => (
              <button
                key={inst.id}
                onClick={() => openInstitute(inst)}
                className="group flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white p-3.5 text-left shadow-sm transition-all hover:shadow-elevation-2 dark:border-slate-700/60 dark:bg-slate-900 sm:p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <Building2 className="h-4 w-4 shrink-0 text-primary-500" /> <span className="min-w-0 truncate">{inst.name}</span>
                  </p>
                  <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {inst.state || '—'}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {inst.staff ?? 0} staff</span>
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Staff grid for the selected institute ─────────────────────────
  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden sm:space-y-6">
      <div className="flex min-w-0 flex-col items-stretch gap-4 lg:flex-row lg:items-start lg:justify-between">
        {Header}
        <div className="relative w-full min-w-0 lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID or department" className="input min-h-11 w-full rounded-xl pl-9 pr-3 text-sm" />
        </div>
      </div>

      {/* Breadcrumb */}
      <button onClick={() => setSelected(null)} className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
        <ChevronLeft className="h-4 w-4" /> All institutes
      </button>
      <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
        <Building2 className="h-4 w-4 shrink-0 text-primary-500" /> <span className="min-w-0 truncate">{selected.name}</span>
      </div>

      {/* Stats */}
      <div className="grid min-w-0 grid-cols-1 gap-3.5 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setTab('all')}
          className="block w-full text-left focus:outline-none cursor-pointer group"
          title="Filter all staff"
        >
          <StatCard
            label="Total staff"
            value={summary.total}
            icon={User}
            accent="primary"
            className={`transition-all ${
              tab === 'all'
                ? '!border-2 !border-emerald-500 shadow-md shadow-emerald-500/10'
                : 'opacity-75 group-hover:opacity-100 group-hover:scale-[1.01]'
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => setTab('enrolled')}
          className="block w-full text-left focus:outline-none cursor-pointer group"
          title="Filter enrolled staff"
        >
          <StatCard
            label="Enrolled"
            value={summary.withImage}
            icon={ShieldCheck}
            accent="success"
            className={`transition-all ${
              tab === 'enrolled'
                ? '!border-2 !border-emerald-500 shadow-md shadow-emerald-500/10'
                : 'opacity-75 group-hover:opacity-100 group-hover:scale-[1.01]'
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => setTab('missing')}
          className="block w-full text-left focus:outline-none cursor-pointer group"
          title="Filter missing image staff"
        >
          <StatCard
            label="Missing image"
            value={missing}
            icon={AlertCircle}
            accent="danger"
            className={`transition-all ${
              tab === 'missing'
                ? '!border-2 !border-rose-500 shadow-md shadow-rose-500/10'
                : 'opacity-75 group-hover:opacity-100 group-hover:scale-[1.01]'
            }`}
          />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200/50 bg-slate-100/50 p-1 scrollbar-none dark:border-slate-800/50 dark:bg-slate-900/30">
        <div className="flex min-w-max flex-nowrap gap-1 sm:min-w-0 sm:flex-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-10 shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-all cursor-pointer sm:flex-1 sm:px-4 ${
                tab === t.key
                  ? 'bg-white text-primary-700 shadow dark:bg-slate-800 dark:text-primary-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-700/60">
              <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800" />
              <div className="space-y-2 p-3"><div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800" /><div className="h-2 w-1/2 rounded bg-slate-100 dark:bg-slate-800" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState title="No staff" description="No one matches this filter." icon={User} /></Card>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {filtered.map((s) => <StaffCard key={s.id} s={s} onView={setView} />)}
        </div>
      )}

      {view && <Lightbox person={view} onClose={() => setView(null)} />}
    </div>
  );
};

export default SuperAdminRegistrationImages;
