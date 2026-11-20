import { test } from "node:test";
import assert from "node:assert/strict";

import { periodFor, rangeFor, daysBetween } from "../src/lib/periods";
import { shiftDateKey } from "../src/lib/time";
import {
  averageRate,
  doneKey,
  rate,
  storeDays,
  sumDays,
  tierOf,
  type ScheduleSlot,
} from "../src/lib/execution";

// --- the period calendar -----------------------------------------------------

test("PG1's anchor: Mon Jan 4, 2027 is day 1 of period 1 of 2027", () => {
  assert.deepEqual(periodFor("2027-01-04"), {
    year: 2027,
    number: 1,
    start: "2027-01-04",
    end: "2027-01-31",
    day: 1,
    week: 1,
  });
});

test("counted back from the anchor: Nov 19, 2026 is Period 12, week 2, day 11", () => {
  assert.deepEqual(periodFor("2026-11-19"), {
    year: 2026,
    number: 12,
    start: "2026-11-09",
    end: "2026-12-06",
    day: 11,
    week: 2,
  });
});

test("a fiscal year is thirteen four-week periods, and the next one rolls on", () => {
  assert.equal(periodFor("2026-01-05").number, 1, "period 1 of 2026 began Mon Jan 5");
  assert.equal(periodFor("2026-01-05").year, 2026);
  assert.equal(periodFor("2026-01-04").number, 13, "the day before rolls back a year");
  assert.equal(periodFor("2026-01-04").year, 2025);
  assert.equal(periodFor("2027-01-03").number, 13);
  assert.equal(periodFor("2027-01-03").day, 28);
  assert.equal(periodFor("2027-01-03").year, 2026);
});

test("every period is 28 days and starts on a Monday, back and forward for years", () => {
  let previous: ReturnType<typeof periodFor> | null = null;
  for (let key = "2023-01-02"; key <= "2035-12-31"; key = shiftDateKey(key, 1)) {
    const period = periodFor(key);
    assert.equal(new Date(`${period.start}T00:00:00Z`).getUTCDay(), 1, `${key}: starts on a Monday`);
    assert.equal(daysBetween({ from: period.start, to: period.end }).length, 28, `${key}: 28 days`);
    assert.ok(period.day >= 1 && period.day <= 28);
    if (previous && period.start !== previous.start) {
      assert.equal(period.start, shiftDateKey(previous.end, 1), `${key}: follows straight on`);
      assert.equal(period.number, (previous.number % 13) + 1, `${key}: numbered in turn`);
    }
    previous = period;
  }
});

test("ranges, and the like-for-like range each is compared with", () => {
  const today = "2026-11-19"; // a Thursday, day 11 of Period 12
  assert.deepEqual(rangeFor("today", today).previous, { from: "2026-11-18", to: "2026-11-18" });
  assert.deepEqual(rangeFor("wtd", today), {
    range: { from: "2026-11-16", to: "2026-11-19" },
    previous: { from: "2026-11-09", to: "2026-11-12" },
    versus: "vs same days last week",
  });
  assert.deepEqual(rangeFor("ptd", today).range, { from: "2026-11-09", to: "2026-11-19" });
  assert.deepEqual(rangeFor("ptd", today).previous, { from: "2026-10-12", to: "2026-10-22" });
  assert.deepEqual(rangeFor("lp", today).range, { from: "2026-10-12", to: "2026-11-08" });
  assert.equal(daysBetween(rangeFor("wtd", today).range).length, 4);
});

// --- what a store owed, and did -------------------------------------------------

const everyDay = [0, 1, 2, 3, 4, 5, 6];
const opening: ScheduleSlot = { id: "open", locationIds: ["s1"], daysOfWeek: everyDay, dueTime: "10:00", createdKey: "2026-01-01" };
const closing: ScheduleSlot = { id: "close", locationIds: ["s1"], daysOfWeek: everyDay, dueTime: "23:30", createdKey: "2026-01-01" };
const weekly: ScheduleSlot = { id: "weekly", locationIds: ["s1"], daysOfWeek: [3], dueTime: "17:00", createdKey: "2026-01-01" };
const store = { id: "s1", todayKey: "2026-11-19", nowMinutes: 12 * 60 };

test("a past day owes every schedule on its weekday, and counts what was done", () => {
  const done = new Set([doneKey("s1", "open", "2026-11-18")]);
  const days = storeDays([store], [opening, closing, weekly], done, ["2026-11-18"]); // a Wednesday
  assert.deepEqual(days.get("s1")!.get("2026-11-18"), { due: 3, done: 1 });
});

test("today counts only what is due by now — unless it is already done", () => {
  const notYet = storeDays([store], [opening, closing], new Set(), ["2026-11-19"]);
  assert.deepEqual(notYet.get("s1")!.get("2026-11-19"), { due: 1, done: 0 }, "the close is not due at noon");
  const early = storeDays([store], [opening, closing], new Set([doneKey("s1", "close", "2026-11-19")]), ["2026-11-19"]);
  assert.deepEqual(early.get("s1")!.get("2026-11-19"), { due: 2, done: 1 }, "a close done early still counts");
});

test("nothing is owed on a future day, or before a schedule existed", () => {
  const late: ScheduleSlot = { ...opening, id: "new", createdKey: "2026-11-19" };
  const days = storeDays([store], [late], new Set(), ["2026-11-18", "2026-11-20"]);
  assert.deepEqual(days.get("s1")!.get("2026-11-18"), { due: 0, done: 0 });
  assert.deepEqual(days.get("s1")!.get("2026-11-20"), { due: 0, done: 0 });
});

test("rates, bands and averages", () => {
  assert.equal(rate(sumDays([{ due: 3, done: 2 }, { due: 3, done: 3 }])), 83.3);
  assert.equal(rate({ due: 0, done: 0 }), null, "nothing owed is not 0%");
  assert.equal(tierOf(69.9), "behind");
  assert.equal(tierOf(70), "close");
  assert.equal(tierOf(89.9), "close");
  assert.equal(tierOf(90), "on");
  assert.equal(tierOf(null), null);
  assert.equal(averageRate([50, 100, null]), 75);
  assert.equal(averageRate([null]), null);
});
