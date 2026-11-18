import axios from 'axios';

// Local YYYY-MM-DD (avoids the UTC shift of toISOString in non-UTC zones).
export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Fetch the REAL class-checkin status for a set of dates and return a map keyed
// by `${timetableId}_${YYYY-MM-DD}`.  mode: 'faculty' → the logged-in faculty's
// own classes; otherwise the org/HOD-scoped log. Endpoints are optional — any
// failure just leaves that date out, and callers fall back to deterministic
// evidence so the UI never breaks.
export async function fetchWeekLog(dates, mode = 'org') {
  const url = mode === 'faculty' ? '/api/portal/my/teaching-log' : '/api/class-checkins/log';
  const map = {};
  await Promise.all(
    dates.map(async (d) => {
      const ds = ymd(d);
      try {
        const res = await axios.get(url, { params: { date: ds } });
        (res.data.rows || []).forEach((r) => {
          map[`${r.timetableId}_${ds}`] = r;
        });
      } catch {
        /* endpoint unavailable — fall back to deterministic evidence */
      }
    })
  );
  return map;
}

// Full uploaded evidence (photos, note, geo) for one class on one date.
export async function fetchEvidence(timetableId, date, mode = 'org') {
  const url =
    mode === 'faculty'
      ? `/api/portal/my/class-evidence/${timetableId}`
      : `/api/class-checkins/evidence/${timetableId}`;
  try {
    const res = await axios.get(url, { params: { date: ymd(date) } });
    return res.data.evidence || null;
  } catch {
    return null;
  }
}
