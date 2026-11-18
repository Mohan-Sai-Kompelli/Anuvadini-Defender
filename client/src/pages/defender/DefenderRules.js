import React, { useMemo, useState } from 'react';
import { AppWindow, ArrowRight, BellRing, Eye, Plus, Sparkles, Trash2, Type, XOctagon } from 'lucide-react';
import { Card, Confirm, DefenderPage, Empty, ErrorNote, Skeleton } from '../../components/defender/ui';
import { act, ago, ddelete, dpost, useDefender } from './api';

const KINDS = {
  process: { label: 'Application', icon: AppWindow, color: '#2f7de1', hint: 'Matches the program that is running, e.g. steam.exe', field: 'Program file name', ph: 'steam.exe' },
  keyword: { label: 'Window text', icon: Type, color: '#7a5bd6', hint: 'Matches words in any window title or browser tab, e.g. "online casino"', field: 'Words to look for', ph: 'online casino' },
};
const ACTIONS = {
  alert: { label: 'Alert only', icon: BellRing, color: '#2f7de1', hint: 'Record it as an incident. The app keeps running.' },
  kill: { label: 'Alert and close', icon: XOctagon, color: '#c43d42', hint: 'Record it and close the app straight away.' },
};
const CATEGORIES = ['Gaming', 'Gambling', 'Social Media', 'Streaming', 'Distraction', 'Custom'];
const PRESETS = [
  { type: 'process', pattern: 'steam.exe', label: 'Steam', category: 'Gaming', action: 'alert' },
  { type: 'process', pattern: 'discord.exe', label: 'Discord', category: 'Distraction', action: 'alert' },
  { type: 'keyword', pattern: 'online casino', label: 'Casino site', category: 'Gambling', action: 'kill' },
  { type: 'keyword', pattern: 'netflix', label: 'Netflix', category: 'Streaming', action: 'alert' },
];

const Choice = ({ on, onClick, icon: Icon, color, title, hint }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className="app-focus flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5"
    style={{ borderColor: on ? color : 'var(--app-border)', background: on ? `${color}10` : 'var(--app-card)', boxShadow: on ? `0 0 0 3px ${color}1f` : undefined }}>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1c`, color }}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
    <span className="min-w-0"><span className="block text-[13.5px] font-semibold text-[color:var(--app-text)]">{title}</span><span className="mt-0.5 block text-[12px] leading-snug text-[color:var(--app-text-2)]">{hint}</span></span>
  </button>
);

const Step = ({ n, title, text }) => (
  <li className="flex items-start gap-3">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12.5px] font-semibold text-[#B9F36A]">{n}</span>
    <span><span className="block text-[13.5px] font-semibold text-white">{title}</span><span className="block text-[12.5px] leading-snug text-slate-300">{text}</span></span>
  </li>
);

const RuleRow = ({ r, onDelete }) => {
  const k = KINDS[r.rule_type] || KINDS.keyword; const a = ACTIONS[r.action] || ACTIONS.alert; const Icon = k.icon;
  return (
    <li className="group flex items-center gap-3 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-card)] p-3 transition-colors hover:border-[color:var(--accent-border)]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${k.color}1c`, color: k.color }}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-[color:var(--app-text)]">{r.label}</p>
        <p className="truncate text-[12px] text-[color:var(--app-text-2)]">{r.rule_type === 'process' ? 'When ' : 'When a window mentions '}<code className="rounded bg-[color:var(--app-hover)] px-1 py-0.5 text-[11.5px] text-[color:var(--app-text)]">{r.pattern}</code>{r.rule_type === 'process' ? ' is running' : ''} · {r.category}{r.created_at ? ` · added ${ago(r.created_at)}` : ''}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: `${a.color}14`, color: a.color }}><a.icon className="h-3.5 w-3.5" aria-hidden="true" />{a.label}</span>
      <button type="button" aria-label={`Delete ${r.label}`} className="app-focus rounded-md p-1.5 text-[color:var(--app-muted)] opacity-60 transition hover:bg-[color:var(--app-hover)] hover:text-[color:var(--err)] group-hover:opacity-100" onClick={() => onDelete(r)}><Trash2 className="h-4 w-4" /></button>
    </li>
  );
};

