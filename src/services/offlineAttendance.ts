/**
 * Offline-first attendance store.
 *
 * The app marks attendance against the LIVE server first. If that fails because
 * the device is offline (network error / timeout), the mark is saved on-device
 * and replayed automatically the next time we're online — so a check-in/out is
 * NEVER lost and the on-screen status survives a flaky connection (this is what
 * was breaking checkout: a failed request used to wipe the check-in state).
 *
 * Storage is AsyncStorage (a persistent on-device key-value DB that's already
 * integrated). It gives us the same offline-first guarantees you'd get from
 * SQLite — local persistence, a sync queue, and load-from-local — without adding
 * a native database module to the New-Architecture build.
 *
 *   - cacheTodayRecords / getCachedTodayRecords  → the server's records, cached
 *   - enqueueMark / getQueue                     → marks awaiting sync
 *   - mergedTodayRecords                         → cache + pending (what the UI shows)
 *   - flushQueue                                 → replay the queue to the server
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from './api';

const QUEUE_KEY = 'offlineAttendanceQueue_v1';
const CACHE_KEY = 'attendanceTodayCache_v1';

export type PendingMark = {
  id: string;
  type: 'in' | 'out';
  latitude: number;
  longitude: number;
  authMethod: string;
  faceImage?: any;
  timestamp: string; // ISO
};

const parse = (s: string | null, fb: any) => {
  try {
    return s ? JSON.parse(s) : fb;
  } catch {
    return fb;
  }
};
const todayStr = () => new Date().toDateString();
const isToday = (ts: any) => {
  try {
    return new Date(ts).toDateString() === todayStr();
  } catch {
    return false;
  }
};

/** Is this a connectivity failure (→ queue offline) vs a server rejection (→ show)? */
export const isNetworkError = (msg?: string): boolean => {
  if (!msg) return true; // no message usually means the request never reached the server
  const m = String(msg).toLowerCase();
  return (
    m.includes('network request failed') ||
    m.includes('network error') ||
    m.includes('failed to fetch') ||
    m.includes('timed out') ||
    m.includes('timeout') ||
    m.includes('connection') ||
    m.includes('unable to resolve host') ||
    m.includes('could not connect') ||
    m.includes('unexpected html') // domain served the SPA/proxy fallback instead of the API
  );
};

/* ───────── cache (the server's today records) ───────── */
export async function cacheTodayRecords(records: any[]): Promise<void> {
  try {
    const todays = (records || []).filter((r) => isToday(r?.timestamp));
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ date: todayStr(), records: todays }));
  } catch {
    /* non-fatal */
  }
}

export async function getCachedTodayRecords(): Promise<any[]> {
  const obj = parse(await AsyncStorage.getItem(CACHE_KEY), null);
  if (!obj || obj.date !== todayStr()) return []; // none, or stale (a new day)
  return Array.isArray(obj.records) ? obj.records : [];
}

/* ───────── pending sync queue ───────── */
export async function getQueue(): Promise<PendingMark[]> {
  const q = parse(await AsyncStorage.getItem(QUEUE_KEY), []);
  return Array.isArray(q) ? q : [];
}

async function setQueue(q: PendingMark[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function enqueueMark(m: Omit<PendingMark, 'id'>): Promise<PendingMark> {
  const q = await getQueue();
  const item: PendingMark = { ...m, id: `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}` };
  q.push(item);
  await setQueue(q);
  return item;
}

/** Today's pending marks shaped like attendance records (for the UI list). */
export function pendingAsRecords(q: PendingMark[]): any[] {
  return (q || [])
    .filter((p) => isToday(p?.timestamp))
    .map((p) => ({
      id: p.id,
      type: p.type,
      timestamp: p.timestamp,
      latitude: p.latitude,
      longitude: p.longitude,
      authMethod: p.authMethod,
      status: 'pending',
      _pending: true,
    }));
}

/**
 * The "today" view the UI derives check-in/out status from: server records
 * (passed in, or the cache) PLUS any pending marks not already present.
 */
export async function mergedTodayRecords(serverRecords?: any[]): Promise<any[]> {
  const base = serverRecords != null ? serverRecords : await getCachedTodayRecords();
  const pend = pendingAsRecords(await getQueue());
  const typesPresentToday = new Set(
    (base || []).filter((r) => isToday(r?.timestamp)).map((r) => r?.type)
  );
  const fresh = pend.filter((p) => !typesPresentToday.has(p.type));
  return [...(base || []), ...fresh];
}

/**
 * Replay queued marks to the live server. Each success is removed; a server
 * rejection (e.g. geofence) is dropped (it would never succeed); a connectivity
 * failure stops the run and keeps the rest for next time.
 */
export async function flushQueue(): Promise<{ synced: number; remaining: number }> {
  const q = await getQueue();
  if (!q.length) return { synced: 0, remaining: 0 };
  let synced = 0;
  const drop = new Set<string>();
  for (const item of q) {
    let res: any;
    try {
      res = await apiService.markAttendance({
        type: item.type,
        latitude: item.latitude,
        longitude: item.longitude,
        authMethod: item.authMethod as any,
        faceImage: item.faceImage,
      });
    } catch (e: any) {
      res = { success: false, error: e?.message || 'network' };
    }
    if (res && res.success) {
      synced += 1;
      drop.add(item.id);
      continue;
    }
    if (res && isNetworkError(res.error)) break; // still offline — stop, keep the rest
    drop.add(item.id); // server rejected — won't ever succeed, drop it
  }
  const remaining = q.filter((x) => !drop.has(x.id));
  await setQueue(remaining);
  return { synced, remaining: remaining.length };
}

export async function pendingCount(): Promise<number> {
  return (await getQueue()).length;
}
