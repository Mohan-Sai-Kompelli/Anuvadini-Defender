import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Ban, Check, Dices, EyeOff, Gamepad2, Globe, Heart, Layers, Search, Share2, Tv, UserCheck, X } from 'lucide-react';
import { Card, Empty, ErrorNote, Skeleton } from './ui';
import { Avatar } from './visual';
import { act, dget, ddelete, dpost, errorText } from '../../pages/defender/api';

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
const POPULAR = ['instagram.com', 'facebook.com', 'youtube.com', 'x.com', 'twitter.com', 'snapchat.com', 'netflix.com', 'twitch.tv', 'tiktok.com', 'reddit.com'];
const bare = (d) => String(d || '').replace(/^www\./, '');

const SCOPES = [
  { value: 'category', title: 'A whole category', hint: 'e.g. all Social Media sites', icon: Layers },
  { value: 'domain', title: 'One website', hint: 'e.g. only instagram.com', icon: Globe },
  { value: 'all', title: 'Every blocked site', hint: 'Full access for this person', icon: UserCheck },
];

/** Type a name or ID, pick a person. Results come from the organisation's real staff list. */
const PersonPicker = ({ value, onChange }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setRows(null); setFailed(false);
    const t = setTimeout(async () => {
      try { setRows(await dget('staff-search', { q })); setHi(0); } catch (e) { setFailed(true); setRows([]); }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const choose = (p) => { onChange(p); setOpen(false); setQ(''); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min((rows?.length || 1) - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && open && rows?.[hi]) { e.preventDefault(); choose(rows[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[color:var(--accent-border)] bg-[color:var(--accent-soft)] px-3 py-2">
        <Avatar name={value.name} size={34} />
        <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold text-[color:var(--app-text)]">{value.name}</p><p className="truncate text-[12px] text-[color:var(--app-text-2)]">{[value.department, value.organization, value.employee_id].filter(Boolean).join(' · ')}</p></div>
        <button type="button" aria-label="Choose someone else" className="app-focus rounded-md p-1.5 text-[color:var(--app-text-2)] hover:bg-white/70" onClick={() => onChange(null)}><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--app-muted)]" aria-hidden="true" />
      <input
        className="app-input w-full pl-9" placeholder="Search by name or ID" aria-label="Search employees" role="combobox" aria-expanded={open} aria-controls="ex-people"
        value={q} autoComplete="off" onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={key}
      />
      {open && (
        <ul id="ex-people" role="listbox" className="absolute z-20 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-[color:var(--app-border)] bg-white p-1 shadow-xl">
          {rows === null ? <li className="px-3 py-3 text-[12.5px] text-[color:var(--app-muted)]">Searching...</li>
            : failed ? <li className="px-3 py-3 text-[12.5px] text-[color:var(--err)]">Could not load staff. Please try again.</li>
            : rows.length === 0 ? <li className="px-3 py-3 text-[12.5px] text-[color:var(--app-muted)]">No one found{q ? ` for "${q}"` : ''}.</li>
            : rows.map((p, i) => (
              <li key={p.employee_id} role="option" aria-selected={i === hi}>
                <button type="button" onMouseEnter={() => setHi(i)} onClick={() => choose(p)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors" style={{ background: i === hi ? 'var(--app-hover)' : 'transparent' }}>
                  <Avatar name={p.name} size={30} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium text-[color:var(--app-text)]">{p.name}</span><span className="block truncate text-[12px] text-[color:var(--app-text-2)]">{[p.department, p.employee_id].filter(Boolean).join(' · ')}</span></span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

/** People allowed to bypass part of the blocklist. */
const ExceptionsCard = ({ exQ, rules, catList, onChanged }) => {
  const [person, setPerson] = useState(null);
  const [scope, setScope] = useState('category');
  const [value, setValue] = useState('');
  const [siteQ, setSiteQ] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => exQ.data || [], [exQ.data]);
  const byPerson = useMemo(() => {
    const m = {};
    list.forEach((e) => { (m[e.employee_id] = m[e.employee_id] || { id: e.employee_id, name: e.name, department: e.department, items: [] }).items.push(e); });
    return Object.values(m);
  }, [list]);

  const sites = useMemo(() => {
    const seen = new Set();
    return rules.filter((r) => { const b = bare(r.domain); if (seen.has(b)) return false; seen.add(b); return true; }).map((r) => ({ domain: bare(r.domain), category: r.category }));
  }, [rules]);
  const examples = useMemo(() => {
    const m = {};
    sites.forEach((s) => { (m[s.category] = m[s.category] || []).push(s.domain); });
    return m;
  }, [sites]);
  const popular = useMemo(() => POPULAR.filter((d) => sites.some((s) => s.domain === d)), [sites]);
  const shown = useMemo(() => {
    const t = siteQ.trim().toLowerCase();
    return sites.filter((s) => !t || s.domain.includes(t) || s.category.toLowerCase().includes(t)).slice(0, 40);
  }, [sites, siteQ]);

  const ready = person && (scope === 'all' || value);
  const label = (e) => (e.scope === 'all' ? 'Every blocked site' : e.scope === 'category' ? `${e.value} (all sites)` : e.value);

  const submit = async (ev) => {
    ev.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const r = await dpost('firewall/exemptions', { employee_id: person.employee_id, name: person.name, department: person.department || '', scope, value: scope === 'all' ? '' : value });
      if (r?.success) { toast.success(`${person.name} can now open ${scope === 'all' ? 'every blocked site' : value}. It reaches their PC within 30 seconds.`); setValue(''); setSiteQ(''); setPerson(null); exQ.refresh(); onChanged?.(); }
      else toast.error(r?.message || 'Could not save the exception.');
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  const remove = async (id) => { if (await act(ddelete(`firewall/exemptions/${id}`), 'Exception removed')) { exQ.refresh(); onChanged?.(); } };

  return (
    <Card title="Exceptions: who can bypass" subtitle="A blocked site stays blocked for everyone except the people you list here. Example: Instagram is blocked, but the social media team can still open it.">
      {exQ.error && !exQ.data ? <ErrorNote error={exQ.error} onRetry={exQ.refresh} /> : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">1 · Who?</p>
              <PersonPicker value={person} onChange={setPerson} />
            </div>

            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">2 · What can they open?</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => {
                  const on = scope === s.value; const Icon = s.icon;
                  return (
                    <button key={s.value} type="button" aria-pressed={on} onClick={() => { setScope(s.value); setValue(''); }}
                      className="app-focus flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5"
                      style={{ borderColor: on ? 'var(--accent)' : 'var(--app-border)', background: on ? 'var(--accent-soft)' : 'var(--app-card)', boxShadow: on ? '0 0 0 3px var(--accent-soft)' : undefined }}>
                      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ color: on ? 'var(--accent)' : 'var(--app-muted)' }} aria-hidden="true" />
                      <span className="min-w-0"><span className="block text-[13px] font-semibold text-[color:var(--app-text)]">{s.title}</span><span className="block text-[11.5px] leading-snug text-[color:var(--app-text-2)]">{s.hint}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>

            {scope === 'category' && (
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">3 · Which category?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {catList.map(([name, n]) => {
                    const m = meta(name); const Icon = m.icon; const on = value === name; const ex = examples[name] || [];
                    return (
                      <button key={name} type="button" aria-pressed={on} onClick={() => setValue(on ? '' : name)}
                        className="app-focus flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5"
                        style={{ borderColor: on ? m.color : 'var(--app-border)', background: on ? `${m.color}10` : 'var(--app-card)', boxShadow: on ? `0 0 0 3px ${m.color}1f` : undefined }}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${m.color}1c`, color: m.color }}>{on ? <Check className="h-[18px] w-[18px]" /> : <Icon className="h-[18px] w-[18px]" aria-hidden="true" />}</span>
                        <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-[color:var(--app-text)]">{name} <span className="font-normal text-[color:var(--app-muted)]">· {n} sites</span></span><span className="block truncate text-[11.5px] text-[color:var(--app-text-2)]">{ex.slice(0, 3).join(', ')}{ex.length > 3 ? ` +${ex.length - 3} more` : ''}</span></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {scope === 'domain' && (
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">3 · Which website?</p>
                {popular.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {popular.map((d) => { const on = value === d; return <button key={d} type="button" aria-pressed={on} onClick={() => setValue(on ? '' : d)} className="app-focus rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors" style={{ borderColor: on ? 'var(--accent)' : 'var(--app-border)', background: on ? 'var(--accent-soft)' : 'var(--app-card)', color: on ? 'var(--accent)' : 'var(--app-text)' }}>{d}</button>; })}
                  </div>
                )}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--app-muted)]" aria-hidden="true" />
                  <input className="app-input w-full pl-9" placeholder="Search blocked websites" aria-label="Search blocked websites" value={siteQ} onChange={(e) => setSiteQ(e.target.value)} autoComplete="off" />
                </div>
                <ul className="mt-2 max-h-48 overflow-auto rounded-xl border border-[color:var(--app-border)] p-1" aria-label="Blocked websites">
                  {shown.length === 0 ? <li className="px-3 py-3 text-[12.5px] text-[color:var(--app-muted)]">No blocked website matches.</li> : shown.map((s) => {
                    const m = meta(s.category); const on = value === s.domain;
                    return (
                      <li key={s.domain}>
                        <button type="button" onClick={() => setValue(on ? '' : s.domain)} aria-pressed={on} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[color:var(--app-hover)]" style={{ background: on ? 'var(--accent-soft)' : undefined }}>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                          <span className="flex-1 truncate font-medium text-[color:var(--app-text)]">{s.domain}</span>
                          <span className="shrink-0 text-[11.5px] text-[color:var(--app-muted)]">{s.category}</span>
                          {on && <Check className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <button type="submit" className="app-btn app-btn--primary w-full" disabled={!ready || busy}>
              <UserCheck className="h-4 w-4" />
              {busy ? 'Saving...' : ready ? `Allow ${person.name.split(' ')[0]} to open ${scope === 'all' ? 'every blocked site' : value}` : 'Allow'}
            </button>
            <p className="text-[12px] text-[color:var(--app-muted)]">Works on that person's own laptop. Everyone else stays blocked, and allowed visits are not logged as blocks.</p>
          </form>

          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">Currently allowed {byPerson.length > 0 && <span className="tnum">· {byPerson.length}</span>}</p>
            {!exQ.data ? <Skeleton rows={2} h="h-14" /> : byPerson.length === 0 ? (
              <Empty icon={UserCheck} title="No exceptions yet" hint="Everyone follows the full blocklist. Search for a person on the left to let them open a blocked site for work." />
            ) : (
              <ul className="space-y-3">
                {byPerson.map((p) => (
                  <li key={p.id} className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-card)] p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} size={32} />
                      <div className="min-w-0"><p className="truncate text-[13.5px] font-semibold text-[color:var(--app-text)]">{p.name}</p><p className="truncate text-[12px] text-[color:var(--app-text-2)]">{p.department || p.id}</p></div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {p.items.map((e) => (
                        <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent-soft)] py-1 pl-3 pr-1.5 text-[12px] font-medium text-[color:var(--accent)]">
                          {label(e)}
                          <button type="button" aria-label={`Remove ${label(e)} for ${p.name}`} className="app-focus rounded-full p-0.5 transition-colors hover:bg-white/70" onClick={() => remove(e.id)}><X className="h-3.5 w-3.5" /></button>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default ExceptionsCard;
