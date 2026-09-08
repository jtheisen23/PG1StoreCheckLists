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
