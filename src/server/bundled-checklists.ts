import "server-only";

import { readFile } from "fs/promises";
import path from "path";

import { parseChecklist } from "@/lib/checklist-import";

/**
 * Checklists that ship with the app.
 *
 * These were rebuilt from the reports this operation already ran, and they live
 * in `checklists/` as ordinary CSVs so they can be read, diffed and edited like
 * anything else in the repository. Shipping them means setting up a new
 * deployment does not begin with someone downloading three files in order to
 * upload the same three files.
 */
export interface BundledChecklist {
  key: string;
  file: string;
  name: string;
  category: string;
  description: string;
  passingScore: number;
  /** What this was rebuilt from, so nobody has to guess later. */
  origin: string;
}

export const BUNDLED_CHECKLISTS: BundledChecklist[] = [
  // PG1's daily set, transcribed from the paper sheets the stores run today.
  {
    key: "opening-checklist",
    file: "opening-checklist.csv",
    name: "Opening Checklist",
    category: "Opening",
    description:
      "Opener 1, Opener 2 and the manager's final steps from 8:30 to 9:15. Under 200 bread loaves one opener does both opener lists; over 200, two openers and a manager.",
    passingScore: 90,
    origin: "Opening Checklist (paper sheet)",
  },
  {
    key: "daily-sheet",
    file: "daily-sheet.csv",
    name: "Daily Sheet",
    category: "Daily Sheet",
    description:
      "Last night's close, the opener evaluation from 9:30 to 10:00 by the first manager in, and the day's cleaning and maintenance focus — a different focus each day of the week.",
    passingScore: 90,
    origin: "Daily Sheet, days 1–7 (paper sheets)",
  },
  {
    key: "midday-checklist",
    file: "midday-checklist.csv",
    name: "Midday Checklist",
    category: "Midday",
    description:
      "1:50 to 2:30 PM: bread and prep, front line, restrooms, back line, lobby, grill and back room.",
    passingScore: 90,
    origin: "Midday Checklist (paper sheet)",
  },
  {
    key: "closing-manager-checklist",
    file: "closing-manager-checklist.csv",
    name: "Closing Manager Checklist",
    category: "Closing",
    description:
      "The manager's cash, deposit and lock-up, the meat case from 5:00 and from 8:15, and the front line after close.",
    passingScore: 90,
    origin: "Closing Manager Checklist (paper sheet)",
  },
  {
    key: "closing-grill-checklist",
    file: "closing-grill-checklist.csv",
    name: "Closing Grill Checklist",
    category: "Closing",
    description:
      "The grill closer: warmer, sandwich units, the grill through the night, and the hot sub counter, back line counter and floors after close.",
    passingScore: 90,
    origin: "Closing Grill Checklist (paper sheet)",
  },
  {
    key: "closing-lobby-checklist",
    file: "closing-lobby-checklist.csv",
    name: "Closing Lobby Checklist",
    category: "Closing",
    description:
      "The lobby closer: bread racking from 6:45, restrooms from 7:30, the back room, and the lobby from 8:00 between customers.",
    passingScore: 90,
    origin: "Closing Lobby Checklist (paper sheet)",
  },
  {
    key: "dir-of-ops-snapshot",
    file: "dir-of-ops-snapshot.csv",
    name: "Dir of Ops Snapshot",
    category: "Ops Snapshot",
    description:
      "The Director of Operations store visit: phone check, exterior and dining room, front line, product, team and backroom.",
    passingScore: 90,
    origin: "Dir of Ops Snapshot Report",
  },
  {
    key: "food-safety-audit",
    file: "food-safety-audit.csv",
    name: "Food Safety Audit",
    category: "Food Safety",
    description:
      "Temperature log with pass ranges, then the numbered food safety items and the 7 Principles of Success. Cold-holding failures fail the audit outright.",
    passingScore: 90,
    origin: "Food Safety Audit",
  },
  {
    key: "facilities-audit",
    file: "facilities-audit.csv",
    name: "Facilities Audit",
    category: "Facilities",
    description:
      "The full building walk — 36 areas from the sidewalk to the mop sink, checked against the same list each time.",
    passingScore: 90,
    origin: "Facilities Audit",
  },
  {
    key: "sub-weight-log",
    file: "sub-weight-log.csv",
    name: "Sub Weight Log",
    category: "Sub Weights",
    description:
      "Three subs weighed against their spec: never under it, at most 0.5 oz over. Schedule it twice a day — once at Lunch and once at Dinner — for the six daily weighings.",
    passingScore: 100,
    origin: "weight log — three at lunch, three at dinner",
  },
  {
    key: "opening-temp-log",
    file: "opening-temp-log.csv",
    name: "Opening Temp Log",
    category: "Temp Log",
    description:
      "Thirteen readings at opening — walk-in, freezer, grill top, sandwich units, steam table, meat case, drop-in, soda case and the digital line — and the manager's initials. Cold holding above 41°F or steam-table product under 135°F fails the log outright.",
    passingScore: 100,
    origin: "Dunkirk Afternoon Temperature Log — the same lines, taken at opening",
  },
  {
    key: "midday-temp-log",
    file: "midday-temp-log.csv",
    name: "Midday Temp Log",
    category: "Temp Log",
    description:
      "The same thirteen readings in the afternoon, and the manager's initials. Cold holding above 41°F or steam-table product under 135°F fails the log outright.",
    passingScore: 100,
    origin: "Dunkirk Afternoon Temperature Log",
  },
];

/**
 * Read from disk rather than compiled in, so the CSVs stay the one copy of
 * these checklists. `next.config.ts` tells the build to carry the folder into
 * the deployment; without that the files exist in the repository and not in the
 * running app.
 */
export async function readBundledChecklist(key: string): Promise<string | null> {
  const entry = BUNDLED_CHECKLISTS.find((item) => item.key === key);
  if (!entry) return null;
  try {
    return await readFile(
      path.join(process.cwd(), "checklists", entry.file),
      "utf8",
    );
  } catch {
    return null;
  }
}

export interface BundledSummary extends BundledChecklist {
  /** Null when the file could not be read in this deployment. */
  sections: number | null;
  items: number | null;
  /** True when a checklist of this name already exists. */
  installed: boolean;
}

/** What to show on the checklists page: what ships, and what is already in. */
export async function summariseBundled(
  existingNames: string[],
): Promise<BundledSummary[]> {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  return Promise.all(
    BUNDLED_CHECKLISTS.map(async (entry) => {
      const text = await readBundledChecklist(entry.key);
      const parsed = text ? parseChecklist(text) : null;
      return {
        ...entry,
        sections: parsed ? parsed.sections.length : null,
        items: parsed ? parsed.itemCount : null,
        installed: taken.has(entry.name.trim().toLowerCase()),
      };
    }),
  );
}
