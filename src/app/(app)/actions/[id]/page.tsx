import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canAssignActions,
  canVerifyActions,
  getAccessibleLocationIds,
} from "@/lib/permissions";
import { Badge, Card, CardHeader } from "@/components/ui";
import { ACTION_PRIORITY_LABELS, ACTION_STATUS_LABELS } from "@/lib/labels";
import { relativeTime } from "@/lib/time";
import { ActionForm } from "./action-form";

export const metadata: Metadata = { title: "Corrective action" };
export const dynamic = "force-dynamic";

export default async function ActionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const locationIds = await getAccessibleLocationIds(user);

  const action = await prisma.correctiveAction.findFirst({
    where: { id, orgId: user.orgId, locationId: { in: locationIds } },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueAt: true,
      createdAt: true,
      resolvedAt: true,
      resolutionNote: true,
      assigneeId: true,
      location: { select: { id: true, name: true, code: true } },
      assignee: { select: { name: true } },
      raisedBy: { select: { name: true } },
      submission: {
        select: { id: true, template: { select: { name: true } }, submittedAt: true },
      },
      response: {
        select: {
          note: true,
          photos: { select: { id: true, url: true } },
          item: { select: { label: true, critical: true } },
        },
      },
      photos: { select: { id: true, url: true } },
    },
  });

  if (!action) notFound();

  const assignable = await prisma.user.findMany({
    where: {
      orgId: user.orgId,
      active: true,
      OR: [
        { role: { in: ["ADMIN", "REGIONAL", "DISTRICT"] } },
        { scopes: { some: { locationId: action.location.id } } },
      ],
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  const evidence = [
    ...(action.response?.photos ?? []),
    ...action.photos,
  ];

  return (
    <>
      <Link href="/actions" className="text-muted text-[13px]">
        ‹ Corrective actions
      </Link>

      <div className="mt-1.5 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{action.title}</h1>
          <p className="text-muted mt-1 text-[13px]">
            #{action.location.code} {action.location.name} · raised by{" "}
            {action.raisedBy.name} {relativeTime(action.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={action.priority === "CRITICAL" ? "fail" : "warn"}>
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
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="What happened" />
            <div className="px-5 py-4">
              {action.description ? (
                <p className="text-[13px] whitespace-pre-wrap">{action.description}</p>
              ) : (
                <p className="text-muted text-[13px]">No description provided.</p>
              )}

              {action.submission ? (
                <p className="text-muted mt-3 text-[12px]">
                  From{" "}
                  <Link
                    href={`/submissions/${action.submission.id}`}
                    className="font-medium"
                    style={{ color: "var(--info)" }}
                  >
                    {action.submission.template.name}
                  </Link>
                  {action.response ? ` — "${action.response.item.label}"` : ""}
                </p>
              ) : null}

              {evidence.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {evidence.map((photo) => (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt="Evidence"
                        className="h-24 w-24 rounded-lg border object-cover"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>

          {action.resolutionNote ? (
            <Card>
              <CardHeader
                title="Resolution"
                subtitle={
                  action.resolvedAt
                    ? `Recorded ${relativeTime(action.resolvedAt)}`
                    : undefined
                }
              />
              <p className="px-5 py-4 text-[13px] whitespace-pre-wrap">
                {action.resolutionNote}
              </p>
            </Card>
          ) : null}
        </div>

        <ActionForm
          actionId={action.id}
          status={action.status}
          priority={action.priority}
          assigneeId={action.assigneeId}
          dueAt={action.dueAt ? action.dueAt.toISOString().slice(0, 16) : ""}
          assignable={assignable}
          canAssign={canAssignActions(user)}
          canVerify={canVerifyActions(user)}
        />
      </div>
    </>
  );
}
