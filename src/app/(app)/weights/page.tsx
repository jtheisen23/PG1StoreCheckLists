import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { businessDateKey, shiftDateKey } from "@/lib/time";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { describeNet, formatOz, summarizeWeighings, weekStarting } from "@/lib/sub-weight";
import { StoreWeek } from "@/components/sub-weight-summary";
import { getWeighings } from "@/server/sub-specs";

export const metadata: Metadata = { title: "Sub weights" };
export const dynamic = "force-dynamic";

/**
 * Every store's week at the scale: how many subs were weighed, how many came
 * in under spec and how many over, and how many ounces light or heavy the
 * store ran in total. Under and over are never netted into one "out of spec"
 * figure — a light sub is a guest problem and a heavy one a food-cost problem.
 */
export default async function SubWeightsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUser();
  const { week: asked } = await searchParams;
  const locationIds = await getAccessibleLocationIds(user);

  const org = await prisma.organization.findUnique({
    where: { id: user.orgId },
    select: { timezone: true },
  });
  const thisWeek = weekStarting(businessDateKey(org?.timezone ?? "America/Chicago"));
  const week = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? weekStarting(asked) : thisWeek;
  const weekEnd = shiftDateKey(week, 6);

  const [stores, weighings] = await Promise.all([
    prisma.location.findMany({
      where: { id: { in: locationIds }, active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    getWeighings(locationIds, week, weekEnd),
  ]);

  const byStore = new Map<string, typeof weighings>();
  for (const row of weighings) {
    byStore.set(row.locationId, [...(byStore.get(row.locationId) ?? []), row]);
  }
  const rows = stores
    .map((store) => ({ ...store, summary: summarizeWeighings(byStore.get(store.id) ?? []) }))
    // Worst first: the store to call is at the top.
    .sort(
      (a, b) =>
        b.summary.under + b.summary.over - (a.summary.under + a.summary.over) ||
        a.code.localeCompare(b.code, undefined, { numeric: true }),
    );
  const fleet = summarizeWeighings(weighings);

  return (
    <>
      <PageHeader
        title="Sub weights"
        description={`${formatWeek(week, weekEnd)} · ${stores.length} store${stores.length === 1 ? "" : "s"}, most out of spec first. Spec is the floor; up to 0.5 oz over is acceptable.`}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/weights?week=${shiftDateKey(week, -7)}`}
          className="text-[13px] font-medium"
          style={{ color: "var(--info)" }}
        >
          ‹ Previous week
        </Link>
        {week < thisWeek ? (
          <Link
            href={`/weights?week=${shiftDateKey(week, 7)}`}
            className="text-[13px] font-medium"
            style={{ color: "var(--info)" }}
          >
            Next week ›
          </Link>
        ) : null}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Weighed" value={fleet.logged} hint={`${fleet.acceptable} acceptable`} />
        <Stat
          label="Under spec"
          value={fleet.under}
          hint={fleet.under ? `${formatOz(fleet.ozShort)} short` : "None"}
          tone={fleet.under ? "fail" : "neutral"}
        />
        <Stat
          label="Over the limit"
          value={fleet.over}
          hint={fleet.over ? `${formatOz(fleet.ozOver)} past spec + 0.5` : "None"}
          tone={fleet.over ? "warn" : "neutral"}
        />
        <Stat label="Ran" value={describeNet(fleet.netVsSpecOz)} hint="All judged subs against spec" />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No stores in your scope" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {rows.map((row) => (
              <li key={row.id} className="border-b last:border-b-0">
                <Link
                  href={`/locations/${row.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-[var(--surface-sunken)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      #{row.code} {row.name}
                    </p>
                    <p className="text-muted text-[12px]">
                      {row.summary.logged ? `${row.summary.logged} weighed` : "Nothing weighed"}
                    </p>
                  </div>
                  <StoreWeek summary={row.summary} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function formatWeek(from: string, to: string) {
  const format = (key: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${key}T00:00:00Z`),
    );
  return `Week of ${format(from)}–${format(to)}`;
}
