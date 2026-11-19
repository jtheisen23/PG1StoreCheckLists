/**
 * PG1's fiscal calendar: thirteen periods of four weeks, each period Monday to
 * Sunday. Leadership talks in periods ("Period 12 · Week 2"), so the dashboard
 * does too.
 *
 * Anchored on the walkthrough's own dates — Period 12 ran Mon Nov 2 to Sun
 * Nov 29, 2026 — which puts period 1 of that year on Mon Dec 29, 2025. A
 * 52-week year rolls straight on into the next; a year that takes a 53rd week
 * needs its start added to FISCAL_YEAR_STARTS.
 */
import { shiftDateKey } from "./time";

export const PERIOD_DAYS = 28;
export const PERIODS_PER_YEAR = 13;

/** The first day of each fiscal year, oldest first. Later years roll on in 364-day steps. */
export const FISCAL_YEAR_STARTS = ["2025-12-29"];

const DAY_MS = 86_400_000;
const toDays = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / DAY_MS;

export interface Period {
  /** The fiscal year, named for the calendar year most of it falls in. */
  year: number;
  number: number;
  start: string;
  end: string;
  /** 1–28. */
  day: number;
  /** 1–4. */
  week: number;
}

function yearStartFor(key: string): string {
  const days = toDays(key);
  let start = FISCAL_YEAR_STARTS[0];
  for (const candidate of FISCAL_YEAR_STARTS) {
    if (toDays(candidate) <= days) start = candidate;
  }
  // Roll on (or back) in whole 52-week years from the latest known start.
  while (toDays(start) + PERIOD_DAYS * PERIODS_PER_YEAR <= days) {
    start = shiftDateKey(start, PERIOD_DAYS * PERIODS_PER_YEAR);
  }
  while (toDays(start) > days) {
    start = shiftDateKey(start, -PERIOD_DAYS * PERIODS_PER_YEAR);
  }
  return start;
}

export function periodFor(key: string): Period {
  const yearStart = yearStartFor(key);
  const offset = toDays(key) - toDays(yearStart);
  const index = Math.min(PERIODS_PER_YEAR - 1, Math.floor(offset / PERIOD_DAYS));
  const start = shiftDateKey(yearStart, index * PERIOD_DAYS);
  // A 53-week year's extra week stays in period 13.
  const length = index === PERIODS_PER_YEAR - 1 ? Math.max(PERIOD_DAYS, offset - index * PERIOD_DAYS + 1) : PERIOD_DAYS;
  const day = offset - index * PERIOD_DAYS + 1;
  return {
    year: +shiftDateKey(yearStart, 7).slice(0, 4),
    number: index + 1,
    start,
    end: shiftDateKey(start, length - 1),
    day,
    week: Math.floor((day - 1) / 7) + 1,
  };
}

export const RANGE_KEYS = ["today", "wtd", "ptd", "lp"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  wtd: "Week to date",
  ptd: "Period to date",
  lp: "Last period",
};

export interface DateRange {
  from: string;
  to: string;
}

/** The days a range covers, and the like-for-like range it is compared with. */
export function rangeFor(key: RangeKey, today: string): { range: DateRange; previous: DateRange; versus: string } {
  const days = (r: DateRange) => toDays(r.to) - toDays(r.from);
  switch (key) {
    case "today":
      return {
        range: { from: today, to: today },
        previous: { from: shiftDateKey(today, -1), to: shiftDateKey(today, -1) },
        versus: "vs yesterday",
      };
    case "wtd": {
      const monday = shiftDateKey(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
      const range = { from: monday, to: today };
      return {
        range,
        previous: { from: shiftDateKey(monday, -7), to: shiftDateKey(monday, -7 + days(range)) },
        versus: "vs same days last week",
      };
    }
    case "ptd": {
      const period = periodFor(today);
      const range = { from: period.start, to: today };
      const before = periodFor(shiftDateKey(period.start, -1));
      return {
        range,
        previous: { from: before.start, to: shiftDateKey(before.start, days(range)) },
        versus: "vs same days last period",
      };
    }
    case "lp": {
      const last = periodFor(shiftDateKey(periodFor(today).start, -1));
      const before = periodFor(shiftDateKey(last.start, -1));
      return {
        range: { from: last.start, to: last.end },
        previous: { from: before.start, to: before.end },
        versus: "vs the period before",
      };
    }
  }
}

/** Every date key from one to another, inclusive. */
export function daysBetween(range: DateRange): string[] {
  const out: string[] = [];
  for (let key = range.from; key <= range.to; key = shiftDateKey(key, 1)) out.push(key);
  return out;
}
