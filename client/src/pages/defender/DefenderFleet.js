import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Lock, AlertTriangle, Power, Search, Trash2 } from 'lucide-react';
import { Avatar, STATUS_COLOR, SummaryTile } from '../../components/defender/visual';
import { Card, Confirm, DefenderPage, Empty, ErrorNote, Overlay, Skeleton, StatusPill } from '../../components/defender/ui';
import { act, ago, dpost, ddelete, fmtSecs, useDefender, useLiveImage } from './api';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All workstations', color: 'var(--app-muted)' },
  { value: 'PRODUCTIVE', label: 'On task', color: 'var(--ok)' },
  { value: 'IDLE', label: 'Idle', color: 'var(--warn)' },
  { value: 'GAMING_ALERT', label: 'Violations', color: 'var(--err)' },
  { value: 'TAMPER_ALERT', label: 'Not reporting', color: '#9aa09a' },
];

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-2 text-[13px]"><dt className="text-[color:var(--app-muted)]">{k}</dt><dd className="min-w-0 break-words text-right font-medium text-[color:var(--app-text)]">{v || '-'}</dd></div>
);

const WorkstationDrawer = ({ ws, onClose, onChanged }) => {
  const [confirm, setConfirm] = useState(null);
  const open = !!ws;
  const { src, failed } = useLiveImage(ws ? `fleet/live-screen/${encodeURIComponent(ws.hostname)}` : null, { interval: 2500, enabled: open });
  if (!ws) return <Overlay open={false} onClose={onClose} side title="Workstation" />;
  const send = (type, payload, msg) => act(dpost(`fleet/${encodeURIComponent(ws.hostname)}/command`, { command_type: type, payload }), msg).then((ok) => ok && onChanged());
  const violating = ws.status === 'GAMING_ALERT';
  return (
    <>
      <Overlay open={open} onClose={onClose} side title={ws.username || ws.hostname}>
        <div className="mb-4 overflow-hidden rounded-xl border border-[color:var(--app-border)] bg-[#0f172a]">
          {src ? <img src={src} alt={`Live screen of ${ws.hostname}`} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center text-[12px] text-slate-400">{failed ? 'No live signal' : 'Connecting to screen...'}</div>}
        </div>
        <div className="mb-3"><StatusPill status={ws.status} /></div>
        <dl className="divide-y divide-[color:var(--app-border)]">
          <Row k="Workstation" v={ws.hostname} />
          <Row k="Employee ID" v={ws.employee_id} />
          <Row k="Department" v={ws.department} />
          <Row k="IP address" v={ws.ip_address} />
          <Row k="Active application" v={ws.current_app} />
          <Row k="Window" v={ws.window_title} />
          <Row k="Idle for" v={fmtSecs(ws.idle_seconds)} />
          <Row k="Last heartbeat" v={ago(ws.last_heartbeat)} />
        </dl>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="app-btn app-btn--ghost" onClick={() => send('show_warning', { game_name: ws.current_app || 'Unauthorized activity' }, 'Warning sent')}><AlertTriangle className="h-4 w-4" />Send warning</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => setConfirm('lock')}><Lock className="h-4 w-4" />Lock screen</button>
          <button type="button" className="app-btn app-btn--ghost" disabled={!ws.pid} onClick={() => setConfirm('kill')}><Power className="h-4 w-4" />End application</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => setConfirm('remove')}><Trash2 className="h-4 w-4" />Remove PC</button>
        </div>
        {violating && <p className="mt-3 text-[12px] text-[color:var(--err)]">This workstation is currently flagged for {ws.current_app}.</p>}
      </Overlay>
      <Confirm open={confirm === 'lock'} title="Lock this workstation?" message={`${ws.username || ws.hostname}'s screen will be locked immediately.`} confirmLabel="Lock" onClose={() => setConfirm(null)} onConfirm={() => send('lock_workstation', {}, 'Lock command queued')} />
      <Confirm open={confirm === 'kill'} danger title="End the running application?" message={`This closes ${ws.current_app || 'the active application'} on ${ws.hostname}. Unsaved work in it may be lost.`} confirmLabel="End application" onClose={() => setConfirm(null)} onConfirm={() => send('kill_process', { pid: ws.pid, app_name: ws.current_app }, 'End-application command queued')} />
      <Confirm open={confirm === 'remove'} danger title="Remove this workstation?" message="It leaves the fleet list. Incident history is kept, and the PC reappears if its agent reports again." confirmLabel="Remove" onClose={() => setConfirm(null)} onConfirm={() => act(ddelete(`fleet/${encodeURIComponent(ws.hostname)}`), 'Workstation removed').then((ok) => { if (ok) { onClose(); onChanged(); } })} />
    </>
  );
};

