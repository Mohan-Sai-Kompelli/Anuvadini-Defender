import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowUpRight, MonitorCheck, MonitorOff, ShieldAlert } from 'lucide-react';
import KpiCard from '../../components/app/KpiCard';
import { Avatar, Ring, STATUS_COLOR, StackedBar } from '../../components/defender/visual';
import { Card, DefenderPage, Empty, ErrorNote, Pill, SeverityPill, Skeleton, StatusPill } from '../../components/defender/ui';
import { ago, fmtSecs, useDefender } from './api';

// The organizations on the platform. They always show, even before any PC is enrolled under them.
const ORGS = ['Anuvadini Foundation', 'AICTE', 'NETF', 'IUAC'];
const orgName = (raw) => {
  const t = String(raw || '').trim();
  if (!t) return 'Unassigned';
  const hit = ORGS.find((o) => o.toLowerCase() === t.toLowerCase() || (o === 'Anuvadini Foundation' && /^anuvadini/i.test(t)));
  return hit || t;
};
const ORG_COLOR = { 'Anuvadini Foundation': '#385d27', AICTE: '#2f7de1', NETF: '#7a5bd6', IUAC: '#d4577f' };

const Hero = ({ shift, stats, fleet, stale }) => {
  const on = shift?.is_active && !shift?.is_lunch;
  const reporting = (fleet || []).filter((w) => !['TAMPER_ALERT', 'OFFLINE'].includes(w.status));
  return (
    <section className="relative overflow-hidden rounded-[18px] p-6 text-white sm:p-7" style={{ background: 'linear-gradient(135deg, #0a1016 0%, #0e1a20 52%, #0b2620 100%)', boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset, 0 30px 60px -30px rgba(8,20,16,0.7), 0 0 80px -30px rgba(52,227,160,0.25)' }} aria-label="Shift status">
      <span data-parallax="34" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-[0.28]" style={{ background: 'radial-gradient(circle, #34e3a0, transparent 65%)' }} aria-hidden="true" />
      <span data-parallax="-22" className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full opacity-[0.16]" style={{ background: 'radial-gradient(circle, #B9F36A, transparent 65%)' }} aria-hidden="true" />
      <span className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '36px 36px', maskImage: 'radial-gradient(ellipse at 80% 20%, #000, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 80% 20%, #000, transparent 70%)' }} aria-hidden="true" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: on ? 'rgba(185,243,106,0.16)' : 'rgba(255,255,255,0.1)', color: on ? '#B9F36A' : '#cbd5e1' }}>
              <span className="relative flex h-1.5 w-1.5"><span className={`absolute inline-flex h-full w-full rounded-full ${on ? 'animate-ping' : ''}`} style={{ background: 'currentColor', opacity: 0.6 }} /><span className="relative h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} /></span>{on ? 'Enforcing policy' : 'Standby'}
            </span>
            {stale && <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[11.5px] font-semibold text-amber-200">Data stale</span>}
          </div>
          <h2 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.01em] sm:text-[28px]">{shift ? shift.status_label : 'Reading schedule'}</h2>
          <p className="mt-1.5 text-[13.5px] text-slate-300">{shift?.status_reason || 'Loading the office schedule...'}</p>
          {shift?.schedule_enabled && (
            <div className="mt-4 max-w-md" aria-label={`Shift ${Math.round(shift.progress_pct || 0)} percent complete`}>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
                <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, Math.max(0, shift.progress_pct || 0))}%`, background: 'linear-gradient(90deg, #B9F36A, #7bd34a)', boxShadow: '0 0 12px rgba(185,243,106,.55)' }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11.5px] text-slate-400 tnum"><span>{shift.shift_start}</span><span>{Math.round(shift.progress_pct || 0)}% of shift</span><span>{shift.shift_end}</span></div>
            </div>
          )}
          {reporting.length > 0 && (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex -space-x-2">
                {reporting.slice(0, 6).map((w) => <span key={w.hostname} className="rounded-full ring-2 ring-[#0b1319]"><Avatar name={w.username || w.hostname} size={30} /></span>)}
              </div>
              <span className="text-[12.5px] text-slate-300"><b className="text-white tnum">{reporting.length}</b> workstation{reporting.length === 1 ? '' : 's'} reporting now</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          <span style={{ filter: 'drop-shadow(0 0 14px rgba(185,243,106,.35))' }}><Ring value={stats?.health_score ?? 0} label="Compliance score" sub="compliance" /></span>
          <dl className="space-y-3 text-[13px]">
            {[['Reporting', stats?.reporting_count ?? '-', '#B9F36A'], ['Violating now', stats?.slacking_count ?? '-', '#f87171'], ['Idle', stats?.idle_count ?? '-', '#fbbf24']].map(([k, v, c]) => (
              <div key={k} className="flex items-center gap-3"><span className="h-2 w-2 rounded-full" style={{ background: c }} /><dt className="w-[96px] text-slate-300">{k}</dt><dd className="font-semibold tnum">{v}</dd></div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};

const STATE = { WORK: ['On task', 'ok'], GAMING: ['Policy violation', 'err'], IDLE: ['Idle', 'warn'], OFF_DUTY: ['Off duty', 'neutral'] };

/** Live telemetry of the PC that runs the engine (the old "Live Diagnostic Telemetry Stream"). */
const ThisPcLive = () => {
  const st = useDefender('status', { interval: 3000 });
  const d = st.data;
  const [label, tone] = STATE[d?.current_state] || ['Unknown', 'neutral'];
  const win = d?.active_window || {};
  const v = d?.active_violation;
  return (
    <Card title="This PC, live" subtitle={d ? `${d.username} on ${d.hostname}. Refreshes every 3 seconds.` : 'Reading the engine PC...'} actions={d && <Pill tone={tone}>{label}</Pill>}>
      {!d ? <Skeleton rows={1} h="h-14" /> : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] lg:grid-cols-4">
          <div className="min-w-0"><dt className="text-[color:var(--app-muted)]">Active application</dt><dd className="truncate font-medium text-[color:var(--app-text)]" title={win.process}>{win.process || '-'}</dd></div>
          <div className="min-w-0"><dt className="text-[color:var(--app-muted)]">Window</dt><dd className="truncate font-medium text-[color:var(--app-text)]" title={win.title}>{win.title || '-'}</dd></div>
          <div><dt className="text-[color:var(--app-muted)]">Idle for</dt><dd className="font-medium text-[color:var(--app-text)] tnum">{fmtSecs(d.idle_seconds)}</dd></div>
          <div><dt className="text-[color:var(--app-muted)]">Game controller</dt><dd className="font-medium text-[color:var(--app-text)]">{d.controller?.connected ? 'Connected' : 'Not detected'}</dd></div>
          {v && <div className="col-span-2 lg:col-span-4 rounded-xl px-3 py-2 text-[12.5px]" style={{ background: '#fbe9e7', color: '#7d2a21' }}>Flagged: <b>{v.game_name || v.name}</b> {v.category ? `(${v.category})` : ''}</div>}
        </dl>
      )}
    </Card>
  );
};

const HourTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[color:var(--app-border)] bg-white px-3 py-2 text-[12px] shadow-lg">
      <p className="mb-1 font-semibold text-[color:var(--app-text)]">{label}</p>
      {payload.map((p) => <p key={p.dataKey} className="text-[color:var(--app-text-2)]">{p.name}: <b className="text-[color:var(--app-text)] tnum">{Math.round(p.value)} min</b></p>)}
    </div>
  );
};

const DefenderOverview = () => {
  const stats = useDefender('fleet/stats', { interval: 5000 });
  const analytics = useDefender('analytics', { interval: 15000 });
  const status = useDefender('status', { interval: 5000 });
  const fleet = useDefender('fleet', { interval: 5000 });
  const incidents = useDefender('violations', { params: { limit: 6 }, interval: 8000 });

  const s = stats.data;
  const all = useMemo(() => {
    if (Array.isArray(fleet.data)) return fleet.data;
    if (Array.isArray(fleet.data?.workstations)) return fleet.data.workstations;
    if (Array.isArray(fleet.data?.fleet)) return fleet.data.fleet;
    return [];
  }, [fleet.data]);
  const attentionAll = all.filter((w) => ['GAMING_ALERT', 'TAMPER_ALERT'].includes(w.status));
  const attention = attentionAll.slice(0, 5);
  const hours = analytics.data?.hourly_breakdown || [];
  const incidentsList = useMemo(() => {
    if (Array.isArray(incidents.data)) return incidents.data;
    if (Array.isArray(incidents.data?.violations)) return incidents.data.violations;
    if (Array.isArray(incidents.data?.logs)) return incidents.data.logs;
    return [];
  }, [incidents.data]);

  const depts = useMemo(() => {
    const m = {};
    ORGS.forEach((o) => { m[o] = { name: o, ok: 0, idle: 0, viol: 0, off: 0 }; });
    all.forEach((w) => {
      const d = orgName(w.department);
      const e = m[d] || (m[d] = { name: d, ok: 0, idle: 0, viol: 0, off: 0 });
      if (['ONLINE', 'PRODUCTIVE'].includes(w.status)) e.ok += 1;
      else if (w.status === 'IDLE') e.idle += 1;
      else if (w.status === 'GAMING_ALERT') e.viol += 1;
      else e.off += 1;
    });
    const size = (e) => e.ok + e.idle + e.viol + e.off;
    return Object.values(m).sort((x, y) => (ORGS.indexOf(x.name) === -1 ? 99 : ORGS.indexOf(x.name)) - (ORGS.indexOf(y.name) === -1 ? 99 : ORGS.indexOf(y.name)) || size(y) - size(x));
  }, [all]);

  return (
    <DefenderPage title="Defender Overview" subtitle="Monitor workstation status, policy enforcement, and recent incidents.">
      <Hero shift={status.data?.shift} stats={s} fleet={all} stale={status.stale} />

      {stats.error && !s && <ErrorNote error={stats.error} onRetry={stats.refresh} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard index={0} info="PCs whose agent reported recently. Excludes silent or stopped agents." label="Reporting workstations" value={s?.reporting_count ?? 0} icon={MonitorCheck} loading={!s} hint={s ? `${s.total_workstations} enrolled` : ''} />
        <KpiCard index={1} info="Share of reporting PCs that are on task. Idle counts as half." label="Compliance score" value={s?.health_score ?? 0} suffix="%" icon={Activity} tone="ok" loading={!s} hint="Reporting PCs that are on task" />
        <KpiCard index={2} info="Incidents recorded today. A record is a detection, not a judgement of intent." label="Violations today" value={analytics.data?.total_violations ?? 0} icon={ShieldAlert} tone="err" loading={!analytics.data} hint={s ? `${s.slacking_count} active right now` : ''} />
        <KpiCard index={3} info="Agents that stopped reporting during the shift. This is not a confirmed violation." label="Not reporting" value={s?.offline_count ?? 0} icon={MonitorOff} tone="warn" loading={!s} hint="Agent stopped or PC offline" />
      </div>

      <ThisPcLive />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Work and policy time by hour" subtitle="Minutes recorded on this server's PC today." actions={<span className="flex items-center gap-3 text-[11.5px] text-[color:var(--app-text-2)]"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'linear-gradient(135deg,#B9F36A,#2f7a4f)' }} />Work</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'linear-gradient(135deg,#ffd166,#c2410c)' }} />Policy-related</span></span>}>
          <div className="h-[240px]" role="img" aria-label="Work and policy-related minutes per hour">
            {!analytics.data ? <Skeleton rows={1} h="h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hours} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barGap={3}>
                  <defs>
                    <linearGradient id="dfWork" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B9F36A" /><stop offset="55%" stopColor="#6fa83a" /><stop offset="100%" stopColor="#2f7a4f" /></linearGradient>
                    <linearGradient id="dfPolicy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffd166" /><stop offset="55%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#c2410c" /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--app-border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--app-muted)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--app-muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<HourTip />} cursor={{ fill: 'var(--app-hover)' }} />
                  <Bar dataKey="work_mins" name="Work" fill="url(#dfWork)" radius={[6, 6, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  <Bar dataKey="gaming_mins" name="Policy-related" fill="url(#dfPolicy)" radius={[6, 6, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Needs attention" subtitle={attentionAll.length ? `${attentionAll.length} workstation${attentionAll.length === 1 ? '' : 's'} flagged. Showing the first ${attention.length}.` : 'Violations and silent agents.'} actions={<Link to="/defender/fleet" className="app-focus inline-flex items-center gap-0.5 rounded text-[13px] font-medium text-[color:var(--accent)] hover:underline">All workstations<ArrowUpRight className="h-3.5 w-3.5" /></Link>}>
          {!fleet.data ? <Skeleton rows={3} /> : attention.length === 0 ? (
            <Empty title="Everything looks clear" hint="No workstation currently has a violation or has stopped reporting." />
          ) : (
            <ul className="space-y-1">
              {attention.map((w) => (
                <li key={w.hostname}>
                  <Link to={`/defender/fleet?host=${encodeURIComponent(w.hostname)}`} className="app-focus flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[color:var(--app-hover)]">
                    <Avatar name={w.username || w.hostname} dot={STATUS_COLOR[w.status]} />
                    <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-medium text-[color:var(--app-text)]">{w.username || w.hostname}</p><p className="truncate text-[12px] text-[color:var(--app-text-2)]">{w.current_app || w.hostname} · {ago(w.last_heartbeat)}</p></div>
                    <StatusPill status={w.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title="By organization" subtitle="Current status of every enrolled PC, grouped by organization.">
          {!fleet.data ? <Skeleton rows={3} h="h-10" /> : (
            <ul className="space-y-4">
              {depts.map((d) => {
                const n = d.ok + d.idle + d.viol + d.off;
                const c = ORG_COLOR[d.name] || '#6b7280';
                return (
                <li key={d.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                    <span className="inline-flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10.5px] font-bold text-white" style={{ background: c }} aria-hidden="true">{d.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                      <span className="truncate font-medium text-[color:var(--app-text)]">{d.name}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-[color:var(--app-muted)] tnum">{n === 0 ? 'No PCs enrolled' : `${n} PC${n === 1 ? '' : 's'}`}</span>
                  </div>
                  <StackedBar parts={[{ label: 'On task', value: d.ok, color: 'var(--accent-chart)' }, { label: 'Idle', value: d.idle, color: '#D69A2D' }, { label: 'Violation', value: d.viol, color: 'var(--err)' }, { label: 'Not reporting', value: d.off, color: '#cfd3cc' }]} />
                </li>
                );
              })}
              <li className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11.5px] text-[color:var(--app-text-2)]">
                {[['On task', 'var(--accent-chart)'], ['Idle', '#D69A2D'], ['Violation', 'var(--err)'], ['Not reporting', '#cfd3cc']].map(([l, c]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>)}
              </li>
            </ul>
          )}
        </Card>

        <Card title="Recent incidents" actions={<Link to="/defender/incidents" className="app-focus inline-flex items-center gap-0.5 rounded text-[13px] font-medium text-[color:var(--accent)] hover:underline">View all<ArrowUpRight className="h-3.5 w-3.5" /></Link>}>
          {!incidents.data ? <Skeleton rows={3} /> : incidentsList.length === 0 ? (
            <Empty title="No incidents recorded" hint="Detected games, blocked sites and tamper attempts will appear here." />
          ) : (
            <ul className="space-y-1">
              {incidentsList.map((v) => (
                <li key={v.id}>
                  <Link to={`/defender/incidents?id=${v.id}`} className="app-focus flex items-start gap-3 rounded-xl px-1.5 py-2 transition-colors hover:bg-[color:var(--app-hover)]">
                    <span className="mt-0.5"><Avatar name={v.username} size={30} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-[color:var(--app-text)]">{v.game_name}</p>
                      <p className="truncate text-[12px] text-[color:var(--app-text-2)]">{v.username} · {v.category} · {fmtSecs(v.duration_seconds)}</p>
                    </div>
                    <div className="shrink-0 text-right"><SeverityPill severity={v.severity} /><p className="mt-1 text-[11.5px] text-[color:var(--app-muted)]">{ago(v.timestamp)}</p></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DefenderPage>
  );
};

export default DefenderOverview;
