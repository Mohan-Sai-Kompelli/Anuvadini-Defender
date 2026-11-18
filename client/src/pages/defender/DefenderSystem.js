import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Download, FlaskConical, Save, ScanEye } from 'lucide-react';
import { Card, Confirm, DefenderPage, Pill, Skeleton, Stat, Toggle } from '../../components/defender/ui';
import { act, dpost, downloadFile, useDefender } from './api';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const Row = ({ title, hint, children }) => (
  <div className="flex items-center justify-between gap-4 border-b border-[color:var(--app-border)] py-3 last:border-b-0">
    <div className="min-w-0"><p className="text-[13.5px] font-medium text-[color:var(--app-text)]">{title}</p>{hint && <p className="text-[12px] text-[color:var(--app-text-2)]">{hint}</p>}</div>
    {children}
  </div>
);

const Schedule = ({ schedule, onSaved }) => {
  const sh = schedule.shift;
  const [start, setStart] = useState(sh.shift_start);
  const [end, setEnd] = useState(sh.shift_end);
  const [days, setDays] = useState(schedule.working_days || []);
  const [enabled, setEnabled] = useState(sh.schedule_enabled);
  const [always, setAlways] = useState(sh.override_schedule);
  const [saving, setSaving] = useState(false);
  const [ask, setAsk] = useState(false);
  useEffect(() => { setStart(sh.shift_start); setEnd(sh.shift_end); setDays(schedule.working_days || []); setEnabled(sh.schedule_enabled); setAlways(sh.override_schedule); }, [sh.shift_start, sh.shift_end, sh.schedule_enabled, sh.override_schedule, schedule.working_days]);
  const valid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start < end;

  const save = async () => {
    setAsk(false);
    setSaving(true);
    const ok = await act(dpost('schedule', { shift_start: start, shift_end: end, schedule_enabled: enabled, override_schedule: always, working_days: days }), 'Schedule saved');
    setSaving(false);
    if (ok) onSaved();
  };
  return (
    <Card title="Office hours" subtitle="Policies are enforced only inside this window.">
      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <div><label htmlFor="sh-start" className="mb-1 block text-[12px] text-[color:var(--app-text-2)]">Shift starts</label><input id="sh-start" type="time" className="app-input w-full" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label htmlFor="sh-end" className="mb-1 block text-[12px] text-[color:var(--app-text-2)]">Shift ends</label><input id="sh-end" type="time" className="app-input w-full" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      {!valid && <p className="mt-2 text-[12px] text-[color:var(--err)]">The end time must be later than the start time.</p>}
      <fieldset className="mt-4"><legend className="mb-1.5 text-[12px] text-[color:var(--app-text-2)]">Working days</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => { const on = days.includes(i); return (
            <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())} className="app-focus rounded-lg border px-3 py-1.5 text-[12.5px] font-medium" style={{ borderColor: on ? 'var(--accent-border)' : 'var(--app-border)', background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--app-text-2)' }}>{d}</button>
          ); })}
        </div>
      </fieldset>
      <div className="mt-3">
        <Row title="Follow the schedule" hint="Off means monitoring is always on."><Toggle checked={enabled} onChange={setEnabled} label="Follow the schedule" /></Row>
        <Row title="Always enforce" hint="Ignore office hours until switched off."><Toggle checked={always} onChange={setAlways} label="Always enforce" /></Row>
      </div>
      <button type="button" className="app-btn app-btn--primary mt-4" disabled={!valid || saving || days.length === 0} onClick={() => (always && !sh.override_schedule ? setAsk(true) : save())}><Save className="h-4 w-4" />Save schedule</button>
      <Confirm open={ask} title="Enforce at all times?" message="Always enforce ignores office hours and the lunch break. Policies will apply on every monitored PC until you switch it off." confirmLabel="Enforce at all times" onClose={() => setAsk(false)} onConfirm={save} />
    </Card>
  );
};

