import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { getDueChecklists } from "@/server/schedules";
import { Badge, Card, CardHeader, EmptyState, Meter, ScoreBadge, Stat } from "@/components/ui";
import { relativeTime } from "@/lib/time";
import { DAYPART_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Location" };
export const dynamic = "force-dynamic";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const locationIds = await getAccessibleLocationIds(user);
  if (!locationIds.includes(id)) notFound();

  const location = await prisma.location.findFirst({
    where: { id, orgId: user.orgId },
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      state: true,
      phone: true,
      timezone: true,
      district: { select: { name: true, region: { select: { name: true } } } },
    },
  });
  if (!location) notFound();

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [checklists, recent, openActions, aggregate, team] = await Promise.all([
    getDueChecklists(user.orgId, id),
    prisma.submission.findMany({
      where: { locationId: id, status: "SUBMITTED" },
      orderBy: { submittedAt: "desc" },
      take: 10,
      select: {
        id: true,
        score: true,
        passed: true,
        daypart: true,
        itemsFailed: true,
        submittedAt: true,
        template: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.correctiveAction.findMany({
      where: { locationId: id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
      take: 8,
      select: {
        id: true,
        title: true,
        priority: true,
        dueAt: true,
        assignee: { select: { name: true } },
      },
    }),
    prisma.submission.aggregate({
      where: {
        locationId: id,
        status: "SUBMITTED",
        submittedAt: { gte: since },
      },
      _avg: { score: true },
      _count: { _all: true },
      _sum: { itemsFailed: true },
    }),
    prisma.user.findMany({
      where: { orgId: user.orgId, active: true, scopes: { some: { locationId: id } } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
      take: 20,
    }),
  ]);

  const completed = checklists.filter((c) => c.completed).length;
  const avgScore =
    aggregate._avg.score !== null
      ? Math.round(aggregate._avg.score * 10) / 10
      : null;

  return (
    <>
      <Link href="/locations" className="text-muted text-[13px]">
        ‹ Locations
      </Link>

      <div className="mt-1.5 mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          #{location.code} {location.name}
        </h1>
        <p className="text-muted mt-1 text-[13px]">
          {location.district.region.name} · {location.district.name}
          {location.city ? ` · ${location.city}, ${location.state}` : ""}
          {location.phone ? ` · ${location.phone}` : ""}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Today"
          value={`${completed}/${checklists.length}`}
          hint="Checklists completed"
          tone={completed === checklists.length ? "pass" : "warn"}
        />
        <Stat
          label="30-day average"
          value={avgScore === null ? "—" : `${avgScore}%`}
          tone={
            avgScore === null ? "neutral" : avgScore >= 95 ? "pass" : avgScore >= 85 ? "warn" : "fail"
          }
        />
        <Stat label="Submissions (30d)" value={aggregate._count._all} />
        <Stat
          label="Failed items (30d)"
          value={aggregate._sum.itemsFailed ?? 0}
          tone={(aggregate._sum.itemsFailed ?? 0) > 0 ? "fail" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Today's checklists" />
          {checklists.length === 0 ? (
            <EmptyState title="Nothing scheduled today" />
          ) : (
            <ul className="divide-y">
              {checklists.map((checklist) => (
                <li
                  key={checklist.scheduleId}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {checklist.templateName}
                    </p>
                    <p className="text-muted text-[12px]">
                      {DAYPART_LABELS[checklist.daypart]} · due {checklist.dueTime}
                      {checklist.completedBy ? ` · ${checklist.completedBy}` : ""}
                    </p>
                  </div>
                  {checklist.completed ? (
                    <ScoreBadge score={checklist.score} />
                  ) : (
                    <Badge tone={checklist.overdue ? "fail" : "neutral"}>
                      {checklist.overdue ? "Past due" : "Pending"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t px-5 py-3">
            <Meter
              value={checklists.length ? (completed / checklists.length) * 100 : 0}
              tone={completed === checklists.length ? "pass" : "warn"}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Open corrective actions" />
          {openActions.length === 0 ? (
            <EmptyState title="Nothing open" description="This store is clear." />
          ) : (
            <ul className="divide-y">
              {openActions.map((action) => (
                <li key={action.id}>
                  <Link
                    href={`/actions/${action.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--surface-sunken)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{action.title}</p>
                      <p className="text-muted text-[12px]">
                        {action.assignee?.name ?? "Unassigned"}
                        {action.dueAt ? ` · due ${relativeTime(action.dueAt)}` : ""}
                      </p>
                    </div>
                    <Badge tone={action.priority === "CRITICAL" ? "fail" : "warn"}>
                      {action.priority}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent submissions" />
          {recent.length === 0 ? (
            <EmptyState title="No submissions yet" />
          ) : (
            <ul className="divide-y">
              {recent.map((submission) => (
                <li key={submission.id}>
                  <Link
                    href={`/submissions/${submission.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--surface-sunken)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">
                        {submission.template.name}
                      </p>
                      <p className="text-muted text-[12px]">
                        {submission.user.name} ·{" "}
                        {submission.submittedAt
                          ? relativeTime(submission.submittedAt)
                          : "—"}
                      </p>
                    </div>
                    <ScoreBadge score={submission.score} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Assigned team" subtitle={`${team.length} people`} />
          {team.length === 0 ? (
            <EmptyState title="Nobody assigned to this store yet" />
          ) : (
            <ul className="divide-y">
              {team.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center justify-between px-5 py-2.5"
                >
                  <span className="text-[13px]">{person.name}</span>
                  <Badge>{person.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
