import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Ghost, ScanFace, Loader2, AlertTriangle, Building2, User, ArrowLeftRight,
  ShieldAlert, CheckCircle2, XCircle, Users,
} from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { ghostFacultyAPI } from '../../services/api';

const SEVERITY = {
  critical: { label: 'Network duplicate', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', ring: 'ring-rose-300 dark:ring-rose-500/40', desc: 'Same face across different institutes' },
  high:     { label: 'Different names',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', ring: 'ring-amber-300 dark:ring-amber-500/40', desc: 'Same face, different names (same institute)' },
  review:   { label: 'Review',            badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', ring: 'ring-slate-300 dark:ring-slate-600', desc: 'Same face, same name — possible duplicate enrollment' },
};
const STATUS = {
  open:        { label: 'Open',            badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  confirmed:   { label: 'Confirmed',       badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  same_person: { label: 'Same person',     badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  dismissed:   { label: 'Dismissed',       badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
};

// One person's face card within a collision.
const MemberFace = ({ m }) => {
  const [err, setErr] = useState(false);
  return (
    <div className="flex w-32 shrink-0 flex-col items-center text-center sm:w-36">
      <div className="relative h-24 w-24 overflow-hidden rounded-2xl border-2 border-white bg-slate-100 shadow ring-1 ring-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:ring-slate-700 sm:h-28 sm:w-28">
        {err ? (
          <div className="flex h-full w-full items-center justify-center text-slate-300"><User className="h-10 w-10" /></div>
        ) : (
          <img src={ghostFacultyAPI.imageSrc(m)} alt={m.name} onError={() => setErr(true)} className="h-full w-full object-cover" />
        )}
      </div>
      <p className="mt-2 w-full truncate text-sm font-bold text-slate-900 dark:text-slate-100" title={m.name}>{m.name}</p>
      <p className="w-full truncate text-[11px] text-slate-500 dark:text-slate-400" title={m.uid}>{m.uid}</p>
      <div className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400" title={m.institute}>
        <Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{m.institute}</span>
      </div>
      {m.department ? <p className="w-full truncate text-[10px] text-slate-400">{m.department}</p> : null}
      {!m.onRoster && <span className="mt-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">not on roster</span>}
    </div>
  );
};

const CollisionCard = ({ c, onStatus }) => {
  const sev = SEVERITY[c.severity] || SEVERITY.review;
  const st = STATUS[c.status] || STATUS.open;
  return (
    <Card className={`ring-1 ${sev.ring}`}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${sev.badge}`}>
              <ShieldAlert className="h-3.5 w-3.5" />{sev.label}
            </span>
            {c.crossInstitute && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                <Building2 className="h-3 w-3" />{c.institutes} institutes
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-[11px] font-bold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
              {Math.round(c.maxSim * 100)}% match
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${st.badge}`}>{st.label}</span>
          </div>
          <p className="max-w-full text-[11px] leading-4 text-slate-400 sm:text-right">{sev.desc}</p>
        </div>

        {/* Faces row with match links */}
        <div className="flex flex-nowrap items-start gap-2 overflow-x-auto overscroll-contain pb-2 sm:flex-wrap sm:overflow-visible">
          {c.members.map((m, i) => (
            <React.Fragment key={m.uid}>
              <MemberFace m={m} />
              {i < c.members.length - 1 && (
                <div className="flex h-24 shrink-0 flex-col items-center justify-center px-1 text-slate-300 dark:text-slate-600 sm:h-28">
                  <ArrowLeftRight className="h-5 w-5" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Triage actions */}
        <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/60 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <button onClick={() => onStatus(c.id, 'confirmed')}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 sm:min-h-0">
            <AlertTriangle className="h-3.5 w-3.5" /> Confirm duplicate
          </button>
          <button onClick={() => onStatus(c.id, 'same_person')}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 sm:min-h-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> Same person (legit)
          </button>
          <button onClick={() => onStatus(c.id, 'dismissed')}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 sm:min-h-0">
            <XCircle className="h-3.5 w-3.5" /> Dismiss
          </button>
        </div>
      </div>
    </Card>
  );
};

const STATUS_TABS = [
  { key: 'open', label: 'Open' },
  { key: '', label: 'All' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'same_person', label: 'Same person' },
  { key: 'dismissed', label: 'Dismissed' },
];

const SuperAdminGhostFaculty = () => {
  const [collisions, setCollisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [statusTab, setStatusTab] = useState('open');
  const [lastScanAt, setLastScanAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ghostFacultyAPI.list({ status: statusTab || undefined });
      setCollisions(res.collisions || []);
      setLastScanAt(res.lastScanAt || null);
    } catch {
      toast.error('Failed to load collisions');
    } finally {
      setLoading(false);
    }
  }, [statusTab]);
  useEffect(() => { load(); }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await ghostFacultyAPI.scan();
      const cross = res.bySeverity?.critical || 0;
      toast.success(`Scanned ${res.scannedFaces} faces · ${res.clusters} collision${res.clusters === 1 ? '' : 's'}${cross ? ` · ${cross} cross-institute` : ''}`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const setStatus = async (id, status) => {
    try {
      await ghostFacultyAPI.setStatus(id, status);
      toast.success('Updated');
      setCollisions((prev) => (statusTab && statusTab !== status ? prev.filter((c) => c.id !== id) : prev.map((c) => (c.id === id ? { ...c, status } : c))));
    } catch {
      toast.error('Update failed');
    }
  };

  const crossCount = collisions.filter((c) => c.crossInstitute).length;

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden sm:space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-xl">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-rose-400 text-white shadow-md shadow-rose-600/30">
              <Ghost className="h-5 w-5" />
            </span>
            <span className="min-w-0 truncate">Ghost Faculty</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
            One face, multiple identities — the same person enrolled under different IDs across the network
            {lastScanAt ? ` · last scan ${new Date(lastScanAt).toLocaleString()}` : ''}
          </p>
        </div>
        <button onClick={runScan} disabled={scanning}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-600/25 transition-all hover:from-primary-700 disabled:opacity-60 sm:w-auto">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
          {scanning ? 'Scanning network…' : 'Run network scan'}
        </button>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Collisions" value={collisions.length} icon={Users} accent="primary" />
        <StatCard label="Cross-institute" value={crossCount} icon={Building2} accent="danger" />
        <StatCard label="Viewing" value={STATUS_TABS.find((t) => t.key === statusTab)?.label || 'All'} icon={Ghost} accent="info" />
      </div>

      <div className="flex min-w-0 flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button key={t.key || 'all'} onClick={() => setStatusTab(t.key)}
            className={`min-h-10 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-all ${
              statusTab === t.key
                ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow shadow-primary-600/25'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="min-w-0 space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}</div>
      ) : collisions.length === 0 ? (
        <Card>
          <EmptyState
            icon={Ghost}
            title={statusTab === 'open' ? 'No open collisions' : 'No collisions'}
            description="Run a network scan to compare every enrolled face. A clean result means no duplicate identities were found at this similarity threshold."
          />
        </Card>
      ) : (
        <div className="min-w-0 space-y-4">
          {collisions.map((c) => <CollisionCard key={c.id} c={c} onStatus={setStatus} />)}
        </div>
      )}
    </div>
  );
};

export default SuperAdminGhostFaculty;
