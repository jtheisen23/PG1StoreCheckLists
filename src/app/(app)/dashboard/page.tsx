import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { canManageUsers, getAccessibleLocationIds } from "@/lib/permissions";
import { getDirectoryOptions } from "@/server/directory";
import { AddUserDialog } from "@/components/add-user-dialog";
import { getDashboardData } from "@/server/dashboard";
import { Badge, Card, CardHeader, EmptyState, Meter, PageHeader, Stat } from "@/components/ui";
import {
  FailedItemsTrend,
  RankedBars,
  ScoreDotPlot,
  ScoreTrend,
} from "@/components/charts";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const user = await requireUser();
  const locationIds = await getAccessibleLocationIds(user);
  const rangeDays = RANGES.includes(Number(rangeParam)) ? Number(rangeParam) : 30;

  const [data, directory] = await Promise.all([
    getDashboardData(user.orgId, locationIds, rangeDays),
    canManageUsers(user) ? getDirectoryOptions(user.orgId) : null,
  ]);

  if (!locationIds.length) {
    return (
      <Card>
        <EmptyState
          title="No stores in your scope"
          description="Ask an administrator to assign you to a region, district or location."
        />
      </Card>
    );
  }

  // A regional sees districts; a district manager or GM spans only one, so for
  // them the useful comparison is between their own stores.
  const scoredDistricts = data.districts.filter((d) => d.avgScore !== null);
  const comparison =
    scoredDistricts.length > 1
      ? {
          title: "District average score",
          rows: scoredDistricts.map((d) => ({ name: d.name, value: d.avgScore ?? 0 })),
        }
      : {
          title: "Store average score",
          rows: [...data.locations]
            .filter((l) => l.avgScore !== null)
            .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
            .slice(0, 12)
            .map((l) => ({ name: `#${l.code} ${l.name}`, value: l.avgScore ?? 0 })),
        };

  const worst = [...data.locations]
    .filter((l) => l.avgScore !== null)
    .sort((a, b) => (a.avgScore ?? 0) - (b.avgScore ?? 0))
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description={`${data.locations.length} store${data.locations.length === 1 ? "" : "s"} · last ${rangeDays} days`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {directory ? (
              <>
                <AddUserDialog directory={directory} />
                <span className="mx-1 hidden h-5 w-px sm:block" style={{ background: "var(--border)" }} />
              </>
            ) : null}
            {RANGES.map((days) => (
              <Link
                key={days}
                href={`/dashboard?range=${days}`}
                className="rounded-lg border px-3 py-1.5 text-[13px] font-medium"
                style={
                  days === rangeDays
                    ? {
                        background: "var(--info-bg)",
                        color: "var(--info)",
                        borderColor: "transparent",
                      }
                    : { background: "var(--surface-raised)" }
                }
              >
                {days}d
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Completed today"
          value={
            data.today.completionRate === null
              ? "—"
              : `${data.today.completionRate}%`
          }
          hint={`${data.today.completed} of ${data.today.due} checklists`}
          tone={
            data.today.completionRate === null
              ? "neutral"
              : data.today.completionRate >= 95
                ? "pass"
                : data.today.completionRate >= 80
                  ? "warn"
                  : "fail"
          }
        />
        <Stat
          label="Average score"
          value={data.period.avgScore === null ? "—" : `${data.period.avgScore}%`}
          hint={`${data.period.submissions.toLocaleString()} submissions`}
          tone={
            data.period.avgScore === null
              ? "neutral"
              : data.period.avgScore >= 95
                ? "pass"
                : data.period.avgScore >= 85
                  ? "warn"
                  : "fail"
          }
        />
        <Stat
          label="Past due today"
          value={data.today.overdue}
          hint="Checklists not completed in window"
          tone={data.today.overdue > 0 ? "fail" : "pass"}
        />
        <Stat
          label="Open actions"
          value={data.actions.open}
          hint={`${data.actions.overdue} past due · ${data.actions.critical} critical`}
          tone={data.actions.overdue > 0 ? "fail" : "neutral"}
        />
      </div>

      <div className="mb-4 grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Average checklist score"
            subtitle={`Daily average across your stores, last ${rangeDays} days`}
          />
          <div className="px-2 py-4">
            <ScoreTrend data={data.trend} passingScore={90} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Failed items per day"
            subtitle="Individual checklist items that came back out of standard"
          />
          <div className="px-2 py-4">
            <FailedItemsTrend data={data.trend} />
          </div>
        </Card>
      </div>

      <div className="mb-4 grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Most-missed items"
            subtitle="Where coaching time pays back the most"
          />
          <div className="px-3 py-4">
            {data.failingItems.length ? (
              <RankedBars
                tone="critical"
                unit=" failures"
                data={data.failingItems.map((item) => ({
                  name: item.label,
                  value: item.failures,
                }))}
              />
            ) : (
              <EmptyState title="No failed items in this period" />
            )}
          </div>
          {data.failingItems.length ? (
            <ul className="divide-y border-t">
              {data.failingItems.slice(0, 5).map((item) => (
                <li
                  key={item.itemId}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <span className="min-w-0 truncate text-[13px]">{item.label}</span>
                  <span className="tabular text-muted shrink-0 text-[12px]">
                    {item.failures} of {item.answered} · {item.failureRate}%
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title={comparison.title}
            subtitle="Values sit close together, so the scale is zoomed to the spread"
          />
          <div className="px-5 py-4">
            {comparison.rows.length ? (
              <ScoreDotPlot average={data.period.avgScore} data={comparison.rows} />
            ) : (
              <EmptyState title="No scored submissions yet" />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Stores needing attention"
          subtitle="Lowest average score in the period"
        />
        {worst.length === 0 ? (
          <EmptyState title="No scored submissions yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-[13px]">
              <thead>
                <tr className="text-faint border-b text-left text-[12px]">
                  <th className="px-5 py-2.5 font-medium">Store</th>
                  <th className="px-3 py-2.5 font-medium">District</th>
                  <th className="px-3 py-2.5 font-medium">Avg score</th>
                  <th className="px-3 py-2.5 font-medium">Today</th>
                  <th className="px-3 py-2.5 font-medium">Open actions</th>
                  <th className="px-5 py-2.5 font-medium">Submissions</th>
                </tr>
              </thead>
              <tbody>
                {worst.map((location) => (
                  <tr key={location.locationId} className="border-b last:border-b-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/locations/${location.locationId}`}
                        className="font-medium"
                      >
                        #{location.code} {location.name}
                      </Link>
                    </td>
                    <td className="text-muted px-3 py-3">{location.districtName}</td>
                    <td className="tabular px-3 py-3">
                      <span
                        className="font-semibold"
                        style={{
                          color:
                            (location.avgScore ?? 0) >= 95
                              ? "var(--pass)"
                              : (location.avgScore ?? 0) >= 85
                                ? "var(--warn)"
                                : "var(--fail)",
                        }}
                      >
                        {location.avgScore}%
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {location.completionRate === null ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <div className="w-24">
                          <Meter
                            value={location.completionRate}
                            tone={location.completionRate >= 95 ? "pass" : "warn"}
                          />
                          <span className="tabular text-faint mt-1 block text-[11px]">
                            {location.completionRate}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {location.openActions > 0 ? (
                        <Badge tone={location.overdueActions > 0 ? "fail" : "warn"}>
                          {location.openActions}
                          {location.overdueActions > 0
                            ? ` · ${location.overdueActions} late`
                            : ""}
                        </Badge>
                      ) : (
                        <span className="text-faint">None</span>
                      )}
                    </td>
                    <td className="tabular px-5 py-3">{location.submissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
