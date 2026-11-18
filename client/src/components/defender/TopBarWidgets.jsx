import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { act, dpost, secondsAgo, useDefender, useFreshness, ago } from '../../pages/defender/api';

/** Engine state + last good refresh, derived only from real responses. */
export const EngineChip = () => {
  const f = useFreshness();
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 5000); return () => clearInterval(id); }, []);
  const age = secondsAgo(f.lastOk);
  let tone = 'neutral'; let label = 'Checking engine';
  if (f.online === false) { tone = 'err'; label = 'Engine unavailable'; }
  else if (f.online && (f.failing || (age != null && age > 45))) { tone = 'warn'; label = 'Data stale'; }
  else if (f.online) { tone = 'ok'; label = 'Engine online'; }
  const color = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', neutral: 'var(--app-muted)' }[tone];
  return (
    <div className="hidden items-center gap-2 rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-card)] px-3 py-1.5 text-[12px] md:flex" role="status" aria-live="polite">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      <span className="font-medium text-[color:var(--app-text)]">{label}</span>
      {f.online && age != null && <span className="text-[color:var(--app-muted)] tnum">Updated {age < 5 ? 'just now' : `${age}s ago`}</span>}
    </div>
  );
};

const SEV = { CRITICAL: 'var(--err)', HIGH: 'var(--err)', MEDIUM: 'var(--warn)', LOW: 'var(--info)' };

/** Defender notification centre: real /notifications API (list, mark read, clear). */
export const DefenderNotifications = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const n = useDefender('notifications', { params: { limit: 15 }, interval: 10000 });
  const items = n.data?.notifications || [];
  const unread = n.data?.unread_count || 0;

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Defender notifications${unread ? `, ${unread} unread` : ''}`} aria-haspopup="true" aria-expanded={open}
        className="app-focus relative flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--app-text-2)] transition-colors hover:bg-[color:var(--app-hover)]">
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[color:var(--err)] px-1 text-[10px] font-semibold text-white tnum">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[color:var(--app-border)] bg-white shadow-xl" role="dialog" aria-label="Defender notifications">
          <div className="flex items-center justify-between border-b border-[color:var(--app-border)] px-4 py-3">
            <p className="text-[13.5px] font-semibold text-[color:var(--app-text)]">Incident alerts</p>
            <div className="flex gap-1">
              <button type="button" disabled={!unread} className="app-focus inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[color:var(--accent)] hover:bg-[color:var(--app-hover)] disabled:opacity-40" onClick={() => act(dpost('notifications/read', {})).then(n.refresh)}><CheckCheck className="h-3.5 w-3.5" />Mark read</button>
              <button type="button" disabled={!items.length} className="app-focus rounded-md px-2 py-1 text-[12px] font-medium text-[color:var(--app-text-2)] hover:bg-[color:var(--app-hover)] disabled:opacity-40" onClick={() => act(dpost('notifications/clear')).then(n.refresh)}>Clear</button>
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {!n.data ? <p className="px-4 py-6 text-center text-[12.5px] text-[color:var(--app-text-2)]">Loading...</p>
              : items.length === 0 ? <p className="px-4 py-8 text-center text-[12.5px] text-[color:var(--app-text-2)]">No alerts. New incidents appear here.</p>
              : items.map((i) => (
                <div key={i.id} className="flex gap-3 border-b border-[color:var(--app-border)] px-4 py-3 last:border-b-0" style={{ background: i.is_read ? 'transparent' : 'var(--accent-soft)' }}>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: SEV[String(i.severity).toUpperCase()] || 'var(--app-muted)' }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[color:var(--app-text)]">{i.game_name}</p>
                    <p className="truncate text-[12px] text-[color:var(--app-text-2)]">{i.username} · {i.hostname}</p>
                    <p className="text-[11.5px] text-[color:var(--app-muted)]">{ago(i.timestamp)} · {i.category}</p>
                  </div>
                </div>
              ))}
          </div>
          <Link to="/defender/incidents" onClick={() => setOpen(false)} className="block border-t border-[color:var(--app-border)] px-4 py-2.5 text-center text-[12.5px] font-semibold text-[color:var(--accent)] hover:bg-[color:var(--app-hover)]">Open incidents</Link>
        </div>
      )}
    </div>
  );
};
