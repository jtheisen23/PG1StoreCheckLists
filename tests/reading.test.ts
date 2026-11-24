import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeReading,
  flipSign,
  positionOn,
  rangeLabel,
  readingEntry,
  readingScale,
  readingText,
  readsBelowZero,
  tickLabel,
} from "../src/lib/reading";

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

test("a reading box takes a negative number however the keypad sends it", () => {
  assert.deepEqual(readingEntry("-5"), { text: "-5", value: -5 });
  assert.deepEqual(readingEntry("-12.5"), { text: "-12.5", value: -12.5 });
  assert.deepEqual(readingEntry("−8"), { text: "-8", value: -8 }, "the minus sign some keyboards send");
  assert.deepEqual(readingEntry("-0,5"), { text: "-0.5", value: -0.5 }, "a decimal comma");
  assert.deepEqual(readingEntry("-.5"), { text: "-.5", value: -0.5 });
});

test("a reading on its way is kept as typed but means nothing yet", () => {
  assert.deepEqual(readingEntry("-"), { text: "-", value: null }, "not zero: nothing has been read");
  assert.deepEqual(readingEntry(""), { text: "", value: null });
  assert.deepEqual(readingEntry("."), { text: ".", value: null });
  assert.deepEqual(readingEntry("4."), { text: "4.", value: 4 });
});

test("a reading box drops what is not a number", () => {
  assert.deepEqual(readingEntry("38°F"), { text: "38", value: 38 });
  assert.deepEqual(readingEntry("5-"), { text: "5", value: 5 }, "a minus counts only at the start");
  assert.deepEqual(readingEntry("--5"), { text: "-5", value: -5 });
  assert.deepEqual(readingEntry("1.2.3"), { text: "1.23", value: 1.23 }, "one decimal point");
  assert.deepEqual(readingEntry("1e3"), { text: "13", value: 13 }, "no exponents");
});

test("the +/− key flips the sign, or starts a negative reading", () => {
  assert.deepEqual(flipSign("5"), { text: "-5", value: -5 });
  assert.deepEqual(flipSign("-5"), { text: "5", value: 5 });
  assert.deepEqual(flipSign(""), { text: "-", value: null }, "an empty box waits for the digits");
  assert.deepEqual(flipSign("-"), { text: "", value: null });
});

test("a saved reading shows in the box as it was saved", () => {
  assert.equal(readingText(-8), "-8");
  assert.equal(readingText(41), "41");
  assert.equal(readingText(null), "");
  assert.equal(readingText(Number.NaN), "");
});

test("the +/− key goes where a reading can be below zero", () => {
  assert.equal(readsBelowZero(-10, 0), true, "the temp log's freezer");
  assert.equal(readsBelowZero(-10, 10), true, "the audit's freezer");
  assert.equal(readsBelowZero(null, 0), true, "0°F or below");
  assert.equal(readsBelowZero(0, 5), true, "a band that starts at zero can be missed below it");
  assert.equal(readsBelowZero(null, null), true, "no band: nothing says it cannot be");
  assert.equal(readsBelowZero(null, 41), false, "a cooler");
  assert.equal(readsBelowZero(345, 355), false, "the grill top");
  assert.equal(readsBelowZero(135, null), false, "steam-table product");
});
