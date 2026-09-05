import { detectDelimiter, parseDelimited } from "./checklist-import";

/**
 * Turns a pasted store list into locations, districts and regions.
 *
 * Operators keep their stores in a spreadsheet, so this accepts what you get
 * from copying cells out of Google Sheets or Excel, matches headings loosely,
 * and fills in the things a spreadsheet almost never carries — a timezone, and
 * the region and district a store rolls up into.
 */

export interface ParsedStore {
  /** The store number. Unique per organization. */
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  brand: string | null;
  regionName: string;
  districtName: string;
  timezone: string;
  /**
   * True when the state spans two timezones and the city did not settle it.
   * Surfaced in the preview so nobody discovers it from a day's checklists
   * opening an hour late.
   */
  timezoneUncertain: boolean;
  /** 1-based row in the pasted text, for error messages. */
  sourceRow: number;
}

export interface ImportIssue {
  row: number;
  message: string;
}

/** How stores are grouped when the paste carries no region or district column. */
export type Grouping = "brand" | "state";

export interface StoreParseResult {
  stores: ParsedStore[];
  issues: ImportIssue[];
  /** Region name -> district names, in the order they first appear. */
  structure: { region: string; districts: string[] }[];
  /** How many rows named a timezone we had to guess at. */
  uncertainCount: number;
}

// --- column matching ------------------------------------------------------

const COLUMNS: Record<string, string[]> = {
  code: ["store", "store#", "storenumber", "store no", "storeno", "number", "no", "code", "storecode", "unit", "unit#", "site", "id"],
  name: ["name", "storename", "location", "locationname", "site name", "description"],
  city: ["city", "town", "market"],
  state: ["state", "st", "province", "region code"],
  brand: ["brand", "concept", "banner", "chain"],
  region: ["region", "area", "division", "zone"],
  district: ["district", "market area", "subregion", "sub region", "supervisor"],
  address: ["address", "street", "address1", "address 1"],
  timezone: ["timezone", "time zone", "tz"],
};

function normaliseHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_.-]+/g, "")
    .replace(/[^a-z0-9#]/g, "")
    .trim();
}

function matchColumn(header: string): string | null {
  const cleaned = normaliseHeader(header);
  if (!cleaned) return null;
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    if (aliases.some((alias) => normaliseHeader(alias) === cleaned)) return key;
  }
  return null;
}

// --- states and timezones -------------------------------------------------

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const NAME_TO_ABBREVIATION: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([abbreviation, name]) => [
    name.toLowerCase(),
    abbreviation,
  ]),
);

const EASTERN = "America/New_York";
const CENTRAL = "America/Chicago";
const MOUNTAIN = "America/Denver";
const PACIFIC = "America/Los_Angeles";

/** States that sit wholly in one zone. */
const STATE_TIMEZONES: Record<string, string> = {
  AL: CENTRAL, AR: CENTRAL, CA: PACIFIC, CO: MOUNTAIN, CT: EASTERN,
  DE: EASTERN, DC: EASTERN, GA: EASTERN, HI: "Pacific/Honolulu",
  IL: CENTRAL, IA: CENTRAL, LA: CENTRAL, ME: EASTERN, MD: EASTERN,
  MA: EASTERN, MN: CENTRAL, MS: CENTRAL, MO: CENTRAL, NH: EASTERN,
  NJ: EASTERN, NM: MOUNTAIN, NY: EASTERN, NC: EASTERN, OH: EASTERN,
  OK: CENTRAL, PA: EASTERN, RI: EASTERN, SC: EASTERN, UT: MOUNTAIN,
  VT: EASTERN, VA: EASTERN, WA: PACIFIC, WV: EASTERN, WI: CENTRAL,
  WY: MOUNTAIN,
  // Arizona keeps its own zone because almost all of it skips daylight saving.
  AZ: "America/Phoenix",
};

/**
 * States split across two zones. `majority` is where most of the state's stores
 * would be; `exceptions` names the cities on the other side, which is what
 * settles it for the regions people actually operate in — eastern Tennessee
 * runs on Eastern time even though the state is mostly Central.
 */
const SPLIT_STATES: Record<
  string,
  { majority: string; other: string; exceptions: string[] }
