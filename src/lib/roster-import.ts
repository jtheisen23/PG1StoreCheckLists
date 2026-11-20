import { detectDelimiter, parseDelimited } from "./checklist-import";
import {
  hierarchyColumn,
  parseHierarchy,
  type ImportIssue,
  type KnownDomain,
  type ParsedPerson,
} from "./hierarchy-import";
import { parseStores, storeColumn, type ParsedStore } from "./store-import";

/**
 * The whole organization from one roster: one row per store, naming the store
 * (number, name, state, address) and the people over it (operator, director of
 * operations, vice president, president).
 *
 * Permission here is a list of stores attached to a person, never a role
 * attached to an entity, so the roster is the one statement of who covers
 * what. This reads it with the same parsers the separate store and people
 * imports use, so a store or person comes out exactly as either would make it,
 * and adds the hierarchy the sheet implies: when it names no region or
 * district, each vice president's stores are a region and each director of
 * operations' stores a district within it.
 *
 * Pure — the Admin preview runs it as you type, and the server runs it again
 * on what it receives rather than trusting the preview.
 */

export interface RosterOptions {
  fixSuspectDomains?: boolean;
  knownDomains?: KnownDomain[];
  /** Names people already have here, by lower-case email. */
  knownNames?: Record<string, string>;
}

export interface RosterParseResult {
  stores: ParsedStore[];
  people: ParsedPerson[];
  /** Region -> districts, in the order they first appear. */
  structure: { region: string; districts: string[] }[];
  /** Whether regions and districts came from the sheet or from its leaders. */
  groupedBy: "sheet" | "leaders";
  issues: ImportIssue[];
  suspectEmails: { email: string; suggestion: string; rows: number[] }[];
}

export const NO_VICE_PRESIDENT = "No vice president";
export const NO_DIRECTOR = "No director of operations";

const EMPTY: RosterParseResult = {
  stores: [],
  people: [],
  structure: [],
  groupedBy: "leaders",
  issues: [],
  suspectEmails: [],
};

export function parseRoster(text: string, options: RosterOptions = {}): RosterParseResult {
  if (!text.trim()) return EMPTY;

  const hierarchy = parseHierarchy(text, {
    fixSuspectDomains: options.fixSuspectDomains,
    knownDomains: options.knownDomains,
  });

  const rows = parseDelimited(text, detectDelimiter(text)).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  if (!rows.length) return { ...EMPTY, issues: hierarchy.issues };

  const header = rows[0];
  const index = (key: string) => header.findIndex((cell) => hierarchyColumn(cell) === key);
  const vpColumn = index("vicePresident");
  const doColumn = index("directorOfOps");
  const sheetRegions = header.some((cell) => storeColumn(cell) === "region");
  const sheetDistricts = header.some((cell) => storeColumn(cell) === "district");

  // A leader's region or district reads as their name: the one they already
  // have here, or the one the people import gives them.
  const correction = new Map(
    options.fixSuspectDomains ? hierarchy.suspectEmails.map((s) => [s.email, s.suggestion]) : [],
  );
  const people = new Map(hierarchy.people.map((person) => [person.email, person]));
  const leaderName = (raw: string | undefined, fallback: string) => {
    const value = raw?.trim().toLowerCase();
    if (!value || !value.includes("@")) return fallback;
    const email = correction.get(value) ?? value;
    return options.knownNames?.[email] ?? people.get(email)?.name ?? fallback;
  };

  const augmented = rows.map((row, i) => {
    const extra: string[] = [];
    if (i === 0) {
      if (!sheetRegions) extra.push("Region");
      if (!sheetDistricts) extra.push("District");
    } else {
      if (!sheetRegions) extra.push(leaderName(row[vpColumn], NO_VICE_PRESIDENT));
      if (!sheetDistricts) extra.push(leaderName(row[doColumn], NO_DIRECTOR));
    }
    return [...row, ...extra].map((cell) => (cell ?? "").replace(/[\t\r\n]+/g, " "));
  });
  const stores = parseStores(augmented.map((row) => row.join("\t")).join("\n"), "brand");

  // Both parsers notice a missing store number or a repeated row; say it once.
  const seen = new Set<string>();
  const issues = [...stores.issues, ...hierarchy.issues].filter((issue) => {
    const key = `${issue.row}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    stores: stores.stores,
    people: hierarchy.people,
    structure: stores.structure,
    groupedBy: sheetRegions || sheetDistricts ? "sheet" : "leaders",
    issues,
    suspectEmails: hierarchy.suspectEmails,
  };
}

/** The sheet in a workbook that looks like a roster: a store column and people. */
export function pickRosterSheet(sheets: { name: string; rows: string[][] }[]): number {
  const score = (rows: string[][]) => {
    const header = rows[0] ?? [];
    const hasStore = header.some((cell) => hierarchyColumn(cell) === "code");
    const leaders = header.filter((cell) =>
      ["operatorEmail", "president", "vicePresident", "directorOfOps"].includes(hierarchyColumn(cell) ?? ""),
    ).length;
    return hasStore ? leaders * 1000 + rows.length : -1;
  };
  let best = 0;
  sheets.forEach((sheet, i) => {
    if (score(sheet.rows) > score(sheets[best].rows)) best = i;
  });
  return best;
}
