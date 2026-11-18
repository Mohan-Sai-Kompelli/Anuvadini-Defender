import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Circle, Polyline } from '@react-google-maps/api';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
} from 'recharts';
import {
  ArrowLeft, MapPin, Clock, LogOut, ShieldAlert, Footprints, WifiOff,
  Navigation, Crosshair, CalendarDays, AlertTriangle, RefreshCw, Activity, Timer, Gauge,
} from 'lucide-react';
import { portalAPI } from '../services/api';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const LIBRARIES = [];
const containerStyle = { width: '100%', height: '100%' };

const C = { inside: '#6AA51F', outside: '#dc2626', gap: '#94a3b8', brand: '#FF6B35' };

// ── formatting helpers ──────────────────────────────────────────────────────
const fmtDur = (s) => {
  if (s == null) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const fmtMeters = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
const hhmm = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const hhmmss = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const localYMD = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const ms = (d) => new Date(d).getTime();

// ── premium KPI card ─────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const tones = {
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border-amber-100 dark:border-amber-900/30',
    rose: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 border-rose-100 dark:border-rose-900/30',
    violet: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400 border-violet-100 dark:border-violet-900/30',
    pink: 'text-pink-600 bg-pink-50 dark:bg-pink-950/40 dark:text-pink-400 border-pink-100 dark:border-pink-900/30',
    sky: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-400 border-sky-100 dark:border-sky-900/30',
    slate: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300 dark:hover:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${tones[tone]}`}>
          <Icon size={16} />
        </div>
        {sub ? <span className="truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">{sub}</span> : null}
      </div>
      <div className="mt-3">
        <div className="text-xl font-extrabold leading-none text-slate-900 dark:text-slate-100 tabular-nums">{value}</div>
        <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, right, children, className = '' }) {
  return (
    <div className={`min-w-0 rounded-[24px] border border-slate-200/80 bg-white p-4 lg:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            {Icon ? <Icon size={16} className="text-emerald-600 dark:text-emerald-400" /> : null} {title}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// ── 2D analog clock (12-hour) — sharing window vs not-sharing, at real times ──
function SharingClock({ segments, startedAt, active, sharingSec, notSharingSec }) {
  const SZ = 230, cx = SZ / 2, cy = SZ / 2;
  const rO = 88, rI = 66, dial = 104;
  const polar = (r, a) => { const rad = ((a - 90) * Math.PI) / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; };
  // Time → angle on a 12-hour face (12 at top, clockwise).
  const ang = (t) => { const d = new Date(t); return (((d.getHours() % 12) + d.getMinutes() / 60 + d.getSeconds() / 3600) / 12) * 360; };
  const arc = (a0, a1) => {
    let s = a0, e = a1;
    if (e <= s) e += 360;
    if (e - s < 0.6) e = s + 0.6; // keep very short segments visible
    const large = e - s > 180 ? 1 : 0;
    const [x1, y1] = polar(rO, s), [x2, y2] = polar(rO, e), [x3, y3] = polar(rI, e), [x4, y4] = polar(rI, s);
    return `M ${x1} ${y1} A ${rO} ${rO} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rI} ${rI} 0 ${large} 0 ${x4} ${y4} Z`;
  };
  const nowA = ang(Date.now());
  const [nhx, nhy] = polar(rI - 6, nowA);
  return (
    <div className="flex flex-col items-center">
      <svg width="100%" height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ maxWidth: SZ }} className="drop-shadow-sm">
        <circle cx={cx} cy={cy} r={dial} fill="#fff" stroke="#e2e8f0" strokeWidth="1.5" />
        {/* empty 12-hour track */}
        <circle cx={cx} cy={cy} r={(rO + rI) / 2} fill="none" stroke="#f1f5f9" strokeWidth={rO - rI} />
        {/* sharing (green) / not-sharing (red) arcs at their clock positions */}
        {segments.map((s, i) => (
          <path key={i} d={arc(ang(s.start), ang(s.end))} fill={s.state === 'gap' ? '#dc2626' : '#6AA51F'} />
        ))}
        {/* minute ticks */}
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * 360; const big = i % 5 === 0;
          const [t1x, t1y] = polar(dial - 3, a); const [t2x, t2y] = polar(dial - (big ? 9 : 6), a);
          return <line key={i} x1={t1x} y1={t1y} x2={t2x} y2={t2y} stroke={big ? '#cbd5e1' : '#e2e8f0'} strokeWidth={big ? 1.5 : 1} />;
        })}
        {/* hour numbers */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = ((i + 1) / 12) * 360; const [tx, ty] = polar(rI - 15, a);
          return <text key={i} x={tx} y={ty} fontSize="11" fontWeight="700" fill="#94a3b8" textAnchor="middle" dominantBaseline="central">{i + 1}</text>;
        })}
        {/* now hand */}
        {active ? (
          <>
            <line x1={cx} y1={cy} x2={nhx} y2={nhy} stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="4.5" fill="#0f172a" />
          </>
        ) : (
          <circle cx={cx} cy={cy} r="3.5" fill="#cbd5e1" />
        )}
      </svg>
      <div className="mt-3 grid w-full grid-cols-2 gap-2">
        <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-center dark:border-green-900/40 dark:bg-green-900/20">
          <div className="text-base font-extrabold text-green-700 dark:text-green-300">{fmtDur(sharingSec)}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sharing{startedAt ? ` · since ${hhmm(startedAt)}` : ''}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center dark:border-red-900/40 dark:bg-red-900/20">
          <div className="text-base font-extrabold text-red-700 dark:text-red-300">{fmtDur(notSharingSec)}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Not sharing</div>
        </div>
      </div>
    </div>
  );
}

