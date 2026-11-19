/**
 * Execution: what a store owed against what it did, day by day. Pure, so the
 * dashboard's numbers can be checked by a test rather than by eye.
 *
 * A store owes every active, published schedule that lands on that day of the
 * week — checklists and weight logs alike, because a weight log is a
 * checklist. The denominator is always derived from the schedules, never
 * stored: a stored count and a derived one drift apart. A walk counts when it
 * was submitted for that schedule on that business day; a voided one never
 * reaches here.
 *
 * Today is judged so far: a checklist not yet due does not count against the
 * store, unless it is already done. Otherwise every morning would read as a
 * fleet in trouble.
 *
 * The close rating is not here and never will be: it is a gate, not a score.
 */
import { parseClock } from "./time";

export interface ScheduleSlot {
  id: string;
  locationIds: string[];
  daysOfWeek: number[];
  dueTime: string;
  /** The day the schedule was created: it owes nothing before then. */
  createdKey: string;
}

export interface StoreClock {
  id: string;
  /** The store's business date now, on its own clock. */
  todayKey: string;
  /** Minutes past local midnight now. */
  nowMinutes: number;
}

export interface StoreDay {
  due: number;
  done: number;
}

export const doneKey = (locationId: string, scheduleId: string, dayKey: string) =>
  `${locationId}|${scheduleId}|${dayKey}`;

function dayOfWeek(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** Owed and done, per store per day, for the given days. */
export function storeDays(
  stores: StoreClock[],
  schedules: ScheduleSlot[],
  done: Set<string>,
  days: string[],
): Map<string, Map<string, StoreDay>> {
  const byStore = new Map<string, ScheduleSlot[]>();
  for (const schedule of schedules) {
    for (const id of schedule.locationIds) {
      byStore.set(id, [...(byStore.get(id) ?? []), schedule]);
    }
  }

  const out = new Map<string, Map<string, StoreDay>>();
  for (const store of stores) {
    const perDay = new Map<string, StoreDay>();
    for (const day of days) {
      const tally = { due: 0, done: 0 };
      if (day <= store.todayKey) {
        const dow = dayOfWeek(day);
        for (const schedule of byStore.get(store.id) ?? []) {
          if (!schedule.daysOfWeek.includes(dow) || schedule.createdKey > day) continue;
          const completed = done.has(doneKey(store.id, schedule.id, day));
          if (day === store.todayKey && !completed) {
            const { hour, minute } = parseClock(schedule.dueTime);
            if (hour * 60 + minute > store.nowMinutes) continue; // not due yet
          }
          tally.due += 1;
          if (completed) tally.done += 1;
        }
      }
      perDay.set(day, tally);
    }
    out.set(store.id, perDay);
  }
  return out;
}

export function sumDays(days: Iterable<StoreDay>): StoreDay {
  let due = 0;
  let done = 0;
  for (const day of days) {
    due += day.due;
    done += day.done;
  }
  return { due, done };
}

/** Completion as a percentage to one decimal, or null when nothing was owed. */
export function rate({ due, done }: StoreDay): number | null {
  return due ? Math.round((done / due) * 1000) / 10 : null;
}

export type Tier = "behind" | "close" | "on";

/** The dashboard's three bands — each with a word and a shape, never colour alone. */
export const TIERS: Record<Tier, { label: string; shape: string; tone: "fail" | "warn" | "pass" }> = {
  behind: { label: "under 70%", shape: "●", tone: "fail" },
  close: { label: "70–89%", shape: "◆", tone: "warn" },
  on: { label: "90% and up", shape: "✓", tone: "pass" },
};

export function tierOf(value: number | null): Tier | null {
  if (value === null) return null;
  return value < 70 ? "behind" : value < 90 ? "close" : "on";
}

/** Average of the stores' own rates — "average store completion", by DO. */
export function averageRate(values: (number | null)[]): number | null {
  const scored = values.filter((value): value is number => value !== null);
  return scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null;
}
