import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds, isLeader } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { relativeTime } from "@/lib/time";
import { activityWhere } from "@/server/activity-query";
import { ACTION_GROUPS, filterQuery, readFilters } from "@/lib/activity-filters";
import { ActivityFilters } from "./filters";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ACTION_TONE: Record<string, "pass" | "warn" | "fail" | "info" | "neutral"> = {
  submission: "info",
  action: "warn",
  template: "info",
  schedule: "info",
  user: "neutral",
  org: "neutral",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  if (!isLeader(user)) {
    return (
      <Card>
        <EmptyState
          title="Not available"
          description="The activity log is visible to district leadership and administrators."
        />
      </Card>
    );
  }

  const filters = readFilters(params);
  const page = Math.max(1, Number(params.page) || 1);
  const where = await activityWhere(user, filters);

  const locationIds = await getAccessibleLocationIds(user);
  const [entries, total, locations, people] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        summary: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.activityLog.count({ where }),
    prisma.location.findMany({
      where: { id: { in: locationIds } },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.user.findMany({
      where: { orgId: user.orgId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 300,
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every submission, corrective action, configuration change and sign-in, newest first."
        action={
          <Link
            href={`/api/activity/export${filterQuery(filters)}`}
            className="inline-flex h-9 items-center rounded-lg border px-3.5 text-[13px] font-medium"
            style={{ background: "var(--surface-raised)" }}
            prefetch={false}
          >
            Export CSV
          </Link>
        }
      />

      <ActivityFilters
        filters={filters}
        locations={locations}
        people={people}
        total={total}
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            title="No matching activity"
            description="Try widening the date range or clearing a filter."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <Badge tone={ACTION_TONE[entry.action.split(".")[0]] ?? "neutral"}>
                  {entry.action.split(".")[1]?.replace(/_/g, " ") ?? entry.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">{entry.summary}</p>
                  <p className="text-faint mt-0.5 text-[12px]">
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(entry.createdAt)}{" "}
                    · {relativeTime(entry.createdAt)}
                    {entry.user ? ` · ${entry.user.name}` : ""}
                  </p>
                </div>
                {entry.entityType === "Submission" && entry.entityId ? (
                  <Link
                    href={`/submissions/${entry.entityId}`}
                    className="shrink-0 text-[12px] font-medium"
                    style={{ color: "var(--info)" }}
                  >
                    View
                  </Link>
                ) : entry.entityType === "CorrectiveAction" && entry.entityId ? (
                  <Link
                    href={`/actions/${entry.entityId}`}
                    className="shrink-0 text-[12px] font-medium"
                    style={{ color: "var(--info)" }}
                  >
                    View
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <span className="text-muted">
            Page {page} of {pages} · {total.toLocaleString()} events
          </span>
          <div className="flex gap-3">
            {page > 1 ? (
              <Link
                href={`/activity${filterQuery(filters, { page: String(page - 1) })}`}
                style={{ color: "var(--info)" }}
              >
                ‹ Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={`/activity${filterQuery(filters, { page: String(page + 1) })}`}
                style={{ color: "var(--info)" }}
              >
                Next ›
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="text-faint mt-6 text-[12px]">
        {Object.values(ACTION_GROUPS).length} event families are recorded. Entries
        are kept indefinitely — see the README for pruning guidance.
      </p>
    </>
  );
}
