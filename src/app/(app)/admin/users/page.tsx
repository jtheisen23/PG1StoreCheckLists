import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { relativeTime } from "@/lib/time";
import { toggleUserActive } from "@/server/admin-service";
import { NewUserForm } from "./new-user-form";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireUser();

  const [people, regions, districts, locations] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        scopes: {
          select: {
            level: true,
            region: { select: { name: true } },
            district: { select: { name: true } },
            location: { select: { name: true, code: true } },
          },
        },
      },
    }),
    prisma.region.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.district.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.location.findMany({
      where: { orgId: user.orgId, active: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="People"
        description={`${people.filter((p) => p.active).length} active of ${people.length}. Scope decides which stores someone sees.`}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_23rem]">
        <div>
          {people.length === 0 ? (
            <Card>
              <EmptyState title="No people yet" />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul>
                {people.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-start gap-3 border-b px-4 py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-medium">{person.name}</p>
                        <Badge tone={person.active ? "neutral" : "fail"}>
                          {person.active ? ROLE_LABELS[person.role] : "Deactivated"}
                        </Badge>
                      </div>
                      <p className="text-muted mt-0.5 text-[12px]">
                        {person.email}
                        {person.lastLoginAt
                          ? ` · last signed in ${relativeTime(person.lastLoginAt)}`
                          : " · never signed in"}
                      </p>
                      <p className="text-faint mt-1 text-[12px]">
                        {describeScopes(person.scopes)}
                      </p>
                    </div>

                    {person.id === user.id ? (
                      <span className="text-faint text-[12px]">You</span>
                    ) : (
                      <form action={toggleUserActive}>
                        <input type="hidden" name="userId" value={person.id} />
                        <button
                          type="submit"
                          className="text-[12px] font-medium"
                          style={{
                            color: person.active ? "var(--fail)" : "var(--info)",
                          }}
                        >
                          {person.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <NewUserForm regions={regions} districts={districts} locations={locations} />
      </div>
    </>
  );
}

type ScopeRow = {
  level: string;
  region: { name: string } | null;
  district: { name: string } | null;
  location: { name: string; code: string } | null;
};

function describeScopes(scopes: ScopeRow[]): string {
  if (!scopes.length) return "No stores assigned";
  if (scopes.some((s) => s.level === "ORG")) return "Entire organization";

  const names = scopes.map(
    (s) =>
      s.region?.name ??
      s.district?.name ??
      (s.location ? `#${s.location.code} ${s.location.name}` : "—"),
  );
  return names.length > 4
    ? `${names.slice(0, 4).join(", ")} +${names.length - 4} more`
    : names.join(", ");
}
