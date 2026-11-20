import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RATEABLE_NIGHTS,
  closeDateFor,
  closeRatingKey,
  closeRatingProblem,
  closeWindow,
  describeVerdicts,
  isDateKey,
  isRateableCloseDate,
  normalizeNote,
  shiftDateKey,
} from "../src/lib/close-rating";

const AREAS = [
  { id: "front", name: "Frontline" },
  { id: "grill", name: "Grill" },
  { id: "back", name: "Backroom" },
];

const allGood = AREAS.map((area) => ({ areaId: area.id, acceptable: true }));

test("three thumbs up can be saved", () => {
  assert.equal(closeRatingProblem(AREAS, allGood), null);
});

test("a thumbs down needs a note saying what was wrong", () => {
  const verdicts = [
    { areaId: "front", acceptable: true },
    { areaId: "grill", acceptable: false, note: "   " },
    { areaId: "back", acceptable: true },
  ];
  assert.equal(closeRatingProblem(AREAS, verdicts), "Say what was wrong with Grill.");

  verdicts[1].note = "Flat-top not scraped";
  assert.equal(closeRatingProblem(AREAS, verdicts), null);
});

test("every area offered has to be rated", () => {
  assert.equal(closeRatingProblem(AREAS, allGood.slice(0, 2)), "Rate Backroom.");
  assert.equal(
    closeRatingProblem(AREAS, [...allGood.slice(0, 2), { areaId: "back", acceptable: null }]),
    "Rate Backroom.",
  );
});

test("an area that is not being rated, or one rated twice, is refused", () => {
  assert.match(
    closeRatingProblem(AREAS, [...allGood, { areaId: "patio", acceptable: true }])!,
    /no longer being rated/,
  );
  assert.equal(
    closeRatingProblem(AREAS, [...allGood, { areaId: "grill", acceptable: false, note: "x" }]),
    "Grill was rated twice.",
  );
});

test("a note is kept only on a thumbs down, and trimmed", () => {
  assert.equal(normalizeNote(true, "Spotless"), null);
  assert.equal(normalizeNote(false, "  Bins full  "), "Bins full");
  assert.equal(normalizeNote(false, "  "), null);
});

test("an over-long note is refused rather than cut short", () => {
  const verdicts = [
    { areaId: "front", acceptable: false, note: "x".repeat(1001) },
    ...allGood.slice(1),
  ];
  assert.match(closeRatingProblem(AREAS, verdicts)!, /too long/);
});

test("the opener rates the business day before their own", () => {
  assert.equal(closeDateFor("2026-11-18"), "2026-11-17");
  assert.equal(closeDateFor("2026-03-01"), "2026-02-28");
  assert.equal(closeDateFor("2027-01-01"), "2026-12-31");
});

test("only a recent night that has already closed can be rated", () => {
  const today = "2026-11-18";
  assert.ok(isRateableCloseDate("2026-11-17", today));
  assert.ok(isRateableCloseDate(shiftDateKey(today, -RATEABLE_NIGHTS), today));
  assert.ok(!isRateableCloseDate(shiftDateKey(today, -RATEABLE_NIGHTS - 1), today));
  assert.ok(!isRateableCloseDate("2026-11-18", today), "tonight has not closed yet");
  assert.ok(!isRateableCloseDate("2026-11-19", today));
  assert.ok(!isRateableCloseDate("2026-02-30", "2026-03-01"), "not a real date");
  assert.ok(!isRateableCloseDate("yesterday", today));
});

test("date keys are checked for being real dates", () => {
  assert.ok(isDateKey("2028-02-29"));
  assert.ok(!isDateKey("2026-02-29"));
  assert.ok(!isDateKey("2026-1-05"));
});

test("a close finished after midnight still belongs to last night", () => {
  const { from, to } = closeWindow("America/Chicago", "2026-11-17");
  const inside = (iso: string) => {
    const at = new Date(iso);
    return at >= from && at < to;
  };
  // 22:45 and 00:20 Chicago time (CST, UTC-6).
  assert.ok(inside("2026-11-18T04:45:00Z"));
  assert.ok(inside("2026-11-18T06:20:00Z"));
  // The previous night's close, and the following afternoon, are not.
  assert.ok(!inside("2026-11-17T05:30:00Z"));
  assert.ok(!inside("2026-11-18T19:00:00Z"));
});

test("the close window follows the store's clock across a DST change", () => {
  // Clocks went back in Chicago on 2026-11-01: noon CDT on the 31st, noon CST on the 1st.
  const { from, to } = closeWindow("America/Chicago", "2026-10-31");
  assert.equal(from.toISOString(), "2026-10-31T17:00:00.000Z");
  assert.equal(to.toISOString(), "2026-11-01T18:00:00.000Z");
});

test("the outbox holds one rating per store per night", () => {
  assert.equal(closeRatingKey("loc1", "2026-11-17"), "close:loc1:2026-11-17");
});

test("the activity log reads as a sentence", () => {
  assert.equal(
    describeVerdicts([
      { areaName: "Frontline", acceptable: true },
      { areaName: "Grill", acceptable: false },
    ]),
    "Frontline good handoff · Grill needs better",
  );
});
