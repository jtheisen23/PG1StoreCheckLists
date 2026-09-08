import { test } from "node:test";
import assert from "node:assert/strict";

import {
  editDistance,
  findSuspectDomains,
  nameFromEmail,
  parseHierarchy,
} from "../src/lib/hierarchy-import";

const HEADER =
  "Store Number\tOperator Name\tOperator email\tOperator Phone\tPresident\tVice President\tDirector of Operations";

/** Shaped like the real export, typos and all. */
const SHEET = [
  HEADER,
  "3027\tJustis Craig\tJustis@pg1restaurants.com\t7049842115\tCliff@pg1restaurants.com\tNeal@pg1restaurants.com\taustinw@pg1restaurant.com",
  "3053\tJaMia Cochraine\tJaMia@pg1restaurants.com\t7436492708\tCliff@pg1restaurants.com\tNeal@pg1restaurants.com\tmelissa@pg1restaurants.com",
  "3066\tFranklin Steele\tFranklin@pg1restaurants.com\t9807773216\tCliff@pg1restaurants.com\tNeal@pg1restaurants.com\taustinw@pg1restaurants.com",
  "3158\t\t\t\tCliff@pg1restaurants.com\tNeal@pg1restaurants.com\tmelissa@pg1restaurants.com",
  "4043\tSam Reed\tsam@pg1restaurants.com\t4235550101\tCliff@pg1restaurants.com\tDom@pg1restauratnts.com\trudy@pg1restaurants.com",
  "4049\tLee Park\tlee@pg1restaurants.com\t4235550102\tCliff@pg1restaurants.com\tDom@pg1restauratnts.com\trudy@pg1restaurants.com",
].join("\n");

test("collapses one row per store into people holding many stores", () => {
  const result = parseHierarchy(SHEET);
  assert.equal(result.storeCodes.length, 6);

  const neal = result.people.find((p) => p.email === "neal@pg1restaurants.com");
  assert.ok(neal);
  assert.equal(neal.role, "VICE_PRESIDENT");
  assert.deepEqual(neal.storeCodes, ["3027", "3053", "3066", "3158"]);
});

test("the president covers the company rather than a list of stores", () => {
  const cliff = parseHierarchy(SHEET).people.find(
    (p) => p.email === "cliff@pg1restaurants.com",
  );
  assert.ok(cliff);
  assert.equal(cliff.role, "PRESIDENT");
  assert.equal(cliff.wholeOrg, true);
  assert.deepEqual(cliff.storeCodes, []);
});

test("an operator holds the store on their own row", () => {
  const justis = parseHierarchy(SHEET).people.find(
    (p) => p.email === "justis@pg1restaurants.com",
  );
  assert.ok(justis);
  assert.equal(justis.role, "OPERATOR");
  assert.equal(justis.name, "Justis Craig");
  assert.equal(justis.phone, "7049842115");
  assert.deepEqual(justis.storeCodes, ["3027"]);
});

test("a mistyped domain is flagged rather than quietly made into a second person", () => {
  const result = parseHierarchy(SHEET);
  const suspects = Object.fromEntries(
    result.suspectEmails.map((s) => [s.email, s.suggestion]),
  );
  assert.equal(suspects["austinw@pg1restaurant.com"], "austinw@pg1restaurants.com");
  assert.equal(suspects["dom@pg1restauratnts.com"], "dom@pg1restaurants.com");

  // Left alone, it really is two Austins holding one store each.
  const austins = result.people.filter((p) => p.email.startsWith("austinw@"));
  assert.equal(austins.length, 2);
});

test("correcting the domains merges the split person back together", () => {
  const result = parseHierarchy(SHEET, { fixSuspectDomains: true });
  const austins = result.people.filter((p) => p.email.startsWith("austinw@"));
  assert.equal(austins.length, 1);
  assert.deepEqual(austins[0].storeCodes, ["3027", "3066"]);
  assert.ok(!result.people.some((p) => p.email.includes("pg1restauratnts")));
});

test("a store with nobody operating it is reported, not silently skipped", () => {
  const result = parseHierarchy(SHEET);
  assert.ok(result.issues.some((i) => /3158 has no operator/.test(i.message)));
  // The store still counts — it exists, it just has a gap.
  assert.ok(result.storeCodes.includes("3158"));
});

test("a header repeated partway down the sheet is not read as a store", () => {
  const result = parseHierarchy([HEADER, SHEET.split("\n")[1], HEADER].join("\n"));
  assert.deepEqual(result.storeCodes, ["3027"]);
});

test("names are derived from the address when only an address is given", () => {
  assert.equal(nameFromEmail("melissa@pg1restaurants.com"), "Melissa");
  assert.equal(nameFromEmail("first.last@pg1restaurants.com"), "First Last");
  assert.equal(nameFromEmail("austinw@pg1restaurants.com"), "Austinw");
});

