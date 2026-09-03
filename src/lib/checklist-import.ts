import type { ItemType } from "@prisma/client";

/**
 * Turns a pasted or uploaded checklist into template sections and items.
 *
 * People arrive with a spreadsheet, so this is deliberately forgiving: it
 * accepts CSV or tab-separated text (what you get by copying cells out of
 * Excel), matches column headings loosely, and falls back to reading a plain
 * list of lines when there is no recognisable header at all.
 */

export interface ParsedItem {
  label: string;
  helpText: string | null;
  type: ItemType;
  required: boolean;
  critical: boolean;
  weight: number;
  requirePhoto: boolean;
  photoOnFail: boolean;
  noteOnFail: boolean;
  actionOnFail: boolean;
  minValue: number | null;
  maxValue: number | null;
  unit: string | null;
  options: string[];
  failingOptions: string[];
  /** 1-based row in the uploaded file, for error messages. */
  sourceRow: number;
}

export interface ParsedSection {
  title: string;
  items: ParsedItem[];
}

export interface ImportIssue {
  row: number;
  message: string;
}

export interface ParseResult {
  sections: ParsedSection[];
  issues: ImportIssue[];
  itemCount: number;
  /** True when the input had no header row and was read as a plain list. */
  simpleMode: boolean;
}

// --- column matching ------------------------------------------------------

const COLUMNS: Record<string, string[]> = {
  section: ["section", "category", "area", "group", "heading"],
  item: ["item", "label", "question", "task", "check", "description", "step"],
  type: ["type", "answer", "answertype", "answer type", "responsetype", "response type", "input"],
  help: ["help", "helptext", "help text", "instructions", "instruction", "hint", "guidance", "notes"],
  required: ["required", "mandatory"],
  critical: ["critical", "criticalitem", "critical item", "cca", "ccp"],
  weight: ["weight", "points", "value"],
  min: ["min", "minimum", "minvalue", "min value", "low", "lower"],
  max: ["max", "maximum", "maxvalue", "max value", "high", "upper"],
  unit: ["unit", "units", "uom"],
  options: ["options", "choices", "answers", "values"],
  failing: ["failingoptions", "failing options", "failoptions", "fail options", "failing", "failvalues"],
  photo: ["photo", "photorequired", "photo required", "requirephoto", "picture", "image"],
  photoOnFail: ["photoonfail", "photo on fail", "photoiffail"],
  noteOnFail: ["noteonfail", "note on fail", "commentonfail", "reason"],
  action: ["action", "raiseaction", "raise action", "actiononfail", "action on fail", "correctiveaction", "corrective action", "followup", "follow up"],
};

function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\-./\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchColumn(header: string): string | null {
  const key = normaliseHeader(header);
  const squashed = key.replace(/\s+/g, "");
  for (const [field, aliases] of Object.entries(COLUMNS)) {
    if (aliases.includes(key) || aliases.includes(squashed)) return field;
  }
  return null;
}

// --- value coercion -------------------------------------------------------

const TYPE_ALIASES: Record<string, ItemType> = {
  checkbox: "CHECKBOX", check: "CHECKBOX", done: "CHECKBOX", "yes no": "CHECKBOX",
  yesno: "CHECKBOX", boolean: "CHECKBOX", tick: "CHECKBOX",
  "pass fail": "PASS_FAIL", passfail: "PASS_FAIL", pass: "PASS_FAIL",
  "ok not ok": "PASS_FAIL", compliance: "PASS_FAIL",
  temperature: "TEMPERATURE", temp: "TEMPERATURE", degrees: "TEMPERATURE",
  number: "NUMBER", numeric: "NUMBER", count: "NUMBER", quantity: "NUMBER",
  text: "TEXT", freetext: "TEXT", "free text": "TEXT", comment: "TEXT", note: "TEXT",
  select: "SELECT", choice: "SELECT", dropdown: "SELECT", single: "SELECT",
  "single choice": "SELECT", list: "SELECT",
  multiselect: "MULTISELECT", multi: "MULTISELECT", "multiple choice": "MULTISELECT",
  checkboxes: "MULTISELECT",
  photo: "PHOTO", picture: "PHOTO", image: "PHOTO",
  signature: "SIGNATURE", sign: "SIGNATURE", "sign off": "SIGNATURE", initials: "SIGNATURE",
  rating: "RATING", score: "RATING", scale: "RATING", stars: "RATING",
};

