import { test } from "node:test";
import assert from "node:assert/strict";

import { describeReading, positionOn, rangeLabel, readingScale, tickLabel } from "../src/lib/reading";

test("the bar runs half the band past each end, as the walkthrough draws it", () => {
  assert.deepEqual(readingScale(33, 41), { lo: 29, hi: 45 }, "walk-in fridge 33–41 draws 29–45");
  assert.deepEqual(readingScale(-10, 1), { lo: -15, hi: 6 }, "walk-in freezer -10–1 draws -15–6");
  assert.deepEqual(readingScale(0, 1), { lo: -1, hi: 2 }, "never less than one unit either side");
  assert.equal(readingScale(33, null), null, "one limit has no band to draw");
  assert.equal(readingScale(41, 33), null);
});

test("a reading sits on the bar, pinned to the ends when it is far out", () => {
  const scale = readingScale(33, 41)!;
  assert.equal(positionOn(scale, 37), 50);
  assert.equal(positionOn(scale, 48), 100);
  assert.equal(positionOn(scale, 0), 0);
});

test("how far out a reading is, in the walkthrough's words", () => {
  assert.deepEqual(describeReading(48, 33, 41, "°F"), { inRange: false, text: "7° above the band" });
  assert.deepEqual(describeReading(30.5, 33, 41, "°F"), { inRange: false, text: "2.5° below the band" });
  assert.deepEqual(describeReading(38, 33, 41, "°F"), { inRange: true, text: "In range" });
  assert.deepEqual(describeReading(41, 33, 41, "°F"), { inRange: true, text: "In range" }, "the edge is in");
  assert.deepEqual(describeReading(150, 165, null, "°F"), { inRange: false, text: "15° below the minimum" });
  assert.deepEqual(describeReading(450, null, 400, "ppm"), { inRange: false, text: "50 ppm above the maximum" });
  assert.deepEqual(describeReading(12, null, null, null), { inRange: true, text: "Logged" });
  assert.equal(describeReading(null, 33, 41, "°F"), null);
});

test("labels for the range and the ends of the bar", () => {
  assert.equal(rangeLabel(33, 41, "°F"), "33 – 41 °F");
  assert.equal(rangeLabel(-10, 1, "°F"), "-10 – 1 °F");
  assert.equal(rangeLabel(165, null, "°F"), "at least 165 °F");
  assert.equal(rangeLabel(null, 400, "ppm"), "at most 400 ppm");
  assert.equal(rangeLabel(null, null, "°F"), null);
  assert.equal(tickLabel(29, "°F"), "29°");
  assert.equal(tickLabel(6.5, "ppm"), "6.5 ppm");
});
