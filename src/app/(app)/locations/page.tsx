import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { getDashboardData } from "@/server/dashboard";
import { Badge, Card, EmptyState, Meter, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Locations" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const user = await requireUser();
  const locationIds = await getAccessibleLocationIds(user);
  const data = await getDashboardData(user.orgId, locationIds, 30);

  if (!data.locations.length) {
    return (
      <Card>
        <EmptyState title="No stores in your scope" />
      </Card>
    );
  }

  // Group by region → district so a 150-store fleet stays navigable.
  const byRegion = new Map<string, Map<string, typeof data.locations>>();
  for (const location of data.locations) {
    const districts =
      byRegion.get(location.regionName) ?? new Map<string, typeof data.locations>();
    const list = districts.get(location.districtName) ?? [];
    list.push(location);
    districts.set(location.districtName, list);
    byRegion.set(location.regionName, districts);
  }

  return (
    <>
      <PageHeader
        title="Locations"
        description={`${data.locations.length} stores · 30-day average score and today's completion.`}
      />

      <div className="flex flex-col gap-6">
        {[...byRegion.entries()].map(([region, districts]) => (
          <section key={region}>
            <h2 className="text-faint mb-2 text-[12px] font-semibold tracking-wide uppercase">
              {region}
            </h2>
            <div className="flex flex-col gap-4">
              {[...districts.entries()].map(([district, locations]) => (
                <Card key={district} className="overflow-hidden">
                  <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <p className="text-[13px] font-semibold">{district}</p>
                    <p className="text-muted text-[12px]">
                      {locations.length} store{locations.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ul>
                    {locations.map((location) => (
                      <li key={location.locationId} className="border-b last:border-b-0">
                        <Link
                          href={`/locations/${location.locationId}`}
                          className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--surface-sunken)]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">
                              #{location.code} {location.name}
                            </p>
                            <p className="text-muted text-[12px]">
                              {location.submissions} submissions in 30 days
                            </p>
                          </div>

                          <div className="hidden w-28 sm:block">
                            <p className="text-faint mb-1 text-[11px]">Today</p>
                            {location.completionRate === null ? (
                              <span className="text-faint text-[12px]">
                                Nothing due
                              </span>
                            ) : (
                              <>
                                <Meter
                                  value={location.completionRate}
                                  tone={location.completionRate >= 95 ? "pass" : "warn"}
                                />
                                <span className="tabular text-faint mt-1 block text-[11px]">
                                  {location.completionRate}%
                                </span>
                              </>
                            )}
                          </div>

                          {location.openActions > 0 ? (
                            <Badge tone={location.overdueActions > 0 ? "fail" : "warn"}>
                              {location.openActions} open
                            </Badge>
                          ) : null}

                          <span
                            className="tabular w-14 text-right text-[14px] font-semibold"
                            style={{
                              color:
                                location.avgScore === null
                                  ? "var(--text-faint)"
                                  : location.avgScore >= 95
                                    ? "var(--pass)"
                                    : location.avgScore >= 85
                                      ? "var(--warn)"
                                      : "var(--fail)",
                            }}
                          >
                            {location.avgScore === null ? "—" : `${location.avgScore}%`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