const DefenderRules = () => {
  const rules = useDefender('rules');
  const [type, setType] = useState('process');
  const [pattern, setPattern] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('Custom');
  const [action, setAction] = useState('alert');
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const kind = KINDS[type];
  const ok = pattern.trim().length >= 2 && label.trim().length >= 2;
  const list = useMemo(() => rules.data || [], [rules.data]);
  const apps = list.filter((r) => r.rule_type === 'process');
  const words = list.filter((r) => r.rule_type !== 'process');

  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    const res = await act(dpost('rules', { rule_type: type, pattern: pattern.trim(), label: label.trim(), category: category.trim() || 'Custom', action }), 'Rule added');
    setBusy(false);
    if (res) { setPattern(''); setLabel(''); rules.refresh(); }
  };
  const applyPreset = (p) => { setType(p.type); setPattern(p.pattern); setLabel(p.label); setCategory(p.category); setAction(p.action); };

  const previewA = ACTIONS[action];

  return (
    <DefenderPage title="Detection rules" subtitle="Teach Defender what else to watch for, on top of the built-in game and site signatures.">
      {/* What is this? */}
      <section className="relative overflow-hidden rounded-[18px] p-6 text-white sm:p-7" style={{ background: 'linear-gradient(135deg, #0a1016 0%, #0e1a20 52%, #0b2620 100%)', boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset, 0 30px 60px -30px rgba(8,20,16,0.7), 0 0 80px -30px rgba(52,227,160,0.25)' }} aria-label="How rules work">
        <span data-parallax="30" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-[0.26]" style={{ background: 'radial-gradient(circle, #34e3a0, transparent 65%)' }} aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#B9F36A]"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Your own rules</span>
            <h2 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.01em] sm:text-[28px]">Tell Defender what to catch</h2>
            <p className="mt-1.5 max-w-lg text-[13.5px] text-slate-300">Defender already knows 300+ games and sites. If something is missing, add a rule here. It starts working on every enrolled PC within seconds.</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-[12.5px] text-slate-300"><b className="text-white tnum">{rules.data ? list.length : '-'}</b> custom rule{list.length === 1 ? '' : 's'} active</p>
          </div>
          <ol className="space-y-3.5">
            <Step n="1" title="Pick what to watch" text="A program on the PC, or words that show up in a window or tab." />
            <Step n="2" title="Choose the reaction" text="Just record it, or record it and close the app." />
            <Step n="3" title="See it in Incidents" text="Every catch appears there with the name you give it." />
          </ol>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Builder */}
        <Card title="Create a rule" subtitle="Fill in the three blocks, then check the preview.">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">1 · What should Defender watch?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(KINDS).map(([k, v]) => <Choice key={k} on={type === k} onClick={() => setType(k)} icon={v.icon} color={v.color} title={v.label} hint={v.hint} />)}
              </div>
              <label htmlFor="r-pat" className="mb-1 mt-3 block text-[12px] text-[color:var(--app-text-2)]">{kind.field}</label>
              <input id="r-pat" className="app-input w-full" placeholder={kind.ph} value={pattern} onChange={(e) => setPattern(e.target.value)} autoComplete="off" />
            </div>

            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">2 · What should happen?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(ACTIONS).map(([k, v]) => <Choice key={k} on={action === k} onClick={() => setAction(k)} icon={v.icon} color={v.color} title={v.label} hint={v.hint} />)}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">3 · How should it be named?</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="r-label" className="mb-1 block text-[12px] text-[color:var(--app-text-2)]">Name shown in Incidents</label><input id="r-label" className="app-input w-full" placeholder="Casino site" value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" /></div>
                <div><label htmlFor="r-cat" className="mb-1 block text-[12px] text-[color:var(--app-text-2)]">Category</label><input id="r-cat" list="r-cats" className="app-input w-full" value={category} onChange={(e) => setCategory(e.target.value)} /><datalist id="r-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">Or start from an example</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => <button key={p.pattern} type="button" onClick={() => applyPreset(p)} className="app-focus inline-flex items-center gap-1.5 rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-card)] px-3 py-1.5 text-[12.5px] font-medium text-[color:var(--app-text)] transition-colors hover:border-[color:var(--accent-border)] hover:bg-[color:var(--accent-soft)]">{p.label}<span className="text-[color:var(--app-muted)]">{p.pattern}</span></button>)}
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-xl border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-hover)]/50 p-4" aria-live="polite">
              <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--app-text-2)]"><Eye className="h-3.5 w-3.5" aria-hidden="true" />Preview</p>
              <p className="text-[13.5px] leading-relaxed text-[color:var(--app-text)]">
                When {type === 'process' ? 'the program' : 'any window mentions'} <b className="rounded bg-white px-1.5 py-0.5 font-mono text-[12.5px] shadow-sm">{pattern.trim() || kind.ph}</b>{type === 'process' ? ' is running' : ''}, <b style={{ color: previewA.color }}>{previewA.label.toLowerCase()}</b>
                <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-[color:var(--app-muted)]" aria-hidden="true" />
                log it as <b>{label.trim() || 'Your rule name'}</b> <span className="text-[color:var(--app-text-2)]">({category.trim() || 'Custom'})</span>.
              </p>
            </div>

            <button type="submit" className="app-btn app-btn--primary w-full" disabled={!ok || busy}><Plus className="h-4 w-4" />{busy ? 'Adding...' : 'Add rule'}</button>
          </form>
        </Card>

        {/* Existing rules */}
        <Card title="Active rules" subtitle="Applied on top of the 300+ built-in signatures." className="self-start">
          {rules.error && !rules.data ? <ErrorNote error={rules.error} onRetry={rules.refresh} />
            : !rules.data ? <Skeleton rows={3} h="h-16" />
            : list.length === 0 ? <Empty icon={Sparkles} title="No custom rules yet" hint="Built-in signatures already cover common games, gambling and streaming sites. Pick an example on the left to add your first rule." />
            : (
              <div className="space-y-5">
                {[['Applications', apps], ['Window text', words]].map(([title, items]) => items.length > 0 && (
                  <div key={title}>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">{title} <span className="tnum">· {items.length}</span></p>
                    <ul className="space-y-2">{items.map((r) => <RuleRow key={r.id} r={r} onDelete={setDel} />)}</ul>
                  </div>
                ))}
              </div>
            )}
        </Card>
      </div>
      <Confirm open={!!del} danger title="Delete this rule?" message={del ? `"${del.label}" will stop being detected.` : ''} confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={() => act(ddelete(`rules/${del.id}`), 'Rule deleted').then(rules.refresh)} />
    </DefenderPage>
  );
};

export default DefenderRules;