test("only a near-miss of the house domain is suspected", () => {
  const entries = [
    ...Array.from({ length: 8 }, (_, i) => ({ email: `a${i}@pg1restaurants.com`, row: i })),
    { email: "someone@gmail.com", row: 20 },
    { email: "typo@pg1restaurant.com", row: 21 },
  ];
  const found = findSuspectDomains(entries).map((s) => s.email);
  // A genuinely different domain is somebody's personal address, not a typo.
  assert.deepEqual(found, ["typo@pg1restaurant.com"]);
});

test("nothing is suspected when there is no dominant domain to compare against", () => {
  assert.deepEqual(
    findSuspectDomains([
      { email: "a@one.com", row: 1 },
      { email: "b@two.com", row: 2 },
    ]),
    [],
  );
});

test("edit distance counts the mistakes people actually make", () => {
  assert.equal(editDistance("pg1restaurants.com", "pg1restaurants.com"), 0);
  assert.equal(editDistance("pg1restaurant.com", "pg1restaurants.com"), 1);
  assert.equal(editDistance("pg1restaurants.co", "pg1restaurants.com"), 1);
  // An inserted letter, not a transposition — one edit, not two.
  assert.equal(editDistance("pg1restauratnts.com", "pg1restaurants.com"), 1);
  assert.equal(editDistance("pg1reataurants.com", "pg1restaurants.com"), 1);
  // Far enough apart to be somebody's real, different address.
  assert.ok(editDistance("gmail.com", "pg1restaurants.com") > 2);
});

test("a paste with no store number column says so", () => {
  const result = parseHierarchy("name,email\nSam,sam@pg1restaurants.com");
  assert.equal(result.people.length, 0);
  assert.match(result.issues[0].message, /No store number column/);
});

test("a two-row paste is checkable against the domains people already use", () => {
  // Nothing in these two rows says what is normal, so before this the typo
  // sailed through: the sheet needs three agreeing rows to teach itself.
  const tiny = [
    HEADER,
    "3027\tSam Reed\tsam@pg1restaurant.com\t5551110000\t\t\tmelissa@pg1restaurants.com",
  ].join("\n");

  assert.deepEqual(parseHierarchy(tiny).suspectEmails, []);

  const withKnowledge = parseHierarchy(tiny, {
    knownDomains: [{ domain: "pg1restaurants.com", users: 67 }],
  });
  assert.equal(withKnowledge.suspectEmails.length, 1);
  assert.equal(withKnowledge.suspectEmails[0].email, "sam@pg1restaurant.com");
  assert.equal(
    withKnowledge.suspectEmails[0].suggestion,
    "sam@pg1restaurants.com",
  );
});

test("one account created from an earlier typo does not become the standard", () => {
  const tiny = [
    HEADER,
    "3027\tSam Reed\tsam@pg1restaurant.com\t5551110000\t\t\tmelissa@pg1restaurants.com",
  ].join("\n");
  const result = parseHierarchy(tiny, {
    knownDomains: [
      { domain: "pg1restaurants.com", users: 67 },
      // Somebody imported before this check existed.
      { domain: "pg1restaurant.com", users: 1 },
    ],
  });
  assert.equal(result.suspectEmails.length, 1);
  assert.equal(result.suspectEmails[0].suggestion, "sam@pg1restaurants.com");
});

test("a domain two people share is trusted rather than corrected", () => {
  // A second brand, a franchise partner, an agency — real, just not the house one.
  const tiny = [
    HEADER,
    "3027\tSam Reed\tsam@pg1restaurant.com\t5551110000\t\t\tmelissa@pg1restaurants.com",
  ].join("\n");
  const result = parseHierarchy(tiny, {
    knownDomains: [
      { domain: "pg1restaurants.com", users: 67 },
      { domain: "pg1restaurant.com", users: 2 },
    ],
  });
  assert.deepEqual(result.suspectEmails, []);
});

test("an address on a genuinely different domain is left alone", () => {
  const tiny = [
    HEADER,
    "3027\tSam Reed\tsam@gmail.com\t5551110000\t\t\tmelissa@pg1restaurants.com",
  ].join("\n");
  const result = parseHierarchy(tiny, {
    knownDomains: [{ domain: "pg1restaurants.com", users: 67 }],
  });
  assert.deepEqual(result.suspectEmails, []);
});

test("the real sheet is still caught with no prior knowledge at all", () => {
  // The first import has nobody to learn from, so the sheet must teach itself.
  const found = parseHierarchy(SHEET).suspectEmails.map((s) => s.email);
  assert.ok(found.includes("austinw@pg1restaurant.com"));
  assert.ok(found.includes("dom@pg1restauratnts.com"));
});
