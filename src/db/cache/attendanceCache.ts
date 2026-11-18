import { Q } from '@nozbe/watermelondb';
import { database } from '../index';
import { AttendanceRecord, AttendanceStat } from '../models';

// Attendance history is append-mostly (old marks never change once made), so
// unlike requests we upsert by server_id instead of wiping the table — this
// keeps months of history around locally without re-fetching it, and a
// refetch of "recent" history just fills in/updates the latest rows.

function extractServerId(record: any): string {
  return String(record._id || record.id || '');
}

export async function saveAttendanceRecords(records: any[]): Promise<void> {
  const collection = database.get<AttendanceRecord>('attendance_records');
  const now = Date.now();
  const withIds = records.filter((r) => extractServerId(r));
  if (withIds.length === 0) return;

  await database.write(async () => {
    const ids = withIds.map(extractServerId);
    const existing = await collection.query(Q.where('server_id', Q.oneOf(ids))).fetch();
    const existingById = new Map(existing.map((r) => [r.serverId, r]));

    const ops = withIds.map((r) => {
      const id = extractServerId(r);
      const found = existingById.get(id);
      if (found) {
        return found.prepareUpdate((model) => {
          model._setRaw('payload', JSON.stringify(r));
          model._setRaw('updated_at', now);
        });
      }
      return collection.prepareCreate((model) => {
        model._setRaw('server_id', id);
        model._setRaw('mark_type', r.type || '');
        model._setRaw('timestamp', r.timestamp || r.createdAt || '');
        model._setRaw('payload', JSON.stringify(r));
        model._setRaw('updated_at', now);
      });
    });
    await database.batch(...ops);
  });
}

export async function getCachedAttendanceRecords(limit = 100): Promise<any[]> {
  const rows = await database
    .get<AttendanceRecord>('attendance_records')
    .query(Q.sortBy('timestamp', Q.desc), Q.take(limit))
    .fetch();
  return rows.map((r) => r.payload).filter(Boolean);
}

export async function saveAttendanceStats(periodKey: string, payload: any): Promise<void> {
  if (!periodKey || !payload) return;
  const collection = database.get<AttendanceStat>('attendance_stats');
  const now = Date.now();

  await database.write(async () => {
    const existing = await collection.query(Q.where('period_key', periodKey)).fetch();
    if (existing.length > 0) {
      await existing[0].update((model) => {
        model._setRaw('payload', JSON.stringify(payload));
        model._setRaw('updated_at', now);
      });
    } else {
      await collection.create((model) => {
        model._setRaw('period_key', periodKey);
        model._setRaw('payload', JSON.stringify(payload));
        model._setRaw('updated_at', now);
      });
    }
  });
}

export async function getCachedAttendanceStats(periodKey: string): Promise<any | null> {
  if (!periodKey) return null;
  const rows = await database.get<AttendanceStat>('attendance_stats').query(Q.where('period_key', periodKey)).fetch();
  return rows[0]?.payload ?? null;
}
