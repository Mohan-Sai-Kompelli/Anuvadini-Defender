import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import {
  Profile,
  Organization,
  WfhStatus,
  LeaveRequest,
  FieldRequest,
  CheckoutRequest,
  AttendanceRecord,
  AttendanceStat,
  SyncMeta,
  Holiday,
  TimetableRow,
  ClassCheckin,
  SpotCheckHistory,
  Memo,
  OutreachActivity,
} from './models';

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'nats_attendance_cache',
  jsi: true,
  onSetUpError: (error) => {
    console.error('[db] WatermelonDB setup failed:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    Profile,
    Organization,
    WfhStatus,
    LeaveRequest,
    FieldRequest,
    CheckoutRequest,
    AttendanceRecord,
    AttendanceStat,
    SyncMeta,
    Holiday,
    TimetableRow,
    ClassCheckin,
          SpotCheckHistory,
    Memo,
    OutreachActivity,
  ],
});

// Most cache tables (leave/field/checkout requests, attendance history,
// holidays, timetable, memos, ...) have NO per-user column —
// they hold "whoever is currently logged in"'s data, wiped-and-replaced on
// each sync. That's fine for one account on one device, but on a SHARED
// device (borrowed/replacement phone) it means a second person logging in
// could see the first person's still-"fresh" cached data for up to the TTL
// window, without a single network call happening to correct it (the whole
// point of the TTL skip is to avoid that call). Call this on every logout
// AND defensively before writing a freshly-logged-in profile that doesn't
// match whatever uid was cached before, so no cross-account data can survive
// an account switch on the same phone.
export async function resetLocalCache(): Promise<void> {
  try {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  } catch (e: any) {
    console.warn('[db] resetLocalCache failed:', e?.message);
  }
}
