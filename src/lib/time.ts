/**
 * Timezone helpers. Every location runs on its own clock, so "today" and
 * "due at 10:30" have to be resolved against the location's timezone rather
 * than the server's.
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function wallClockIn(timeZone: string, at: Date = new Date()): WallClock {
  const parts = formatter(timeZone).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Intl renders midnight as "24" in some engines.
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** The timezone's UTC offset in minutes at the given instant. */
function offsetMinutes(timeZone: string, at: Date): number {
  const w = wallClockIn(timeZone, at);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return (asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000;
}

/**
 * Converts a wall-clock time in `timeZone` to the matching UTC instant.
 * Resolves the offset twice so DST transition days land correctly.
 */
export function zonedTimeToUtc(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hour = 0,
  minute = 0,
): Date {
  const naive = Date.UTC(y, m - 1, d, hour, minute);
  let guess = new Date(naive - offsetMinutes(timeZone, new Date(naive)) * 60000);
  guess = new Date(naive - offsetMinutes(timeZone, guess) * 60000);
  return guess;
}

/**
 * The location's current business date, stored as UTC midnight so Postgres
 * `date` columns compare cleanly across timezones.
 */
export function businessDate(timeZone: string, at: Date = new Date()): Date {
  const w = wallClockIn(timeZone, at);
  return new Date(Date.UTC(w.year, w.month - 1, w.day));
}

export function businessDateKey(timeZone: string, at: Date = new Date()): string {
  const w = wallClockIn(timeZone, at);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** Parses "HH:mm" into minutes past local midnight. */
export function parseClock(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":");
  return { hour: Number(h) || 0, minute: Number(m) || 0 };
}

/** The instant a schedule is due on a given local day. */
export function scheduleDueAt(
  timeZone: string,
  day: Date,
  dueTime: string,
): Date {
  const { hour, minute } = parseClock(dueTime);
  return zonedTimeToUtc(
    timeZone,
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    hour,
    minute,
  );
}

/** 0 = Sunday .. 6 = Saturday, in the location's timezone. */
export function localDayOfWeek(timeZone: string, at: Date = new Date()): number {
  const w = wallClockIn(timeZone, at);
  return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const target = typeof date === "string" ? new Date(date) : date;
  const diff = target.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of TIME_UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}
