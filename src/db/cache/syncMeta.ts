import { Q } from '@nozbe/watermelondb';
import { database } from '../index';
import { SyncMeta } from '../models';

// The actual load-reduction mechanism. Every cache write in this feature also
// stamps a `sync_meta` row (one per logical "domain" — e.g. 'leave_requests',
// 'holidays', or a per-date key like 'class_checkins:2026-07-26'). Before a
// cached API method hits the network, it calls isFresh(key, ttlMs) — if the
// domain synced within the TTL window, the network call is skipped entirely
// and the cached rows are returned as-is. This is distinct from (and layered
// on top of) the earlier cache-then-refresh work, which always re-fetched and
// only improved perceived load time, not actual call volume.

export async function markSynced(key: string): Promise<void> {
  const collection = database.get<SyncMeta>('sync_meta');
  const now = Date.now();
  await database.write(async () => {
    const existing = await collection.query(Q.where('key', key)).fetch();
    if (existing.length > 0) {
      await existing[0].update((m) => {
        m._setRaw('synced_at', now);
      });
    } else {
      await collection.create((m) => {
        m._setRaw('key', key);
        m._setRaw('synced_at', now);
      });
    }
  });
}

export async function isFresh(key: string, ttlMs: number): Promise<boolean> {
  const collection = database.get<SyncMeta>('sync_meta');
  const rows = await collection.query(Q.where('key', key)).fetch();
  if (rows.length === 0) return false;
  return Date.now() - rows[0].syncedAt < ttlMs;
}
