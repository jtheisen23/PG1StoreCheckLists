import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normaliseState,
  parseStores,
  resolveTimezone,
  slugCode,
} from "../src/lib/store-import";

/** The real PG1 list, as it comes off the clipboard from Google Sheets. */
const PG1 = [
  ["Store #", "City", "State", "Brand"],
  ["6113", "Wytheville", "VA", "Jersey Mikes"],
  ["4043", "Gunbarrel", "TN", "Jersey Mikes"],
  ["4049", "Hixson", "TN", "Jersey Mikes"],
  ["4051", "Cleveland", "TN", "Jersey Mikes"],
  ["4056", "Ooltewah", "TN", "Jersey Mikes"],
  ["4086", "East Ridge", "TN", "Jersey Mikes"],
  ["6046", "5th St", "VA", "Jersey Mikes"],
  ["5074", "Fort O", "GA", "Jersey Mikes"],
  ["12015", "Cullman", "AL", "Jersey Mikes"],
  ["12042", "Huntsville", "AL", "Jersey Mikes"],
  ["3027", "University", "NC", "Jersey Mikes"],
  ["3271", "Peter's Creek", "NC", "Jersey Mikes"],
]
  .map((row) => row.join("\t"))
  .join("\n");

test("reads a spreadsheet paste of stores", () => {
  const result = parseStores(PG1);
  assert.equal(result.stores.length, 12);
  assert.equal(result.stores[0].code, "6113");
  assert.equal(result.stores[0].name, "Wytheville");
  assert.equal(result.stores[0].city, "Wytheville");
  assert.equal(result.stores[0].state, "VA");
  assert.equal(result.stores[0].brand, "Jersey Mikes");
});

test("east Tennessee runs on Eastern time, not the state's majority Central", () => {
  const result = parseStores(PG1);
  const tennessee = result.stores.filter((s) => s.state === "TN");
  assert.equal(tennessee.length, 5);
  for (const store of tennessee) {
    assert.equal(
      store.timezone,
      "America/New_York",
      `${store.name} should be Eastern`,
    );
    assert.equal(store.timezoneUncertain, false);
  }
});

test("Alabama is Central and the eastern seaboard states are Eastern", () => {
  const result = parseStores(PG1);
  const zone = (code: string) =>
    result.stores.find((s) => s.code === code)?.timezone;
  assert.equal(zone("12015"), "America/Chicago"); // Cullman, AL
  assert.equal(zone("12042"), "America/Chicago"); // Huntsville, AL
  assert.equal(zone("6113"), "America/New_York"); // Wytheville, VA
  assert.equal(zone("3027"), "America/New_York"); // University, NC
  assert.equal(zone("5074"), "America/New_York"); // Fort O, GA
});

test("nothing in the real list needs a timezone checked by hand", () => {
  const result = parseStores(PG1);
  assert.equal(result.uncertainCount, 0);
  assert.deepEqual(result.issues, []);
});

test("groups by brand and state by default", () => {
  const result = parseStores(PG1);
  assert.deepEqual(result.structure, [
    {
      region: "Jersey Mikes",
      districts: ["Virginia", "Tennessee", "Georgia", "Alabama", "North Carolina"],
    },
  ]);
});

test("can group by state instead", () => {
  const result = parseStores(PG1, "state");
  assert.deepEqual(
    result.structure.map((entry) => entry.region),
    ["Virginia", "Tennessee", "Georgia", "Alabama", "North Carolina"],
  );
  assert.deepEqual(result.structure[0], {
    region: "Virginia",
    districts: ["Virginia"],
  });
});

test("region and district columns override the grouping", () => {
  const text = [
    "store,city,state,brand,region,district",
    "1,Hixson,TN,Jersey Mikes,Southeast,Chattanooga",
  ].join("\n");
  const result = parseStores(text);
  assert.equal(result.stores[0].regionName, "Southeast");
  assert.equal(result.stores[0].districtName, "Chattanooga");
});

