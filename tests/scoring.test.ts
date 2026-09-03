import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateAnswer,
  formatAnswer,
  scoreSubmission,
  type ScorableItem,
} from "../src/lib/scoring";

function item(overrides: Partial<ScorableItem> = {}): ScorableItem {
  return {
    id: "i1",
    type: "CHECKBOX",
    required: true,
    critical: false,
    weight: 1,
    minValue: null,
    maxValue: null,
    failingOptions: [],
    ...overrides,
  };
}

test("an unanswered item is not scored", () => {
  assert.equal(evaluateAnswer(item(), undefined), null);
});

test("N/A takes an item out of scoring entirely", () => {
  const answer = { itemId: "i1", boolValue: false, naFlag: true };
  assert.equal(evaluateAnswer(item(), answer), null);
});

test("a temperature inside its range passes and outside fails", () => {
  const cooler = item({ type: "TEMPERATURE", minValue: 33, maxValue: 40 });
  assert.equal(evaluateAnswer(cooler, { itemId: "i1", numericValue: 36 }), true);
  assert.equal(evaluateAnswer(cooler, { itemId: "i1", numericValue: 33 }), true, "min is inclusive");
  assert.equal(evaluateAnswer(cooler, { itemId: "i1", numericValue: 40 }), true, "max is inclusive");
  assert.equal(evaluateAnswer(cooler, { itemId: "i1", numericValue: 44 }), false);
  assert.equal(evaluateAnswer(cooler, { itemId: "i1", numericValue: 31 }), false);
});

test("a one-sided range only checks the bound it has", () => {
  const hotHold = item({ type: "TEMPERATURE", minValue: 140, maxValue: null });
  assert.equal(evaluateAnswer(hotHold, { itemId: "i1", numericValue: 400 }), true);
  assert.equal(evaluateAnswer(hotHold, { itemId: "i1", numericValue: 139 }), false);
});

test("a blank numeric answer is unscored rather than a failure", () => {
  const cooler = item({ type: "TEMPERATURE", minValue: 33, maxValue: 40 });
  assert.equal(evaluateAnswer(cooler, { itemId: "i1", numericValue: null }), null);
});

test("a choice item fails only on a configured failing option", () => {
  const oil = item({ type: "SELECT", failingOptions: ["Needs changing"] });
  assert.equal(evaluateAnswer(oil, { itemId: "i1", selected: ["Fresh"] }), true);
  assert.equal(evaluateAnswer(oil, { itemId: "i1", selected: ["Needs changing"] }), false);
  assert.equal(evaluateAnswer(oil, { itemId: "i1", selected: [] }), null);
});

test("a rating passes at or above its floor, defaulting to 3", () => {
  assert.equal(evaluateAnswer(item({ type: "RATING" }), { itemId: "i1", numericValue: 3 }), true);
  assert.equal(evaluateAnswer(item({ type: "RATING" }), { itemId: "i1", numericValue: 2 }), false);
  const strict = item({ type: "RATING", minValue: 4 });
  assert.equal(evaluateAnswer(strict, { itemId: "i1", numericValue: 3 }), false);
});

test("free text and photos are informational, never scored", () => {
  for (const type of ["TEXT", "PHOTO", "SIGNATURE"] as const) {
    assert.equal(
      evaluateAnswer(item({ type }), { itemId: "i1", value: "anything" }),
      null,
      `${type} should not be scored`,
    );
  }
});

test("the score is weighted, not a plain item count", () => {
  const items = [
    item({ id: "a", weight: 3 }),
    item({ id: "b", weight: 1 }),
    item({ id: "c", weight: 1 }),
  ];
  const answers = [
    { itemId: "a", boolValue: false },
    { itemId: "b", boolValue: true },
    { itemId: "c", boolValue: true },
  ];
  // 2 of 5 weight earned, not 2 of 3 items.
  const result = scoreSubmission(items, answers, 90);
  assert.equal(result.score, 40);
  assert.equal(result.itemsPassed, 2);
  assert.equal(result.itemsFailed, 1);
  assert.equal(result.passed, false);
});

test("a failed critical item fails the walk even at a high score", () => {
  const items = [
    item({ id: "critical", critical: true, weight: 1 }),
    ...Array.from({ length: 30 }, (_, i) => item({ id: `ok${i}` })),
  ];
  const answers = [
    { itemId: "critical", boolValue: false },
    ...Array.from({ length: 30 }, (_, i) => ({ itemId: `ok${i}`, boolValue: true })),
  ];
  const result = scoreSubmission(items, answers, 90);
  assert.ok(result.score !== null && result.score > 90, "score is above the threshold");
  assert.equal(result.criticalFailure, true);
  assert.equal(result.passed, false, "the critical failure still fails the walk");
});

test("N/A items are excluded from the denominator", () => {
  const items = [item({ id: "a" }), item({ id: "b" })];
  const result = scoreSubmission(
    items,
    [
      { itemId: "a", boolValue: true },
      { itemId: "b", boolValue: false, naFlag: true },
    ],
    90,
  );
  assert.equal(result.score, 100);
  assert.equal(result.itemsTotal, 1);
});

test("a walk with nothing scorable has no score but does not fail", () => {
  const result = scoreSubmission([item({ type: "TEXT" })], [{ itemId: "i1", value: "hi" }], 90);
  assert.equal(result.score, null);
  assert.equal(result.passed, true);
});

test("answers format for display and export", () => {
  assert.equal(formatAnswer({ id: "i1", type: "PASS_FAIL" }, { itemId: "i1", boolValue: false }), "Fail");
  assert.equal(
    formatAnswer({ id: "i1", type: "TEMPERATURE", unit: "°F" }, { itemId: "i1", numericValue: 38.5 }),
    "38.5 °F",
  );
  assert.equal(formatAnswer({ id: "i1", type: "CHECKBOX" }, { itemId: "i1", naFlag: true }), "N/A");
  assert.equal(formatAnswer({ id: "i1", type: "TEXT" }, undefined), "—");
});
