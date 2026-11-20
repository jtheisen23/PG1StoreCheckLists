import { test } from "node:test";
import assert from "node:assert/strict";

import { NO_DIRECTOR, NO_VICE_PRESIDENT, parseRoster, pickRosterSheet } from "../src/lib/roster-import";

/** Shaped like PG1's Real Time Hierarchy workbook, Current Roster tab. */
const HEADER = [
  "Store #", "Site Name", "State", "Director of Operations", "Operator Name", "Operator email",
  "Operator Phone #", "President", "Vice President", "Store Address",
].join("\t");
const row = (...cells: string[]) => cells.join("\t");
const ROSTER = [
  HEADER,
  row("3062", "Log Cabin", "NC", "jasmine@pg1restaurants.com", "Quentin Green", "quentin@pg1restaurants.com", "(704) 984-2115", "Cliff@pg1restaurants.com", "Austinw@pg1restaurants.com", "5940 University Parkway, Winston-Salem, NC 27105"),
  row("3122", "Denver", "NC", "jasmine@pg1restaurants.com", "Drew Blair", "drew@pg1restaurants.com", "(704) 726-0169", "Cliff@pg1restaurants.com", "Austinw@pg1restaurants.com", "7260 Highway 73, Denver, NC 28037"),
  row("12042", "Hays Farm", "AL", "gabriel@pg1restaurants.com", "Aretha Holden", "aretha@pg1restaurants.com", "(205) 706-6776", "Cliff@pg1restaurants.com", "Delvin@pg1restaurants.com", "9070 Memorial Parkway SW, Huntsville, AL 35802"),
  row("12035", "Scottsboro", "AL", "gabriel@pg1restaurants.com", "", "", "(938) 257-4129", "Cliff@pg1restaurants.com", "Delvin@pg1restaurants.com", "24540 John T. Reid Parkway, Scottsboro, AL 35768"),
  row("4043", "Gunbarrel", "TN", "emma@pg1restaurants.com", "Cam Lamoureux", "cam@pg1restaurants.com", "(423) 268-1794", "Cliff@pg1restaurants.com", "Dom@pg1restaurants.com", "2260 Gunbarrel Road, Chattanooga, TN 37421"),
  row("4049", "Hixon", "TN", "emma@pg1restaurants.com", "Gabe Jones", "gabe@pg1restaurants.com", "(423) 320-5060", "Cliff@pg1restaurants.com", "Dom@pg1restaurants.com", "5002 Hixson Pike, Suite 10, Hixson, TN 37343"),
].join("\n");

test("each store comes out with its street, city, ZIP and a timezone the address settles", () => {
  const { stores, issues } = parseRoster(ROSTER);
  assert.equal(stores.length, 6);
  const gunbarrel = stores.find((s) => s.code === "4043")!;
  assert.equal(gunbarrel.name, "Gunbarrel");
  assert.equal(gunbarrel.address, "2260 Gunbarrel Road");
  assert.equal(gunbarrel.city, "Chattanooga");
  assert.equal(gunbarrel.postalCode, "37421");
  // Tennessee is mostly Central; Chattanooga is not, and only the city says so.
  assert.equal(gunbarrel.timezone, "America/New_York");
  assert.equal(gunbarrel.timezoneUncertain, false);
  assert.equal(stores.find((s) => s.code === "4049")!.address, "5002 Hixson Pike, Suite 10");
  assert.equal(stores.find((s) => s.code === "12042")!.timezone, "America/Chicago");
  assert.equal(stores.find((s) => s.code === "3062")!.timezone, "America/New_York");
  assert.ok(!issues.some((i) => /timezone/.test(i.message)));
});

test("the hierarchy follows the people: a region per vice president, a district per director", () => {
  const result = parseRoster(ROSTER, { knownNames: { "austinw@pg1restaurants.com": "Austin Wade" } });
  assert.equal(result.groupedBy, "leaders");
  assert.deepEqual(result.structure, [
    { region: "Austin Wade", districts: ["Jasmine"] },
    { region: "Delvin", districts: ["Gabriel"] },
    { region: "Dom", districts: ["Emma"] },
  ]);
  const hays = result.stores.find((s) => s.code === "12042")!;
  assert.equal(hays.regionName, "Delvin");
  assert.equal(hays.districtName, "Gabriel");
});

test("people get their roles and the stores they hold", () => {
  const { people } = parseRoster(ROSTER);
  const find = (email: string) => people.find((p) => p.email === email)!;
  assert.equal(find("cliff@pg1restaurants.com").role, "PRESIDENT");
  assert.equal(find("cliff@pg1restaurants.com").wholeOrg, true);
  assert.equal(find("austinw@pg1restaurants.com").role, "VICE_PRESIDENT");
  assert.deepEqual(find("austinw@pg1restaurants.com").storeCodes, ["3062", "3122"]);
  assert.equal(find("gabriel@pg1restaurants.com").role, "DIRECTOR_OF_OPS");
  assert.deepEqual(find("gabriel@pg1restaurants.com").storeCodes, ["12042", "12035"]);
  const cam = find("cam@pg1restaurants.com");
  assert.equal(cam.role, "OPERATOR");
  assert.equal(cam.name, "Cam Lamoureux");
  assert.equal(cam.namedInSheet, true);
  assert.equal(cam.phone, "(423) 268-1794");
  // A leader the sheet gives only as an address keeps whatever name they have.
  assert.equal(find("emma@pg1restaurants.com").namedInSheet, false);
  assert.equal(people.length, 5 + 7, "five operators, seven leaders");
});

test("a store with no operator is reported once, and still belongs to its leaders", () => {
  const { issues, people, stores } = parseRoster(ROSTER);
  assert.equal(issues.filter((i) => /12035 has no operator/.test(i.message)).length, 1);
  assert.ok(stores.some((s) => s.code === "12035"));
  assert.ok(people.find((p) => p.email === "gabriel@pg1restaurants.com")!.storeCodes.includes("12035"));
});

test("a sheet that names its own regions and districts keeps them", () => {
  const sheet = [
    `${HEADER}\tRegion\tDistrict`,
    `${ROSTER.split("\n")[1]}\tCarolinas\tTriad`,
  ].join("\n");
  const result = parseRoster(sheet);
  assert.equal(result.groupedBy, "sheet");
  assert.deepEqual(result.structure, [{ region: "Carolinas", districts: ["Triad"] }]);
});

test("a store with no vice president or director is grouped as such, not dropped", () => {
  const sheet = [HEADER, row("9001", "New Store", "NC", "", "", "", "", "Cliff@pg1restaurants.com", "", "1 Main St, Shelby, NC 28150")].join("\n");
  const result = parseRoster(sheet);
  assert.deepEqual(result.structure, [{ region: NO_VICE_PRESIDENT, districts: [NO_DIRECTOR] }]);
  assert.equal(result.stores[0].city, "Shelby");
});

test("the roster tab is chosen over the other tabs of the workbook", () => {
  const sheets = [
    { name: "Future Development Pipeline", rows: [["Store #", "", "", "Email 3"], ["3090", "High Point, NC", "NC", ""]] },
    { name: "Current Roster", rows: ROSTER.split("\n").map((line) => line.split("\t")) },
    { name: "Next Up Leaders", rows: [["Store #", "Site Name", "State", "Leader 1"]] },
  ];
  assert.equal(pickRosterSheet(sheets), 1);
});

test("nothing pasted is nothing to import", () => {
  assert.deepEqual(parseRoster("   ").stores, []);
});