const AiVision = () => {
  const st = useDefender('nvidia/status');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const d = st.data;
  const save = async (body, msg) => { setBusy(true); const ok = await act(dpost('nvidia/settings', body), msg); setBusy(false); if (ok) { setKey(''); st.refresh(); } };
  const test = async () => {
    setBusy(true);
    try { const r = await dpost('nvidia/test-key', { api_key: key }); (r.success ? toast.success : toast.error)(r.message || 'Done'); } catch (e) { toast.error('Connection test failed.'); }
    setBusy(false);
  };
  return (
    <Card title="AI screen review" subtitle="Optional: an NVIDIA vision model double-checks suspicious screens. Without a key, local signature rules are used.">
      {!d ? <Skeleton rows={2} h="h-10" /> : (
        <>
          <Row title="Use AI review" hint={d.has_api_key ? `Key saved (${d.masked_key})` : 'No API key saved'}><Toggle checked={!!d.enabled} label="Use AI review" disabled={busy} onChange={(v) => save({ enabled: v }, v ? 'AI review on' : 'AI review off')} /></Row>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="ai-model" className="mb-1 block text-[12px] text-[color:var(--app-text-2)]">Model</label><select id="ai-model" className="app-input w-full" value={d.model} disabled={busy} onChange={(e) => save({ model: e.target.value }, 'Model updated')}>{(d.supported_models || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><label htmlFor="ai-key" className="mb-1 block text-[12px] text-[color:var(--app-text-2)]">API key</label><input id="ai-key" type="password" autoComplete="off" className="app-input w-full" placeholder={d.has_api_key ? 'Enter a new key to replace' : 'nvapi-...'} value={key} onChange={(e) => setKey(e.target.value)} /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="app-btn app-btn--ghost" disabled={busy || !key.trim()} onClick={test}>Test key</button>
            <button type="button" className="app-btn app-btn--primary" disabled={busy || !key.trim()} onClick={() => save({ api_key: key }, 'API key saved')}>Save key</button>
          </div>
        </>
      )}
    </Card>
  );
};

const AiAudit = () => {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const run = async () => {
    setBusy(true); setRes(null);
    try { setRes(await dpost('nvidia/audit-screen')); } catch (e) { toast.error('The screen review could not be completed.'); }
    setBusy(false);
  };
  return (
    <Card title="Review this server's screen now" subtitle="Captures the screen of the PC running the engine and classifies it. Employee PCs are not included.">
      <button type="button" className="app-btn app-btn--ghost" disabled={busy} onClick={() => setAsk(true)}><ScanEye className="h-4 w-4" />{busy ? 'Reviewing...' : 'Review screen now'}</button>
      {res && (
        <dl className="mt-4 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
          <div><dt className="text-[color:var(--app-muted)]">Result</dt><dd className="font-medium text-[color:var(--app-text)]">{res.is_slacking ? 'Possible non-work activity' : 'Looks like work'}</dd></div>
          <div><dt className="text-[color:var(--app-muted)]">Confidence</dt><dd className="font-medium text-[color:var(--app-text)] tnum">{Math.round((res.confidence || 0) * 100)}%</dd></div>
          <div><dt className="text-[color:var(--app-muted)]">Detected</dt><dd className="font-medium text-[color:var(--app-text)]">{res.app_or_game_name || '-'}</dd></div>
          <div><dt className="text-[color:var(--app-muted)]">Method</dt><dd className="font-medium text-[color:var(--app-text)]">{res.provider || '-'} · {res.model || '-'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-[color:var(--app-muted)]">Summary</dt><dd className="text-[color:var(--app-text)]">{res.visual_summary || res.reasoning || '-'}</dd></div>
        </dl>
      )}
      <Confirm open={ask} title="Capture and review this screen?" message="A screenshot of the server PC is taken now. If an AI key is saved, the image is sent to NVIDIA NIM for analysis; otherwise only local rules are used." confirmLabel="Review screen" onClose={() => setAsk(false)} onConfirm={run} />
    </Card>
  );
};

const PLATFORMS = [['Windows 10 / 11', 'Full: window and process watching, DACL protection, hosts firewall, network and PE scans', 'ok'], ['macOS (Intel and Apple Silicon)', 'Partial: window watching, idle, screenshots, firewall. No kernel-level protection', 'warn'], ['Linux', 'Partial: process and idle detection. Browser-tab closing is limited', 'warn']];

const DefenderSystem = () => {
  const [askTest, setAskTest] = useState(false);
  const [askBell, setAskBell] = useState(false);
  const status = useDefender('status', { interval: 8000 });
  const schedule = useDefender('schedule');
  const health = useDefender('system/health', { interval: 10000 });
  const [busy, setBusy] = useState(false);
  const s = status.data;
  const h = health.data;

  const flip = async (path, msg) => { setBusy(true); const ok = await act(dpost(path), msg); setBusy(false); if (ok) { status.refresh(); schedule.refresh(); } };
  const simulate = async () => {
    setBusy(true);
    await act(dpost('simulate', { game_name: 'Sample game', window_title: 'Sample Game - Play Online', category: 'Simulated Gaming' }), 'Test incident created. The test PC removes itself in about 45 seconds.');
    setBusy(false);
  };

  return (
    <DefenderPage title="Engine and agents" subtitle="Engine controls, office hours and employee-PC installers.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Engine" actions={s && <Pill tone={s.engine_running ? 'ok' : 'neutral'}>{s.engine_running ? 'Running' : 'Stopped'}</Pill>}>
          {!s ? <Skeleton rows={3} h="h-10" /> : (
            <>
              <Row title="Monitoring" hint="Watches this server PC and accepts reports from agents."><Toggle checked={s.engine_running} disabled={busy} label="Monitoring" onChange={() => flip('toggle-monitor', s.engine_running ? 'Monitoring stopped' : 'Monitoring started')} /></Row>
              <Row title="Close apps automatically" hint="Ends a detected game without waiting for an admin."><Toggle checked={s.auto_kill_enabled} disabled={busy} label="Close apps automatically" onChange={() => flip('toggle-autokill')} /></Row>
              <Row title="Show warning popup" hint="Tells the employee why the app was flagged."><Toggle checked={s.show_popup} disabled={busy} label="Show warning popup" onChange={() => flip('toggle-popup')} /></Row>
              <Row title="Alert sound"><Toggle checked={s.play_sound} disabled={busy} label="Alert sound" onChange={() => flip('toggle-sound')} /></Row>
              <Row title="Start with Windows" hint="Launch the engine when this PC boots."><Toggle checked={s.autostart_enabled} disabled={busy} label="Start with Windows" onChange={() => flip('autostart/toggle')} /></Row>
            </>
          )}
        </Card>
        <Card title="Server health">
          {!h ? <Skeleton rows={2} h="h-12" /> : (
            <>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                <Stat label="CPU" value={`${Math.round(h.cpu_usage_pct)}%`} />
                <Stat label="Memory" value={`${Math.round(h.ram_usage_pct)}%`} hint={`${h.ram_used_mb} of ${h.ram_total_mb} MB`} />
                <Stat label="Workstations" value={h.registered_workstations} />
                <Stat label="Live sessions" value={h.active_ws_connections} />
                <Stat label="Database" value={`${h.database_size_kb} KB`} hint={h.database_type} />
                <Stat label="Uptime" value={h.uptime_human.split(' (')[0]} />
              </div>
              <p className="mt-4 text-[12px] text-[color:var(--app-muted)]">{h.platform} · Python {h.python_version}</p>
            </>
          )}
        </Card>
      </div>

      {schedule.data ? <Schedule schedule={schedule.data} onSaved={() => { schedule.refresh(); status.refresh(); }} /> : <Card title="Office hours"><Skeleton rows={2} h="h-10" /></Card>}
      <AiVision />
      <AiAudit />

      <Card title="Platform support" subtitle={h ? `This engine runs on ${h.platform}.` : undefined}>
        <ul className="divide-y divide-[color:var(--app-border)]">
          {PLATFORMS.map(([n, d, t]) => (
            <li key={n} className="flex items-center justify-between gap-4 py-2.5 text-[13px]"><div><p className="font-medium text-[color:var(--app-text)]">{n}</p><p className="text-[12px] text-[color:var(--app-text-2)]">{d}</p></div><Pill tone={t}>{t === 'ok' ? 'Full' : 'Partial'}</Pill></li>
          ))}
        </ul>
      </Card>

      <Card title="Install the agent on employee PCs" subtitle="Run the installer on each workstation. Employees sign in with their employee ID.">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="app-btn app-btn--primary" onClick={() => downloadFile('download/installer', 'Anuvadini_Installer.bat')}><Download className="h-4 w-4" />Windows installer</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => downloadFile('download/mac-installer', 'Anuvadini_Installer_Mac.sh')}><Download className="h-4 w-4" />macOS installer</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => downloadFile('download/client-bundle.zip', 'anuvadini_client_bundle.zip')}><Download className="h-4 w-4" />Client bundle (.zip)</button>
          <button type="button" className="app-btn app-btn--ghost" disabled={busy} onClick={() => setAskTest(true)}><FlaskConical className="h-4 w-4" />Create a test incident</button>
          <button type="button" className="app-btn app-btn--ghost" disabled={busy} onClick={() => setAskBell(true)}><Bell className="h-4 w-4" />Send a test alert to the bell</button>
        </div>
        <p className="mt-3 text-[12px] text-[color:var(--app-muted)]">Agents report straight to the Defender service (port 8055 by default), so employee PCs must be able to reach this server on that port.</p>
      </Card>
      <Confirm open={askBell} title="Send a test alert?" message="Adds a clearly labelled sample alert to the notification bell so you can see how alerts look. It does not create an incident." confirmLabel="Send test alert" onClose={() => setAskBell(false)} onConfirm={() => act(dpost('notifications/simulate', { game_name: '[TEST] Sample alert', employee_id: 'TEST-001', hostname: 'TEST-PC', severity: 'LOW' }), 'Test alert sent')} />
      <Confirm open={askTest} title="Create a test incident?" message="This adds a clearly labelled [TEST] incident and a pretend workstation. The pretend PC removes itself after about 45 seconds; the test incident stays in the history." confirmLabel="Create test incident" onClose={() => setAskTest(false)} onConfirm={simulate} />
    </DefenderPage>
  );
};

export default DefenderSystem;
