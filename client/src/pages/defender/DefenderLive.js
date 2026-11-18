import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { DefenderPage, Empty, Overlay, Skeleton, StatusPill } from '../../components/defender/ui';
import { secondsAgo, useDefender, useLiveImage } from './api';

const PER_PAGE = 6;

const Tile = ({ ws, onOpen, active }) => {
  const { src, failed, at } = useLiveImage(`fleet/live-screen/${encodeURIComponent(ws.hostname)}`, { interval: 3000, enabled: active });
  const age = secondsAgo(at);
  return (
    <button type="button" onClick={() => onOpen(ws)} className="app-card app-card--hover app-focus group relative block overflow-hidden p-0 text-left" aria-label={`Open live screen of ${ws.username || ws.hostname}`}>
      <div className="relative aspect-video bg-[#0f172a]">
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[12px] text-slate-400">{failed ? 'No live signal' : 'Connecting...'}</div>}
        {src && failed && <span className="absolute left-2 top-2 rounded-md bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">Stale</span>}
        {age != null && <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-[11px] text-white tnum">{age < 5 ? 'Live' : `${age}s ago`}</span>}
        <span className="absolute right-2 top-2 rounded-md bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"><Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /></span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="min-w-0"><p className="truncate text-[13px] font-medium text-[color:var(--app-text)]">{ws.username || ws.hostname}</p><p className="truncate text-[11.5px] text-[color:var(--app-muted)]">{ws.current_app || ws.hostname}</p></div>
        <StatusPill status={ws.status} />
      </div>
    </button>
  );
};

const Viewer = ({ ws, onClose }) => {
  const { src, failed } = useLiveImage(ws ? `fleet/live-screen/${encodeURIComponent(ws.hostname)}` : null, { interval: 1500, enabled: !!ws });
  return (
    <Overlay open={!!ws} onClose={onClose} title={ws ? `${ws.username || ws.hostname} - ${ws.hostname}` : 'Live screen'} width="max-w-4xl">
      <div className="overflow-hidden rounded-xl bg-[#0f172a]">
        {src ? <img src={src} alt={ws ? `Live screen of ${ws.hostname}` : ''} className="aspect-video w-full object-contain" /> : <div className="flex aspect-video items-center justify-center text-[13px] text-slate-400">{failed ? 'No live signal' : 'Connecting...'}</div>}
      </div>
      {ws && <p className="mt-3 text-[12.5px] text-[color:var(--app-text-2)]">{ws.window_title || ws.current_app}</p>}
    </Overlay>
  );
};

const DefenderLive = () => {
  const fleet = useDefender('fleet', { interval: 8000 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const rawFleet = Array.isArray(fleet.data) ? fleet.data : (Array.isArray(fleet.data?.workstations) ? fleet.data.workstations : (Array.isArray(fleet.data?.fleet) ? fleet.data.fleet : []));
  const reporting = useMemo(() => rawFleet.filter((w) => w.status !== 'TAMPER_ALERT' && w.status !== 'OFFLINE'), [rawFleet]);
  const pages = Math.max(1, Math.ceil(reporting.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const view = reporting.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);

  return (
    <DefenderPage
      title="Live screens"
      subtitle="A rolling view of workstation screens. Select a tile to enlarge it."
      actions={pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className="app-btn app-btn--ghost !px-2" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-[12.5px] text-[color:var(--app-text-2)] tnum">{p + 1} / {pages}</span>
          <button type="button" className="app-btn app-btn--ghost !px-2" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    >
      {!fleet.data ? <Skeleton rows={2} h="h-52" />
        : view.length === 0 ? <div className="app-card"><Empty title="No workstations are reporting" hint="Screens appear here when an agent is online and streaming." /></div>
        : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{view.map((w) => <Tile key={w.hostname} ws={w} onOpen={setOpen} active={!open} />)}</div>}
      <Viewer ws={open} onClose={() => setOpen(null)} />
    </DefenderPage>
  );
};

export default DefenderLive;
