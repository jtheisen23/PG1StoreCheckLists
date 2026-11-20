import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { getCurrentLocation } from "@/lib/current-location";
import { businessDateKey, localDayOfWeek } from "@/lib/time";
import { runsOn } from "@/lib/weekdays";
import { ChecklistRunner } from "@/components/runner/checklist-runner";
import type { RunnerContext, RunnerTemplate } from "@/lib/runner-types";
import { getRunnerSubSpecs, getStoreWeightWeek, weighsSubs } from "@/server/sub-specs";
import { getRunnerNav } from "@/server/runner-nav";

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
              daysOfWeek: true,
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
                  actionOnFail: true,
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
  const today = localDayOfWeek(location.timezone);

  const template: RunnerTemplate = {
    id: schedule.template.id,
    name: schedule.template.name,
    description: schedule.template.description,
    category: schedule.template.category,
    passingScore: schedule.template.passingScore,
    // Only the sections that run on the store's day: the daily sheet's
    // cleaning focus is Tuesday's grill on a Tuesday, and nothing else.
    sections: schedule.template.sections.filter((s) => s.items.length > 0 && runsOn(s.daysOfWeek, today)),
    // The menu travels with the walk, so a weighing is judged with no signal.
    subSpecs: weighsSubs(schedule.template.sections) ? await getRunnerSubSpecs(user.orgId) : undefined,
    subWeightWeek: weighsSubs(schedule.template.sections) ? await getStoreWeightWeek(location) : undefined,
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
  // submission is recognised as the same walk rather than a second one. If the
  // walk on this key is voided, the redo is sent under the same key and the
  // server stores it beside the voided one — see src/lib/walk-key.ts.
  const clientKey = `${location.id}:${schedule.id}:${businessDateKey(location.timezone)}`;

  const nav = await getRunnerNav(user.orgId, location, { scheduleId: schedule.id, templateId: template.id });

  return (
    <ChecklistRunner
      template={template}
      context={context}
      clientKey={clientKey}
      nav={nav}
      subtitle={`#${location.code} ${location.name} · ${nav.dateLabel} · due by ${schedule.dueTime}`}
    />
  );
}
