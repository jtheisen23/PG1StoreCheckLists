/**
 * The sub weight rule, and everything that reads or reports it. Pure, so the
 * walk screen that tells a manager "under by 0.3 oz" and the server that
 * records it cannot disagree.
 *
 * The rule is deliberately not a symmetric tolerance. The spec weight is the
 * floor: a sub may never be under it. Spec + 0.5 oz is the ceiling. Under is a
 * guest problem and over is a food-cost problem, so they are different
 * violations and are always counted apart. A spec with no target weight yet
 * (the BLT, for one) can be logged but is not judged.
 */

/** Largest first, the way the menu and the prototype list them. */
export const SUB_SIZES = ["GIANT", "REGULAR", "MINI"] as const;
export type SubSize = (typeof SUB_SIZES)[number];

export const SUB_SIZE_LABELS: Record<SubSize, string> = {
  MINI: "Mini",
  REGULAR: "Regular",
  GIANT: "Giant",
};

/** How far above spec a sub may run before it is overweight. */
export const OVER_TOLERANCE_OZ = 0.5;

/** The heaviest weight anyone could mean; above this it is a typo, not a sub. */
export const MAX_SUB_OZ = 80;

export type WeightVerdict = "UNDER" | "ACCEPTABLE" | "OVER" | "UNSCORED";

export interface Weighing {
  verdict: WeightVerdict;
  /** Weight minus spec, in ounces. Null when there is no spec. */
  vsSpecOz: number | null;
  /** How far under the floor, for an underweight sub. */
  shortOz: number;
  /** How far over the ceiling, for an overweight sub. */
  overOz: number;
}

/** Ounces held as whole hundredths, so 8.1 + 0.5 is never 8.600000000000001. */
const hundredths = (oz: number) => Math.round(oz * 100);
const ounces = (h: number) => h / 100;

export function weighSub(weightOz: number, specOz: number | null | undefined): Weighing {
  if (specOz === null || specOz === undefined) {
    return { verdict: "UNSCORED", vsSpecOz: null, shortOz: 0, overOz: 0 };
  }
  const weight = hundredths(weightOz);
  const floor = hundredths(specOz);
  const ceiling = floor + hundredths(OVER_TOLERANCE_OZ);
  const vsSpecOz = ounces(weight - floor);
  if (weight < floor) {
    return { verdict: "UNDER", vsSpecOz, shortOz: ounces(floor - weight), overOz: 0 };
  }
  if (weight > ceiling) {
    return { verdict: "OVER", vsSpecOz, shortOz: 0, overOz: ounces(weight - ceiling) };
  }
  return { verdict: "ACCEPTABLE", vsSpecOz, shortOz: 0, overOz: 0 };
}

/** A weighing is answered once it says which sub, at which size, and what it weighed. */
export function weighingComplete(answer: {
  numericValue?: number | null;
  subSpecId?: string | null;
}): boolean {
  return (
    answer.numericValue !== null &&
    answer.numericValue !== undefined &&
    !Number.isNaN(answer.numericValue) &&
    Boolean(answer.subSpecId)
  );
}

/** Pass, fail, or not judged — what a weighing means to a checklist score. */
export function weighingPassed(weighing: Weighing): boolean | null {
  if (weighing.verdict === "UNSCORED") return null;
  return weighing.verdict === "ACCEPTABLE";
}

export function formatOz(oz: number): string {
  return `${Number(oz.toFixed(2))} oz`;
}

/** "8.00–8.50 oz", the window a sub has to land in. Scales read in hundredths. */
export function acceptableRange(specOz: number, unit = true): string {
  const ceiling = ounces(hundredths(specOz) + hundredths(OVER_TOLERANCE_OZ));
  return `${specOz.toFixed(2)}–${ceiling.toFixed(2)}${unit ? " oz" : ""}`;
}

/** The ceiling: spec + 0.5 oz. */
export function ceilingOz(specOz: number): number {
  return ounces(hundredths(specOz) + hundredths(OVER_TOLERANCE_OZ));
}

/**
 * The verdict as the scale screen says it: signed against spec, then what it
 * means — "+0.15 oz in range", "−0.15 oz underweight — 0.15 oz short".
 */