> = {
  TN: {
    majority: CENTRAL,
    other: EASTERN,
    exceptions: [
      "chattanooga", "hixson", "ooltewah", "east ridge", "red bank", "cleveland",
      "gunbarrel", "collegedale", "soddy daisy", "signal mountain",
      "lookout mountain", "jasper", "dunlap", "south pittsburg", "athens",
      "sweetwater", "madisonville", "etowah", "dayton", "knoxville", "farragut",
      "maryville", "alcoa", "oak ridge", "clinton", "powell", "lenoir city",
      "harriman", "crossville", "sevierville", "pigeon forge", "gatlinburg",
      "newport", "morristown", "jefferson city", "greeneville", "johnson city",
      "kingsport", "bristol", "elizabethton", "erwin", "rogersville", "tazewell",
    ],
  },
  FL: {
    majority: EASTERN,
    other: CENTRAL,
    exceptions: [
      "pensacola", "panama city", "panama city beach", "destin",
      "fort walton beach", "niceville", "crestview", "navarre", "gulf breeze",
      "milton", "pace", "marianna", "chipley", "bonifay", "defuniak springs",
    ],
  },
  KY: {
    majority: EASTERN,
    other: CENTRAL,
    exceptions: [
      "bowling green", "paducah", "owensboro", "hopkinsville", "madisonville",
      "henderson", "murray", "mayfield", "russellville", "franklin", "glasgow",
      "central city", "greenville", "princeton", "cadiz", "benton", "fulton",
    ],
  },
  IN: { majority: "America/Indiana/Indianapolis", other: CENTRAL, exceptions: ["gary", "hammond", "merrillville", "valparaiso", "michigan city", "evansville", "jasper", "vincennes"] },
  MI: { majority: "America/Detroit", other: CENTRAL, exceptions: ["iron mountain", "menominee", "ironwood", "escanaba"] },
  TX: { majority: CENTRAL, other: MOUNTAIN, exceptions: ["el paso", "socorro", "horizon city", "van horn"] },
  KS: { majority: CENTRAL, other: MOUNTAIN, exceptions: ["goodland", "colby", "syracuse"] },
  NE: { majority: CENTRAL, other: MOUNTAIN, exceptions: ["scottsbluff", "gering", "sidney", "alliance", "chadron"] },
  ND: { majority: CENTRAL, other: MOUNTAIN, exceptions: ["dickinson", "williston", "bowman"] },
  SD: { majority: CENTRAL, other: MOUNTAIN, exceptions: ["rapid city", "spearfish", "sturgis", "pierre", "belle fourche"] },
  ID: { majority: "America/Boise", other: PACIFIC, exceptions: ["coeur d'alene", "coeur dalene", "post falls", "sandpoint", "moscow", "lewiston", "hayden"] },
  OR: { majority: PACIFIC, other: MOUNTAIN, exceptions: ["ontario", "nyssa", "vale"] },
  NV: { majority: PACIFIC, other: MOUNTAIN, exceptions: ["west wendover", "jackpot"] },
  AK: { majority: "America/Anchorage", other: "America/Adak", exceptions: ["adak"] },
};

export interface ResolvedTimezone {
  timezone: string;
  uncertain: boolean;
}

/**
 * The timezone a store keeps its day by.
 *
 * This is not cosmetic: every "today" in the app is computed in the store's own
 * zone, so a wrong one opens and closes a store's checklists an hour early.
 */
