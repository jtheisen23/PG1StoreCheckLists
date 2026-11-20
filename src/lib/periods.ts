/**
 * PG1's fiscal calendar: every period is exactly 28 days and starts on a
 * Monday, thirteen to a year, with no long periods and no 53rd week — so the
 * calendar is one unbroken run of 28-day blocks. Leadership talks in periods
 * ("Period 12 · Week 2"), so the dashboard does too.
 *
 * Anchored on the date PG1 gave: Mon Jan 4, 2027 is day 1 of period 1 of
 * 2027. Every other period, before or after, follows from that one date —
 * period 1 of 2026 began Mon Jan 5, 2026, and period 12 of 2026 runs
 * Nov 9 – Dec 6.
 */
import { shiftDateKey } from "./time";

export const PERIOD_DAYS = 28;
export const PERIODS_PER_YEAR = 13;

/** The first day of a fiscal year: a Monday. Every period is counted from it. */
export const FISCAL_ANCHOR = "2027-01-04";

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

export function periodFor(key: string): Period {
  const offset = toDays(key) - toDays(FISCAL_ANCHOR);
  // Whole periods since the anchor, rounding down for dates before it.
  const index = Math.floor(offset / PERIOD_DAYS);
  const start = shiftDateKey(FISCAL_ANCHOR, index * PERIOD_DAYS);
  const number = (((index % PERIODS_PER_YEAR) + PERIODS_PER_YEAR) % PERIODS_PER_YEAR) + 1;
  const yearStart = shiftDateKey(start, -(number - 1) * PERIOD_DAYS);
  const day = toDays(key) - toDays(start) + 1;
  return {
    year: +shiftDateKey(yearStart, 7).slice(0, 4),
    number,
    start,
    end: shiftDateKey(start, PERIOD_DAYS - 1),
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
