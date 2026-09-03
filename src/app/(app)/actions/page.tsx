import Link from "next/link";
import type { Metadata } from "next";
import { ActionStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { ACTION_PRIORITY_LABELS, ACTION_STATUS_LABELS } from "@/lib/labels";
import { relativeTime } from "@/lib/time";

export const metadata: Metadata = { title: "Corrective actions" };
export const dynamic = "force-dynamic";

const OPEN_STATES = [ActionStatus.OPEN, ActionStatus.IN_PROGRESS];

type Filter = "open" | "mine" | "overdue" | "resolved";

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const filter = (filterParam ?? "open") as Filter;
  const user = await requireUser();
  const locationIds = await getAccessibleLocationIds(user);
  const now = new Date();

  const base = { orgId: user.orgId, locationId: { in: locationIds } };
  const where = {
    ...base,
    ...(filter === "mine"
      ? { assigneeId: user.id, status: { in: OPEN_STATES } }
      : filter === "overdue"
        ? { status: { in: OPEN_STATES }, dueAt: { lt: now } }
        : filter === "resolved"
          ? { status: { in: [ActionStatus.RESOLVED, ActionStatus.VERIFIED] } }
          : { status: { in: OPEN_STATES } }),
  };

  const [actions, openCount, overdueCount, mineCount] = await Promise.all([
    prisma.correctiveAction.findMany({
      where,
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueAt: true,
        createdAt: true,
        resolvedAt: true,
        location: { select: { name: true, code: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.correctiveAction.count({ where: { ...base, status: { in: OPEN_STATES } } }),
    prisma.correctiveAction.count({
      where: { ...base, status: { in: OPEN_STATES }, dueAt: { lt: now } },
    }),
    prisma.correctiveAction.count({
      where: { ...base, assigneeId: user.id, status: { in: OPEN_STATES } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Corrective actions"
        description="Every failed item becomes a tracked follow-up until it is fixed and verified."
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Open" value={openCount} />
        <Stat label="Past due" value={overdueCount} tone={overdueCount ? "fail" : "neutral"} />
        <Stat label="Assigned to me" value={mineCount} tone={mineCount ? "warn" : "neutral"} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterTab current={filter} value="open" label="Open" />
        <FilterTab current={filter} value="mine" label="Mine" />
        <FilterTab current={filter} value="overdue" label="Past due" />
        <FilterTab current={filter} value="resolved" label="Resolved" />
      </div>

      {actions.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing here"
            description={
              filter === "open"
                ? "No open corrective actions. Your stores are clear."
                : "No actions match this filter."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {actions.map((action) => {
              const overdue =
                action.dueAt &&
                action.dueAt < now &&
                OPEN_STATES.includes(action.status as (typeof OPEN_STATES)[number]);
              return (
                <li key={action.id} className="border-b last:border-b-0">
                  <Link
                    href={`/actions/${action.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-sunken)]"
                  >
                    <span
                      className="h-9 w-1 shrink-0 rounded-full"
                      style={{
                        background:
                          action.priority === "CRITICAL"
                            ? "var(--fail)"
                            : action.priority === "HIGH"
                              ? "var(--warn)"
                              : "var(--border-strong)",
                      }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{action.title}</p>
                      <p className="text-muted mt-0.5 text-[12px]">
                        #{action.location.code} {action.location.name}
                        {action.assignee ? ` · ${action.assignee.name}` : " · Unassigned"}
                        {action.dueAt ? ` · due ${relativeTime(action.dueAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {overdue ? <Badge tone="fail">Late</Badge> : null}
                      <Badge
                        tone={
                          action.priority === "CRITICAL"
                            ? "fail"
                            : action.priority === "HIGH"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {ACTION_PRIORITY_LABELS[action.priority]}
                      </Badge>
                      <Badge
                        tone={
                          action.status === "VERIFIED"
                            ? "pass"
                            : action.status === "RESOLVED"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {ACTION_STATUS_LABELS[action.status]}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function FilterTab({
  current,
  value,
  label,
}: {
  current: string;
  value: string;
  label: string;
}) {
  const active = current === value;
  return (
    <Link
      href={`/actions?filter=${value}`}
      className="rounded-lg border px-3 py-1.5 text-[13px] font-medium"
      style={
        active
          ? { background: "var(--info-bg)", color: "var(--info)", borderColor: "transparent" }
          : { background: "var(--surface-raised)" }
      }
    >
      {label}
    </Link>
  );
}
