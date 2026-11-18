import React, { useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import toast from 'react-hot-toast';
import { Check, Cpu, EyeOff, Gamepad2, MonitorOff, RefreshCw, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, DefenderPage, Empty, ErrorNote, Skeleton } from '../../components/defender/ui';
import { Avatar } from '../../components/defender/visual';
import { ago, dget, errorText, useDefender } from './api';

gsap.registerPlugin(useGSAP);

/** Radar that idles slowly and spins up while a scan runs. Colour follows the verdict. */
const Radar = ({ secure, scanning }) => {
  const root = useRef(null);
  const tween = useRef(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      tween.current = gsap.to('[data-sweep]', { rotation: 360, transformOrigin: '50% 50%', duration: 6, ease: 'none', repeat: -1 });
      gsap.fromTo('[data-pulse]', { scale: 0.7, opacity: 0.5 }, { scale: 1.5, opacity: 0, duration: 3, ease: 'power2.out', repeat: -1, stagger: 1, transformOrigin: '50% 50%' });
    });
    return () => mm.revert();
  }, { scope: root });
  useGSAP(() => { if (tween.current) gsap.to(tween.current, { timeScale: scanning ? 5 : 1, duration: 0.6, ease: 'power2.out', overwrite: true }); }, { dependencies: [scanning] });
  const tone = secure ? '#34e3a0' : '#f87171';
  return (
    <div ref={root} className="relative h-[150px] w-[150px] shrink-0" aria-hidden="true">
      <svg viewBox="0 0 150 150" className="h-full w-full overflow-visible">
        <defs>
          <radialGradient id="secCore" cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor={tone} stopOpacity="0.35" /><stop offset="100%" stopColor={tone} stopOpacity="0.04" /></radialGradient>
          <linearGradient id="secSweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={tone} stopOpacity="0" /><stop offset="100%" stopColor={tone} stopOpacity="0.55" /></linearGradient>
        </defs>
        {[0, 1].map((i) => <circle key={i} data-pulse cx="75" cy="75" r="52" fill="none" stroke={tone} strokeWidth="1.5" />)}
        <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(255,255,255,0.08)" />
        <circle cx="75" cy="75" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 5" />
        <circle cx="75" cy="75" r="46" fill="url(#secCore)" stroke={tone} strokeOpacity="0.5" strokeWidth="1.5" />
        <path data-sweep d="M75 75 L75 13 A62 62 0 0 1 128 44 Z" fill="url(#secSweep)" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ color: tone }}>
        {secure ? <ShieldCheck className="h-11 w-11" strokeWidth={1.6} /> : <ShieldAlert className="h-11 w-11" strokeWidth={1.6} />}
      </div>
    </div>
  );
};

