import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Camera, Upload, Search, CheckCircle2, AlertCircle, User, Loader2, Image as ImageIcon,
  ShieldCheck, X,
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../components/ui';
import { registrationImageAPI } from '../services/api';

// One staff member's registration card.
const StaffCard = ({ s, bust, uploading, onPick, onView }) => {
  const [errored, setErrored] = useState(false);
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-all hover:shadow-elevation-2 dark:border-slate-700/60 dark:bg-slate-900">
      <button
        onClick={() => s.hasImage && onView(s)}
        className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800"
      >
        {s.hasImage && !errored ? (
          <img
            src={`${registrationImageAPI.imageSrc(s.id)}&v=${bust}`}
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
      </button>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5 sm:p-3">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{s.fullName}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
          {s.designation ? `${s.designation} · ` : ''}{s.uid}
        </p>
        {s.department ? <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{s.department}</p> : null}
        <button
          onClick={() => onPick(s.id)}
          disabled={uploading}
          className={`mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl py-1.5 px-2 text-[11px] sm:text-xs font-bold transition-all disabled:opacity-50 ${
            s.hasImage
              ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              : 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow shadow-primary-600/25 hover:from-primary-700'}`}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? 'Uploading…' : s.hasImage ? 'Replace' : 'Upload image'}
        </button>
      </div>
    </div>
  );
};

const RegistrationImages = () => {
  const [staff, setStaff] = useState([]);
  const [summary, setSummary] = useState({ total: 0, withImage: 0, department: null });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all'); // all | missing | enrolled
  const [bust, setBust] = useState(0);
  const [uploadingId, setUploadingId] = useState(null);
  const [view, setView] = useState(null);
  const [viewErrored, setViewErrored] = useState(false);
  const fileRef = useRef(null);
  const targetRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await registrationImageAPI.overview();
      setStaff(res.staff || []);
      setSummary({ total: res.total || 0, withImage: res.withImage || 0, department: res.department || null });
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = (id) => { targetRef.current = id; fileRef.current?.click(); };

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const id = targetRef.current;
    if (!files.length || !id) return;
    setUploadingId(id);
    try {
      const images = await Promise.all(
        files.map((f) => new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(f);
        }))
      );
      const out = await registrationImageAPI.upload(id, images);
      toast.success(out.reEnrolled
        ? `Saved & re-enrolled in the face engine (${out.saved} image${out.saved > 1 ? 's' : ''})`
        : 'Saved — face engine offline, recognition updates once it is reachable');
      setBust(Date.now());
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed');
    } finally {
      setUploadingId(null);
      targetRef.current = null;
    }
  };

  const filtered = staff.filter((s) => {
    if (tab === 'missing' && s.hasImage) return false;
    if (tab === 'enrolled' && !s.hasImage) return false;
    const needle = q.trim().toLowerCase();
    if (needle && !(`${s.fullName} ${s.uid} ${s.designation || ''}`.toLowerCase().includes(needle))) return false;
    return true;
  });

  const missing = summary.total - summary.withImage;
  const TABS = [
    { key: 'all', label: `All (${summary.total})` },
    { key: 'enrolled', label: `Enrolled (${summary.withImage})` },
    { key: 'missing', label: `Missing (${missing})` },
  ];

  return (
    <div className="space-y-6">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-400 text-white shadow-md shadow-primary-600/30">
              <Camera className="h-5 w-5" />
            </span>
            Registration Images
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            View each faculty member's enrolled face — upload one if it's missing (it re-enrolls them for recognition)
            {summary.department ? ` · ${summary.department} department` : ''}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ID" className="w-full input pl-9" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
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
      <div className="flex w-full overflow-x-auto scrollbar-none rounded-xl bg-slate-100/50 p-1 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/50">
        <div className="flex flex-nowrap min-w-max gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all shrink-0 cursor-pointer ${
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {filtered.map((s) => (
            <StaffCard key={s.id} s={s} bust={bust} uploading={uploadingId === s.id} onPick={pick} onView={(staff) => { setView(staff); setViewErrored(false); }} />
          ))}
        </div>
      )}

      {/* View modal */}
      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setView(null)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-elevation-4 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700/60">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{view.fullName}</h3>
              <button onClick={() => setView(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800">
              {viewErrored ? (
                <div className="flex h-64 w-full flex-col items-center justify-center gap-1 text-slate-300 dark:text-slate-600">
                  <User className="h-12 w-12" />
                  <span className="text-[11px] font-medium text-slate-400">No image</span>
                </div>
              ) : (
                <img
                  src={`${registrationImageAPI.imageSrc(view.id)}&v=${bust}`}
                  alt={view.fullName}
                  onError={() => setViewErrored(true)}
                  className="w-full object-cover"
                />
              )}
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {view.designation ? `${view.designation} · ` : ''}{view.uid}
              </div>
              <button onClick={() => { setView(null); pick(view.id); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Upload className="h-3.5 w-3.5" /> Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegistrationImages;
