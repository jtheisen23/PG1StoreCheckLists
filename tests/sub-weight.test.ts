import { test } from "node:test";
import assert from "node:assert/strict";

import {
  acceptableRange,
  describeNet,
  describeWeighing,
  parseSubSpecs,
  summarizeWeighings,
  verdictLine,
  verdictText,
  verdictTone,
  weekStarting,
  weighSub,
} from "../src/lib/sub-weight";

// --- the rule ---------------------------------------------------------------

test("the spec weight is the floor: anything under it is underweight", () => {
  const w = weighSub(7.9, 8);
  assert.equal(w.verdict, "UNDER");
  assert.equal(w.shortOz, 0.1);
  assert.equal(verdictText(w), "Under by 0.1 oz");
});

test("spec through spec + 0.5 oz is acceptable, both ends included", () => {
  assert.equal(weighSub(8, 8).verdict, "ACCEPTABLE");
  assert.equal(weighSub(8.25, 8).verdict, "ACCEPTABLE");
  assert.equal(weighSub(8.5, 8).verdict, "ACCEPTABLE");
});

test("past spec + 0.5 oz is overweight, measured from the ceiling", () => {
  const w = weighSub(8.8, 8);
  assert.equal(w.verdict, "OVER");
  assert.equal(w.overOz, 0.3);
  assert.equal(w.vsSpecOz, 0.8);
  assert.equal(verdictText(w), "Over by 0.3 oz");
});

test("the tolerance is not symmetric: 0.1 under fails where 0.4 over passes", () => {
  assert.equal(weighSub(11.9, 12).verdict, "UNDER");
  assert.equal(weighSub(12.4, 12).verdict, "ACCEPTABLE");
});

test("floating point never moves a sub across a boundary", () => {
  // 8.1 + 0.5 is 8.600000000000001 in plain floating point.
  assert.equal(weighSub(8.6, 8.1).verdict, "ACCEPTABLE");
  assert.equal(weighSub(8.61, 8.1).verdict, "OVER");
  assert.equal(weighSub(0.3, 0.3).verdict, "ACCEPTABLE");
});

test("a spec with no target weight is logged but never judged", () => {
  const w = weighSub(9.2, null);
  assert.equal(w.verdict, "UNSCORED");
  assert.equal(w.vsSpecOz, null);
  assert.match(verdictText(w), /not scored/);
});

test("the window and the one-line description read the way a manager says them", () => {
  assert.equal(acceptableRange(8), "8.00–8.50 oz");
  assert.equal(acceptableRange(6.4), "6.40–6.90 oz");
  assert.equal(
    describeWeighing({ number: "13", name: "The Original Italian", size: "REGULAR" }, 7.6, 8),
    "#13 The Original Italian · Regular: 7.6 oz (spec 8.00–8.50 oz) — Under by 0.4 oz",
  );
  assert.equal(
    describeWeighing({ number: "1", name: "BLT", size: "MINI" }, 4.1, null),
    "#1 BLT · Mini: 4.1 oz (no spec) — No spec weight — logged, not scored",
  );
});

// --- the week -----------------------------------------------------------------

test("under and over are counted apart, with the ounces of each", () => {
  const summary = summarizeWeighings([
    { weightOz: 7.6, specOz: 8 }, // under 0.4
    { weightOz: 7.9, specOz: 8 }, // under 0.1
    { weightOz: 8.2, specOz: 8 }, // acceptable
    { weightOz: 9.0, specOz: 8 }, // over 0.5 past the ceiling
    { weightOz: 4.1, specOz: null }, // BLT, not judged
  ]);
  assert.deepEqual(summary, {
    logged: 5,
    judged: 4,
    acceptable: 1,
    under: 2,
    over: 1,
    ozShort: 0.5,
    ozOver: 0.5,
    // -0.4 - 0.1 + 0.2 + 1.0: the store ran 0.7 oz heavy against spec.
    netVsSpecOz: 0.7,
  });
});