/** One security check: status at a glance, findings listed underneath. */
const CheckCard = ({ icon: Icon, title, what, scope, items, render }) => {
  const clear = items.length === 0;
  const c = clear ? '#24804a' : '#c43d42';
  return (
    <section className="app-card p-5" aria-label={title}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${c}16`, color: c }}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold text-[color:var(--app-text)]">{title}</h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-[color:var(--app-text-2)]">{what}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: `${c}14`, color: c }}>
          {clear ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}{clear ? 'Clear' : `${items.length} found`}
        </span>
      </div>
      {!clear && <ul className="mt-4 divide-y divide-[color:var(--app-border)] rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-hover)]/40 px-3">{items.map((it, i) => <li key={i} className="py-2.5 text-[13px]">{render(it)}</li>)}</ul>}
      <p className="mt-3 text-[11.5px] text-[color:var(--app-muted)]">Covers: {scope}</p>
    </section>
  );
};

const LAYERS = [
  ['Process protection', 'Stops the agent being closed from Task Manager or taskkill.'],
  ['Watchdog', 'Restarts the agent automatically if it is ever killed.'],
  ['Heartbeat monitoring', 'Flags any workstation that goes silent during the shift.'],
  ['Evidence capture', 'Saves a screenshot with every incident.'],
];

const DefenderSecurity = () => {
  const a = useDefender('antitamper/status', { interval: 15000 });
  const inc = useDefender('violations', { params: { limit: 60 }, interval: 30000 });
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(null);
  const d = manual?.data || a.data;
  const scan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const [data] = await Promise.all([dget('antitamper/audit'), new Promise((r) => setTimeout(r, 1500))]);
      setManual({ data, at: new Date() });
    } catch (e) { toast.error(errorText(e, 'The scan could not be completed.')); }
    setScanning(false);
  };

  const attempts = useMemo(() => (inc.data || []).filter((v) => /bypass|tamper|terminat/i.test(`${v.category} ${v.game_name}`)), [inc.data]);
  const checks = d ? [
    d.tampered_workstations || [], d.evasion_processes || [], d.gaming_sockets || [], d.cloaked_binaries || [],
  ] : [];
  const found = checks.reduce((n, c) => n + c.length, 0);
  const clearCount = checks.filter((c) => c.length === 0).length;
  const secure = d?.status === 'SECURE';

  return (
    <DefenderPage
      title="Tamper protection"
      subtitle="Checks for attempts to bypass monitoring: hidden games, evasion tools and silent agents."
      actions={<button type="button" className="app-btn app-btn--ghost" disabled={scanning} onClick={scan}><RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />{scanning ? 'Scanning...' : 'Scan again'}</button>}
    >
      {a.error && !d ? <ErrorNote error={a.error} onRetry={a.refresh} /> : !d ? <Skeleton rows={3} h="h-24" /> : (
        <>
          <section className="relative overflow-hidden rounded-[18px] p-6 text-white sm:p-7" style={{ background: 'linear-gradient(135deg, #0a1016 0%, #0e1a20 52%, #0b2620 100%)', boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset, 0 30px 60px -30px rgba(8,20,16,0.7), 0 0 80px -30px rgba(52,227,160,0.25)' }} aria-label="Security verdict">
            <span data-parallax="30" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-[0.26]" style={{ background: `radial-gradient(circle, ${secure ? '#34e3a0' : '#f87171'}, transparent 65%)` }} aria-hidden="true" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
              <Radar secure={secure} scanning={scanning} />
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: secure ? 'rgba(52,227,160,0.14)' : 'rgba(248,113,113,0.16)', color: secure ? '#34e3a0' : '#fca5a5' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />{scanning ? 'Scanning...' : secure ? 'All checks clear' : 'Needs review'}
                </span>
                <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.01em] sm:text-[30px]">{secure ? 'No tampering detected' : `${found} possible tamper signal${found === 1 ? '' : 's'}`}</h2>
                <p className="mt-1.5 max-w-xl text-[13.5px] text-slate-300">{secure ? 'Nothing suspicious right now. Defender is checking for hidden games, evasion tools, disguised programs and silent agents.' : 'These are detected conditions, not proof of intent. Review them before drawing conclusions.'}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-slate-300">
                  <span><b className="text-white tnum">{clearCount}/{checks.length}</b> checks clear</span>
                  <span>{manual ? `Scanned ${manual.at.toLocaleTimeString()}` : 'Auto-scans every 15 seconds'}</span>
                  <span style={{ color: d.tamper_protection_active ? '#34e3a0' : '#fca5a5' }}>{d.tamper_protection_active ? 'Process protection on' : 'Process protection off'}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CheckCard icon={MonitorOff} title="Silent agents" what="Workstations that stopped reporting during the shift." scope="every enrolled workstation" items={d.tampered_workstations || []}
              render={(w) => <span><b className="text-[color:var(--app-text)]">{w.username}</b><span className="ml-2 text-[color:var(--app-text-2)]">{w.hostname} · silent for {Math.round((w.overdue_seconds || 0) / 60)} min</span></span>} />
            <CheckCard icon={EyeOff} title="Evasion tools" what="Programs commonly used to hide activity, like VPNs and process hiders." scope="the server PC only" items={d.evasion_processes || []}
              render={(p) => <span><b className="text-[color:var(--app-text)]">{p.process_name}</b><span className="ml-2 text-[color:var(--app-text-2)]">{p.category} · {p.evasion_title}</span></span>} />
            <CheckCard icon={Gamepad2} title="Gaming connections" what="Open network connections to known game servers." scope="the server PC only" items={d.gaming_sockets || []}
              render={(s) => <span><b className="text-[color:var(--app-text)]">{s.process_name}</b><span className="ml-2 text-[color:var(--app-text-2)]">{s.game_service} · {s.remote_ip}:{s.remote_port}</span></span>} />
            <CheckCard icon={Cpu} title="Disguised programs" what="Executables renamed to look like something harmless." scope="the server PC only" items={d.cloaked_binaries || []}
              render={(b) => <span><b className="text-[color:var(--app-text)]">{b.process_name}</b><span className="ml-2 text-[color:var(--app-text-2)]">{b.product_name} · {b.reason}</span></span>} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card title="Recent tamper attempts" subtitle="Bypass attempts Defender has already recorded as incidents.">
              {!inc.data ? <Skeleton rows={3} h="h-12" /> : attempts.length === 0 ? <Empty icon={ShieldCheck} title="No tamper attempts recorded" hint="Attempts to close or bypass the agent will be listed here." /> : (
                <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-[color:var(--app-border)]">
                  {attempts.slice(0, 6).map((v) => (
                    <li key={v.id} className="relative flex gap-3">
                      <span className="relative z-[1] mt-0.5"><Avatar name={v.username || v.hostname} size={30} dot="var(--err)" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-[color:var(--app-text)]">{String(v.game_name || '').replace(/^\W+/, '')}</p>
                        <p className="truncate text-[12px] text-[color:var(--app-text-2)]">{v.username} on {v.hostname} · {v.window_title}</p>
                      </div>
                      <span className="shrink-0 pt-0.5 text-[11.5px] text-[color:var(--app-muted)]">{ago(v.timestamp)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="Protection layers" subtitle="What keeps monitoring running.">
              <ul className="space-y-3">
                {LAYERS.map(([t, h], i) => (
                  <li key={t} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: '#eaf6e3', color: '#2f5b1e' }}><Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /></span>
                    <span className="text-[13px]"><b className="text-[color:var(--app-text)]">{t}</b><span className="block text-[12px] text-[color:var(--app-text-2)]">{h}{i === 0 ? ' Windows only.' : ''}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </DefenderPage>
  );
};

export default DefenderSecurity;
