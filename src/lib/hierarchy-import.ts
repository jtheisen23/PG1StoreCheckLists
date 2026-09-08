import { Role } from "@prisma/client";

import { detectDelimiter, parseDelimited } from "./checklist-import";
import { isEmail } from "./email-content";

/**
 * Turns an org chart into people and the stores they cover.
 *
 * One row per store, naming who operates it and who it rolls up to. The same
 * vice president appears on thirty rows; the point of this parser is to collapse
 * that into one person holding thirty stores.
 */

export interface ParsedPerson {
  email: string;
  name: string;
  role: Role;
  /** Store codes this person covers. Empty for a president, who covers all. */
  storeCodes: string[];
  wholeOrg: boolean;
  phone: string | null;
}

export interface ImportIssue {
  row: number;
  message: string;
}

export interface HierarchyParseResult {
  people: ParsedPerson[];
  /** Store codes seen, in order of first appearance. */
  storeCodes: string[];
  issues: ImportIssue[];
  /** Addresses whose domain looks like a misspelling of the common one. */
  suspectEmails: { email: string; suggestion: string; rows: number[] }[];
}

const COLUMNS: Record<string, string[]> = {
  code: ["store", "store#", "storenumber", "store number", "number", "code", "unit", "site"],
  operatorName: ["operator", "operator name", "operatorname", "name"],
  operatorEmail: ["operator email", "operatoremail", "email", "operator e-mail"],
  operatorPhone: ["operator phone", "operatorphone", "phone", "mobile", "cell"],
  president: ["president", "pres"],
  vicePresident: ["vice president", "vicepresident", "vp"],
  directorOfOps: [
    "director of operations", "directorofoperations", "director of ops",
    "do", "dir of ops", "dircetor of operations",
  ],
};

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_.#-]+/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function matchColumn(header: string): string | null {
  const cleaned = normaliseHeader(header);
  if (!cleaned) return null;
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    if (aliases.some((alias) => normaliseHeader(alias) === cleaned)) return key;
  }
  return null;
}

/** "melissa" -> "Melissa"; "austinw" -> "Austinw"; "first.last" -> "First Last". */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Levenshtein distance, used only to spot a mistyped email domain. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[cols - 1];
}

/**
 * Addresses whose domain is nearly, but not quite, the one everybody else uses.
 *
 * A single transposed letter makes a different person: one who never gets the
 * audit, cannot sign in, and splits a real person's stores across two accounts
 * that each look plausible. Worth stopping to look at rather than importing.
 */
export interface KnownDomain {
  domain: string;
  /** How many people in the organization already use it. */
  users: number;
}

/**
 * The domains an address is measured against.
 *
 * Two sources. The organization's own — the domains real people already sign in
 * with — which is what makes a two-row paste checkable at all. And the sheet's
 * own dominant domain, for the first import, when there is nobody to learn
 * from yet.
 *
 * A domain used by exactly one person is trusted only if it is the most common
 * one there is, so a single account created from an earlier typo does not
 * quietly become the standard everything else is judged against.
 */