test("a split state with an unlisted city is flagged rather than guessed silently", () => {
  const result = parseStores("store,city,state\n9,Nashville,TN");
  assert.equal(result.stores[0].timezone, "America/Chicago");
  assert.equal(result.stores[0].timezoneUncertain, true);
  assert.equal(result.uncertainCount, 1);
  assert.match(result.issues[0].message, /spans two timezones/);
});

test("an explicit timezone column always wins", () => {
  const result = parseStores("store,city,state,timezone\n9,Nashville,TN,America/New_York");
  assert.equal(result.stores[0].timezone, "America/New_York");
  assert.equal(result.stores[0].timezoneUncertain, false);
  assert.deepEqual(result.issues, []);
});

test("accepts loose headings and CSV", () => {
  const result = parseStores("Store Number,Town,ST,Concept\n#4049,Hixson,Tennessee,Jersey Mikes");
  assert.equal(result.stores[0].code, "4049");
  assert.equal(result.stores[0].city, "Hixson");
  assert.equal(result.stores[0].state, "TN");
  assert.equal(result.stores[0].brand, "Jersey Mikes");
});

test("names a store after its city, or its number when there is no city", () => {
  const result = parseStores("store,state\n7,VA");
  assert.equal(result.stores[0].name, "Store 7");
});

test("reports a paste with no store number column", () => {
  const result = parseStores("city,state\nHixson,TN");
  assert.equal(result.stores.length, 0);
  assert.match(result.issues[0].message, /No store number column/);
});

test("skips a row with no store number and says which", () => {
  const result = parseStores("store,city,state\n,Hixson,TN\n4049,Ooltewah,TN");
  assert.equal(result.stores.length, 1);
  assert.equal(result.issues[0].row, 2);
});

test("a repeated store number keeps the later row and says so", () => {
  const result = parseStores("store,city,state\n4049,Hixson,TN\n4049,Ooltewah,TN");
  assert.equal(result.stores.length, 1);
  assert.equal(result.stores[0].city, "Ooltewah");
  assert.match(result.issues[0].message, /also appears on row 2/);
});

test("flags an unrecognised state", () => {
  const result = parseStores("store,city,state\n1,Toronto,ON");
  assert.equal(result.stores[0].state, null);
  assert.match(result.issues[0].message, /not a state we recognise/);
});

test("normalises state spellings", () => {
  assert.equal(normaliseState("va"), "VA");
  assert.equal(normaliseState(" Virginia "), "VA");
  assert.equal(normaliseState("North Carolina"), "NC");
  assert.equal(normaliseState("ZZ"), null);
  assert.equal(normaliseState(""), null);
});

test("Arizona keeps its own zone because it skips daylight saving", () => {
  assert.deepEqual(resolveTimezone("AZ", "Phoenix"), {
    timezone: "America/Phoenix",
    uncertain: false,
  });
});

test("Florida's panhandle is Central while the rest of the state is Eastern", () => {
  assert.equal(resolveTimezone("FL", "Pensacola").timezone, "America/Chicago");
  assert.equal(resolveTimezone("FL", "Orlando").timezone, "America/New_York");
});

test("generated group codes do not collide", () => {
  const taken = new Set<string>();
  assert.equal(slugCode("Jersey Mikes", taken), "JERSEY-MIKES");
  assert.equal(slugCode("Jersey Mikes", taken), "JERSEY-MIKES-2");
  assert.equal(slugCode("North Carolina", taken), "NORTH-CAROLINA");
  assert.equal(slugCode("!!!", taken), "GROUP");
});

test("a city named after its road still resolves its timezone", () => {
  assert.equal(resolveTimezone("TN", "Hixson Pike").timezone, "America/New_York");
  assert.equal(resolveTimezone("TN", "Gunbarrel Rd").timezone, "America/New_York");
  assert.equal(resolveTimezone("TN", "East Ridge Crossing").timezone, "America/New_York");
  assert.equal(resolveTimezone("TN", "Hixson Pike").uncertain, false);
});

test("a partial word does not count as a city match", () => {
  // "Clevelander" is not Cleveland, and nothing in the row settles it.
  assert.equal(resolveTimezone("TN", "Clevelander").uncertain, true);
});
