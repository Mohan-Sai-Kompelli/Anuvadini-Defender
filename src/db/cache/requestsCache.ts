import { Q } from '@nozbe/watermelondb';
import { database } from '../index';
import { LeaveRequest, FieldRequest, CheckoutRequest } from '../models';

// Leave/field/checkout request history, cached for RequestScreen's
// stale-while-revalidate read (show cache instantly, then overwrite from the
// server response). Personal request history tops out at a few hundred rows
// per user at most, so a full wipe-and-reinsert per sync is simpler and safer
// than diffing — there's no risk of an unbounded table growing forever.

function extractServerId(record: any): string {
  return String(record._id || record.id || record.serverId || '');
}

async function replaceAll(tableName: string, records: any[], extraColumns: (r: any) => Record<string, any>): Promise<void> {
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
          const extras = extraColumns(r);
          for (const [col, val] of Object.entries(extras)) {
            model._setRaw(col, val ?? '');
          }
        }),
      );
    await database.batch(...deletes, ...creates);
  });
}

export async function saveLeaveRequests(records: any[]): Promise<void> {
  await replaceAll('leave_requests', records, (r) => ({
    status: r.status || 'pending',
    start_date: r.startDate || r.leaveDates?.start || r.fromDate || '',
    end_date: r.endDate || r.leaveDates?.end || r.toDate || '',
  }));
}

export async function getCachedLeaveRequests(): Promise<any[]> {
  const rows = await database.get<LeaveRequest>('leave_requests').query(Q.sortBy('start_date', Q.desc)).fetch();
  return rows.map((r) => r.payload).filter(Boolean);
}

export async function saveFieldRequests(records: any[]): Promise<void> {
  await replaceAll('field_requests', records, (r) => ({
    status: r.status || 'pending',
    start_date: r.startDate || r.fromDate || '',
    end_date: r.endDate || r.toDate || '',
  }));
}

export async function getCachedFieldRequests(): Promise<any[]> {
  const rows = await database.get<FieldRequest>('field_requests').query(Q.sortBy('start_date', Q.desc)).fetch();
  return rows.map((r) => r.payload).filter(Boolean);
}

export async function saveCheckoutRequests(records: any[]): Promise<void> {
  await replaceAll('checkout_requests', records, (r) => ({
    status: r.status || 'pending',
    date: r.date || '',
  }));
}

export async function getCachedCheckoutRequests(): Promise<any[]> {
  const rows = await database.get<CheckoutRequest>('checkout_requests').query(Q.sortBy('date', Q.desc)).fetch();
  return rows.map((r) => r.payload).filter(Boolean);
}