export function resolveTimezone(
  state: string | null,
  city: string | null,
  fallback = CENTRAL,
): ResolvedTimezone {
  if (!state) return { timezone: fallback, uncertain: true };

  const simple = STATE_TIMEZONES[state];
  if (simple) return { timezone: simple, uncertain: false };

  const split = SPLIT_STATES[state];
  if (!split) return { timezone: fallback, uncertain: true };

  // Matched as whole words inside the label rather than as the whole label:
  // stores get named after the road they sit on, so "Hixson Pike" and
  // "Gunbarrel Rd" have to resolve the same way "Hixson" does.
  const key = ` ${(city ?? "").toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (key.trim() && split.exceptions.some((city) => key.includes(` ${city} `))) {
    return { timezone: split.other, uncertain: false };
  }
  // Nothing in the row settles which side of the line this store is on.
  return { timezone: split.majority, uncertain: true };
}

/** "va" / "Virginia" / " VA " all become "VA". */
export function normaliseState(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.length === 2 && STATE_NAMES[value.toUpperCase()]) {
    return value.toUpperCase();
  }
  return NAME_TO_ABBREVIATION[value.toLowerCase()] ?? null;
}

// --- parsing --------------------------------------------------------------

export function parseStores(
  text: string,
  grouping: Grouping = "brand",
): StoreParseResult {
  const issues: ImportIssue[] = [];
  const rows = parseDelimited(text, detectDelimiter(text)).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );

  if (rows.length === 0) {
    return { stores: [], issues, structure: [], uncertainCount: 0 };
  }

  const header = rows[0];
  const mapping = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = matchColumn(cell);
    if (key && !mapping.has(key)) mapping.set(key, index);
  });

  if (!mapping.has("code")) {
    issues.push({
      row: 1,
      message:
        "No store number column found. The first row should name the columns, e.g. \"Store #, City, State, Brand\".",
    });
    return { stores: [], issues, structure: [], uncertainCount: 0 };
  }

  const cell = (row: string[], key: string): string | undefined => {
    const index = mapping.get(key);
    return index === undefined ? undefined : row[index]?.trim();
  };

  const stores: ParsedStore[] = [];
  const seen = new Map<string, number>();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const sourceRow = index + 1;

    const code = (cell(row, "code") ?? "").replace(/^#/, "").trim();
    if (!code) {
      issues.push({ row: sourceRow, message: "No store number; row skipped." });
      continue;
    }

    const rawState = cell(row, "state");
    const state = normaliseState(rawState);
    if (rawState && !state) {
      issues.push({
        row: sourceRow,
        message: `Store ${code}: "${rawState}" is not a state we recognise.`,
      });
    }

    const city = cell(row, "city") || null;
    const name = cell(row, "name") || city || `Store ${code}`;
    const brand = cell(row, "brand") || null;

    const explicit = cell(row, "timezone");
    const resolved = explicit
      ? { timezone: explicit, uncertain: false }
      : resolveTimezone(state, city);
    if (resolved.uncertain) {
      issues.push({
        row: sourceRow,
        message: state
          ? `Store ${code}: ${STATE_NAMES[state]} spans two timezones — set to ${label(resolved.timezone)}. Check this one.`
          : `Store ${code}: no state given, so the timezone is a guess (${label(resolved.timezone)}).`,
      });
    }

    const stateLabel = state ? STATE_NAMES[state] : "Unassigned";
    const regionName =
      cell(row, "region") || (grouping === "brand" ? brand || "All stores" : stateLabel);
    const districtName = cell(row, "district") || stateLabel;

    const duplicate = seen.get(code);
    if (duplicate !== undefined) {
      issues.push({
        row: sourceRow,
        message: `Store ${code} also appears on row ${duplicate}; the later row wins.`,
      });
    }
    seen.set(code, sourceRow);

    const store: ParsedStore = {
      code,
      name,
      city,
      state,
      brand,
      regionName,
      districtName,
      timezone: resolved.timezone,
      timezoneUncertain: resolved.uncertain,
      sourceRow,
    };

    const existing = stores.findIndex((s) => s.code === code);
    if (existing >= 0) stores[existing] = store;
    else stores.push(store);
  }

  return {
    stores,
    issues,
    structure: buildStructure(stores),
    uncertainCount: stores.filter((s) => s.timezoneUncertain).length,
  };
}

function buildStructure(stores: ParsedStore[]) {
  const structure: { region: string; districts: string[] }[] = [];
  for (const store of stores) {
    let region = structure.find((entry) => entry.region === store.regionName);
    if (!region) {
      region = { region: store.regionName, districts: [] };
      structure.push(region);
    }
    if (!region.districts.includes(store.districtName)) {
      region.districts.push(store.districtName);
    }
  }
  return structure;
}

/** "America/New_York" -> "Eastern", for people who do not think in IANA names. */
export function label(timezone: string): string {
  const names: Record<string, string> = {
    [EASTERN]: "Eastern",
    [CENTRAL]: "Central",
    [MOUNTAIN]: "Mountain",
    [PACIFIC]: "Pacific",
    "America/Phoenix": "Arizona",
    "America/Anchorage": "Alaska",
    "Pacific/Honolulu": "Hawaii",
    "America/Indiana/Indianapolis": "Eastern",
    "America/Detroit": "Eastern",
    "America/Boise": "Mountain",
  };
  return names[timezone] ?? timezone;
}

/** A short, stable code for a region or district created by an import. */
export function slugCode(name: string, taken: Set<string>): string {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "GROUP";
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}
