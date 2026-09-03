import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { toggleLocationActive } from "@/server/admin-service";
import { OrgBuilder } from "./org-builder";

export const metadata: Metadata = { title: "Stores" };
export const dynamic = "force-dynamic";

export default async function LocationsAdminPage() {
  const user = await requireUser();

  const [regions, districts, locations] = await Promise.all([
    prisma.region.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.district.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        regionId: true,
        region: { select: { name: true } },
      },
    }),
    prisma.location.findMany({
      where: { orgId: user.orgId },
      orderBy: { code: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        state: true,
        timezone: true,
        active: true,
        district: { select: { name: true, region: { select: { name: true } } } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Stores"
        description="Regions hold districts, districts hold stores. Build this out before scheduling checklists."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-[13px] font-semibold">
                Stores{locations.length ? ` · ${locations.length}` : ""}
              </p>
              <p className="text-muted text-[12px]">
                {regions.length} region{regions.length === 1 ? "" : "s"} ·{" "}
                {districts.length} district{districts.length === 1 ? "" : "s"}
              </p>
            </div>

            {locations.length === 0 ? (
              <EmptyState
                title="No stores yet"
                description="Add a region, then a district, then your first store."
              />
            ) : (
              <ul>
                {locations.map((location) => (
                  <li
                    key={location.id}
                    className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium">
                          #{location.code} {location.name}
                        </p>
                        {!location.active ? <Badge tone="fail">Closed</Badge> : null}
                      </div>
                      <p className="text-muted mt-0.5 text-[12px]">
                        {location.district.region.name} · {location.district.name}
                        {location.city ? ` · ${location.city}, ${location.state}` : ""}{" "}
                        · {location.timezone}
                      </p>
                    </div>
                    <form action={toggleLocationActive}>
                      <input type="hidden" name="locationId" value={location.id} />
                      <button
                        type="submit"
                        className="text-[12px] font-medium"
                        style={{
                          color: location.active ? "var(--fail)" : "var(--info)",
                        }}
                      >
                        {location.active ? "Close" : "Reopen"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {districts.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="border-b px-4 py-2.5">
                <p className="text-[13px] font-semibold">Districts</p>
              </div>
              <ul>
                {districts.map((district) => (
                  <li
                    key={district.id}
                    className="flex items-center justify-between border-b px-4 py-2.5 last:border-b-0"
                  >
                    <span className="text-[13px]">
                      {district.name}{" "}
                      <span className="text-faint">({district.code})</span>
                    </span>
                    <span className="text-muted text-[12px]">
                      {district.region.name} ·{" "}
                      {locations.filter((l) => l.district.name === district.name).length}{" "}
                      stores
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <OrgBuilder regions={regions} districts={districts} />
      </div>
    </>
  );
}