const TRUE_VALUES = new Set(["y", "yes", "true", "1", "x", "✓", "✔", "required", "critical"]);
const FALSE_VALUES = new Set(["n", "no", "false", "0", "", "-", "optional"]);

function toBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const value = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return fallback;
}

function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function toList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[|;,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// --- delimited text parsing ----------------------------------------------

/** Splits CSV/TSV honouring quoted cells and embedded newlines. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

/** Tabs win when present — that is what a spreadsheet paste looks like. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(";") && !firstLine.includes(",")) return ";";
  return ",";
}

// --- the parser -----------------------------------------------------------

const MAX_ITEMS = 500;

export function parseChecklist(text: string): ParseResult {
  const issues: ImportIssue[] = [];
  const trimmed = text.trim();

  if (!trimmed) {
    return { sections: [], issues: [{ row: 0, message: "Nothing to import." }], itemCount: 0, simpleMode: false };
  }

  const rows = parseDelimited(trimmed, detectDelimiter(trimmed));
  const header = rows[0] ?? [];
  const mapping = new Map<string, number>();

  header.forEach((cell, index) => {
    const field = matchColumn(cell);
    if (field && !mapping.has(field)) mapping.set(field, index);
  });

  // No "item" column means this is not a table we understand — read it as a
  // plain list of lines instead.
  const simpleMode = !mapping.has("item");
  const parsed = simpleMode
    ? parseSimpleList(rows, issues)
    : parseTable(rows, mapping, issues);

  const itemCount = parsed.reduce((sum, section) => sum + section.items.length, 0);
  if (itemCount === 0 && issues.length === 0) {
    issues.push({ row: 0, message: "No checklist items were found." });
  }
  if (itemCount > MAX_ITEMS) {
    issues.push({
      row: 0,
      message: `That is ${itemCount} items; the limit is ${MAX_ITEMS}. Split it into several checklists.`,
    });
  }

  return { sections: parsed, issues, itemCount, simpleMode };
}

function parseSimpleList(rows: string[][], issues: ImportIssue[]): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  rows.forEach((row, index) => {
    const label = (row[0] ?? "").trim();
    if (!label) return;

    // "# Food safety", "Food safety:" and an all-caps line are headings.
    const heading =
      label.startsWith("#") ||
      label.endsWith(":") ||
      (row.length === 1 && label === label.toUpperCase() && label.length > 3 && /[A-Z]/.test(label));

    if (heading) {
      current = { title: label.replace(/^#+\s*/, "").replace(/:$/, "").trim(), items: [] };
      sections.push(current);
      return;
    }

    if (!current) {
      current = { title: "Checklist", items: [] };
      sections.push(current);
    }

    if (label.length > 300) {
      issues.push({ row: index + 1, message: `"${label.slice(0, 40)}…" is too long for an item label.` });
      return;
    }

    current.items.push(baseItem(label, index + 1));
  });

  return sections.filter((section) => section.items.length > 0);
}

function parseTable(
  rows: string[][],
  mapping: Map<string, number>,
  issues: ImportIssue[],
): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const byTitle = new Map<string, ParsedSection>();

  const cell = (row: string[], field: string): string | undefined => {
    const index = mapping.get(field);
    if (index === undefined) return undefined;
    return row[index]?.trim();
  };

  rows.slice(1).forEach((row, offset) => {
    const sourceRow = offset + 2; // 1-based, and the header is row 1
    const label = cell(row, "item");
    if (!label) return;

    if (label.length > 300) {
      issues.push({ row: sourceRow, message: `Item label is longer than 300 characters.` });
      return;
    }

    const item = baseItem(label, sourceRow);
    item.helpText = cell(row, "help") || null;
    item.options = toList(cell(row, "options"));
    item.failingOptions = toList(cell(row, "failing"));
    item.minValue = toNumber(cell(row, "min"));
    item.maxValue = toNumber(cell(row, "max"));
    item.unit = cell(row, "unit") || null;
    item.type = resolveType(cell(row, "type"), item, issues, sourceRow);
    item.required = toBoolean(cell(row, "required"), true);
    item.critical = toBoolean(cell(row, "critical"), false);
    item.requirePhoto = toBoolean(cell(row, "photo"), false);
    item.photoOnFail = toBoolean(cell(row, "photoOnFail"), true);
    item.noteOnFail = toBoolean(cell(row, "noteOnFail"), true);
    item.actionOnFail = toBoolean(cell(row, "action"), true);

    const weight = toNumber(cell(row, "weight"));
    item.weight = weight && weight >= 1 ? Math.min(10, Math.round(weight)) : 1;

    validate(item, issues);

    const title = cell(row, "section") || "Checklist";
    let section = byTitle.get(title);
    if (!section) {
      section = { title, items: [] };
      byTitle.set(title, section);
      sections.push(section);
    }
    section.items.push(item);
  });

  return sections;
}

