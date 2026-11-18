import { Q } from '@nozbe/watermelondb';
import { database } from '../index';
import { Profile, Organization, WfhStatus } from '../models';

// Read-through cache: profile/organization/WFH status. All three arrive
// together off the login/lookup response and off `/auth/me` refreshes, so
// they're upserted together. Each table keeps exactly one row per uid/orgId —
// upsert-by-server_id, never append, since this is "latest known state", not
// a history log.

async function upsertSingleton(
  tableName: string,
  keyColumn: string,
  keyValue: string,
  payload: any,
): Promise<void> {
  const collection = database.get<any>(tableName);
  const existing = await collection.query(Q.where(keyColumn, keyValue)).fetch();
  const now = Date.now();

  await database.write(async () => {
    if (existing.length > 0) {
      await existing[0].update((record: any) => {
        record._setRaw('payload', JSON.stringify(payload));
        record._setRaw('updated_at', now);
      });
      // Defensive cleanup: shouldn't normally happen since we always upsert,
      // but guards against duplicate rows from a pre-fix version of this cache.
      for (const dupe of existing.slice(1)) {
        await dupe.destroyPermanently();
      }
    } else {
      await collection.create((record: any) => {
        record._setRaw(keyColumn, keyValue);
        record._setRaw('payload', JSON.stringify(payload));
        record._setRaw('updated_at', now);
      });
    }
  });
}

export async function saveProfile(uid: string, payload: any): Promise<void> {
  if (!uid || !payload) return;
  await upsertSingleton('profiles', 'server_id', uid, payload);
}

export async function getCachedProfile(uid: string): Promise<any | null> {
  if (!uid) return null;
  const rows = await database.get<Profile>('profiles').query(Q.where('server_id', uid)).fetch();
  return rows[0]?.payload ?? null;
}

export async function saveOrganization(orgId: string, payload: any): Promise<void> {
  if (!orgId || !payload) return;
  await upsertSingleton('organizations', 'server_id', orgId, payload);
}

export async function getCachedOrganization(orgId: string): Promise<any | null> {
  if (!orgId) return null;
  const rows = await database.get<Organization>('organizations').query(Q.where('server_id', orgId)).fetch();
  return rows[0]?.payload ?? null;
}

export async function saveWfhStatus(ownerUid: string, payload: any): Promise<void> {
  if (!ownerUid || !payload) return;
  await upsertSingleton('wfh_status', 'owner_uid', ownerUid, payload);
}

export async function getCachedWfhStatus(ownerUid: string): Promise<any | null> {
  if (!ownerUid) return null;
  const rows = await database.get<WfhStatus>('wfh_status').query(Q.where('owner_uid', ownerUid)).fetch();
  return rows[0]?.payload ?? null;
}
