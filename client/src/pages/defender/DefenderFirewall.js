import React, { useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Ban, ChevronLeft, ChevronRight, Dices, EyeOff, Gamepad2, Globe, Heart, Layers, Plus, RefreshCw, Search, Share2, ShieldCheck, ShieldOff, Trash2, Tv, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Confirm, DefenderPage, Empty, ErrorNote, Skeleton, Toggle } from '../../components/defender/ui';
import { Avatar } from '../../components/defender/visual';
import KpiCard from '../../components/app/KpiCard';
import ExceptionsCard from '../../components/defender/ExceptionsCard';
import { act, ago, ddelete, dpost, errorText, useDefender } from './api';

gsap.registerPlugin(useGSAP);

const CATEGORIES = ['Web Gaming', 'Gambling & Betting', 'Social Media', 'Streaming & Leisure', 'Dating & Distraction', 'Adult & 18+ Content', 'Custom Blocklist'];
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

const CAT = {
  'Web Gaming': { color: '#5f9b2f', icon: Gamepad2 },
  'Gambling & Betting': { color: '#c43d42', icon: Dices },
  'Social Media': { color: '#2f7de1', icon: Share2 },
  'Streaming & Leisure': { color: '#7a5bd6', icon: Tv },
  'Dating & Distraction': { color: '#d4577f', icon: Heart },
  'Adult & 18+ Content': { color: '#b7791f', icon: EyeOff },
  'Custom Blocklist': { color: '#6b7280', icon: Ban },
};
const meta = (c) => CAT[c] || { color: '#6b7280', icon: Globe };

