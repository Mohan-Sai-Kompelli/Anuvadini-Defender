// Mobile lets an outreach/field request carry an exact time-of-day (full day,
// half day, or a custom "out at X, back at Y" window) baked directly into
// startDate/endDate as full ISO datetimes — there's no separate "durationType"
// field, so the window has to be inferred from the times themselves. Some
// older records only ever stored a bare date (no time), which JS/Mongo treat
// as UTC midnight — reading that back with native Date.getHours() shows
// whatever the VIEWER'S BROWSER's OS timezone happens to be (e.g. 5:30 AM in
// an IST browser), not the intended midnight. Always resolve times through
// Asia/Kolkata explicitly so the result is the same regardless of where the
// dashboard is opened from.
const IST_TZ = "Asia/Kolkata";

const getISTParts = (date) => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl can return "24" for midnight with hour12:false in some engines.
    hour: parts.hour === "24" ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
  };
};

const formatISTDate = (date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: IST_TZ, day: "2-digit", month: "2-digit", year: "numeric" })
    .format(date)
    .replace(/\//g, "-");

const formatISTTime = (date) => {
  const time = new Intl.DateTimeFormat("en-US", { timeZone: IST_TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  // Zero-pad the hour ("5:30 AM" -> "05:30 AM") to match the rest of the UI.
  return time.replace(/^(\d):/, "0$1:");
};

// Compact "Jun 23" style, used in table cells alongside formatISTTime.
export const formatISTMonthDay = (dateStr) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Invalid Date";
  return new Intl.DateTimeFormat("en-US", { timeZone: IST_TZ, month: "short", day: "2-digit" }).format(d);
};

export const formatISTClockTime = (dateStr) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Invalid Date";
  return formatISTTime(d);
};

// "Jun 23, 2026" style, IST calendar date regardless of viewer's browser tz.
export const formatISTFullDate = (dateStr) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Invalid Date";
  return new Intl.DateTimeFormat("en-US", { timeZone: IST_TZ, month: "short", day: "2-digit", year: "numeric" }).format(d);
};

const HALF_DAY_WINDOWS = [
  { key: "first", startH: 9, startM: 0, endH: 13, endM: 30 },
  { key: "second", startH: 13, startM: 30, endH: 18, endM: 0 },
];

const detectHalfDay = (startParts, endParts) =>
  HALF_DAY_WINDOWS.find(
    (w) =>
      startParts.hour === w.startH && startParts.minute === w.startM &&
      endParts.hour === w.endH && endParts.minute === w.endM
  )?.key || null;

const classify = (startDateStr, endDateStr) => {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const sp = getISTParts(start);
  const ep = getISTParts(end);
  const sameDay = sp.year === ep.year && sp.month === ep.month && sp.day === ep.day;
  // Some old/legacy records only ever stored ONE bare date reused for both
  // start and end — there was never a real "time out / time in" captured.
  // Showing a fabricated identical time range for those is worse than
  // showing nothing, so treat an exact instant match as "no time info".
  const noTimeInfo = start.getTime() === end.getTime();
  const isFullDay = sameDay && !noTimeInfo && sp.hour === 0 && sp.minute === 0 && ep.hour >= 23;
  const halfDay = sameDay && !noTimeInfo && !isFullDay ? detectHalfDay(sp, ep) : null;

  return { start, end, sameDay, noTimeInfo, isFullDay, halfDay };
};

export const describeRequestWindow = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return "—";
  const c = classify(startDateStr, endDateStr);
  if (!c) return "—";

  if (!c.sameDay) {
    return `${formatISTDate(c.start)} to ${formatISTDate(c.end)}`;
  }
  if (c.noTimeInfo) {
    return formatISTDate(c.start);
  }
  if (c.isFullDay) {
    return `${formatISTDate(c.start)} (Full day)`;
  }
  if (c.halfDay) {
    return `${formatISTDate(c.start)} — Half day (${c.halfDay === "second" ? "second half" : "first half"}), ${formatISTTime(c.start)} – ${formatISTTime(c.end)}`;
  }
  return `${formatISTDate(c.start)}, ${formatISTTime(c.start)} – ${formatISTTime(c.end)}`;
};

// True for any same-day window that isn't a full day and DOES carry real
// time info (covers both half-day and arbitrary custom-time requests) — used
// to decide whether to also show a day-count suffix (multi-day/full-day) or
// not (single-day windows), and whether to fabricate a time-range display.
export const isCustomTimeWindow = (startDateStr, endDateStr) => {
  const c = classify(startDateStr, endDateStr);
  return !!c && c.sameDay && !c.isFullDay && !c.noTimeInfo;
};

export const isHalfDayWindow = (startDateStr, endDateStr) => {
  const c = classify(startDateStr, endDateStr);
  return !!c?.halfDay;
};
