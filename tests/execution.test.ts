import { test } from "node:test";
import assert from "node:assert/strict";

import { periodFor, rangeFor, daysBetween } from "../src/lib/periods";
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

test("the walkthrough's own dates: Nov 13, 2026 is Period 12, week 2, day 12 of 28", () => {
  assert.deepEqual(periodFor("2026-11-13"), {
    year: 2026,
    number: 12,
    start: "2026-11-02",
    end: "2026-11-29",
    day: 12,
    week: 2,
  });
});

test("a fiscal year is thirteen four-week periods, and the next one rolls on", () => {
  assert.equal(periodFor("2025-12-29").number, 1);
  assert.equal(periodFor("2026-12-27").number, 13);
  const next = periodFor("2026-12-28");
  assert.equal(next.number, 1);
  assert.equal(next.year, 2027);
  assert.equal(periodFor("2025-12-28").number, 13, "the day before rolls back a year");
});

test("ranges, and the like-for-like range each is compared with", () => {
  const today = "2026-11-19"; // a Thursday, day 18 of Period 12
  assert.deepEqual(rangeFor("today", today).previous, { from: "2026-11-18", to: "2026-11-18" });
  assert.deepEqual(rangeFor("wtd", today), {
    range: { from: "2026-11-16", to: "2026-11-19" },
    previous: { from: "2026-11-09", to: "2026-11-12" },
    versus: "vs same days last week",
  });
  assert.deepEqual(rangeFor("ptd", today).range, { from: "2026-11-02", to: "2026-11-19" });
  assert.deepEqual(rangeFor("ptd", today).previous, { from: "2026-10-05", to: "2026-10-22" });
  assert.deepEqual(rangeFor("lp", today).range, { from: "2026-10-05", to: "2026-11-01" });
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
