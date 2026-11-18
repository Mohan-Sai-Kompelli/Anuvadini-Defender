import { database } from '../index';
import { SpotCheckHistory, Memo, OutreachActivity } from '../models';

function extractServerId(record: any): string {
  return String(record._id || record.id || '');
}

async function replaceAllList(tableName: string, records: any[]): Promise<void> {
  const collection = database.get<any>(tableName);
  const now = Date.now();
  await database.write(async () => {
    const existing = await collection.query().fetch();
    const deletes = existing.map((r: any) => r.prepareDestroyPermanently());
    const creates = records
      .filter((r) => extractServerId(r))
      .map((r) =>
        collection.prepareCreate((model: any) => {
          model._setRaw('server_id', extractServerId(r));
          model._setRaw('payload', JSON.stringify(r));
          model._setRaw('updated_at', now);
        }),
      );
    await database.batch(...deletes, ...creates);
  });
}

// Note: this is spot-check HISTORY (getMySpotChecks — past responses + stats
// for SpotCheckHistoryScreen), never the *pending* mandatory-verification
// check. The pending poll (SpotCheckBanner, every 15s) is intentionally left
// alone — it has to stay live for the fraud-detection gate to mean anything;
// caching/TTL-gating it would just let someone stall past a spot-check.
//
// The real response shape is { stats, recent } (a summary object, not a list
// of individually-identified items), so — unlike leave/field/checkout
// requests — this is cached as ONE singleton payload (a single row, keyed
// fixed as 'current'), not a replaceAll'd list keyed by server_id. An
// earlier version of this tried to force it into the list shape via
// extractRequestArray(['history','records','spotChecks']) — none of which
// exist on the real payload, so it silently cached nothing and the
// then-cache-hit path returned `{history: []}`, which the screen (reading
// `.stats`/`.recent`) would have shown as empty even with real cached data.
export async function saveSpotCheckHistory(payload: any): Promise<void> {
  const collection = database.get<SpotCheckHistory>('spot_check_history');
  const now = Date.now();
  await database.write(async () => {
    const existing = await collection.query().fetch();
    if (existing.length > 0) {
      await existing[0].update((m) => {
        m._setRaw('server_id', 'current');
        m._setRaw('payload', JSON.stringify(payload));
        m._setRaw('updated_at', now);
      });
      for (const dupe of existing.slice(1)) await dupe.destroyPermanently();
    } else {
      await collection.create((m) => {
        m._setRaw('server_id', 'current');
        m._setRaw('payload', JSON.stringify(payload));
        m._setRaw('updated_at', now);
      });
    }
  });
}
export async function getCachedSpotCheckHistory(): Promise<any | null> {
  const rows = await database.get<SpotCheckHistory>('spot_check_history').query().fetch();
  return rows[0]?.payload ?? null;
}

export async function saveMemos(records: any[]): Promise<void> {
  await replaceAllList('memos', records);
}
export async function getCachedMemos(): Promise<any[]> {
  const rows = await database.get<Memo>('memos').query().fetch();
  return rows.map((r) => r.payload).filter(Boolean);
}

export async function saveOutreachActivities(records: any[]): Promise<void> {
  await replaceAllList('outreach_activities', records);
}
export async function getCachedOutreachActivities(): Promise<any[]> {
  const rows = await database.get<OutreachActivity>('outreach_activities').query().fetch();
  return rows.map((r) => r.payload).filter(Boolean);
}