export function trustedDomains(
  entries: { email: string }[],
  known: KnownDomain[] = [],
): Set<string> {
  const trusted = new Set<string>();

  const ranked = [...known].sort((a, b) => b.users - a.users);
  if (ranked.length) {
    trusted.add(ranked[0].domain);
    for (const entry of ranked) if (entry.users >= 2) trusted.add(entry.domain);
  }

  const counts = new Map<string, number>();
  for (const { email } of entries) {
    const domain = email.split("@")[1];
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (dominant && dominant[1] >= 3) trusted.add(dominant[0]);

  return trusted;
}

export function findSuspectDomains(
  entries: { email: string; row: number }[],
  known: KnownDomain[] = [],
): { email: string; suggestion: string; rows: number[] }[] {
  const trusted = trustedDomains(entries, known);
  if (!trusted.size) return [];

  const suspects = new Map<string, { suggestion: string; rows: number[] }>();
  for (const { email, row } of entries) {
    const domain = email.split("@")[1];
    if (!domain || trusted.has(domain)) continue;

    // Nearest trusted domain wins, so an organization using two domains gets
    // the right suggestion rather than whichever was checked first.
    let best: { domain: string; distance: number } | null = null;
    for (const candidate of trusted) {
      const distance = editDistance(domain, candidate);
      if (distance > 0 && distance <= 2 && (!best || distance < best.distance)) {
        best = { domain: candidate, distance };
      }
    }
    // Far from everything is somebody's own address, not a mistake.
    if (!best) continue;

    const existing = suspects.get(email);
    if (existing) existing.rows.push(row);
    else {
      suspects.set(email, {
        suggestion: `${email.split("@")[0]}@${best.domain}`,
        rows: [row],
      });
    }
  }
  return [...suspects.entries()].map(([email, rest]) => ({ email, ...rest }));
}

interface Column {
  key: string;
  role: Role;
  label: string;
}

const LEADER_COLUMNS: Column[] = [
  { key: "president", role: Role.PRESIDENT, label: "President" },
  { key: "vicePresident", role: Role.VICE_PRESIDENT, label: "Vice President" },
  { key: "directorOfOps", role: Role.DIRECTOR_OF_OPS, label: "Director of Operations" },
];

export function parseHierarchy(
  text: string,
  options: { fixSuspectDomains?: boolean; knownDomains?: KnownDomain[] } = {},
): HierarchyParseResult {
  const issues: ImportIssue[] = [];
  const rows = parseDelimited(text, detectDelimiter(text)).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  if (!rows.length) {
    return { people: [], storeCodes: [], issues, suspectEmails: [] };
  }

  const mapping = new Map<string, number>();
  rows[0].forEach((cell, index) => {
    const key = matchColumn(cell);
    if (key && !mapping.has(key)) mapping.set(key, index);
  });
  if (!mapping.has("code")) {
    issues.push({
      row: 1,
      message:
        'No store number column found. The first row should name the columns, e.g. "Store Number, Operator Name, Operator email, President, Vice President, Director of Operations".',
    });
    return { people: [], storeCodes: [], issues, suspectEmails: [] };
  }

  const cell = (row: string[], key: string) => {
    const index = mapping.get(key);
    const value = index === undefined ? undefined : row[index];
    return value?.trim() || undefined;
  };

  // Gather every address first, so a mistyped domain is judged against the one
  // the rest of the sheet uses.
  const seenEmails: { email: string; row: number }[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    for (const key of ["operatorEmail", "president", "vicePresident", "directorOfOps"]) {
      const raw = cell(rows[i], key);
      if (raw && raw.includes("@")) {
        seenEmails.push({ email: raw.toLowerCase(), row: i + 1 });
      }
    }
  }
  const suspectEmails = findSuspectDomains(seenEmails, options.knownDomains);
  const correction = new Map(
    suspectEmails.map((entry) => [entry.email, entry.suggestion]),
  );

  const resolve = (raw: string) => {
    const lower = raw.toLowerCase();
    return options.fixSuspectDomains ? (correction.get(lower) ?? lower) : lower;
  };

  const people = new Map<string, ParsedPerson>();
  const storeCodes: string[] = [];
  const seenCodes = new Set<string>();

  const add = (
    email: string,
    role: Role,
    code: string | null,
    name?: string,
    phone?: string,
  ) => {
    const existing = people.get(email);
    if (existing) {
      if (code && !existing.storeCodes.includes(code)) existing.storeCodes.push(code);
      if (name && !existing.name) existing.name = name;
      if (phone && !existing.phone) existing.phone = phone;
      return;
    }
    people.set(email, {
      email,
      name: name || nameFromEmail(email),
      role,
      storeCodes: code ? [code] : [],
      wholeOrg: role === Role.PRESIDENT,
      phone: phone ?? null,
    });
  };

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const sourceRow = i + 1;
    const rawCode = cell(row, "code") ?? "";

    // Spreadsheets exported in pieces carry their header again partway down.
    if (matchColumn(rawCode) === "code") continue;

    const code = rawCode.replace(/^#/, "").replace(/\.0$/, "").trim();
    if (!code) {
      issues.push({ row: sourceRow, message: "No store number; row skipped." });
      continue;
    }
    if (!seenCodes.has(code)) {
      seenCodes.add(code);
      storeCodes.push(code);
    } else {
      issues.push({ row: sourceRow, message: `Store ${code} appears more than once.` });
    }

    const operatorEmail = cell(row, "operatorEmail");
    if (operatorEmail && operatorEmail.includes("@")) {
      const email = resolve(operatorEmail);
      if (isEmail(email)) {
        add(
          email,
          Role.OPERATOR,
          code,
          cell(row, "operatorName"),
          cell(row, "operatorPhone")?.replace(/\.0$/, ""),
        );
      } else {
        issues.push({
          row: sourceRow,
          message: `Store ${code}: "${operatorEmail}" is not a valid email address.`,
        });
      }
    } else {
      issues.push({
        row: sourceRow,
        message: `Store ${code} has no operator — nobody is assigned to it.`,
      });
    }

    for (const column of LEADER_COLUMNS) {
      const raw = cell(row, column.key);
      if (!raw || !raw.includes("@")) {
        if (column.role !== Role.PRESIDENT) {
          issues.push({
            row: sourceRow,
            message: `Store ${code} has no ${column.label}.`,
          });
        }
        continue;
      }
      const email = resolve(raw);
      if (!isEmail(email)) {
        issues.push({
          row: sourceRow,
          message: `Store ${code}: "${raw}" is not a valid ${column.label} address.`,
        });
        continue;
      }
      // A president covers the company, so their row's store adds nothing.
      add(email, column.role, column.role === Role.PRESIDENT ? null : code);
    }
  }

  return {
    people: [...people.values()],
    storeCodes,
    issues,
    suspectEmails,
  };
}
