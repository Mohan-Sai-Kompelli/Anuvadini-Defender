import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { Download, ImageOff, Search } from 'lucide-react';
import { SummaryTile } from '../../components/defender/visual';
import { Card, DefenderPage, Empty, ErrorNote, Overlay, SeverityPill, Skeleton } from '../../components/defender/ui';
import { fmtDateTime, fmtSecs, parseTs, useDefender } from './api';

const RANGES = [{ v: 'ALL', l: 'All loaded' }, { v: 'TODAY', l: 'Today' }, { v: '7D', l: 'Last 7 days' }, { v: '30D', l: 'Last 30 days' }];
const csvCell = (v) => {
  const t = String(v ?? '');
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
function exportCsv(rows) {
  const head = ['Incident ID', 'Time', 'Employee', 'Workstation', 'Detected', 'Category', 'Application', 'Window title', 'Severity', 'Duration (seconds)', 'Status'];
  const body = rows.map((v) => [v.id, v.timestamp, v.username, v.hostname, v.game_name, v.category, v.process_name, v.window_title, v.severity, v.duration_seconds, v.status].map(csvCell).join(','));
  const blob = new Blob(['\ufeff' + [head.join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `defender-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast.success(`Exported ${rows.length} incident${rows.length === 1 ? '' : 's'}`);
}

const useEvidence = (filename) => {
  const [state, setState] = useState({ src: null, error: false });
  useEffect(() => {
    if (!filename) { setState({ src: null, error: false }); return undefined; }
    let url; let dead = false;
    axios.get(`/api/defender/evidence/${encodeURIComponent(filename)}`, { responseType: 'blob' })
      .then((r) => { if (dead) return; url = URL.createObjectURL(r.data); setState({ src: url, error: false }); })
      .catch(() => { if (!dead) setState({ src: null, error: true }); });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [filename]);
  return state;
};

const IncidentDialog = ({ v, onClose }) => {
  const ev = useEvidence(v?.screenshot_filename);
  return (
    <Overlay open={!!v} onClose={onClose} title="Incident details" width="max-w-2xl">
      {v && (
        <>
          <div className="mb-4 overflow-hidden rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-bg)]">
            {ev.src ? <img src={ev.src} alt={`Evidence screenshot for ${v.game_name}`} className="w-full" />
              : <div className="flex h-40 flex-col items-center justify-center gap-2 text-[12.5px] text-[color:var(--app-text-2)]"><ImageOff className="h-5 w-5" aria-hidden="true" />{v.screenshot_filename ? (ev.error ? 'The screenshot file is no longer available.' : 'Loading screenshot...') : 'No screenshot was captured for this incident.'}</div>}
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
            {[['Employee', v.username], ['Workstation', v.hostname], ['Detected', v.game_name], ['Category', v.category], ['Application', v.process_name], ['Time', fmtDateTime(v.timestamp)], ['Duration', fmtSecs(v.duration_seconds)], ['Status', v.status]].map(([k, val]) => (
              <div key={k}><dt className="text-[color:var(--app-muted)]">{k}</dt><dd className="font-medium text-[color:var(--app-text)]">{val || '-'}</dd></div>
            ))}
            <div className="sm:col-span-2"><dt className="text-[color:var(--app-muted)]">Window title</dt><dd className="break-words font-medium text-[color:var(--app-text)]">{v.window_title || '-'}</dd></div>
          </dl>
        </>
      )}
    </Overlay>
  );
};

const DefenderIncidents = () => {
  const [limit, setLimit] = useState(100);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [sev, setSev] = useState('ALL');
  const [cat, setCat] = useState(params.get('category') || 'ALL');
  const [range, setRange] = useState('ALL');
  const [open, setOpen] = useState(null);
  const wantId = params.get('id');
  const list = useDefender('violations', { params: { limit }, interval: 10000 });

  const all = list.data || [];
  useEffect(() => {
    if (wantId && list.data) {
      const hit = list.data.find((v) => String(v.id) === wantId);
      if (hit) setOpen(hit);
      setParams({}, { replace: true });
    }
  }, [wantId, list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => ['ALL', ...Array.from(new Set(all.map((v) => v.category).filter(Boolean))).sort()], [all]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const since = range === 'ALL' ? 0 : range === 'TODAY' ? new Date().setHours(0, 0, 0, 0) : Date.now() - (range === '7D' ? 7 : 30) * 86400000;
    return all.filter((v) => (!since || (parseTs(v.timestamp)?.getTime() || 0) >= since) && (sev === 'ALL' || String(v.severity).toUpperCase() === sev) && (cat === 'ALL' || v.category === cat)
      && (!t || `${v.username} ${v.hostname} ${v.game_name} ${v.window_title} ${v.process_name}`.toLowerCase().includes(t)));
  }, [all, q, sev, cat, range]);

  return (
    <DefenderPage
      title="Incidents"
      subtitle="Every detected game, blocked site and tamper attempt, with evidence."
      actions={<button type="button" className="app-btn app-btn--ghost" disabled={rows.length === 0} onClick={() => exportCsv(rows)}><Download className="h-4 w-4" />Export CSV ({rows.length})</button>}
    >
      <div className="flex flex-wrap gap-3" role="group" aria-label="Filter by severity">
        {[['ALL', 'All incidents', 'var(--app-muted)'], ['CRITICAL', 'Critical', 'var(--err)'], ['HIGH', 'High', '#D4572B'], ['MEDIUM', 'Medium', 'var(--warn)'], ['LOW', 'Low', 'var(--info)']].map(([k, l, c]) => (
          <SummaryTile key={k} label={l} color={c} active={sev === k} onClick={() => setSev(sev === k ? 'ALL' : k)} value={k === 'ALL' ? all.length : all.filter((v) => String(v.severity).toUpperCase() === k).length} />
        ))}
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--app-border)] p-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--app-muted)]" aria-hidden="true" />
            <input className="app-input w-full pl-9" placeholder="Search employee, PC or detection" aria-label="Search incidents" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="app-input !w-auto" aria-label="Severity" value={sev} onChange={(e) => setSev(e.target.value)}>
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All severities' : s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
          <select className="app-input !w-auto" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>)}
          </select>
          <select className="app-input !w-auto" aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
          <select className="app-input !w-auto" aria-label="Rows to load" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[50, 100, 250, 500].map((n) => <option key={n} value={n}>Latest {n}</option>)}
          </select>
          <span className="ml-auto text-[12px] text-[color:var(--app-muted)] tnum">{rows.length} shown</span>
        </div>
        {list.error && !list.data ? <div className="p-4"><ErrorNote error={list.error} onRetry={list.refresh} /></div>
          : !list.data ? <div className="p-4"><Skeleton rows={6} h="h-11" /></div>
          : rows.length === 0 ? <Empty title="No incidents found" hint={all.length ? 'Try clearing a filter.' : 'Nothing has been detected yet.'} />
          : (
            <>
            <ul className="divide-y divide-[color:var(--app-border)] md:hidden">
              {rows.map((v) => (
                <li key={v.id}><button type="button" onClick={() => setOpen(v)} className="app-focus block w-full px-4 py-3 text-left">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-[13.5px] font-medium text-[color:var(--app-text)]">{v.game_name}</span><SeverityPill severity={v.severity} /></div>
                  <p className="mt-0.5 truncate text-[12px] text-[color:var(--app-text-2)]">{v.username} · {v.hostname}</p>
                  <p className="mt-0.5 text-[11.5px] text-[color:var(--app-muted)] tnum">{fmtDateTime(v.timestamp)} · {fmtSecs(v.duration_seconds)} · {v.category}</p>
                </button></li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead><tr className="bg-[color:var(--app-bg)] text-left text-[11.5px] uppercase tracking-[0.06em] text-[color:var(--app-muted)]"><th className="px-4 py-2.5 font-semibold">Time</th><th className="px-3 py-2.5 font-semibold">Employee</th><th className="px-3 py-2.5 font-semibold">Detected</th><th className="px-3 py-2.5 font-semibold">Severity</th><th className="px-3 py-2.5 text-right font-semibold">Duration</th><th className="px-4 py-2.5 text-right font-semibold">Evidence</th></tr></thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id} className="cursor-pointer border-t border-[color:var(--app-border)] hover:bg-[color:var(--app-hover)]" onClick={() => setOpen(v)}>
                      <td className="whitespace-nowrap px-4 py-2.5 tnum text-[color:var(--app-text-2)]">{fmtDateTime(v.timestamp)}</td>
                      <td className="px-3 py-2.5"><span className="block font-medium text-[color:var(--app-text)]">{v.username}</span><span className="block text-[12px] text-[color:var(--app-muted)]">{v.hostname}</span></td>
                      <td className="px-3 py-2.5"><span className="block text-[color:var(--app-text)]">{v.game_name}</span><span className="block text-[12px] text-[color:var(--app-muted)]">{v.category}</span></td>
                      <td className="px-3 py-2.5"><SeverityPill severity={v.severity} /></td>
                      <td className="px-3 py-2.5 text-right tnum text-[color:var(--app-text-2)]">{fmtSecs(v.duration_seconds)}</td>
                      <td className="px-4 py-2.5 text-right"><button type="button" className="app-focus rounded text-[13px] font-medium text-[color:var(--accent)] hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(v); }}>{v.screenshot_filename ? 'View' : 'Details'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
      </Card>
      <IncidentDialog v={open} onClose={() => setOpen(null)} />
    </DefenderPage>
  );
};

export default DefenderIncidents;
