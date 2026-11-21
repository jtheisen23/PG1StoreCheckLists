import { test } from "node:test";
import assert from "node:assert/strict";

import {
  businessDate,
  clockLabel,
  windowLabel,
  businessDateKey,
  localDayOfWeek,
  scheduleDueAt,
  zonedTimeToUtc,
} from "../src/lib/time";

test("the business date follows the store's clock, not the server's", () => {
  // 03:00 UTC on the 4th is still the evening of the 3rd in Chicago.
  const at = new Date("2026-09-04T03:00:00Z");
  assert.equal(businessDateKey("America/Chicago", at), "2026-09-03");
  assert.equal(businessDateKey("UTC", at), "2026-09-04");
});

test("stores in different timezones can be on different business dates", () => {
  const at = new Date("2026-09-04T04:30:00Z");
  assert.equal(businessDateKey("America/New_York", at), "2026-09-04");
  assert.equal(businessDateKey("America/Los_Angeles", at), "2026-09-03");
});

test("the business date is stored at UTC midnight so date columns compare cleanly", () => {
  const day = businessDate("America/Chicago", new Date("2026-09-03T18:00:00Z"));
  assert.equal(day.toISOString(), "2026-09-03T00:00:00.000Z");
});

test("a wall-clock time converts to the right instant on both sides of DST", () => {
  // CDT (UTC-5) in July.
  assert.equal(
    zonedTimeToUtc("America/Chicago", 2026, 7, 15, 9, 0).toISOString(),
    "2026-07-15T14:00:00.000Z",
  );
  // CST (UTC-6) in January.
  assert.equal(
    zonedTimeToUtc("America/Chicago", 2026, 1, 15, 9, 0).toISOString(),
    "2026-01-15T15:00:00.000Z",
  );
});

test("a due time resolves against the store's own day", () => {
  const day = businessDate("America/Los_Angeles", new Date("2026-09-03T18:00:00Z"));
  const due = scheduleDueAt("America/Los_Angeles", day, "09:30");
  // 09:30 PDT is 16:30 UTC.
  assert.equal(due.toISOString(), "2026-09-03T16:30:00.000Z");
});

test("the day of week is the store's local day", () => {
  // Saturday 23:00 in Los Angeles is already Sunday in UTC.
  const at = new Date("2026-09-06T05:00:00Z");
  assert.equal(localDayOfWeek("America/Los_Angeles", at), 6, "Saturday locally");
  assert.equal(localDayOfWeek("UTC", at), 0, "Sunday in UTC");
});

test("schedule times read the way a store reads a clock", () => {
  assert.equal(clockLabel("09:15"), "9:15 AM");
  assert.equal(clockLabel("14:30"), "2:30 PM");
  assert.equal(clockLabel("00:00"), "12:00 AM");
  assert.equal(clockLabel("12:05"), "12:05 PM");
  assert.equal(clockLabel("23:00"), "11:00 PM");
  assert.equal(windowLabel("09:30", "10:00"), "9:30–10:00 AM");
  assert.equal(windowLabel("17:00", "23:00"), "5:00–11:00 PM");
  assert.equal(windowLabel("11:00", "13:00"), "11:00 AM–1:00 PM");
});
