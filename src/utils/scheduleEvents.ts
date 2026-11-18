import { apiService } from '../services/api';

export type SchedEvent = {
  kind: 'class';
  id: string;
  title: string;
  subtype: string; // lecture/practical/clinical
  start: string;
  end: string;
  location: string;
  status: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const weekdayIdx = (s: string) => (parseISO(s).getDay() + 6) % 7; // 0=Mon..5=Sat
export const nowHHMM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const isDone = (s: string) => s === 'conducted' || s === 'completed';

/**
 * Today's (or any date's) class events for the logged-in faculty,
 * merged + sorted by start time. Shared by the Schedule screen and the
 * Attendance landing page.
 */
export async function loadDayEvents(
  dateISO: string,
  meIdHint?: string | null,
  forceRefresh = false
): Promise<{ events: SchedEvent[]; meId: string | null }> {
  let meId = meIdHint || null;
  if (!meId) {
    const prof = await apiService.getPortalProfile();
    meId = prof.success ? prof.data?.profile?.id || null : null;
  }

  const out: SchedEvent[] = [];

  // Classes scheduled on this weekday, with today's check-in status.
  const tt = await apiService.getMyTimetable(forceRefresh);
  const rows: any[] = tt.success ? tt.data?.rows || [] : [];
  const wd = weekdayIdx(dateISO);
  const statusByTt: Record<string, any> = {};
  try {
    const log = await apiService.getClassCheckinLog(dateISO, forceRefresh);
    if (log.success)
      (log.data?.rows || []).forEach((r: any) => {
        if (r.timetableId) statusByTt[String(r.timetableId)] = r;
      });
  } catch {
    // non-fatal
  }
  rows
    .filter((r) => r.day === wd)
    .forEach((s) =>
      out.push({
        kind: 'class',
        id: String(s.id),
        title: s.subject,
        subtype: s.type,
        start: s.start,
        end: s.end,
        location: s.room || '',
        status: statusByTt[String(s.id)]?.status || 'upcoming',
      })
    );

  out.sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
  return { events: out, meId };
}