/** The shield: a radar sweep and pulse rings that only run while the firewall is on. */
const Shield = ({ on }) => {
  const root = useRef(null);
  useGSAP(() => {
    if (!on) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.to('[data-sweep]', { rotation: 360, transformOrigin: '50% 50%', duration: 5, ease: 'none', repeat: -1 });
      gsap.fromTo('[data-pulse]', { scale: 0.7, opacity: 0.55 }, { scale: 1.45, opacity: 0, duration: 2.8, ease: 'power2.out', repeat: -1, stagger: 0.9, transformOrigin: '50% 50%' });
      gsap.to('[data-core]', { scale: 1.06, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 50%' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [on], revertOnUpdate: true });
  const tone = on ? '#34e3a0' : '#64748b';
  return (
    <div ref={root} className="relative h-[150px] w-[150px] shrink-0" aria-hidden="true">
      <svg viewBox="0 0 150 150" className="h-full w-full overflow-visible">
        <defs>
          <radialGradient id="fwCore" cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor={tone} stopOpacity="0.35" /><stop offset="100%" stopColor={tone} stopOpacity="0.04" /></radialGradient>
          <linearGradient id="fwSweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={tone} stopOpacity="0" /><stop offset="100%" stopColor={tone} stopOpacity="0.55" /></linearGradient>
        </defs>
        {on && [0, 1, 2].map((i) => <circle key={i} data-pulse cx="75" cy="75" r="52" fill="none" stroke={tone} strokeWidth="1.5" />)}
        <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <circle cx="75" cy="75" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="2 5" />
        <circle data-core cx="75" cy="75" r="46" fill="url(#fwCore)" stroke={tone} strokeOpacity="0.5" strokeWidth="1.5" />
        {on && <path data-sweep d="M75 75 L75 13 A62 62 0 0 1 128 44 Z" fill="url(#fwSweep)" />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ color: tone }}>
        {on ? <ShieldCheck className="h-11 w-11" strokeWidth={1.6} /> : <ShieldOff className="h-11 w-11" strokeWidth={1.6} />}
      </div>
    </div>
  );
};

const DefenderFirewall = () => {
  const status = useDefender('firewall/status', { interval: 10000 });
  const rulesQ = useDefender('firewall/rules');
  const logs = useDefender('firewall/logs', { params: { limit: 15 }, interval: 10000 });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('ALL');
  const [domain, setDomain] = useState('');
  const [newCat, setNewCat] = useState(CATEGORIES[0]);
  const [del, setDel] = useState(null);
  const [page, setPage] = useState(0);
  const PER = 12;
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const exQ = useDefender('firewall/exemptions', { interval: 15000 });

  const reload = () => { rulesQ.refresh(); status.refresh(); };
  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await dpost('firewall/sync');
      setLastSync({ ok: !!r.success, msg: r.message, at: new Date() });
      (r.success ? toast.success : toast.error)(r.message || (r.success ? 'Blocklist synced' : 'Sync failed'));
    } catch (e) { setLastSync({ ok: false, msg: errorText(e), at: new Date() }); toast.error(errorText(e)); }
    setSyncing(false); reload();
  };

  const rules = useMemo(() => rulesQ.data || [], [rulesQ.data]);
  const catList = useMemo(() => Object.entries(status.data?.category_breakdown || {}).sort((a, b) => b[1] - a[1]), [status.data]);
  const total = status.data?.total_rules ?? rules.length;
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rules.filter((r) => (cat === 'ALL' || r.category === cat) && (!t || r.domain.toLowerCase().includes(t)));
  }, [rules, q, cat]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const p = Math.min(page, pages - 1);
  const view = filtered.slice(p * PER, p * PER + PER);
  const on = !!status.data?.firewall_active;
  const blocks = logs.data || [];
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const valid = DOMAIN_RE.test(clean);

  const add = async (e) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await act(dpost('firewall/rules', { domain: clean, category: newCat, enabled: true }), `${clean} will be blocked`);
    if (ok) { setDomain(''); reload(); }
  };
  const pick = (c) => { setCat(c); setPage(0); };

  // Exceptions: people allowed to bypass part of the blocklist (e.g. the social media team and Instagram).
  const exList = useMemo(() => exQ.data || [], [exQ.data]);
  const exCountFor = (r) => exList.filter((e) => e.scope === 'all' || (e.scope === 'category' && e.value.toLowerCase() === (r.category || '').toLowerCase()) || (e.scope === 'domain' && (r.domain || '').replace(/^www\./, '').endsWith(e.value))).length;

  return (
    <DefenderPage
      title="Web firewall"
      subtitle="Sites blocked on enrolled workstations during office hours."
      actions={<button type="button" className="app-btn app-btn--ghost" disabled={syncing} onClick={sync}><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing...' : 'Sync now'}</button>}
    >
      {/* Command centre */}
      <section className="relative overflow-hidden rounded-[18px] p-6 text-white sm:p-7" style={{ background: 'linear-gradient(135deg, #0a1016 0%, #0e1a20 52%, #0b2620 100%)', boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset, 0 30px 60px -30px rgba(8,20,16,0.7), 0 0 80px -30px rgba(52,227,160,0.25)' }} aria-label="Firewall status">
        <span data-parallax="30" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-[0.26]" style={{ background: `radial-gradient(circle, ${on ? '#34e3a0' : '#64748b'}, transparent 65%)` }} aria-hidden="true" />
        <span data-parallax="-20" className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-56 rounded-full opacity-[0.14]" style={{ background: 'radial-gradient(circle, #B9F36A, transparent 65%)' }} aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <Shield on={on} />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: on ? 'rgba(52,227,160,0.14)' : 'rgba(255,255,255,0.1)', color: on ? '#34e3a0' : '#cbd5e1' }}>
              <span className="relative flex h-1.5 w-1.5"><span className={`absolute inline-flex h-full w-full rounded-full ${on ? 'animate-ping' : ''}`} style={{ background: 'currentColor', opacity: 0.6 }} /><span className="relative h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} /></span>
              {!status.data ? 'Checking' : on ? 'Shield active' : 'Shield off'}
            </span>
            <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.01em] sm:text-[30px]">{on ? 'Blocking distractions silently' : 'Firewall is switched off'}</h2>
            <p className="mt-1.5 max-w-xl text-[13.5px] text-slate-300">Listed sites are closed on employee PCs with no popup or sound. The visit is only logged. Enforced during office hours.</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-white/5 py-1.5 pl-4 pr-2 text-[13px] font-medium">
                Block listed sites
                <Toggle checked={on} label="Firewall enabled" disabled={!status.data} onChange={(v) => act(dpost('firewall/toggle', { enabled: v }), v ? 'Firewall enabled' : 'Firewall disabled').then(reload)} />
              </label>
              {lastSync && <span className="text-[12px]" style={{ color: lastSync.ok ? '#34e3a0' : '#f87171' }}>Last sync {lastSync.at.toLocaleTimeString()}: {lastSync.msg || (lastSync.ok ? 'done' : 'failed')}</span>}
            </div>
            {status.data && !status.data.hosts_file_writable && <p className="mt-3 text-[12px] text-amber-300">The server PC's hosts file is read-only, so blocking on this PC needs administrator rights.</p>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard index={0} label="Domains blocked" value={status.data?.active_blocked_domains ?? 0} icon={Layers} loading={!status.data} hint={status.data ? `${total} rules in total` : ''} />
        <KpiCard index={1} label="Categories" value={catList.length} icon={Globe} tone="info" loading={!status.data} hint="Policy groups in the blocklist" />
        <KpiCard index={2} label="Recent blocks" value={blocks.length} icon={ShieldCheck} tone="warn" loading={!logs.data} hint="Latest visits closed on employee PCs" />
      </div>

      {/* Category tiles double as the filter */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-[15px] font-semibold text-[color:var(--app-text)]">Categories</h2>
          {cat !== 'ALL' && <button type="button" className="app-focus rounded text-[13px] font-medium text-[color:var(--accent)] hover:underline" onClick={() => pick('ALL')}>Show all</button>}
        </div>
        {!status.data ? <Skeleton rows={1} h="h-24" /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Filter by category">
            {catList.map(([name, n]) => {
              const m = meta(name); const Icon = m.icon; const act_ = cat === name;
              return (
                <button key={name} type="button" aria-pressed={act_} onClick={() => pick(act_ ? 'ALL' : name)}
                  className="app-focus app-card group p-3.5 text-left transition-transform hover:-translate-y-0.5"
                  style={act_ ? { borderColor: m.color, boxShadow: `0 0 0 3px ${m.color}22` } : undefined}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl transition-transform group-hover:scale-110" style={{ background: `${m.color}1c`, color: m.color }}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                  <p className="mt-3 truncate text-[12.5px] font-medium text-[color:var(--app-text-2)]">{name}</p>
                  <p className="mt-0.5 text-[22px] font-semibold leading-none text-[color:var(--app-text)] tnum">{n}</p>
                  <span className="mt-3 block h-1 overflow-hidden rounded-full bg-[color:var(--app-hover)]"><span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: m.color }} /></span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ExceptionsCard exQ={exQ} rules={rules} catList={catList} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Blocklist" subtitle={`${filtered.length} of ${rules.length} domains${cat !== 'ALL' ? ` in ${cat}` : ''}`} pad={false} className="overflow-hidden">
          {/* Quick add bar */}
          <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-y border-[color:var(--app-border)] bg-[color:var(--app-hover)]/50 p-3">
            <div className="relative min-w-[180px] flex-1">
              <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--app-muted)]" aria-hidden="true" />
              <input id="fw-domain" className="app-input w-full pl-9" placeholder="Block a new domain, e.g. example.com" aria-label="Domain to block" value={domain} onChange={(e) => setDomain(e.target.value)} aria-invalid={!!domain && !valid} />
            </div>
            <select className="app-input !w-auto" aria-label="Category for the new domain" value={newCat} onChange={(e) => setNewCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <button type="submit" className="app-btn app-btn--primary" disabled={!valid}><Plus className="h-4 w-4" />Block</button>
            {domain && !valid && <p className="w-full text-[12px] text-[color:var(--err)]">Enter a valid domain such as example.com.</p>}
          </form>
          <div className="flex items-center gap-3 border-b border-[color:var(--app-border)] p-3">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--app-muted)]" aria-hidden="true" />
              <input className="app-input w-full pl-9" placeholder="Search blocked domains" aria-label="Search domains" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            </div>
          </div>
          {rulesQ.error && !rulesQ.data ? <div className="p-4"><ErrorNote error={rulesQ.error} onRetry={rulesQ.refresh} /></div>
            : !rulesQ.data ? <div className="p-4"><Skeleton rows={6} h="h-10" /></div>
            : view.length === 0 ? <Empty title="No domains match" hint="Try a different search or category." />
            : (
              <ul>
                {view.map((r) => {
                  const m = meta(r.category);
                  return (
                    <li key={r.id} className="group flex items-center gap-3 border-b border-[color:var(--app-border)] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-[color:var(--app-hover)]/60">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold uppercase" style={{ background: `${m.color}1c`, color: m.color }} aria-hidden="true">{r.domain.replace(/^www\./, '')[0]}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13.5px] font-medium ${r.enabled ? 'text-[color:var(--app-text)]' : 'text-[color:var(--app-muted)] line-through'}`}>{r.domain}</p>
                        <p className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--app-muted)]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />{r.category}{exCountFor(r) > 0 && <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--accent)]"><UserCheck className="h-3 w-3" aria-hidden="true" />{exCountFor(r)} allowed</span>}</p>
                      </div>
                      <Toggle checked={!!r.enabled} label={`${r.enabled ? 'Disable' : 'Enable'} ${r.domain}`} onChange={() => act(dpost(`firewall/rules/${r.id}/toggle`)).then(reload)} />
                      <button type="button" aria-label={`Delete ${r.domain}`} className="app-focus rounded-md p-1.5 text-[color:var(--app-muted)] opacity-60 transition hover:bg-[color:var(--app-hover)] hover:text-[color:var(--err)] group-hover:opacity-100" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-[color:var(--app-border)] px-4 py-3 text-[12px] text-[color:var(--app-text-2)]">
              <span className="tnum">{p * PER + 1}-{Math.min(filtered.length, (p + 1) * PER)} of {filtered.length}</span>
              <div className="flex gap-1">
                <button type="button" className="app-btn app-btn--ghost" aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)}><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" className="app-btn app-btn--ghost" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </Card>

        {/* Live feed */}
        <Card title="Live block feed" subtitle="Tabs closed automatically on employee PCs." className="self-start">
          {!logs.data ? <Skeleton rows={4} h="h-12" /> : blocks.length === 0 ? <Empty title="No blocks yet" hint="Blocked visits are listed here." /> : (
            <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-[color:var(--app-border)]">
              {blocks.map((l) => {
                const m = meta(l.category);
                return (
                  <li key={l.id} className="relative flex gap-3">
                    <span className="relative z-[1] mt-0.5"><Avatar name={l.username} size={30} dot={m.color} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-[color:var(--app-text)]">{l.domain}</p>
                      <p className="truncate text-[12px] text-[color:var(--app-text-2)]">{l.username} · {l.category}</p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-[11.5px] text-[color:var(--app-muted)]">{ago(l.timestamp)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <Confirm open={!!del} danger title="Delete this rule?" message={del ? `${del.domain} will no longer be blocked.` : ''} confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={() => act(ddelete(`firewall/rules/${del.id}`), 'Rule deleted').then(reload)} />
    </DefenderPage>
  );
};

export default DefenderFirewall;
