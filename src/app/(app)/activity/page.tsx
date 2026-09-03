import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds, isLeader } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { relativeTime } from "@/lib/time";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ACTION_TONE: Record<string, "pass" | "warn" | "fail" | "info" | "neutral"> = {
  "submission.submitted": "info",
  "action.created": "warn",
  "action.updated": "pass",
  "user.login": "neutral",
  "template.published": "info",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
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

  const page = Math.max(1, Number(pageParam) || 1);
  const locationIds = await getAccessibleLocationIds(user);

  // Org-scoped events (logins, template changes) have no location; keep them
  // visible alongside the store events this leader is responsible for.
  const where = {
    orgId: user.orgId,
    OR: [{ locationId: { in: locationIds } }, { locationId: null }],
  };

  const [entries, total] = await Promise.all([
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
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every submission, corrective action and configuration change, newest first."
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState title="No activity recorded yet" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <Badge tone={ACTION_TONE[entry.action] ?? "neutral"}>
                  {entry.action.split(".")[1] ?? entry.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">{entry.summary}</p>
                  <p className="text-faint mt-0.5 text-[12px]">
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(entry.createdAt)}{" "}
                    · {relativeTime(entry.createdAt)}
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
              <Link href={`/activity?page=${page - 1}`} style={{ color: "var(--info)" }}>
                ‹ Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={`/activity?page=${page + 1}`} style={{ color: "var(--info)" }}>
                Next ›
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
