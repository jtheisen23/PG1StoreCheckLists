import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { getCurrentLocation } from "@/lib/current-location";
import { businessDateKey } from "@/lib/time";
import { DAYPART_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui";
import { ChecklistRunner } from "@/components/runner/checklist-runner";
import type { RunnerContext, RunnerTemplate } from "@/lib/runner-types";

export const metadata: Metadata = { title: "Run checklist" };
export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  const user = await requireUser();
  const location = await getCurrentLocation(user);
  if (!location) notFound();

  const allowed = await getAccessibleLocationIds(user);
  if (!allowed.includes(location.id)) notFound();

  const schedule = await prisma.schedule.findFirst({
    where: {
      id: scheduleId,
      orgId: user.orgId,
      active: true,
      locations: { some: { locationId: location.id } },
    },
    select: {
      id: true,
      name: true,
      daypart: true,
      dueTime: true,
      template: {
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          passingScore: true,
          status: true,
          sections: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              helpText: true,
              items: {
                // Archived items stay in history but never appear in a new walk.
                where: { archivedAt: null },
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  label: true,
                  helpText: true,
                  type: true,
                  required: true,
                  critical: true,
                  weight: true,
                  requirePhoto: true,
                  photoOnFail: true,
                  noteOnFail: true,
                  minValue: true,
                  maxValue: true,
                  unit: true,
                  options: true,
                  failingOptions: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!schedule || schedule.template.status !== "PUBLISHED") notFound();

  const template: RunnerTemplate = {
    id: schedule.template.id,
    name: schedule.template.name,
    description: schedule.template.description,
    category: schedule.template.category,
    passingScore: schedule.template.passingScore,
    sections: schedule.template.sections.filter((s) => s.items.length > 0),
  };

  const context: RunnerContext = {
    locationId: location.id,
    locationName: location.name,
    locationCode: location.code,
    timezone: location.timezone,
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    daypart: schedule.daypart,
    dueTime: schedule.dueTime,
  };

  // Stable per store / schedule / operating day, so a replayed offline
  // submission is recognised as the same walk rather than a second one.
  const clientKey = `${location.id}:${schedule.id}:${businessDateKey(location.timezone)}`;

  return (
    <>
      <div className="mb-4">
        <Link href="/" className="text-muted text-[13px]">
          ‹ Today
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{template.name}</h1>
          <Badge>{DAYPART_LABELS[schedule.daypart]}</Badge>
          {template.category ? <Badge tone="info">{template.category}</Badge> : null}
        </div>
        <p className="text-muted mt-1 text-[13px]">
          #{location.code} {location.name} · due by {schedule.dueTime}
        </p>
        {template.description ? (
          <p className="text-muted mt-2 text-[13px]">{template.description}</p>
        ) : null}
      </div>

      <ChecklistRunner
        template={template}
        context={context}
        clientKey={clientKey}
      />
    </>
  );
}