const DefenderFleet = () => {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState(params.get('host'));
  const [bulk, setBulk] = useState(null);
  const fleet = useDefender('fleet', { interval: 5000 });

  const all = Array.isArray(fleet.data) ? fleet.data : (Array.isArray(fleet.data?.workstations) ? fleet.data.workstations : (Array.isArray(fleet.data?.fleet) ? fleet.data.fleet : []));
  const depts = useMemo(() => ['ALL', ...Array.from(new Set(all.map((w) => w.department).filter(Boolean))).sort()], [all]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((w) => (dept === 'ALL' || w.department === dept)
      && (status === 'ALL' || (status === 'PRODUCTIVE' ? ['PRODUCTIVE', 'ONLINE'].includes(w.status) : status === 'TAMPER_ALERT' ? ['TAMPER_ALERT', 'OFFLINE'].includes(w.status) : w.status === status))
      && (!t || `${w.hostname} ${w.username} ${w.employee_id} ${w.current_app} ${w.window_title}`.toLowerCase().includes(t)));
  }, [all, q, dept, status]);
  useEffect(() => { if (params.get('host')) { setParams({}, { replace: true }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const filtersOn = q || dept !== 'ALL' || status !== 'ALL';
  const live = selected ? all.find((w) => w.hostname === selected) : null;
  const violating = all.filter((w) => w.status === 'GAMING_ALERT').length;

  return (
    <DefenderPage
      title="Workstations"
      subtitle="Every enrolled PC, what it is running, and quick actions."
      actions={violating > 0 && (
        <>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => setBulk('warn_all_slacking')}>Warn {violating} flagged</button>
          <button type="button" className="app-btn app-btn--primary" onClick={() => setBulk('kill_all_gaming')}>End {violating} flagged apps</button>
        </>
      )}
    >
      <div className="flex flex-wrap gap-3" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <SummaryTile key={f.value} label={f.label} color={f.color} active={status === f.value} onClick={() => setStatus(status === f.value ? 'ALL' : f.value)}
            value={f.value === 'ALL' ? all.length : all.filter((w) => (f.value === 'PRODUCTIVE' ? ['PRODUCTIVE', 'ONLINE'].includes(w.status) : f.value === 'TAMPER_ALERT' ? ['TAMPER_ALERT', 'OFFLINE'].includes(w.status) : w.status === f.value)).length} />
        ))}
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--app-border)] p-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--app-muted)]" aria-hidden="true" />
            <input className="app-input w-full pl-9" placeholder="Search name, PC, app or ID" aria-label="Search workstations" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="app-input !w-auto" aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>
            {depts.map((d) => <option key={d} value={d}>{d === 'ALL' ? 'All departments' : d}</option>)}
          </select>
          {filtersOn && <button type="button" className="app-btn app-btn--ghost" onClick={() => { setQ(''); setDept('ALL'); setStatus('ALL'); }}>Clear filters</button>}
          <span className="ml-auto text-[12px] text-[color:var(--app-muted)] tnum" aria-live="polite">{rows.length} of {all.length}{fleet.stale ? ' · last known' : ''}</span>
        </div>

        {fleet.error && !fleet.data ? <div className="p-4"><ErrorNote error={fleet.error} onRetry={fleet.refresh} /></div>
          : !fleet.data ? <div className="p-4"><Skeleton rows={6} h="h-11" /></div>
          : rows.length === 0 ? <Empty title={all.length ? 'No workstations match' : 'No workstations enrolled yet'} hint={all.length ? 'Try clearing a filter.' : 'Install the agent on an employee PC from Engine and agents.'} />
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead><tr className="bg-[color:var(--app-bg)] text-left text-[11.5px] uppercase tracking-[0.06em] text-[color:var(--app-muted)]">
                  <th className="px-4 py-2.5 font-semibold">Employee</th><th className="px-3 py-2.5 font-semibold">Department</th><th className="px-3 py-2.5 font-semibold">Now running</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 text-right font-semibold">Last seen</th>
                </tr></thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.hostname} className="cursor-pointer border-t border-[color:var(--app-border)] transition-colors hover:bg-[color:var(--app-hover)]" onClick={() => setSelected(w.hostname)}>
                      <td className="px-4 py-2.5"><button type="button" className="app-focus flex items-center gap-3 rounded text-left" onClick={(e) => { e.stopPropagation(); setSelected(w.hostname); }}><Avatar name={w.username || w.hostname} dot={STATUS_COLOR[w.status]} /><span><span className="block font-medium text-[color:var(--app-text)]">{w.username || 'Unknown'}</span><span className="block text-[12px] text-[color:var(--app-muted)]">{w.hostname}</span></span></button></td>
                      <td className="px-3 py-2.5 text-[color:var(--app-text-2)]">{w.department || '-'}</td>
                      <td className="max-w-[260px] truncate px-3 py-2.5 text-[color:var(--app-text-2)]" title={w.window_title}>{w.current_app || '-'}</td>
                      <td className="px-3 py-2.5"><StatusPill status={w.status} /></td>
                      <td className="px-4 py-2.5 text-right tnum text-[color:var(--app-text-2)]">{ago(w.last_heartbeat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <WorkstationDrawer ws={live} onClose={() => setSelected(null)} onChanged={fleet.refresh} />
      <Confirm
        open={!!bulk} danger={bulk === 'kill_all_gaming'}
        title={bulk === 'kill_all_gaming' ? 'End all flagged applications?' : 'Warn all flagged employees?'}
        message={bulk === 'kill_all_gaming' ? `This closes the flagged application on ${violating} workstation(s).` : `A warning appears on ${violating} workstation(s).`}
        confirmLabel={bulk === 'kill_all_gaming' ? 'End applications' : 'Send warnings'}
        onClose={() => setBulk(null)}
        onConfirm={() => act(dpost('fleet/bulk-action', { action: bulk })).then((r) => { if (r) toast.success(`${r.affected_workstations ?? 0} workstation(s) affected`); fleet.refresh(); })}
      />
    </DefenderPage>
  );
};

export default DefenderFleet;