export default function StaffLocationReport() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const fallbackName = useLocation().state?.name || '';
  const { isLoaded, loadError } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries: LIBRARIES });

  const [date, setDate] = useState(localYMD());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(null);
  const [showRaw, setShowRaw] = useState(false); // toggle raw GPS vs Kalman-smoothed
  const mapRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setFocused(null);
    try {
      const res = await portalAPI.getLocationReport(studentId, date);
      if (res && res.success) setReport(res);
      else setError((res && res.error) || 'Failed to load report');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [studentId, date]);

  useEffect(() => { load(); }, [load]);

  const path = useMemo(() => report?.path || [], [report]);
  const session = report?.session || {};
  const stats = report?.stats || {};
  const premises = report?.premises || null;
  const gaps = report?.gaps || [];

  // ── Build the full-day state band (inside / outside / not-sharing) + totals ──
  const band = useMemo(() => {
    if (!path.length) return { segments: [], start: null, end: null, insideSec: 0, outsideSec: 0, gapSec: 0, total: 0 };
    const start = session.startedAt ? ms(session.startedAt) : ms(path[0].at);
    const end = session.active ? Date.now() : (session.lastFixAt ? ms(session.lastFixAt) : ms(path[path.length - 1].at));
    const segs = [];
    const lead = gaps.find((g) => g.kind === 'start');
    if (lead) segs.push({ start: ms(lead.startAt), end: ms(lead.endAt), state: 'gap' });
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const isGap = gaps.some((g) => g.kind === 'mid' && ms(g.startAt) === ms(a.at));
      segs.push({ start: ms(a.at), end: ms(b.at), state: isGap ? 'gap' : a.insidePremises === false ? 'outside' : 'inside' });
    }
    const tail = gaps.find((g) => g.kind === 'now');
    const lastInside = path[path.length - 1].insidePremises !== false;
    if (tail) segs.push({ start: ms(tail.startAt), end: ms(tail.endAt), state: 'gap' });
    else if (end > ms(path[path.length - 1].at)) segs.push({ start: ms(path[path.length - 1].at), end, state: lastInside ? 'inside' : 'outside' });
    let insideSec = 0, outsideSec = 0, gapSec = 0;
    for (const s of segs) {
      const d = (s.end - s.start) / 1000;
      if (s.state === 'inside') insideSec += d; else if (s.state === 'outside') outsideSec += d; else gapSec += d;
    }
    return { segments: segs, start, end, insideSec: Math.round(insideSec), outsideSec: Math.round(outsideSec), gapSec: Math.round(gapSec), total: end - start };
  }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hour tick marks across the band window.
  const hourTicks = useMemo(() => {
    if (!band.start || band.total <= 0) return [];
    const ticks = [];
    const first = new Date(band.start); first.setMinutes(0, 0, 0);
    let t = first.getTime();
    if (t < band.start) t += 3600000;
    const stepH = band.total > 6 * 3600000 ? 2 : 1; // 2-hourly for long days
    for (; t <= band.end; t += stepH * 3600000) {
      ticks.push({ pct: ((t - band.start) / band.total) * 100, label: hhmm(t) });
    }
    return ticks;
  }, [band]);

  // Distance-from-campus series (smoothed). Also compute raw distance when available.
  const distData = useMemo(() => {
    const premises = report?.premises;
    return path.map((p) => {
      let rawDist = null;
      if (premises && p.rawLatitude != null && p.rawLongitude != null) {
        const R = 6371000;
        const toRad = (d) => (d * Math.PI) / 180;
        const dLat = toRad(premises.latitude - p.rawLatitude);
        const dLon = toRad(premises.longitude - p.rawLongitude);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p.rawLatitude)) * Math.cos(toRad(premises.latitude)) * Math.sin(dLon / 2) ** 2;
        rawDist = Math.round(R * 2 * Math.asin(Math.min(1, Math.sqrt(a))));
      }
      return {
        t: ms(p.at),
        label: hhmm(p.at),
        dist: p.distanceM ?? 0,
        rawDist,
        inside: p.insidePremises !== false,
        kalmanGain: p.kalmanGain,
      };
    });
  }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  // Has any ping in the path got raw GPS data (i.e. Kalman was active)?
  const hasRawData = useMemo(() => path.some((p) => p.rawLatitude != null), [path]);

  // Speed series — GPS chip reports m/s, convert to km/h for display.
  const speedData = useMemo(() => path
    .filter((p) => p.speed != null)
    .map((p) => ({
      label: hhmm(p.at),
      t: ms(p.at),
      kmh: Math.round(p.speed * 3.6 * 10) / 10,
      inside: p.insidePremises !== false,
    })), [path]);
  const hasSpeedData = speedData.length > 0;

  // Donut: time breakdown.
  const donut = useMemo(
    () => [
      { name: 'Inside', value: band.insideSec, color: C.inside },
      { name: 'Outside', value: band.outsideSec, color: C.outside },
      { name: 'Not sharing', value: band.gapSec, color: C.gap },
    ].filter((d) => d.value > 0),
    [band]
  );

  // Minutes outside campus per hour.
  const hourly = useMemo(() => {
    const buckets = {};
    for (const s of band.segments) {
      if (s.state !== 'outside') continue;
      let cur = s.start;
      while (cur < s.end) {
        const h = new Date(cur); h.setMinutes(0, 0, 0);
        const hourEnd = h.getTime() + 3600000;
        buckets[h.getHours()] = (buckets[h.getHours()] || 0) + (Math.min(s.end, hourEnd) - cur) / 1000;
        cur = hourEnd;
      }
    }
    return Object.keys(buckets)
      .map(Number).sort((a, b) => a - b)
      .map((h) => ({ hour: `${String(h).padStart(2, '0')}:00`, min: Math.round(buckets[h] / 60) }));
  }, [band]);

  // Smoothed polyline segments (green = inside, red = outside).
  const runs = useMemo(() => {
    const out = [];
    let cur = null;
    for (const p of path) {
      const inside = p.insidePremises !== false;
      if (!cur || cur.inside !== inside) {
        cur = { inside, pts: [] };
        if (out.length) cur.pts.push(out[out.length - 1].pts.slice(-1)[0]);
        out.push(cur);
      }
      cur.pts.push({ lat: p.latitude, lng: p.longitude });
    }
    return out;
  }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  // Raw GPS polyline (grey dashed) — only pings that have rawLatitude.
  const rawRuns = useMemo(() => {
    const pts = path
      .filter((p) => p.rawLatitude != null && p.rawLongitude != null)
      .map((p) => ({ lat: p.rawLatitude, lng: p.rawLongitude }));
    return pts.length > 1 ? [{ pts }] : [];
  }, [path]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google) return;
    const b = new window.google.maps.LatLngBounds();
    path.forEach((p) => b.extend({ lat: p.latitude, lng: p.longitude }));
    if (premises && (premises.latitude || premises.longitude)) b.extend({ lat: premises.latitude, lng: premises.longitude });
    if (!b.isEmpty()) { mapRef.current.fitBounds(b, 50); if (path.length <= 1) mapRef.current.setZoom(16); }
  }, [isLoaded, report]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinPoint = useCallback((pt) => {
    setFocused(pt);
    if (mapRef.current && window.google && pt) { mapRef.current.panTo({ lat: pt.latitude, lng: pt.longitude }); mapRef.current.setZoom(17); }
  }, []);
  const pinAt = useCallback((t) => {
    if (!path.length) return;
    const near = path.reduce((best, p) => (Math.abs(ms(p.at) - t) < Math.abs(ms(best.at) - t) ? p : best), path[0]);
    pinPoint(near);
  }, [path, pinPoint]);
  const onMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  const currentGap = session.currentGapSeconds;
  const maxDate = localYMD();
  const minDate = localYMD(new Date(Date.now() - 13 * 86400000));
  const name = report?.student?.name || fallbackName || 'Staff member';
  const presencePct = band.total > 0 ? Math.round((band.insideSec / (band.insideSec + band.outsideSec + band.gapSec || 1)) * 100) : null;

  return (
    <div className="w-full min-w-0 space-y-4 lg:space-y-5">
      {/* Glass Header Card */}
      <div className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-4 lg:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <Navigation className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-2xl truncate">
                  {name}
                </h1>
                {session.active != null && (
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${session.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {session.active ? 'LIVE' : 'ENDED'}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                {report?.student?.designation ? `${report.student.designation} · ` : ''}{report?.student?.department || ''}{report?.student?.uid ? ` · ${report.student.uid}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
              <CalendarDays size={14} className="text-slate-400 shrink-0" />
              <input
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              />
            </div>
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-1.5 text-xs font-bold text-white hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="p-6 text-red-600">Failed to load Google Maps. Check the API key.</div>
      ) : loading ? (
        <div className="flex h-[60vh] items-center justify-center text-slate-500">Loading report…</div>
      ) : error ? (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
          <AlertTriangle className="text-red-500" size={28} /><div className="text-red-600">{error}</div>
        </div>
      ) : (
        <div className="w-full min-w-0 space-y-4">
          {/* Currently-not-sharing alert */}
          {currentGap > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300 shadow-xs">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400">
                <WifiOff size={16} />
              </div>
              <div>
                <span className="font-bold text-rose-900 dark:text-rose-200">On duty but not sharing</span> for {fmtDur(currentGap)}. Last fix {hhmm(session.lastFixAt)} — the app may have been closed mid-shift.
              </div>
            </div>
          )}

          {/* KPI strip */}
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
            <Kpi icon={Clock} label="Shared for" value={fmtDur(session.sharingForSeconds)} sub={session.startedAt ? `since ${hhmm(session.startedAt)}` : ''} tone="emerald" />
            <Kpi icon={ShieldAlert} label="On campus" value={presencePct != null ? `${presencePct}%` : '—'} sub={fmtDur(band.insideSec)} tone="amber" />
            <Kpi icon={LogOut} label="Time outside" value={fmtDur(band.outsideSec)} sub={`${stats.breachCount || 0} excursion${stats.breachCount === 1 ? '' : 's'}`} tone="rose" />
            <Kpi icon={WifiOff} label="Not sharing" value={fmtDur(band.gapSec)} sub={`${gaps.length} gap${gaps.length === 1 ? '' : 's'}`} tone="violet" />
            <Kpi icon={Footprints} label="Distance" value={fmtMeters(stats.distanceTraveledM)} sub="walked today" tone="pink" />
            <Kpi icon={Gauge} label="Max speed" value={stats.maxSpeedKmh != null ? `${stats.maxSpeedKmh} km/h` : '—'} sub={stats.avgSpeedKmh != null ? `avg ${stats.avgSpeedKmh} km/h` : 'no speed data'} tone="sky" />
            <Kpi icon={Timer} label="Fixes" value={stats.pingCount || 0} sub="location pings" tone="slate" />
          </div>

          {/* Full-day timeline band */}
          <Card title="Day timeline" icon={Activity}
            right={
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.inside }} /> Inside</span>
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.outside }} /> Outside</span>
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.gap }} /> Not sharing</span>
              </div>
            }>
            {band.segments.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">No activity recorded on this day.</div>
            ) : (
              <>
                <div className="flex h-9 w-full overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
                  {band.segments.map((s, i) => {
                    const w = (s.end - s.start) / band.total * 100;
                    if (w <= 0) return null;
                    return (
                      <button key={i} onClick={() => pinAt((s.start + s.end) / 2)} title={`${hhmm(s.start)}–${hhmm(s.end)} · ${s.state === 'gap' ? 'not sharing' : s.state} · ${fmtDur((s.end - s.start) / 1000)}`}
                        className="h-full transition-opacity hover:opacity-80" style={{ width: `${w}%`, background: C[s.state] }} />
                    );
                  })}
                </div>
                <div className="relative mt-1 h-4">
                  {hourTicks.map((tk, i) => (
                    <span key={i} className="absolute -translate-x-1/2 text-[10px] text-slate-400" style={{ left: `${tk.pct}%` }}>{tk.label}</span>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Charts row */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Distance from campus */}
            <Card
              title="Distance from campus"
              icon={Navigation}
              className="lg:col-span-2"
              right={
                hasRawData ? (
                  <button
                    onClick={() => setShowRaw((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      showRaw
                        ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    <Activity size={12} />
                    {showRaw ? 'Showing Raw GPS' : 'Show Raw GPS'}
                  </button>
                ) : null
              }
            >
              {distData.length > 1 ? (
                <>
                  {showRaw && hasRawData && (
                    <div className="mb-2 flex items-center gap-4 text-[11px] font-medium text-slate-500">
                      <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-5 rounded" style={{ background: C.brand }} /> Kalman Smoothed</span>
                      <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-5 rounded border-t-2 border-dashed border-violet-500" /> Raw GPS</span>
                    </div>
                  )}
                  <div className="h-[230px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={distData} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="distFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={C.brand} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={C.brand} stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="rawFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.18} />
                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" minTickGap={40} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} width={42} />
                        <Tooltip
                          formatter={(v, name) => [fmtMeters(v), name === 'rawDist' ? 'Raw GPS' : 'Kalman Smoothed']}
                          labelStyle={{ color: '#64748b' }}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                        />
                        {premises?.radius ? <ReferenceLine y={premises.radius} stroke="#2563eb" strokeDasharray="5 4" label={{ value: 'campus edge', position: 'insideTopRight', fontSize: 10, fill: '#2563eb' }} /> : null}
                        {/* Smoothed line always visible */}
                        <Area type="monotone" dataKey="dist" stroke={C.brand} strokeWidth={2} fill="url(#distFill)" name="dist" />
                        {/* Raw GPS line visible only when toggle is on */}
                        {showRaw && hasRawData && (
                          <Area type="monotone" dataKey="rawDist" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#rawFill)" name="rawDist" />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="flex h-[230px] items-center justify-center text-sm text-slate-400">Not enough fixes to chart.</div>
              )}
            </Card>

            {/* 2D analog sharing clock */}
            <Card title="Sharing clock (12-hour)" icon={Clock}
              right={<span className="text-[11px] text-slate-400">at real times</span>}>
              <SharingClock
                segments={band.segments}
                startedAt={session.startedAt}
                active={session.active}
                sharingSec={band.insideSec + band.outsideSec}
                notSharingSec={band.gapSec}
              />
            </Card>
          </div>

          {/* Speed over time */}
          {hasSpeedData && (
            <Card title="Speed over time" icon={Gauge} right={<span className="text-[11px] text-slate-400">GPS chip · km/h</span>}>
              <div className="mb-2 flex items-center gap-4 text-[11px] font-medium text-slate-500">
                <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-pink-500" /> Speed (km/h)</span>
                <span className="text-slate-400">· dots coloured by location (green = inside campus, red = outside)</span>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={speedData} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" minTickGap={40} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${v}`} width={36} unit=" k" />
                    <Tooltip
                      formatter={(v) => [`${v} km/h`, 'Speed']}
                      labelStyle={{ color: '#64748b' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                    <ReferenceLine y={5} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: 'walking', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }} />
                    <ReferenceLine y={25} stroke="#dc2626" strokeDasharray="4 3" label={{ value: 'vehicle', position: 'insideTopRight', fontSize: 10, fill: '#dc2626' }} />
                    <Line
                      type="monotone"
                      dataKey="kmh"
                      stroke="#db2777"
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        return <circle key={props.key} cx={cx} cy={cy} r={3} fill={payload.inside ? '#6AA51F' : '#dc2626'} stroke="#fff" strokeWidth={1} />;
                      }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span>Max: <b className="text-slate-700">{stats.maxSpeedKmh ?? '—'} km/h</b></span>
                <span>Avg: <b className="text-slate-700">{stats.avgSpeedKmh ?? '—'} km/h</b></span>
                <span>Readings: <b className="text-slate-700">{stats.speedReadingCount ?? 0}</b></span>
                <span className="ml-auto text-slate-400">0–5 km/h = stationary · 5–25 = walking · &gt;25 = vehicle</span>
              </div>
            </Card>
          )}

          {/* Time breakdown donut + hourly-outside bar */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Time breakdown" icon={Clock}>
              {donut.length ? (
                <div className="relative h-[230px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                        {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [fmtDur(v), n]} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-xl font-extrabold text-slate-900 dark:text-slate-100">{presencePct != null ? `${presencePct}%` : '—'}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">on campus</div>
                  </div>
                </div>
              ) : (
                <div className="flex h-[230px] items-center justify-center text-sm text-slate-400">No data.</div>
              )}
            </Card>

            <Card title="Minutes outside campus, by hour" icon={LogOut}>
              {hourly.length ? (
                <div className="h-[230px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourly} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={28} />
                      <Tooltip formatter={(v) => [`${v} min`, 'Outside']} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="min" fill={C.outside} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[230px] flex-col items-center justify-center gap-1 text-sm text-green-600">
                  <ShieldAlert size={26} /> Stayed within campus all day.
                </div>
              )}
            </Card>
          </div>

          {/* Map + location log row */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Map */}
            <Card title="Movement path" icon={MapPin} className="lg:col-span-3 !p-0 overflow-hidden"
              right={
                hasRawData ? (
                  <button
                    onClick={() => setShowRaw((v) => !v)}
                    className={`mr-3 mt-3 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      showRaw
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Activity size={12} />
                    {showRaw ? 'Raw GPS on' : 'Show Raw GPS'}
                  </button>
                ) : null
              }
            >
              <div className="relative h-[380px] w-full">
                {!isLoaded ? (
                  <div className="flex h-full items-center justify-center text-slate-500">Loading map…</div>
                ) : (
                  <GoogleMap mapContainerStyle={containerStyle} center={premises ? { lat: premises.latitude, lng: premises.longitude } : { lat: 22.97, lng: 78.65 }} zoom={15} onLoad={onMapLoad} options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}>
                    {premises && (premises.latitude || premises.longitude) && (
                      <Circle center={{ lat: premises.latitude, lng: premises.longitude }} radius={premises.radius} options={{ strokeColor: '#2563eb', strokeOpacity: 0.7, strokeWeight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.07, clickable: false }} />
                    )}
                    {/* Kalman-smoothed path — always visible */}
                    {runs.map((r, i) => r.pts.length > 1 ? <Polyline key={i} path={r.pts} options={{ strokeColor: r.inside ? C.inside : C.outside, strokeOpacity: 0.9, strokeWeight: 4 }} /> : null)}
                    {/* Raw GPS path — dashed violet, visible only when toggle is on */}
                    {showRaw && rawRuns.map((r, i) => (
                      <Polyline key={`raw-${i}`} path={r.pts} options={{ strokeColor: '#8b5cf6', strokeOpacity: 0.7, strokeWeight: 2, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }] }} />
                    ))}
                    {path.length > 0 && <Marker position={{ lat: path[0].latitude, lng: path[0].longitude }} label={{ text: 'S', color: '#fff', fontSize: '11px', fontWeight: 'bold' }} title={`Start · ${hhmm(path[0].at)}`} />}
                    {focused && (
                      <Marker position={{ lat: focused.latitude, lng: focused.longitude }} icon={window.google ? { path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: C.brand, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } : undefined}>
                        <InfoWindow position={{ lat: focused.latitude, lng: focused.longitude }} onCloseClick={() => setFocused(null)}>
                          <div style={{ minWidth: 150 }}>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{hhmmss(focused.at)}</div>
                            <div style={{ fontSize: 12, color: focused.insidePremises === false ? '#dc2626' : '#6AA51F', fontWeight: 600 }}>
                              {focused.insidePremises === false ? 'Outside campus' : 'Inside campus'}{focused.distanceM != null ? ` · ${fmtMeters(focused.distanceM)}` : ''}
                            </div>
                          </div>
                        </InfoWindow>
                      </Marker>
                    )}
                  </GoogleMap>
                )}
                {path.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="rounded-xl bg-white/90 px-5 py-3 text-center text-sm text-slate-600 shadow dark:bg-slate-800/90">No location data recorded on this day.</div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Excursions + gaps + log */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Outside-campus excursions" icon={LogOut}>
              <div className="space-y-1.5">
                {(report.outsideSegments || []).length === 0 ? (
                  <div className="rounded-lg px-3 py-2 text-xs text-green-600">Stayed within campus all day.</div>
                ) : report.outsideSegments.map((s, i) => (
                  <button key={i} onClick={() => pinAt((ms(s.startAt) + ms(s.endAt)) / 2)} className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-left hover:bg-red-50 dark:border-red-900/50 dark:bg-red-900/20">
                    <div>
                      <div className="text-sm font-semibold text-red-700 dark:text-red-300">{hhmm(s.startAt)} → {s.ongoing ? 'now' : hhmm(s.endAt)}{s.ongoing ? ' · ongoing' : ''}</div>
                      <div className="text-[11px] text-slate-500">up to {fmtMeters(s.maxDistanceM)} from campus</div>
                    </div>
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">{fmtDur(s.durationSec)}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Not sharing (gaps)" icon={WifiOff}>
              <div className="space-y-1.5">
                {gaps.length === 0 ? (
                  <div className="rounded-lg px-3 py-2 text-xs text-green-600">Shared continuously — no gaps.</div>
                ) : gaps.map((g, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-900/20">
                    <div>
                      <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">{hhmm(g.startAt)} → {g.ongoing ? 'now' : hhmm(g.endAt)}</div>
                      <div className="text-[11px] text-slate-500">{g.kind === 'start' ? 'before first fix' : g.kind === 'now' ? 'still silent' : 'no location received'}</div>
                    </div>
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">{fmtDur(g.durationSec)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Location log" icon={Crosshair} right={<span className="text-[11px] text-slate-400">{path.length} fixes</span>}>
              {path.length === 0 ? (
                <div className="rounded-lg px-3 py-2 text-xs text-slate-400">No fixes recorded.</div>
              ) : (
                <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
                  {path.map((p, i) => {
                    const isFoc = focused && focused.at === p.at;
                    const kmh = p.speed != null ? Math.round(p.speed * 3.6 * 10) / 10 : null;
                    return (
                      <button key={i} onClick={() => pinPoint(p)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left transition ${isFoc ? 'border-[#FF6B35] bg-orange-50 dark:bg-orange-900/20' : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'}`}>
                        <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><Crosshair size={13} className="text-slate-400" /> {hhmmss(p.at)}</span>
                        <span className="flex items-center gap-2">
                          {kmh != null && <span className="text-[11px] text-slate-400">{kmh} km/h</span>}
                          <span className={`text-xs font-semibold ${p.insidePremises === false ? 'text-red-600' : 'text-green-600'}`}>{p.insidePremises === false ? 'Outside' : 'Inside'}<span className="ml-1 font-normal text-slate-400">{p.distanceM != null ? fmtMeters(p.distanceM) : ''}</span></span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div className="pb-2 text-center text-[11px] text-slate-400">
            {report.isToday ? 'Live day — Refresh for new fixes.' : 'Historical day.'} Click a timeline segment, chart point, or log row to locate it on the map.
          </div>
        </div>
      )}
    </div>
  );
}