test("a week with nothing logged is all zeros, not an error", () => {
  assert.deepEqual(summarizeWeighings([]), {
    logged: 0, judged: 0, acceptable: 0, under: 0, over: 0, ozShort: 0, ozOver: 0, netVsSpecOz: 0,
  });
});

// --- importing the spec sheet -------------------------------------------------------

test("a spec sheet with plain headings imports every sub and size", () => {
  const { specs, issues } = parseSubSpecs(
    "Sub #,Name,Size,Spec oz\n13,The Original Italian,Giant,16\n13,The Original Italian,Regular,8\n1,BLT,Mini,\n",
  );
  assert.deepEqual(issues, []);
  assert.deepEqual(
    specs.map(({ number, name, size, specOz }) => [number, name, size, specOz]),
    [
      ["13", "The Original Italian", "GIANT", 16],
      ["13", "The Original Italian", "REGULAR", 8],
      ["1", "BLT", "MINI", null],
    ],
  );
});

test("pasted from a spreadsheet, with the number leading the name and sizes abbreviated", () => {
  const { specs, issues } = parseSubSpecs(
    "Sub\tSize\tTarget weight\n#7 Turkey and Provolone\tReg\t8.0 oz\n#7 Turkey and Provolone\tG\t16 ounces\n#1 BLT\tmini\tTBD\n",
  );
  assert.deepEqual(issues, []);
  assert.deepEqual(
    specs.map(({ number, name, size, specOz }) => [number, name, size, specOz]),
    [
      ["7", "Turkey and Provolone", "REGULAR", 8],
      ["7", "Turkey and Provolone", "GIANT", 16],
      ["1", "BLT", "MINI", null],
    ],
  );
});

test("rows that cannot be read are reported by row, and the rest still import", () => {
  const { specs, issues } = parseSubSpecs(
    "Sub #,Name,Size,Spec oz\n13,Italian,Huge,8\n13,Italian,Regular,eight\n13,Italian,Regular,8\n13,Italian,Regular,8.5\n,Nameless,Mini,4\n",
  );
  assert.equal(specs.length, 1);
  assert.deepEqual(
    issues.map((issue) => issue.row),
    [2, 3, 5, 6],
  );
  assert.match(issues[0].message, /not a size/);
  assert.match(issues[1].message, /not a weight/);
  assert.match(issues[2].message, /appears twice/);
});

test("a sheet without recognisable headings says what it needs", () => {
  const { specs, issues } = parseSubSpecs("13,Italian,Regular,8\n");
  assert.equal(specs.length, 0);
  assert.match(issues[0].message, /headings/);
});

test("a week reads as how light or heavy the store ran", () => {
  assert.equal(describeNet(0.7), "0.7 oz heavy");
  assert.equal(describeNet(-1.25), "1.25 oz light");
  assert.equal(describeNet(0), "on spec");
  assert.equal(describeNet(0.001), "on spec");
});

test("weeks run Monday to Sunday", () => {
  assert.equal(weekStarting("2026-11-16"), "2026-11-16", "a Monday starts its own week");
  assert.equal(weekStarting("2026-11-19"), "2026-11-16");
  assert.equal(weekStarting("2026-11-22"), "2026-11-16", "Sunday ends the week");
  assert.equal(weekStarting("2026-03-01"), "2026-02-23", "across a month end");
});

test("the scale screen says the verdict signed against spec", () => {
  assert.equal(verdictLine(weighSub(6.55, 6.4)), "+0.15 oz in range");
  assert.equal(verdictLine(weighSub(9.05, 9.2)), "−0.15 oz underweight — 0.15 oz short");
  assert.equal(verdictLine(weighSub(7.05, 6.4)), "+0.65 oz overweight — 0.15 oz past the limit");
  assert.equal(verdictLine(weighSub(6.4, 6.4)), "±0.00 oz in range");
  assert.equal(verdictLine(weighSub(4, null)), "No spec weight — logged, not scored");
});

test("under and over never wear the same colour", () => {
  assert.equal(verdictTone("UNDER"), "fail");
  assert.equal(verdictTone("OVER"), "warn");
  assert.equal(verdictTone("ACCEPTABLE"), "pass");
});
