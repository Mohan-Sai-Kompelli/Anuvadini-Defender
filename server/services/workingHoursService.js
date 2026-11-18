/**
 * WorkingHoursService
 * -------------------
 * Computes the live-location tracking window from an organization/location's
 * working hours, so location sharing runs for the WHOLE working day (auto-start
 * on check-in, auto-stop at end-of-hours) instead of a manual share session.
 *
 * `workingHours` shape: { start: 'HH:MM', end: 'HH:MM' } (see OrganizationManagement).
 * Pure functions → unit-testable.
 */

const DEFAULT_SHIFT_HOURS = parseInt(process.env.DEFAULT_SHIFT_HOURS || '8', 10);

/** Parse 'HH:MM' into {h, m}, or null if malformed. */
function parseHHMM(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/**
 * When should live tracking stop, given the working hours and the check-in time?
 * - If working hours define an `end` and it is after `now` today → that time.
 * - Otherwise (no/old config, or a late check-in past end) → now + DEFAULT_SHIFT_HOURS.
 *
 * Uses IST (UTC+5:30) to determine "today's" calendar date so a check-in at
 * 00:xx IST (= previous day in UTC) correctly resolves to that IST calendar day.
 *
 * @param {Object} workingHours { start?, end? }
 * @param {Date} now check-in time
 * @returns {{ trackUntil: Date, basis: 'working_hours' | 'default_shift', shiftHours: number }}
 */
function trackUntil(workingHours, now = new Date()) {
  const end = parseHHMM(workingHours?.end);
  if (end) {
    // Build the end-of-day in IST (UTC+5:30) so that a midnight check-in
    // (which is UTC-previous-day) still tracks until end of the IST working day.
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in ms
    const nowInIst = new Date(now.getTime() + IST_OFFSET_MS);
    // IST year/month/date:
    const istY = nowInIst.getUTCFullYear();
    const istM = nowInIst.getUTCMonth();
    const istD = nowInIst.getUTCDate();
    // Build the end time as a UTC timestamp: IST midnight + end hours/minutes.
    const endOfDayIst = new Date(Date.UTC(istY, istM, istD, end.h, end.m, 0, 0) - IST_OFFSET_MS);
    if (endOfDayIst.getTime() > now.getTime()) {
      return { trackUntil: endOfDayIst, basis: 'working_hours', shiftHours: null };
    }
  }
  // Fallback: end of the IST working day (18:30) on the same IST calendar date.
  // This prevents a midnight-IST check-in from getting an 8-hour window that
  // expires at 08:30 IST, stopping GPS before the actual working day even starts.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowInIst = new Date(now.getTime() + IST_OFFSET_MS);
  const istY = nowInIst.getUTCFullYear();
  const istM = nowInIst.getUTCMonth();
  const istD = nowInIst.getUTCDate();
  const endOfDayIst = new Date(Date.UTC(istY, istM, istD, 18, 30, 0, 0) - IST_OFFSET_MS);
  if (endOfDayIst.getTime() > now.getTime()) {
    return { trackUntil: endOfDayIst, basis: 'default_shift', shiftHours: DEFAULT_SHIFT_HOURS };
  }
  // Already past 18:30 IST — shift to end of next IST day.
  const t = new Date(Date.UTC(istY, istM, istD + 1, 18, 30, 0, 0) - IST_OFFSET_MS);
  return { trackUntil: t, basis: 'default_shift', shiftHours: DEFAULT_SHIFT_HOURS };
}

module.exports = { trackUntil, parseHHMM, DEFAULT_SHIFT_HOURS };