function baseItem(label: string, sourceRow: number): ParsedItem {
  return {
    label,
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
    sourceRow,
  };
}

/** Uses the stated type when it is recognisable, and infers one otherwise. */
function resolveType(
  raw: string | undefined,
  item: ParsedItem,
  issues: ImportIssue[],
  row: number,
): ItemType {
  if (raw) {
    const key = normaliseHeader(raw);
    const matched = TYPE_ALIASES[key] ?? TYPE_ALIASES[key.replace(/\s+/g, "")];
    if (matched) return matched;
    issues.push({
      row,
      message: `"${raw}" is not an answer type we recognise — treated as a checkbox.`,
    });
    return inferType(item);
  }
  return inferType(item);
}

function inferType(item: ParsedItem): ItemType {
  if (item.options.length >= 2) return "SELECT";
  if (item.minValue !== null || item.maxValue !== null) {
    return isDegreeUnit(item.unit) ? "TEMPERATURE" : "NUMBER";
  }
  return "CHECKBOX";
}

/** "°F", "F", "deg C" are temperatures; "cases" and "ppm" are not. */
function isDegreeUnit(unit: string | null): boolean {
  if (!unit) return false;
  const value = unit.trim().toLowerCase();
  return (
    value.includes("°") ||
    value.startsWith("deg") ||
    value === "f" ||
    value === "c" ||
    value === "fahrenheit" ||
    value === "celsius"
  );
}

function validate(item: ParsedItem, issues: ImportIssue[]) {
  if (
    (item.type === "SELECT" || item.type === "MULTISELECT") &&
    item.options.length < 2
  ) {
    issues.push({
      row: item.sourceRow,
      message: `"${item.label}" is a choice item but has fewer than two options.`,
    });
  }

  const stray = item.failingOptions.filter((option) => !item.options.includes(option));
  if (stray.length) {
    issues.push({
      row: item.sourceRow,
      message: `"${stray[0]}" is listed as a failing answer for "${item.label}" but is not one of its options.`,
    });
  }

  if (
    item.minValue !== null &&
    item.maxValue !== null &&
    item.minValue > item.maxValue
  ) {
    issues.push({
      row: item.sourceRow,
      message: `"${item.label}" has a minimum above its maximum.`,
    });
  }
}

/** The sample people can download to see the shape of the file. */
export const SAMPLE_CSV = `section,item,type,help,required,critical,weight,min,max,unit,options,failing options,photo on fail,raise action
Food safety,Walk-in cooler temperature,temperature,Read the thermometer on the middle shelf,yes,yes,3,33,40,°F,,,yes,yes
Food safety,Sanitizer bucket concentration,number,,yes,yes,3,200,400,ppm,,,yes,yes
Food safety,No expired product on the line,pass/fail,,yes,yes,3,,,,,,yes,yes
Equipment,Fryers at temperature and filtered,checkbox,,yes,no,2,,,,,,yes,yes
Equipment,Oil quality,select,,yes,no,2,,,,"Fresh|Acceptable|Needs changing",Needs changing,yes,yes
Readiness,Restrooms stocked and clean,pass/fail,,yes,no,2,,,,,,yes,yes
Readiness,Opening manager signature,signature,,yes,no,1,,,,,,no,no
`;
