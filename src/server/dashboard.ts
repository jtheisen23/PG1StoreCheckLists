import "server-only";

import { ActionStatus, SubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { addDays, businessDate, formatDateKey } from "@/lib/time";
import { getCompletionByLocation } from "./schedules";

export interface TrendPoint {
  date: string;
  submissions: number;
  avgScore: number | null;
  failedItems: number;
}

export interface RankedLocation {
  locationId: string;
  name: string;
  code: string;
  districtName: string;
  regionName: string;
  avgScore: number | null;
  submissions: number;
  completionRate: number | null;
  openActions: number;
  overdueActions: number;
}

export interface FailingItem {
  itemId: string;
  label: string;
  templateName: string;
  failures: number;
  answered: number;
  failureRate: number;
}

export interface DashboardData {
  rangeDays: number;
  today: { due: number; completed: number; overdue: number; completionRate: number | null };
  period: {
    submissions: number;
    avgScore: number | null;
    failedItems: number;
    passRate: number | null;
  };
  actions: { open: number; overdue: number; resolvedInPeriod: number; critical: number };
  trend: TrendPoint[];
  locations: RankedLocation[];
  failingItems: FailingItem[];
  districts: { name: string; avgScore: number | null; submissions: number; locations: number }[];
}

/**
 * Everything the rollup dashboard renders, scoped to the locations the viewer
 * is allowed to see.
 */
export async function getDashboardData(
  orgId: string,
  locationIds: string[],
  rangeDays = 30,
  now: Date = new Date(),
): Promise<DashboardData> {
  const empty: DashboardData = {
    rangeDays,
    today: { due: 0, completed: 0, overdue: 0, completionRate: null },
    period: { submissions: 0, avgScore: null, failedItems: 0, passRate: null },
    actions: { open: 0, overdue: 0, resolvedInPeriod: 0, critical: 0 },
    trend: [],
    locations: [],
    failingItems: [],
    districts: [],
  };
  if (!locationIds.length) return empty;

  const since = addDays(businessDate("UTC", now), -(rangeDays - 1));

  const [
    locations,
    submissions,
    completion,
    openActions,
    overdueActions,
    criticalActions,
    resolvedActions,
    failing,
  ] = await Promise.all([
    prisma.location.findMany({
      where: { id: { in: locationIds }, orgId },
      select: {
        id: true,
        name: true,
        code: true,
        district: { select: { name: true, region: { select: { name: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.submission.findMany({
      where: {
        orgId,
        locationId: { in: locationIds },
        status: SubmissionStatus.SUBMITTED,
        businessDate: { gte: since },
      },
      select: {
        locationId: true,
        businessDate: true,
        score: true,
        passed: true,
        itemsFailed: true,
      },
    }),
    getCompletionByLocation(orgId, locationIds, now),
    prisma.correctiveAction.groupBy({
      by: ["locationId"],
      where: {
        orgId,
        locationId: { in: locationIds },
        status: { in: [ActionStatus.OPEN, ActionStatus.IN_PROGRESS] },
      },
      _count: { _all: true },
    }),
    prisma.correctiveAction.groupBy({
      by: ["locationId"],
      where: {
        orgId,
        locationId: { in: locationIds },
        status: { in: [ActionStatus.OPEN, ActionStatus.IN_PROGRESS] },
        dueAt: { lt: now },
      },
      _count: { _all: true },
    }),
    prisma.correctiveAction.count({
      where: {
        orgId,
        locationId: { in: locationIds },
        status: { in: [ActionStatus.OPEN, ActionStatus.IN_PROGRESS] },
        priority: "CRITICAL",
      },
    }),
    prisma.correctiveAction.count({
      where: {
        orgId,
        locationId: { in: locationIds },
        status: { in: [ActionStatus.RESOLVED, ActionStatus.VERIFIED] },
        resolvedAt: { gte: since },
      },
    }),
    getFailingItems(orgId, locationIds, since),
  ]);

  // --- period rollup ------------------------------------------------------
  const scored = submissions.filter((s) => s.score !== null);
  const avgScore = scored.length
    ? Math.round((scored.reduce((sum, s) => sum + (s.score ?? 0), 0) / scored.length) * 10) / 10
    : null;
  const judged = submissions.filter((s) => s.passed !== null);
  const passRate = judged.length
    ? Math.round((judged.filter((s) => s.passed).length / judged.length) * 1000) / 10
    : null;

  // --- daily trend --------------------------------------------------------
  const byDay = new Map<string, { total: number; scoreSum: number; scored: number; failed: number }>();
  for (let i = 0; i < rangeDays; i++) {
    byDay.set(formatDateKey(addDays(since, i)), { total: 0, scoreSum: 0, scored: 0, failed: 0 });
  }
  for (const s of submissions) {
    const bucket = byDay.get(formatDateKey(s.businessDate));
    if (!bucket) continue;
    bucket.total += 1;
    bucket.failed += s.itemsFailed;
    if (s.score !== null) {
      bucket.scoreSum += s.score;
      bucket.scored += 1;
    }
  }
  const trend: TrendPoint[] = [...byDay.entries()].map(([date, b]) => ({
    date,
    submissions: b.total,
    avgScore: b.scored ? Math.round((b.scoreSum / b.scored) * 10) / 10 : null,
    failedItems: b.failed,
  }));

  // --- per-location ranking ----------------------------------------------
  const openByLocation = new Map(openActions.map((a) => [a.locationId, a._count._all]));
  const overdueByLocation = new Map(overdueActions.map((a) => [a.locationId, a._count._all]));
  const submissionsByLocation = new Map<string, { count: number; scoreSum: number; scored: number }>();
  for (const s of submissions) {
    const row = submissionsByLocation.get(s.locationId) ?? { count: 0, scoreSum: 0, scored: 0 };
    row.count += 1;
    if (s.score !== null) {
      row.scoreSum += s.score;
      row.scored += 1;
    }
    submissionsByLocation.set(s.locationId, row);
  }

  const ranked: RankedLocation[] = locations.map((l) => {
    const stats = submissionsByLocation.get(l.id);
    const todayRow = completion.get(l.id);
    return {
      locationId: l.id,
      name: l.name,
      code: l.code,
      districtName: l.district.name,
      regionName: l.district.region.name,
      avgScore: stats?.scored
        ? Math.round((stats.scoreSum / stats.scored) * 10) / 10
        : null,
      submissions: stats?.count ?? 0,
      completionRate:
        todayRow && todayRow.due > 0
          ? Math.round((todayRow.completed / todayRow.due) * 1000) / 10
          : null,
      openActions: openByLocation.get(l.id) ?? 0,
      overdueActions: overdueByLocation.get(l.id) ?? 0,
    };
  });

  // --- district rollup ----------------------------------------------------
  const districtMap = new Map<string, { scoreSum: number; scored: number; submissions: number; locations: number }>();
  for (const l of locations) {
    const key = l.district.name;
    const row = districtMap.get(key) ?? { scoreSum: 0, scored: 0, submissions: 0, locations: 0 };
    row.locations += 1;
    const stats = submissionsByLocation.get(l.id);
    if (stats) {
      row.submissions += stats.count;
      row.scoreSum += stats.scoreSum;
      row.scored += stats.scored;
    }
    districtMap.set(key, row);
  }
  const districts = [...districtMap.entries()]
    .map(([name, r]) => ({
      name,
      avgScore: r.scored ? Math.round((r.scoreSum / r.scored) * 10) / 10 : null,
      submissions: r.submissions,
      locations: r.locations,
    }))
    .sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));

  let due = 0;
  let completed = 0;
  let overdue = 0;
  for (const row of completion.values()) {
    due += row.due;
    completed += row.completed;
    overdue += row.overdue;
  }

  return {
    rangeDays,
    today: {
      due,
      completed,
      overdue,
      completionRate: due ? Math.round((completed / due) * 1000) / 10 : null,
    },
    period: {
      submissions: submissions.length,
      avgScore,
      failedItems: submissions.reduce((sum, s) => sum + s.itemsFailed, 0),
      passRate,
    },
    actions: {
      open: openActions.reduce((sum, a) => sum + a._count._all, 0),
      overdue: overdueActions.reduce((sum, a) => sum + a._count._all, 0),
      resolvedInPeriod: resolvedActions,
      critical: criticalActions,
    },
    trend,
    locations: ranked,
    failingItems: failing,
    districts,
  };
}

/** The checklist items that fail most often — where to spend coaching time. */
export async function getFailingItems(
  orgId: string,
  locationIds: string[],
  since: Date,
  limit = 10,
): Promise<FailingItem[]> {
  if (!locationIds.length) return [];

  const grouped = await prisma.itemResponse.groupBy({
    by: ["itemId", "passed"],
    where: {
      passed: { not: null },
      submission: {
        orgId,
        locationId: { in: locationIds },
        status: SubmissionStatus.SUBMITTED,
        businessDate: { gte: since },
      },
    },
    _count: { _all: true },
  });

  const tally = new Map<string, { failures: number; answered: number }>();
  for (const row of grouped) {
    const entry = tally.get(row.itemId) ?? { failures: 0, answered: 0 };
    entry.answered += row._count._all;
    if (row.passed === false) entry.failures += row._count._all;
    tally.set(row.itemId, entry);
  }

  const top = [...tally.entries()]
    .filter(([, v]) => v.failures > 0)
    .sort((a, b) => b[1].failures - a[1].failures)
    .slice(0, limit);
  if (!top.length) return [];

  const items = await prisma.templateItem.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: {
      id: true,
      label: true,
      section: { select: { template: { select: { name: true } } } },
    },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  return top.flatMap(([itemId, stats]) => {
    const item = byId.get(itemId);
    if (!item) return [];
    return [
      {
        itemId,
        label: item.label,
        templateName: item.section.template.name,
        failures: stats.failures,
        answered: stats.answered,
        failureRate:
          stats.answered > 0
            ? Math.round((stats.failures / stats.answered) * 1000) / 10
            : 0,
      },
    ];
  });
}
