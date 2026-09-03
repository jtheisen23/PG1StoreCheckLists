import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SAMPLE_CSV,
  detectDelimiter,
  parseChecklist,
  parseDelimited,
  toCsv,
} from "../src/lib/checklist-import";

test("splits CSV, honouring quoted cells and embedded commas", () => {
  const rows = parseDelimited('a,b\n"one, two",three\n', ",");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["one, two", "three"],
  ]);
});

test("handles escaped quotes and blank lines", () => {
  const rows = parseDelimited('item\n"He said ""go"""\n\n', ",");
  assert.deepEqual(rows, [["item"], ['He said "go"']]);
});

test("a spreadsheet paste is tab-separated", () => {
  assert.equal(detectDelimiter("section\titem\ttype"), "\t");
  assert.equal(detectDelimiter("section,item,type"), ",");
});

test("imports the sample file", () => {
  const result = parseChecklist(SAMPLE_CSV);
  assert.deepEqual(result.issues, []);
  assert.equal(result.simpleMode, false);
  assert.equal(result.sections.length, 3);
  assert.equal(result.itemCount, 7);
  assert.deepEqual(
    result.sections.map((s) => s.title),
    ["Food safety", "Equipment", "Readiness"],
  );
});

test("carries item settings across from the file", () => {
  const cooler = parseChecklist(SAMPLE_CSV).sections[0].items[0];
  assert.equal(cooler.label, "Walk-in cooler temperature");
  assert.equal(cooler.type, "TEMPERATURE");
  assert.equal(cooler.critical, true);
  assert.equal(cooler.weight, 3);
  assert.equal(cooler.minValue, 33);
  assert.equal(cooler.maxValue, 40);
  assert.equal(cooler.unit, "°F");
  assert.equal(cooler.helpText, "Read the thermometer on the middle shelf");
});

test("reads choice options and which of them fail", () => {
  const oil = parseChecklist(SAMPLE_CSV).sections[1].items[1];
  assert.equal(oil.type, "SELECT");
  assert.deepEqual(oil.options, ["Fresh", "Acceptable", "Needs changing"]);
  assert.deepEqual(oil.failingOptions, ["Needs changing"]);
});

test("matches column headings loosely", () => {
  const result = parseChecklist(
    "Category\tQuestion\tAnswer Type\tCritical\n" +
      "Cleaning\tFloors mopped\tPass / Fail\tY\n",
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.sections[0].title, "Cleaning");
  assert.equal(result.sections[0].items[0].type, "PASS_FAIL");
  assert.equal(result.sections[0].items[0].critical, true);
});

test("infers a type when the file does not state one", () => {
  const result = parseChecklist(
    "section,item,min,max,unit\n" +
      "Temps,Hot hold,140,190,°F\n" +
      "Counts,Cases on hand,0,50,cases\n",
  );
  assert.equal(result.sections[0].items[0].type, "TEMPERATURE");
  assert.equal(result.sections[1].items[0].type, "NUMBER");
});

test("a plain list of lines still imports, with headings", () => {
  const result = parseChecklist(
    ["# Opening", "Unlock the doors", "Turn on the fryers", "Closing:", "Lock up"].join("\n"),
  );
  assert.equal(result.simpleMode, true);
  assert.deepEqual(
    result.sections.map((s) => [s.title, s.items.length]),
    [["Opening", 2], ["Closing", 1]],
  );
  assert.equal(result.sections[0].items[0].type, "CHECKBOX");
});

test("items before any heading land in a default section", () => {
  const result = parseChecklist("Wipe the counters\nCheck the lights");
  assert.equal(result.sections[0].title, "Checklist");
  assert.equal(result.itemCount, 2);
});

test("reports a failing option that is not one of the options", () => {
  const result = parseChecklist(
    "section,item,type,options,failing options\n" +
      'Prep,Oil quality,select,"Fresh|Old",Rancid\n',
  );
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].message, /Rancid/);
  assert.equal(result.issues[0].row, 2, "points at the offending row");
});

test("reports a choice item with too few options", () => {
  const result = parseChecklist("section,item,type,options\nPrep,Oil,select,Fresh\n");
  assert.match(result.issues[0].message, /fewer than two options/);
});

test("reports an inverted range", () => {
  const result = parseChecklist("item,min,max\nCooler,40,33\n");
  assert.match(result.issues[0].message, /minimum above its maximum/);
});

test("an unknown answer type is a warning, not a lost row", () => {
  const result = parseChecklist("item,type\nSomething,interpretive dance\n");
  assert.match(result.issues[0].message, /not an answer type/);
  assert.equal(result.itemCount, 1, "the item is still imported");
});

test("empty input is rejected", () => {
  assert.match(parseChecklist("   ").issues[0].message, /Nothing to import/);
});

test("weights are clamped to the range the schema allows", () => {
  const result = parseChecklist("item,weight\nA,99\nB,0\nC,2.6\n");
  const weights = result.sections[0].items.map((i) => i.weight);
  assert.deepEqual(weights, [10, 1, 3]);
});

test("an exported checklist re-imports to the same thing", () => {
  const original = parseChecklist(SAMPLE_CSV);
  const csv = toCsv(original.sections);
  const round = parseChecklist(csv);

  assert.deepEqual(round.issues, [], "the export is valid input to the importer");
  assert.equal(round.itemCount, original.itemCount);
  assert.deepEqual(
    round.sections.map((s) => s.title),
    original.sections.map((s) => s.title),
  );

  const strip = (result: typeof original) =>
    result.sections.flatMap((section) =>
      section.items.map(({ sourceRow: _row, ...item }) => item),
    );
  assert.deepEqual(strip(round), strip(original), "every setting survives the trip");
});

test("export marks archived items so a snapshot is complete", () => {
  const csv = toCsv([
    {
      title: "Food safety",
      items: [
        {
          label: "Retired check",
          helpText: null,
          type: "CHECKBOX",
          required: true,
          critical: false,
          weight: 1,
          requirePhoto: false,
          photoOnFail: true,
          noteOnFail: true,
          actionOnFail: true,
          minValue: null,
          maxValue: null,
          unit: null,
          options: [],
          failingOptions: [],
          archivedAt: new Date("2026-01-01"),
        },
      ],
    },
  ]);
  assert.match(csv, /"archived"/);
});

test("export defuses spreadsheet formula injection", () => {
  const csv = toCsv([
    {
      title: "Ops",
      items: [
        {
          label: "=cmd|'/c calc'!A1",
          helpText: null,
          type: "CHECKBOX",
          required: true,
          critical: false,
          weight: 1,
          requirePhoto: false,
          photoOnFail: true,
          noteOnFail: true,
          actionOnFail: true,
          minValue: null,
          maxValue: null,
          unit: null,
          options: [],
          failingOptions: [],
        },
      ],
    },
  ]);
  assert.match(csv, /"'=cmd/, "a leading = is escaped");
});