export function verdictLine(weighing: Weighing): string {
  if (weighing.verdict === "UNSCORED" || weighing.vsSpecOz === null) {
    return "No spec weight — logged, not scored";
  }
  const sign = weighing.vsSpecOz > 0 ? "+" : weighing.vsSpecOz < 0 ? "−" : "±";
  const signed = `${sign}${Math.abs(weighing.vsSpecOz).toFixed(2)} oz`;
  switch (weighing.verdict) {
    case "UNDER":
      return `${signed} underweight — ${weighing.shortOz.toFixed(2)} oz short`;
    case "OVER":
      return `${signed} overweight — ${weighing.overOz.toFixed(2)} oz past the limit`;
    default:
      return `${signed} in range`;
  }
}

/**
 * Which colour a verdict wears. Under is the guest problem and wears the
 * failure colour; over is a food-cost problem — real, but a different kind
 * of wrong — and wears amber, so the two never read as one.
 */
export function verdictTone(verdict: WeightVerdict): "pass" | "warn" | "fail" | "neutral" {
  return verdict === "ACCEPTABLE" ? "pass" : verdict === "OVER" ? "warn" : verdict === "UNDER" ? "fail" : "neutral";
}

/** The verdict in words, for the person holding the scale. */
export function verdictText(weighing: Weighing): string {
  switch (weighing.verdict) {
    case "ACCEPTABLE":
      return "Acceptable";
    case "UNDER":
      return `Under by ${formatOz(weighing.shortOz)}`;
    case "OVER":
      return `Over by ${formatOz(weighing.overOz)}`;
    default:
      return "No spec weight — logged, not scored";
  }
}

export interface SubSpecLike {
  number: string;
  name: string;
  size: SubSize;
}

export function subLabel(spec: SubSpecLike): string {
  return `#${spec.number} ${spec.name} · ${SUB_SIZE_LABELS[spec.size]}`;
}

/** One line that says everything, for history, emails and exports. */
export function describeWeighing(
  spec: SubSpecLike,
  weightOz: number,
  specOz: number | null,
): string {
  const weighing = weighSub(weightOz, specOz);
  const spec_ = specOz === null ? "no spec" : `spec ${acceptableRange(specOz)}`;
  return `${subLabel(spec)}: ${formatOz(weightOz)} (${spec_}) — ${verdictText(weighing)}`;
}

export interface WeightSummary {
  logged: number;
  /** Weighed against a spec. */
  judged: number;
  acceptable: number;
  under: number;
  over: number;
  /** Total ounces short across underweight subs. */
  ozShort: number;
  /** Total ounces past the ceiling across overweight subs. */
  ozOver: number;
  /**
   * Every judged sub's weight minus its spec, added up: how light (negative)
   * or heavy (positive) the store ran in total.
   */
  netVsSpecOz: number;
}

export function summarizeWeighings(
  weighings: { weightOz: number; specOz: number | null }[],
): WeightSummary {
  let judged = 0, acceptable = 0, under = 0, over = 0;
  let short = 0, past = 0, net = 0;
  for (const { weightOz, specOz } of weighings) {
    const weighing = weighSub(weightOz, specOz);
    if (weighing.verdict === "UNSCORED") continue;
    judged += 1;
    net += hundredths(weighing.vsSpecOz ?? 0);
    if (weighing.verdict === "ACCEPTABLE") acceptable += 1;
    if (weighing.verdict === "UNDER") {
      under += 1;
      short += hundredths(weighing.shortOz);
    }
    if (weighing.verdict === "OVER") {
      over += 1;
      past += hundredths(weighing.overOz);
    }
  }
  return {
    logged: weighings.length,
    judged,
    acceptable,
    under,
    over,
    ozShort: ounces(short),
    ozOver: ounces(past),
    netVsSpecOz: ounces(net),
  };
}

/** "0.7 oz heavy", "1.2 oz light", "on spec" — the week in one phrase. */
export function describeNet(netVsSpecOz: number): string {
  if (Math.abs(netVsSpecOz) < 0.005) return "on spec";
  return `${formatOz(Math.abs(netVsSpecOz))} ${netVsSpecOz > 0 ? "heavy" : "light"}`;
}

