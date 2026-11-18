import { Q } from '@nozbe/watermelondb';
import { database } from '../index';
import { Holiday, TimetableRow } from '../models';

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

async function saveByDateKey(tableName: string, dateKey: string, payload: any): Promise<void> {
  const collection = database.get<any>(tableName);
  const now = Date.now();
  await database.write(async () => {
    const existing = await collection.query(Q.where('date_key', dateKey)).fetch();
    if (existing.length > 0) {
      await existing[0].update((model: any) => {
        model._setRaw('payload', JSON.stringify(payload));
        model._setRaw('updated_at', now);
      });
    } else {
      await collection.create((model: any) => {
        model._setRaw('date_key', dateKey);
        model._setRaw('payload', JSON.stringify(payload));
        model._setRaw('updated_at', now);
      });
    }
  });
}

async function getByDateKey(tableName: string, dateKey: string): Promise<any | null> {
  const rows = await database.get<any>(tableName).query(Q.where('date_key', dateKey)).fetch();
  return rows[0]?.payload ?? null;
}

// Holidays — a full-year list, refetched and replaced wholesale each sync
// (getHolidays() filters client-side, so we cache the unfiltered `all` array).
export async function saveHolidays(records: any[]): Promise<void> {
  await replaceAllList('holidays', records);
}

export async function getCachedHolidays(): Promise<any[]> {
  const rows = await database.get<Holiday>('holidays').query().fetch();
  return rows.map((r) => r.payload).filter(Boolean);
}

// Timetable — a per-semester-ish list of class slots.
export async function saveTimetableRows(records: any[]): Promise<void> {
  await replaceAllList('timetable_rows', records);
}

export async function getCachedTimetableRows(): Promise<any[]> {
  const rows = await database.get<TimetableRow>('timetable_rows').query().fetch();
  return rows.map((r) => r.payload).filter(Boolean);
}

// Class-checkin log is "today's operational state" fetched per date — one
// cached row per date queried.
export async function saveClassCheckinLog(dateKey: string, payload: any): Promise<void> {
  await saveByDateKey('class_checkins', dateKey, payload);
}
export async function getCachedClassCheckinLog(dateKey: string): Promise<any | null> {
  return getByDateKey('class_checkins', dateKey);
}
