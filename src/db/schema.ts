import { appSchema, tableSchema } from '@nozbe/watermelondb';

// Local cache for read-mostly server data (profile/org/WFH, leave/field/checkout
// requests, attendance history+stats). Each table keeps a couple of indexed
// columns for filtering/sorting plus a `payload` JSON blob holding the full
// server record as-is — the backend response shapes drift and get patched with
// `it.a || it.b` fallbacks all over the app (see RequestScreen.tsx), so a rigid
// column-per-field schema would need constant migrations. `server_id` is the
// backend `_id`/`id` used to upsert instead of duplicating rows on refetch.
export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      // TTL bookkeeping: one row per cache "domain" (e.g. 'leave_requests',
      // 'holidays_2026-07') recording when it was last successfully synced
      // from the server. The read-through cache in api.ts checks this before
      // deciding whether to skip the network call entirely — this is the
      // actual load-reduction mechanism, separate from the earlier
      // cache-then-refresh (instant-paint-only) work.
      name: 'sync_meta',
      columns: [
        { name: 'key', type: 'string', isIndexed: true },
        { name: 'synced_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'holidays',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'date', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'timetable_rows',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      // One row per queried date — class-checkin log is "today's operational
      // state", fetched per-day.
      name: 'class_checkins',
      columns: [
        { name: 'date_key', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'spot_check_history',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'memos',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'outreach_activities',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'profiles',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'organizations',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'wfh_status',
      columns: [
        // Singleton row keyed by owner uid so multi-account/device-share
        // scenarios don't collide.
        { name: 'owner_uid', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'leave_requests',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'start_date', type: 'string' },
        { name: 'end_date', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'field_requests',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'start_date', type: 'string' },
        { name: 'end_date', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'checkout_requests',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'date', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'attendance_records',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'mark_type', type: 'string' },
        { name: 'timestamp', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'attendance_stats',
      columns: [
        // e.g. "2026-07" or a filter-hash — one cached row per queried period.
        { name: 'period_key', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
