import "server-only";

import { prisma } from "@/lib/db";
import type { RunnerSubSpec } from "@/lib/runner-types";
import { SUB_SIZES, summarizeWeighings, weekStarting } from "@/lib/sub-weight";
import { businessDateKey } from "@/lib/time";

/** Menu order: by number as a number ("2" before "13"), then Mini → Giant. */
export function menuOrder<T extends { number: string; size: string }>(specs: T[]): T[] {
  return [...specs].sort((a, b) => {
    const byNumber =
      (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0) ||
      a.number.localeCompare(b.number);
    if (byNumber) return byNumber;
    return SUB_SIZES.indexOf(a.size as never) - SUB_SIZES.indexOf(b.size as never);
  });
}

/** The subs on the menu, as a walk with a weighing needs them — offline included. */
export async function getRunnerSubSpecs(orgId: string): Promise<RunnerSubSpec[]> {
  const specs = await prisma.subSpec.findMany({
    where: { orgId, archivedAt: null },
    select: { id: true, number: true, name: true, size: true, specOz: true },
  });
  return menuOrder(specs);
}

/** Only a checklist that weighs subs carries the menu with it. */
export function weighsSubs(sections: { items: { type: string }[] }[]): boolean {
  return sections.some((section) => section.items.some((item) => item.type === "SUB_WEIGHT"));
}

export interface WeighingRow {
  locationId: string;
  businessDate: string;
  submissionId: string;
  weightOz: number;
  specOz: number | null;
  number: string;
  name: string;
  size: string;
}

/**
 * Every sub weighed at these stores between two business dates, inclusive.
 * Only submitted walks count: a voided weight log drops out like any walk.
 */
export async function getWeighings(
  locationIds: string[],
  from: string,
  to: string,
): Promise<WeighingRow[]> {
  if (!locationIds.length) return [];
  const rows = await prisma.subWeighing.findMany({
    where: {
      response: {
        submission: {
          status: "SUBMITTED",
          locationId: { in: locationIds },
          businessDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        },
      },
    },
    select: {
      weightOz: true,
      specOz: true,
      subSpec: { select: { number: true, name: true, size: true } },
      response: {
        select: {
          submission: { select: { id: true, locationId: true, businessDate: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    locationId: row.response.submission.locationId,
    businessDate: row.response.submission.businessDate.toISOString().slice(0, 10),
    submissionId: row.response.submission.id,
    weightOz: row.weightOz,
    specOz: row.specOz,
    number: row.subSpec.number,
    name: row.subSpec.name,
    size: row.subSpec.size,
  }));
}

/** The store's week at the scale so far, Monday to today on its own clock. */
export async function getStoreWeightWeek(location: { id: string; timezone: string }) {
  const to = businessDateKey(location.timezone);
  const from = weekStarting(to);
  return { from, to, summary: summarizeWeighings(await getWeighings([location.id], from, to)) };
}
