import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

/** All Defender traffic goes through the authenticated Anuvadini gateway. */
const BASE = '/api/defender';

export const dget = (path, params, signal) =>
  axios.get(`${BASE}/${path}`, { params, signal }).then((r) => {
    let d = r.data;
    if (path === 'fleet' || (typeof path === 'string' && path.startsWith('fleet'))) {
      if (d && !Array.isArray(d)) {
        if (Array.isArray(d.workstations)) return d.workstations;
        if (Array.isArray(d.fleet)) return d.fleet;
        return [];
      }
    }
    if (path === 'violations' || (typeof path === 'string' && path.startsWith('violations'))) {
      if (d && !Array.isArray(d)) {
        if (Array.isArray(d.violations)) return d.violations;
        if (Array.isArray(d.logs)) return d.logs;
        return [];
      }
    }
    return d;
  });
export const dpost = (path, body) => axios.post(`${BASE}/${path}`, body ?? {}).then((r) => r.data);
export const ddelete = (path) => axios.delete(`${BASE}/${path}`).then((r) => r.data);

export const errorText = (e, fallback = 'Something went wrong. Please try again.') => {
  const d = e?.response?.data;
  if (e?.response?.status === 503) return 'The Defender engine is not running.';
  return (d && (d.message || d.detail || d.error)) || fallback;
};

/** Runs an action with a toast; resolves true/false. */
export async function act(promise, okMsg) {
  try {
    const r = await promise;
    if (okMsg) toast.success(okMsg);
    return r ?? true;
  } catch (e) {
    toast.error(errorText(e));
    return false;
  }
}

/** Downloads a gateway file with the admin token (plain links cannot send it). */
export async function downloadFile(path, filename, params) {
  try {
    const r = await axios.get(`${BASE}/${path}`, { params, responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    toast.error(errorText(e, 'Download failed.'));
  }
}

/* ── Shared freshness store: lets the top bar show engine state and the last good refresh ── */
let snap = { online: null, lastOk: 0, failing: false };
const listeners = new Set();
const setSnap = (patch) => {
  const next = { ...snap, ...patch };
  if (next.online === snap.online && next.lastOk === snap.lastOk && next.failing === snap.failing) return;
  snap = next;
  listeners.forEach((l) => l());
};
export const useFreshness = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snap);

/**
 * Polling data hook. Keeps the last good value while a refresh fails (`stale` is then true).
 * `interval` in ms (0 = once). Never runs two requests at once, cancels on unmount / param
 * change, pauses while the tab is hidden and refreshes immediately when it becomes visible again.
 */
export function useDefender(path, { params, interval = 0, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled, updatedAt: 0 });
  const key = JSON.stringify(params || {});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !path) return undefined;
    let cancelled = false;
    let inflight = false;
    let ctrl = null;
    const run = () => {
      if (inflight || cancelled) return;
      inflight = true;
      ctrl = new AbortController();
      dget(path, params, ctrl.signal)
        .then((data) => {
          if (cancelled) return;
          setState({ data, error: null, loading: false, updatedAt: Date.now() });
          setSnap({ lastOk: Date.now(), failing: false });
        })
        .catch((error) => {
          if (cancelled || axios.isCancel(error)) return;
          setState((s) => ({ ...s, error, loading: false }));
          setSnap({ failing: true });
        })
        .finally(() => { inflight = false; });
    };
    setState((s) => ({ ...s, loading: s.data == null }));
    run();
    let id;
    if (interval) id = setInterval(() => { if (!document.hidden) run(); }, interval);
    const onVis = () => { if (!document.hidden && interval) run(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      if (ctrl) ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, interval, enabled, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, stale: !!state.error && state.data != null, refresh };
}

/** Fetches an authenticated image repeatedly and exposes it as a blob URL. */
export function useLiveImage(path, { interval = 2500, enabled = true } = {}) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState(0);
  const last = useRef(null);
  useEffect(() => {
    if (!enabled || !path) return undefined;
    let cancelled = false;
    let busy = false;
    const run = async () => {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const r = await axios.get(`${BASE}/${path}`, { params: { t: Date.now() }, responseType: 'blob' });
        if (cancelled) return;
        const url = URL.createObjectURL(r.data);
        if (last.current) URL.revokeObjectURL(last.current);
        last.current = url;
        setSrc(url); setFailed(false); setAt(Date.now());
      } catch (_) { if (!cancelled) setFailed(true); }
      busy = false;
    };
    run();
    const id = setInterval(run, interval);
    return () => { cancelled = true; clearInterval(id); if (last.current) { URL.revokeObjectURL(last.current); last.current = null; } };
  }, [path, interval, enabled]);
  return { src, failed, at };
}

/* ── Engine status shared by every Defender page ── */
const StatusCtx = createContext({ online: null, health: null, recheck: () => {} });

export function DefenderStatusProvider({ children }) {
  const [s, setS] = useState({ online: null, health: null });
  const check = useCallback(() => {
    dget('gateway/status')
      .then((d) => { setS({ online: !!d.online, health: d.health || null, autostart: d.autostart }); setSnap({ online: !!d.online }); })
      .catch(() => { setS((p) => ({ ...p, online: false })); setSnap({ online: false }); });
  }, []);
  useEffect(() => {
    check();
    const id = setInterval(() => { if (!document.hidden) check(); }, 10000);
    return () => clearInterval(id);
  }, [check]);
  return createElement(StatusCtx.Provider, { value: { ...s, recheck: check } }, children);
}
export const useEngineStatus = () => useContext(StatusCtx);

/* ── formatting ── */
export const parseTs = (ts) => (ts ? new Date(String(ts).replace(' ', 'T')) : null);
export function ago(ts) {
  const d = parseTs(ts);
  if (!d || Number.isNaN(d.getTime())) return 'Unknown';
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 10) return 'Just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const fmtDateTime = (ts) => {
  const d = parseTs(ts);
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
};
export const fmtSecs = (s) => {
  const n = Math.round(Number(s) || 0);
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m ${n % 60}s`;
  return `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m`;
};

export const secondsAgo = (t) => (t ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null);
