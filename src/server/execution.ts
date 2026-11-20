import "server-only";

import { ActionStatus, Role, ScopeLevel, SubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { businessDateKey, shiftDateKey, wallClockIn } from "@/lib/time";
import {
  daysBetween,
  periodFor,
  rangeFor,
  type DateRange,
  type Period,
  type RangeKey,
} from "@/lib/periods";
import {
  averageRate,
  doneKey,
  rate,
  storeDays,
  sumDays,
  type ScheduleSlot,
  type StoreClock,
} from "@/lib/execution";
import { getFailingItems, type FailingItem } from "./dashboard";
import { getLastNightRatings, type LastNightSummary } from "./close-ratings";

/*
 * The leadership view: every store in a person's scope, worst first, with
 * what it owed and did, what it is missing, when it last did anything, and
 * how last night's close was rated. Scoped by the caller's location ids, like
 * everything that reads store data, and a fixed handful of queries however
 * many stores there are.
 */

export interface ExecutionStore {
  id: string;
  code: string;
  name: string;
  state: string | null;
  gm: string | null;
  director: string | null;
  due: number;
  done: number;
  missing: number;
  rate: number | null;
  lastEntry: string | null;
  lastNight: LastNightSummary | null;
}

export interface ExecutionData {
  period: Period;
  rangeKey: RangeKey;
  range: DateRange;
  versus: string;
  rate: number | null;
  previousRate: number | null;
  /** The last fourteen days, for the headline's sparkline. */
  spark: { day: string; rate: number | null }[];
  /** Every day of the period shown, for the chart. */
  daily: { day: string; rate: number | null }[];
  chartRange: DateRange;
  stores: ExecutionStore[];
  close: { configured: boolean; needsBetter: number; storesDown: number; notRated: number };
  actions: { open: number; olderThan14: number; oldestDays: number | null; buckets: { label: string; count: number; tone: "pass" | "warn" | "fail" }[] };
  failing: FailingItem[];
  directors: { name: string; stores: number; rate: number | null }[];
  /** True when nobody holds the DO role, so `directors` is by district. */
  groupedByDistrict: boolean;
}

const dateOf = (key: string) => new Date(`${key}T00:00:00.000Z`);

export async function getExecutionData(
  orgId: string,
  locationIds: string[],
  rangeKey: RangeKey,
  now: Date = new Date(),
): Promise<ExecutionData> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
  const today = businessDateKey(org?.timezone ?? "America/Chicago", now);
  const period = periodFor(today);
  const { range, previous, versus } = rangeFor(rangeKey, today);
  const chartRange: DateRange =
    rangeKey === "lp" ? range : { from: period.start, to: today };
  const sparkRange: DateRange = { from: shiftDateKey(range.to, -13), to: range.to };
  const from = [range.from, previous.from, chartRange.from, sparkRange.from].sort()[0];

  const [locations, schedules, walks, lastEntries, people, openActions, failing, firstWalks] = await Promise.all([
    prisma.location.findMany({
      where: { id: { in: locationIds }, orgId, active: true },
      select: {
        id: true,
        code: true,
        name: true,
        state: true,
        timezone: true,
        districtId: true,
        district: { select: { name: true, regionId: true } },
      },
    }),
    prisma.schedule.findMany({
      where: {
        orgId,
        active: true,
        template: { status: "PUBLISHED" },
        locations: { some: { locationId: { in: locationIds } } },
      },
      select: {
        id: true,
        daysOfWeek: true,
        dueTime: true,
        createdAt: true,
        locations: { select: { locationId: true } },
      },
    }),
    prisma.submission.findMany({
      where: {
        orgId,
        locationId: { in: locationIds },
        status: SubmissionStatus.SUBMITTED,
        scheduleId: { not: null },
        businessDate: { gte: dateOf(from), lte: dateOf(range.to) },
      },
      select: { locationId: true, scheduleId: true, businessDate: true },
    }),
    prisma.submission.groupBy({
      by: ["locationId"],
      where: { orgId, locationId: { in: locationIds }, status: SubmissionStatus.SUBMITTED },
      _max: { submittedAt: true },
    }),
    prisma.user.findMany({
      where: { orgId, active: true, role: { in: [Role.DIRECTOR_OF_OPS, Role.GM, Role.OPERATOR] } },
      select: {
        name: true,
        role: true,
        scopes: { select: { level: true, locationId: true, districtId: true, regionId: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.correctiveAction.findMany({
      where: {
        orgId,
        locationId: { in: locationIds },
        status: { in: [ActionStatus.OPEN, ActionStatus.IN_PROGRESS] },
      },
      select: { createdAt: true },
    }),
    getFailingItems(orgId, locationIds, dateOf(range.from), 8, dateOf(range.to)),
    // A schedule owes nothing before it existed — but history imported or
    // backfilled under it shows it was in force earlier than its row says.
    prisma.submission.groupBy({
      by: ["scheduleId"],
      where: { orgId, scheduleId: { not: null }, status: SubmissionStatus.SUBMITTED },
      _min: { businessDate: true },
    }),
  ]);
  const firstWalk = new Map(
    firstWalks.map((row) => [row.scheduleId as string, row._min.businessDate?.toISOString().slice(0, 10)]),
  );

  // --- who runs each store ------------------------------------------------
  const specificity: Record<ScopeLevel, number> = { LOCATION: 0, DISTRICT: 1, REGION: 2, ORG: 3 };
  const covers = (scope: (typeof people)[number]["scopes"][number], store: (typeof locations)[number]) =>
    scope.level === ScopeLevel.ORG ||
    (scope.level === ScopeLevel.LOCATION && scope.locationId === store.id) ||
    (scope.level === ScopeLevel.DISTRICT && scope.districtId === store.districtId) ||
    (scope.level === ScopeLevel.REGION && scope.regionId === store.district.regionId);
  const nearest = (store: (typeof locations)[number], roles: Role[]) => {
    let best: { name: string; rank: number } | null = null;
    for (const role of roles) {
      for (const person of people.filter((p) => p.role === role)) {
        for (const scope of person.scopes) {
          if (!covers(scope, store)) continue;
          const rank = roles.indexOf(role) * 10 + specificity[scope.level];
          if (!best || rank < best.rank) best = { name: person.name, rank };
        }
      }
    }
    return best?.name ?? null;
  };

  // --- owed and done ----------------------------------------------------------
  const clocks: StoreClock[] = locations.map((location) => {
    const wall = wallClockIn(location.timezone, now);
    return { id: location.id, todayKey: businessDateKey(location.timezone, now), nowMinutes: wall.hour * 60 + wall.minute };
  });
  const slots: ScheduleSlot[] = schedules.map((schedule) => ({
    id: schedule.id,
    locationIds: schedule.locations.map((l) => l.locationId),
    daysOfWeek: schedule.daysOfWeek,
    dueTime: schedule.dueTime,
    createdKey: [schedule.createdAt.toISOString().slice(0, 10), firstWalk.get(schedule.id)]
      .filter((key): key is string => Boolean(key))
      .sort()[0],
  }));
  const done = new Set(
    walks.map((walk) => doneKey(walk.locationId, walk.scheduleId!, walk.businessDate.toISOString().slice(0, 10))),
  );
  const allDays = [...new Set([...daysBetween(range), ...daysBetween(previous), ...daysBetween(chartRange), ...daysBetween(sparkRange)])].sort();
  const perStore = storeDays(clocks, slots, done, allDays);

  const over = (storeId: string, r: DateRange) =>
    sumDays(daysBetween(r).map((day) => perStore.get(storeId)?.get(day) ?? { due: 0, done: 0 }));
  const pooled = (r: DateRange) => rate(sumDays(locations.map((l) => over(l.id, r))));
  const daily = (r: DateRange) =>
    daysBetween(r).map((day) => ({
      day,
      rate: rate(sumDays(locations.map((l) => perStore.get(l.id)?.get(day) ?? { due: 0, done: 0 }))),
    }));

  const lastNight = await getLastNightRatings(orgId, locations, now);
  const lastEntryBy = new Map(lastEntries.map((row) => [row.locationId, row._max.submittedAt]));

  const stores: ExecutionStore[] = locations
    .map((location) => {
      const tally = over(location.id, range);
      return {
        id: location.id,
        code: location.code,
        name: location.name,
        state: location.state,
        gm: nearest(location, [Role.GM, Role.OPERATOR]),
        director: nearest(location, [Role.DIRECTOR_OF_OPS]),
        due: tally.due,
        done: tally.done,
        missing: tally.due - tally.done,
        rate: rate(tally),
        lastEntry: lastEntryBy.get(location.id)?.toISOString() ?? null,
        lastNight: lastNight.get(location.id) ?? null,
      };
    })
    // Worst first; stores that owed nothing go last.
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || b.missing - a.missing || a.code.localeCompare(b.code, undefined, { numeric: true }));

  // --- last night's close ----------------------------------------------------
  let needsBetter = 0;
  let storesDown = 0;
  let notRated = 0;
  for (const summary of lastNight.values()) {
    const down = summary.areas.filter((area) => area.acceptable === false).length;
    needsBetter += down;
    if (down) storesDown += 1;
    if (summary.areas.every((area) => area.acceptable === null)) notRated += 1;
  }

  // --- corrective actions by age --------------------------------------------
  const ages = openActions.map((action) => Math.floor((now.getTime() - action.createdAt.getTime()) / 86_400_000));
  const bucket = (label: string, lo: number, hi: number, tone: "pass" | "warn" | "fail") => ({
    label,
    count: ages.filter((age) => age >= lo && age <= hi).length,
    tone,
  });

  // --- by Director of Operations ----------------------------------------------
  // An organization that does not use the role still gets the comparison, by
  // district, rather than one row reading "no Director of Operations".
  const groupByDistrict = stores.every((store) => !store.director);
  const districtOf = new Map(locations.map((location) => [location.id, location.district.name]));
  const byDirector = new Map<string, (number | null)[]>();
  for (const store of stores) {
    const key = groupByDistrict
      ? (districtOf.get(store.id) ?? "No district")
      : (store.director ?? "No Director of Operations");
    byDirector.set(key, [...(byDirector.get(key) ?? []), store.rate]);
  }

  return {
    period,
    rangeKey,
    range,
    versus,
    rate: pooled(range),
    previousRate: pooled(previous),
    spark: daily(sparkRange),
    daily: daily(chartRange),
    chartRange,
    stores,
    close: { configured: lastNight.size > 0, needsBetter, storesDown, notRated },
    actions: {
      open: openActions.length,
      olderThan14: ages.filter((age) => age > 14).length,
      oldestDays: ages.length ? Math.max(...ages) : null,
      buckets: [
        bucket("0–2 d", 0, 2, "pass"),
        bucket("3–7 d", 3, 7, "pass"),
        bucket("8–14 d", 8, 14, "warn"),
        bucket("15–30 d", 15, 30, "fail"),
        bucket("30+ d", 31, Infinity, "fail"),
      ],
    },
    failing,
    directors: [...byDirector.entries()]
      .map(([name, rates]) => ({ name, stores: rates.length, rate: averageRate(rates) }))
      .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)),
    groupedByDistrict: groupByDistrict,
  };
}