/** The Monday a "YYYY-MM-DD" day falls in — weeks run Monday to Sunday. */
export function weekStarting(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

// --- importing a spec sheet ----------------------------------------------

export interface ParsedSubSpec {
  number: string;
  name: string;
  size: SubSize;
  specOz: number | null;
  row: number;
}

export interface SubSpecParse {
  specs: ParsedSubSpec[];
  issues: { row: number; message: string }[];
}

const SPEC_COLUMNS: Record<"number" | "name" | "size" | "spec" | "sub", string[]> = {
  number: ["#", "no", "num", "number", "sub #", "sub no", "sub number", "menu #", "menu number"],
  name: ["name", "sub name", "description", "item", "item name", "menu item"],
  size: ["size", "sub size"],
  spec: ["spec", "spec oz", "spec weight", "spec weight oz", "target", "target oz", "target weight", "weight", "weight oz", "oz", "ounces", "min", "minimum"],
  sub: ["sub"],
};

const SIZE_WORDS: Record<string, SubSize> = {
  mini: "MINI", m: "MINI", small: "MINI",
  regular: "REGULAR", reg: "REGULAR", r: "REGULAR", medium: "REGULAR",
  giant: "GIANT", g: "GIANT", large: "GIANT",
};

function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

function normal(header: string): string {
  return header.trim().toLowerCase().replace(/[_\-.()]+/g, " ").replace(/\s+/g, " ").trim();
}

function readSize(raw: string): SubSize | null {
  const word = normal(raw).split(" ")[0] ?? "";
  return SIZE_WORDS[word] ?? null;
}

const NO_TARGET = new Set(["", "-", "—", "–", "n/a", "na", "none", "tbd", "no spec"]);

/** "8", "8.0 oz", "8 ounces" → 8; blank, "—" or "TBD" → no target yet. */
function readOz(raw: string): number | null | "bad" {
  const text = raw.trim();
  if (NO_TARGET.has(text.toLowerCase())) return null;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(oz|ounces?)?$/i);
  if (!match) return "bad";
  const value = Number(match[1]);
  return value > 0 && value <= MAX_SUB_OZ ? value : "bad";
}

/**
 * Reads a pasted or exported spec sheet: one row per sub and size, with a
 * header naming the columns. Forgiving about what the columns are called and
 * how sizes are written; a sub number may sit in its own column or lead the
 * name ("#13 Original Italian").
 */
export function parseSubSpecs(text: string): SubSpecParse {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const issues: SubSpecParse["issues"] = [];
  if (!lines.length) return { specs: [], issues: [{ row: 0, message: "Nothing to import." }] };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = splitRow(lines[0], delimiter).map(normal);
  const column = (field: keyof typeof SPEC_COLUMNS) =>
    header.findIndex((cell) => SPEC_COLUMNS[field].includes(cell));
  const at = { number: column("number"), name: column("name"), size: column("size"), spec: column("spec"), sub: column("sub") };

  if (at.size < 0 || at.spec < 0 || (at.number < 0 && at.name < 0 && at.sub < 0)) {
    return {
      specs: [],
      issues: [
        {
          row: 1,
          message:
            "The first row needs headings for the sub (number and/or name), the size and the spec weight — e.g. Sub #, Name, Size, Spec oz.",
        },
      ],
    };
  }

  const specs: ParsedSubSpec[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, index) => {
    const row = index + 2;
    const cells = splitRow(line, delimiter);
    const cell = (i: number) => (i >= 0 ? (cells[i] ?? "") : "");

    let number = cell(at.number).replace(/^#/, "").trim();
    let name = cell(at.name);
    const combined = cell(at.sub);
    if (combined) {
      const match = combined.match(/^#?\s*(\d+[a-z]?)\s*[-–—.:]?\s*(.*)$/i);
      if (match) {
        number ||= match[1];
        name ||= match[2].trim();
      } else {
        name ||= combined;
      }
    }
    if (!number) {
      issues.push({ row, message: "No sub number — skipped." });
      return;
    }
    const size = readSize(cell(at.size));
    if (!size) {
      issues.push({ row, message: `"${cell(at.size) || "(blank)"}" is not a size — use Mini, Regular or Giant.` });
      return;
    }
    const oz = readOz(cell(at.spec));
    if (oz === "bad") {
      issues.push({ row, message: `"${cell(at.spec)}" is not a weight in ounces.` });
      return;
    }
    const key = `${number}:${size}`;
    if (seen.has(key)) {
      issues.push({ row, message: `#${number} ${SUB_SIZE_LABELS[size]} appears twice — the first row is kept.` });
      return;
    }
    seen.add(key);
    specs.push({ number, name: name || `Sub #${number}`, size, specOz: oz, row });
  });

  return { specs, issues };
}
