// Helpers for the "log only during the activity ± buffer" rule.

// Local-time ms for a 'YYYY-MM-DD' + 'HH:MM' (matches classCheckins' slotEnded()).
function hhmmToMs(dateISO, hhmm) {
  return new Date(`${dateISO}T${hhmm}:00`).getTime();
}

const pad = (s) => (s.length === 4 ? `0${s}` : s); // '9:00' -> '09:00'

// Parse a free-text shift like 'Morning (09:00 – 13:00)' into { start, end }.
function parseShiftTimes(shift) {
  const m = /(\d{1,2}:\d{2})\s*(?:–|—|-|to)\s*(\d{1,2}:\d{2})/i.exec(String(shift || ''));
  if (!m) return null;
  return { start: pad(m[1]), end: pad(m[2]) };
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/**
 * Is `now` within [start - buffer, end + buffer] on the given date?
 * @returns {{ ok: boolean, start: string, end: string, bufferMin: number }}
 */
function withinWindow(dateISO, startHHMM, endHHMM, bufferMin, now = new Date()) {
  const buf = bufferMin * 60 * 1000;
  const winStart = hhmmToMs(dateISO, startHHMM) - buf;
  const winEnd = hhmmToMs(dateISO, endHHMM) + buf;
  const t = now.getTime();
  return { ok: t >= winStart && t <= winEnd, start: startHHMM, end: endHHMM, bufferMin };
}

module.exports = { hhmmToMs, parseShiftTimes, toMinutes, withinWindow };
