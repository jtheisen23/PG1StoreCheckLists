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
import { getRecentCloseRatings } from "@/server/close-ratings";
import { getWeighings } from "@/server/sub-specs";
import { StoreWeek } from "@/components/sub-weight-summary";
import { businessDateKey, shiftDateKey } from "@/lib/time";
import { describeWeighing, summarizeWeighings, weekStarting, weighSub, type SubSize } from "@/lib/sub-weight";
import { VerdictChip } from "@/components/close-verdict";

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

  const today = businessDateKey(location.timezone);
  const weekStart = weekStarting(today);
  const lastWeekFrom = shiftDateKey(today, -6);

  const [checklists, recent, openActions, aggregate, team, closeRatings, weighings, weighsSubs] = await Promise.all([
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
    getRecentCloseRatings(user.orgId, location, 7),
    getWeighings([id], lastWeekFrom < weekStart ? lastWeekFrom : weekStart, today),
    prisma.subSpec.count({ where: { orgId: user.orgId } }),
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

      {closeRatings ? <CloseRatingHistory {...closeRatings} /> : null}

      {weighsSubs ? (
        <SubWeightCard
          week={summarizeWeighings(weighings.filter((w) => w.businessDate >= weekStart))}
          outOfSpec={weighings
            .filter((w) => w.businessDate >= lastWeekFrom)
            .filter((w) => {
              const verdict = weighSub(w.weightOz, w.specOz).verdict;
              return verdict === "UNDER" || verdict === "OVER";
            })
            .sort((a, b) => b.businessDate.localeCompare(a.businessDate))}
        />
      ) : null}

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

/**
 * The opening shift's verdict on each close, night by night, with what was
 * wrong and whose close it was — the point of the rating is that the closing
 * shift answers to the opening one.
 */
function CloseRatingHistory({
  areas,
  nights,
}: NonNullable<Awaited<ReturnType<typeof getRecentCloseRatings>>>) {
  const downs = nights.flatMap((night) =>
    areas.flatMap((area) => {
      const rating = night.ratings[area.id];
      return rating && !rating.acceptable ? [{ night: night.closeDate, area: area.name, ...rating }] : [];
    }),
  );
  const rated = nights.filter((night) => Object.keys(night.ratings).length > 0).length;

  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader
        title="Close ratings"
        subtitle={`Last ${nights.length} nights · ${rated} rated · ${downs.length} thumbs down`}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-faint border-b">
              <th className="px-4 py-2 font-medium">Night</th>
              {areas.map((area) => (
                <th key={area.id} className="px-2 py-2 font-medium">
                  {area.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nights.map((night) => (
              <tr key={night.closeDate} className="border-b last:border-b-0">
                <td className="text-muted px-4 py-1.5 whitespace-nowrap">{formatNight(night.closeDate)}</td>
                {areas.map((area) => {
                  const rating = night.ratings[area.id];
                  return (
                    <td key={area.id} className="px-2 py-1.5">
                      {rating ? (
                        <VerdictChip acceptable={rating.acceptable} compact />
                      ) : (
                        <span className="text-faint">Not rated</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {downs.length ? (
        <ul className="border-t">
          {downs.map((down) => (
            <li key={`${down.night}-${down.area}`} className="border-b px-4 py-2.5 last:border-b-0">
              <p className="text-[13px]">
                <span className="font-medium">{down.area}</span>
                <span className="text-muted"> · {formatNight(down.night)}</span>
              </p>
              {down.note ? <p className="mt-0.5 text-[13px]">{down.note}</p> : null}
              <p className="text-muted mt-0.5 text-[12px]">
                Rated by {down.ratedBy}
                {down.closer ? ` · closed by ${down.closer}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function formatNight(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));
}

/** This week at the scale, and every sub that missed spec in the last seven days. */
function SubWeightCard({
  week,
  outOfSpec,
}: {
  week: ReturnType<typeof summarizeWeighings>;
  outOfSpec: Awaited<ReturnType<typeof getWeighings>>;
}) {
  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader
        title="Sub weights"
        subtitle={week.logged ? `This week · ${week.logged} weighed` : "Nothing weighed this week"}
        action={
          <Link href="/weights" className="text-[12px] font-medium" style={{ color: "var(--info)" }}>
            All stores ›
          </Link>
        }
      />
      {week.logged ? (
        <div className="border-b px-4 py-3">
          <StoreWeek summary={week} />
        </div>
      ) : null}
      {outOfSpec.length ? (
        <ul>
          {outOfSpec.slice(0, 8).map((w) => (
            <li key={`${w.submissionId}-${w.number}-${w.size}-${w.weightOz}`} className="border-b px-4 py-2.5 last:border-b-0">
              <Link href={`/submissions/${w.submissionId}`} className="block text-[13px]">
                <span className="text-muted">{formatNight(w.businessDate)} · </span>
                {describeWeighing({ number: w.number, name: w.name, size: w.size as SubSize }, w.weightOz, w.specOz)}
              </Link>
            </li>
          ))}
        </ul>
      ) : week.logged ? (
        <p className="px-4 py-3 text-[12px]" style={{ color: "var(--pass)" }}>
          Every sub weighed in the last 7 days was in spec.
        </p>
      ) : null}
    </Card>
  );
}
