import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Circle, Polyline } from '@react-google-maps/api';
import {
  MapPin, RefreshCw, Send, Users, AlertTriangle, Radio, Clock, Search,
  LogOut, LogIn, Route, Footprints, ShieldAlert, ShieldCheck, CalendarDays,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { portalAPI } from '../services/api';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const LIBRARIES = [];
const POLL_MS = 15000;
const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 };
const containerStyle = { width: '100%', height: '100%' };

const fmtDuration = (s) => {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const ageLabel = (s) => (s == null ? 'unknown' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`);
const fmtMeters = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
const initialsOf = (n) => (n || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Local 'YYYY-MM-DD' (avoids the UTC shift of toISOString in IST).
const ymdLocal = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
// Date range for a history view mode. 'day' = the picked day; week/month end today.
const rangeFor = (mode, day) => {
  if (mode === 'day') return { from: day, to: day };
  const today = new Date();
  const back = mode === 'week' ? 6 : 29;
  const f = new Date(today);
  f.setDate(f.getDate() - back);
  return { from: ymdLocal(f), to: ymdLocal(today) };
};

const statusMeta = (p) =>
  p.stale
    ? { color: '#9ca3af', label: 'Stale', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' }
    : p.outsidePremises
      ? { color: '#dc2626', label: 'Outside', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
      : { color: '#6AA51F', label: 'Inside', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' };

function StatCard({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    green: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30',
    red: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 border-rose-100 dark:border-rose-900/30',
    blue: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-400 border-sky-100 dark:border-sky-900/30',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border-amber-100 dark:border-amber-900/30',
    slate: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300 dark:hover:border-slate-700">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-extrabold leading-none text-slate-900 dark:text-slate-100 tabular-nums">
          {value}
        </div>
        <div className="mt-0.5 truncate text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {label}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, valueClass = 'text-slate-800 dark:text-slate-100' }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="flex items-center gap-2 text-slate-500"><Icon size={14} /> {label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

export default function LiveLocationMap() {
  const navigate = useNavigate();
  const { isLoaded, loadError } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries: LIBRARIES });

  const [points, setPoints] = useState([]);
  const [premises, setPremises] = useState(null);
  const [summary, setSummary] = useState({});
  const [scope, setScope] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [trail, setTrail] = useState([]);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('staff');
  // 'live' = current sharers; 'day'|'week'|'month' = past locations from breadcrumbs.
  const [viewMode, setViewMode] = useState('live');
  const [histDate, setHistDate] = useState(() => ymdLocal(new Date()));
  const [histRange, setHistRange] = useState(null);
  const isHistory = viewMode !== 'live';

  const mapRef = useRef(null);
  const didFitRef = useRef(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeDept, setComposeDept] = useState('');
  const [sending, setSending] = useState(false);

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [loc, al] = await Promise.all([portalAPI.getLiveLocations(), portalAPI.getGeofenceAlerts(60)]);
      if (loc && loc.success) {
        setPoints(Array.isArray(loc.data) ? loc.data : []);
        setPremises(loc.premises || null);
        setSummary(loc.summary || {});
        setScope(loc.scope || '');
        setError('');
        setLastRefreshed(new Date());
      } else {
        setError((loc && loc.error) || 'Failed to load live locations');
      }
      if (al && al.success) setAlerts(Array.isArray(al.data) ? al.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load live locations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Past locations: one marker per staff at their latest fix in the range.
  const fetchHistory = useCallback(async (mode, day) => {
    setLoading(true);
    try {
      const { from, to } = rangeFor(mode, day);
      const res = await portalAPI.getLocationHistory({ from, to });
      if (res && res.success) {
        setPoints(Array.isArray(res.data) ? res.data : []);
        setPremises(res.premises || null);
        setSummary(res.summary || {});
        setScope(res.scope || '');
        setHistRange(res.range || { from, to });
        setError('');
        setLastRefreshed(new Date());
      } else {
        setError((res && res.error) || 'Failed to load location history');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load location history');
    } finally {
      setLoading(false);
    }
  }, []);

  // Live mode polls; history mode fetches once per range change.
  useEffect(() => {
    if (viewMode !== 'live') return undefined;
    fetchAll(true);
    const id = setInterval(() => fetchAll(false), POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll, viewMode]);

  useEffect(() => {
    if (viewMode === 'live') return;
    didFitRef.current = false; // refit map to the historical points
    fetchHistory(viewMode, histDate);
  }, [viewMode, histDate, fetchHistory]);

  // Switch view, clearing any selected staff/trail and forcing a refit.
  const changeMode = (m) => {
    setSelected(null);
    setTrail([]);
    didFitRef.current = false;
    setViewMode(m);
  };

  // Keep the selected user's data fresh from each poll.
  useEffect(() => {
    if (selected) {
      const updated = points.find((p) => p.studentId === selected.studentId);
      if (updated) setSelected(updated);
    }
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoaded || !mapRef.current || didFitRef.current || !window.google) return;
    if (!points.length && !premises) return;
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    if (premises && (premises.latitude || premises.longitude)) bounds.extend({ lat: premises.latitude, lng: premises.longitude });
    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, 80);
      if (points.length <= 1) mapRef.current.setZoom(15);
      didFitRef.current = true;
    }
  }, [isLoaded, points, premises]);

  const onMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  const markerIcon = useCallback((p) => {
    if (!window.google) return undefined;
    return { path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: statusMeta(p).color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 };
  }, []);

  // Load the day's trail for a selected user.
  const loadTrail = useCallback(async (studentId, date) => {
    setTrail([]);
    try {
      const res = await portalAPI.getLiveTrail(studentId, date);
      if (res && res.success) setTrail((res.path || []).map((pt) => ({ lat: pt.latitude, lng: pt.longitude })));
    } catch {
      /* trail is best-effort */
    }
  }, []);

  const focusUser = useCallback((p) => {
    setSelected(p);
    // In history mode, replay the trail for the day this person was last seen.
    loadTrail(p.studentId, isHistory ? ymdLocal(p.lastFixAt || histDate) : undefined);
    if (mapRef.current && window.google) {
      mapRef.current.panTo({ lat: p.latitude, lng: p.longitude });
      mapRef.current.setZoom(16);
    }
  }, [loadTrail, isHistory, histDate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? points.filter((p) => `${p.name} ${p.uid} ${p.department}`.toLowerCase().includes(q)) : points;
    // Outside first, then longest-sharing.
    return [...list].sort((a, b) => (b.outsidePremises === a.outsidePremises ? (b.sharingForSeconds || 0) - (a.sharingForSeconds || 0) : b.outsidePremises ? 1 : -1));
  }, [points, query]);

  const handleSend = async () => {
    if (!composeBody.trim()) { toast.error('Enter a message to send'); return; }
    setSending(true);
    try {
      const payload = { title: composeTitle.trim() || undefined, body: composeBody.trim() };
      if (composeDept.trim()) payload.department = composeDept.trim();
      const res = await portalAPI.sendClassNotification(payload);
      if (res && res.success) {
        toast.success(`Notification sent to ${res.sent} staff member(s)`);
        setComposeOpen(false); setComposeTitle(''); setComposeBody(''); setComposeDept('');
      } else toast.error((res && res.error) || 'Failed to send notification');
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Failed to send notification');
    } finally { setSending(false); }
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="p-6">
        <div className="max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={20} /> Google Maps API key not configured</div>
          <p className="mt-2 text-sm">
            Add <code className="rounded bg-amber-100 px-1">REACT_APP_GOOGLE_MAPS_API_KEY</code> to
            <code className="ml-1 rounded bg-amber-100 px-1">client/.env</code> and restart the dev server.
            Enable the <b>Maps JavaScript API</b> for that key in Google Cloud Console.
          </p>
        </div>
      </div>
    );
  }
  if (loadError) return <div className="p-6 text-red-600">Failed to load Google Maps. Check the API key and that the Maps JavaScript API is enabled.</div>;

  const sel = selected;
  return (
    <div className="w-full min-w-0 space-y-4 lg:space-y-5">
      {/* Header Card */}
      <div className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-4 lg:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-2xl truncate">
                {isHistory ? 'Staff Location History' : 'Live Staff Map'}
              </h1>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                {scope === 'organization' ? 'Whole institution' : scope?.startsWith('department') ? `Department: ${scope.split(':')[1] || ''}` : ''}
                {isHistory && histRange ? ` · ${histRange.from}${histRange.to !== histRange.from ? ` → ${histRange.to}` : ''}` : ''}
                {lastRefreshed ? ` · Updated ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                {premises ? ` · Geofence ${premises.radius} m` : ' · No premises geofence set'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 overflow-x-auto pb-1 sm:pb-0">
            {/* Date filter (first when Day is selected) */}
            {viewMode === 'day' && (
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-800">
                <CalendarDays size={14} className="text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={histDate}
                  max={ymdLocal(new Date())}
                  onChange={(e) => {
                    setSelected(null);
                    setTrail([]);
                    didFitRef.current = false;
                    setHistDate(e.target.value);
                  }}
                  className="w-28 bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                />
              </div>
            )}

            {/* View switcher */}
            <div className="flex items-center gap-0.5 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800/80">
              {[
                ['live', 'Live'],
                ['day', 'Day'],
                ['week', 'Week'],
                ['month', 'Month'],
              ].map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => changeMode(m)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${viewMode === m
                      ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => (isHistory ? fetchHistory(viewMode, histDate) : fetchAll(true))}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>

            <button
              onClick={() => setComposeOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 text-xs font-bold text-white hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <Send size={13} /> Notify Staff
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Main Map & Sidebar Workspace */}
      <div className="flex flex-col lg:flex-row overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 h-[calc(100vh-14.5rem)] min-h-[580px]">
        {/* Map */}
        <div className="relative w-full lg:flex-1 h-[320px] lg:h-auto shrink-0 lg:shrink">
          {!isLoaded ? (
            <div className="flex h-full items-center justify-center text-slate-500">Loading map…</div>
          ) : (
            <GoogleMap mapContainerStyle={containerStyle} center={INDIA_CENTER} zoom={5} onLoad={onMapLoad} options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}>
              {premises && (premises.latitude || premises.longitude) && (
                <Circle
                  center={{ lat: premises.latitude, lng: premises.longitude }}
                  radius={premises.radius}
                  options={{ strokeColor: '#2563eb', strokeOpacity: 0.7, strokeWeight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.08, clickable: false }}
                />
              )}

              {sel && trail.length > 1 && (
                <Polyline path={trail} options={{ strokeColor: '#7c3aed', strokeOpacity: 0.9, strokeWeight: 3 }} />
              )}

              {points.map((p) => (
                <Marker key={p.studentId} position={{ lat: p.latitude, lng: p.longitude }} title={p.name} icon={markerIcon(p)} onClick={() => focusUser(p)} />
              ))}

              {sel && (
                <InfoWindow position={{ lat: sel.latitude, lng: sel.longitude }} onCloseClick={() => { setSelected(null); setTrail([]); }}>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{sel.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{sel.designation || sel.role}{sel.department ? ` · ${sel.department}` : ''}</div>
                    <div style={{ fontSize: 12, marginTop: 4, color: sel.outsidePremises ? '#dc2626' : '#6AA51F', fontWeight: 600 }}>
                      {statusMeta(sel).label}{sel.distanceM != null ? ` · ${fmtMeters(sel.distanceM)} from campus` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
                      {isHistory
                        ? `Last seen ${sel.lastFixAt ? new Date(sel.lastFixAt).toLocaleString() : '—'} · ${sel.fixes || 0} fixes`
                        : `Sharing ${fmtDuration(sel.sharingForSeconds)} · ${ageLabel(sel.ageSeconds)}`}
                    </div>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          )}

          {isLoaded && !loading && points.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto rounded-xl bg-white/90 px-6 py-4 text-center shadow dark:bg-slate-800/90">
                <Users className="mx-auto mb-1 text-slate-400" size={28} />
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {isHistory ? 'No location history for this period' : 'No staff currently on duty'}
                </div>
                <div className="text-xs text-slate-500">
                  {isHistory ? 'No GPS breadcrumbs were recorded in this range (kept ~14 days).' : 'Live points appear after staff check in.'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col w-full lg:w-[360px] border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 flex-1 lg:flex-none min-h-0 lg:h-auto">
          <div className="grid grid-cols-2 gap-2 p-3 shrink-0">
            {isHistory ? (
              <>
                <StatCard icon={Users} label="Staff seen" value={summary.total || 0} tone="blue" />
                <StatCard icon={Route} label="GPS fixes" value={summary.totalFixes || 0} tone="green" />
                <StatCard icon={ShieldAlert} label="Outside campus" value={summary.outside || 0} tone="red" />
                <StatCard icon={Clock} label="Range" value={viewMode === 'day' ? '1 day' : viewMode === 'week' ? '7 days' : '30 days'} tone="slate" />
              </>
            ) : (
              <>
                <StatCard icon={Users} label="On duty" value={summary.total || 0} tone="blue" />
                <StatCard icon={Radio} label="Live now" value={summary.live || 0} tone="green" />
                <StatCard icon={ShieldAlert} label="Outside now" value={summary.outsideNow || 0} tone="red" />
                <StatCard icon={LogOut} label="Breaches today" value={summary.breachesToday || 0} tone="amber" />
              </>
            )}
          </div>

          {/* Selected-user detail */}
          {sel && (
            <div className="mx-4 mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 shrink-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{sel.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{sel.designation || sel.role}{sel.department ? ` · ${sel.department}` : ''}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusMeta(sel).cls} shrink-0`}>{statusMeta(sel).label}</span>
              </div>
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/40">
                {isHistory ? (
                  <>
                    <DetailRow icon={MapPin} label="Distance from campus" value={fmtMeters(sel.distanceM)} valueClass={sel.outsidePremises ? 'text-red-600' : 'text-slate-800 dark:text-slate-100'} />
                    <DetailRow icon={Clock} label="Last seen" value={sel.lastFixAt ? new Date(sel.lastFixAt).toLocaleString() : '—'} />
                    <DetailRow icon={Route} label="GPS fixes in range" value={sel.fixes || 0} />
                  </>
                ) : (
                  <>
                    <DetailRow icon={MapPin} label="Distance from campus" value={fmtMeters(sel.distanceM)} valueClass={sel.outsidePremises ? 'text-red-600' : 'text-slate-800 dark:text-slate-100'} />
                    <DetailRow icon={LogOut} label="Time outside today" value={fmtDuration(sel.outsideSecondsToday)} />
                    <DetailRow icon={ShieldAlert} label="Breaches today" value={sel.breachCountToday || 0} valueClass={sel.breachCountToday ? 'text-amber-600' : 'text-slate-800 dark:text-slate-100'} />
                    <DetailRow icon={Footprints} label="Distance walked today" value={fmtMeters(sel.distanceTraveledM)} />
                    <DetailRow icon={Clock} label="Sharing for" value={fmtDuration(sel.sharingForSeconds)} />
                    <DetailRow icon={Route} label="Last fix" value={ageLabel(sel.ageSeconds)} />
                  </>
                )}
              </div>
              <div className="mt-3 text-[11px] text-violet-600 font-semibold">
                {trail.length > 1
                  ? `Showing ${isHistory ? 'that day’s' : "today's"} path (${trail.length} points)`
                  : `No path recorded ${isHistory ? 'that day' : 'yet today'}`}
              </div>
              <button
                onClick={() => navigate(`/staff-location-report/${sel.studentId}`, { state: { name: sel.name } })}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#FF6B35] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#e85d2a] shadow-sm transition-all duration-150 cursor-pointer animate-fade-in"
              >
                <Route size={14} /> View full report
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2.5 px-4 pb-3 shrink-0">
            <button onClick={() => setTab('staff')} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${tab === 'staff' ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              Staff ({filtered.length})
            </button>
            <button onClick={() => setTab('alerts')} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${tab === 'alerts' ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-355 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              Alerts ({alerts.length})
            </button>
          </div>

          {tab === 'staff' && (
            <>
              <div className="px-4 pb-3 shrink-0">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2 dark:border-slate-800 dark:bg-slate-900">
                  <Search size={16} className="text-slate-400" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff…" className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-500 dark:text-slate-300" />
                </div>
              </div>
              {/* onWheel stopPropagation: Google Maps attaches its own wheel
                  listener for zoom that can otherwise swallow scroll events
                  bubbling from this adjacent panel, leaving mouse-wheel
                  scroll dead here even though the scrollbar drag still works
                  (the container itself scrolls fine -- only wheel input was
                  being intercepted before it reached this element). */}
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4" onWheel={(e) => e.stopPropagation()}>
                {filtered.map((p) => {
                  const m = statusMeta(p);
                  const isSel = sel && sel.studentId === p.studentId;
                  return (
                    <button key={p.studentId} onClick={() => focusUser(p)} className={`flex w-full items-center gap-4 rounded-2xl border p-3.5 text-left transition-all duration-200 cursor-pointer ${isSel ? 'border-green-450 bg-green-50/50 dark:bg-green-950/20 dark:border-green-905/30' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50 shadow-sm'}`}>
                      <div className="relative shrink-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">{initialsOf(p.name)}</div>
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900" style={{ background: m.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                        <div className="truncate text-[11px] text-slate-500 mt-1">{p.department || p.role}{p.breachCountToday ? ` · ${p.breachCountToday} breach${p.breachCountToday > 1 ? 'es' : ''}` : ''}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${m.cls}`}>{m.label}</span>
                        <div className="mt-1 text-[10px] text-slate-450 dark:text-slate-500 font-semibold">{fmtMeters(p.distanceM)}</div>
                      </div>
                    </button>
                  );
                })}
                {!filtered.length && <div className="px-1 py-8 text-center text-xs text-slate-400">No staff sharing location right now.</div>}
              </div>
            </>
          )}

          {tab === 'alerts' && (
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4" onWheel={(e) => e.stopPropagation()}>
              {alerts.map((a) => (
                <div key={a.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.type === 'exit' ? 'bg-red-100 text-red-600 dark:bg-red-900/40' : 'bg-green-100 text-green-600 dark:bg-green-900/40'}`}>
                    {a.type === 'exit' ? <LogOut size={16} /> : <LogIn size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{a.name}</div>
                    <div className="truncate text-[11px] text-slate-500 mt-1">
                      {a.type === 'exit' ? 'Left premises' : 'Returned'}{a.distanceM != null ? ` · ${fmtMeters(a.distanceM)}` : ''}{a.department ? ` · ${a.department}` : ''}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold shrink-0">{new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))}
              {!alerts.length && (
                <div className="flex flex-col items-center px-1 py-10 text-center text-xs text-slate-400">
                  <ShieldCheck className="mb-2 text-green-500" size={28} /> No premises breaches recorded.
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Compose dialog */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setComposeOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Send notification to staff</h2>
            <p className="mt-1 text-xs text-slate-500">Pushed to staff devices. Leave department blank to notify everyone in scope.</p>
            <div className="mt-4 space-y-3">
              <input value={composeTitle} onChange={(e) => setComposeTitle(e.target.value)} placeholder="Title (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
              <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="Message…" rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
              <input value={composeDept} onChange={(e) => setComposeDept(e.target.value)} placeholder="Department (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setComposeOpen(false)} disabled={sending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">Cancel</button>
              <button onClick={handleSend} disabled={sending} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Send size={15} /> {sending ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
