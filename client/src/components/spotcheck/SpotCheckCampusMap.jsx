import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';

// Campus centre for the spot-check map.
const CAMPUS = { lat: 22.30388, lng: 73.18936, name: 'Anuvadini Campus' };

// Stable pseudo-position around campus from an id, so a staff member without a
// recorded response location always lands on the same spot (demo-friendly).
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return Math.abs(h);
};
const scatterPos = (id) => {
  const h = hashStr(id);
  const dLat = ((h % 1000) / 1000 - 0.5) * 0.0026; // ~±145 m
  const dLng = (((h >> 10) % 1000) / 1000 - 0.5) * 0.0026;
  return [CAMPUS.lat + dLat, CAMPUS.lng + dLng];
};

const STYLE = {
  responded: { color: '#6AA51F', fill: '#8FD13C', label: 'Marked present', Icon: CheckCircle2 },
  missed: { color: '#dc2626', fill: '#ef4444', label: 'Missed — no response', Icon: XCircle },
  pending: { color: '#d97706', fill: '#f59e0b', label: 'Awaiting response', Icon: Clock },
};

const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export default function SpotCheckCampusMap({ rounds = [], fmtDateTime }) {
  const [roundId, setRoundId] = useState(rounds[0]?.roundId || null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Default to the newest round once the list arrives.
  useEffect(() => {
    if (!roundId && rounds.length) setRoundId(rounds[0].roundId);
  }, [rounds, roundId]);

  useEffect(() => {
    if (!roundId) return;
    let alive = true;
    setLoading(true);
    axios
      .get(`/api/spot-checks/round/${roundId}`)
      .then((res) => { if (alive) setData(res.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [roundId]);

  // Build the plotted points: responders use their real response location when
  // present, everyone else is scattered around campus and colour-coded.
  const points = useMemo(() => {
    const checks = data?.checks || [];
    return checks.map((c) => {
      const status =
        c.status === 'responded' ? 'responded' : c.status === 'missed' ? 'missed' : 'pending';
      const loc = c.responseLocation;
      const pos =
        status === 'responded' && loc && loc.latitude != null && loc.longitude != null
          ? [loc.latitude, loc.longitude]
          : scatterPos(c.student?._id || c._id);
      return {
        id: c._id,
        name: c.student?.fullName || 'Unknown',
        dept: c.student?.department || '',
        uid: c.student?.uid || '',
        status,
        pos,
        markedFromReal: status === 'responded' && !!(loc && loc.latitude != null),
        respondedAt: c.respondedAt,
      };
    });
  }, [data]);

  const counts = useMemo(
    () => ({
      responded: points.filter((p) => p.status === 'responded').length,
      missed: points.filter((p) => p.status === 'missed').length,
      pending: points.filter((p) => p.status === 'pending').length,
    }),
    [points]
  );

  if (!rounds.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
        <MapPin className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">No spot-check sessions yet</div>
        <div className="text-xs text-slate-400">Run a spot-check to see who marked from where on campus.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session selector + legend */}
      <div className="grid gap-3 lg:flex lg:flex-wrap lg:items-center lg:justify-between">
        <div className="grid min-w-0 gap-2 sm:flex sm:items-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Session</span>
          <select
            value={roundId || ''}
            onChange={(e) => setRoundId(e.target.value)}
            className="input w-full min-w-0 py-1.5 text-sm sm:w-auto sm:max-w-full"
          >
            {rounds.map((r, i) => (
              <option key={r.roundId} value={r.roundId}>
                #SC{String(i + 1).padStart(3, '0')} · {fmtDateTime(r.issuedAt)} · {r.responded}/{r.responded + r.missed} responded
              </option>
            ))}
          </select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs font-medium sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <span className="inline-flex items-center gap-1.5 text-emerald-600"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Marked present ({counts.responded})</span>
          <span className="inline-flex items-center gap-1.5 text-rose-600"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Missed ({counts.missed})</span>
          {counts.pending > 0 && (
            <span className="inline-flex items-center gap-1.5 text-amber-600"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Awaiting ({counts.pending})</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Map */}
        <div className="h-[340px] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 sm:h-[460px] lg:col-span-2">
          <MapContainer center={[CAMPUS.lat, CAMPUS.lng]} zoom={17} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* Campus anchor */}
            <CircleMarker center={[CAMPUS.lat, CAMPUS.lng]} radius={7} pathOptions={{ color: '#315CE8', fillColor: '#315CE8', fillOpacity: 0.9 }}>
              <Tooltip permanent direction="top" offset={[0, -6]} className="!bg-emerald-700 !border-0 !text-white !text-[10px] !font-semibold">
                {CAMPUS.name}
              </Tooltip>
            </CircleMarker>

            {points.map((p) => {
              const s = STYLE[p.status];
              return (
                <CircleMarker
                  key={p.id}
                  center={p.pos}
                  radius={8}
                  pathOptions={{ color: s.color, fillColor: s.fill, fillOpacity: 0.85, weight: 2 }}
                >
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{p.uid}{p.dept ? ` · ${p.dept}` : ''}</div>
                      <div style={{ fontSize: 12, marginTop: 4, color: s.color, fontWeight: 600 }}>{s.label}</div>
                      {p.status === 'responded' && (
                        <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>
                          {p.markedFromReal ? 'Marked from this location' : 'Location not captured'} · {fmtTime(p.respondedAt)}
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {/* Roster side panel */}
        <div className="flex max-h-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 sm:max-h-[460px]">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
            Who responded · who missed
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {points.length === 0 ? (
              <div className="px-2 py-8 text-center text-xs text-slate-400">{loading ? 'Loading session…' : 'No staff in this session.'}</div>
            ) : (
              [...points]
                .sort((a, b) => (a.status === 'missed' ? -1 : 1) - (b.status === 'missed' ? -1 : 1))
                .map((p) => {
                  const s = STYLE[p.status];
                  const Icon = s.Icon;
                  return (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <Icon className="h-4 w-4 shrink-0" style={{ color: s.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</div>
                        <div className="truncate text-[11px] text-slate-400">{p.dept || p.uid}</div>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold" style={{ color: s.color }}>
                        {p.status === 'responded' ? fmtTime(p.respondedAt) : s.label.split(' ')[0]}
                      </span>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
