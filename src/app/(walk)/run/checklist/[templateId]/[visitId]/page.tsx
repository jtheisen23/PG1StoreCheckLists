import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { getCurrentLocation } from "@/lib/current-location";
import { ChecklistRunner } from "@/components/runner/checklist-runner";
import type { RunnerContext, RunnerTemplate } from "@/lib/runner-types";
import { getRunnerSubSpecs, getStoreWeightWeek, weighsSubs } from "@/server/sub-specs";
import { getRunnerNav } from "@/server/runner-nav";

export const metadata: Metadata = { title: "Run checklist" };
export const dynamic = "force-dynamic";

/**
 * A checklist run on demand rather than because a schedule said so — a store
 * visit. Everything downstream is identical to a scheduled walk; the
 * submission simply has no schedule attached.
 */
export default async function RunUnscheduledPage({
  params,
}: {
  params: Promise<{ templateId: string; visitId: string }>;
}) {
  const { templateId, visitId } = await params;
  const user = await requireUser();
  const location = await getCurrentLocation(user);
  if (!location) notFound();

  const allowed = await getAccessibleLocationIds(user);
  if (!allowed.includes(location.id)) notFound();

  const found = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, orgId: user.orgId, status: "PUBLISHED" },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      passingScore: true,
      sections: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          helpText: true,
          items: {
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
  });
  if (!found) notFound();

  const template: RunnerTemplate = {
    id: found.id,
    name: found.name,
    description: found.description,
    category: found.category,
    passingScore: found.passingScore,
    sections: found.sections.filter((s) => s.items.length > 0),
    // The menu travels with the walk, so a weighing is judged with no signal.
    subSpecs: weighsSubs(found.sections) ? await getRunnerSubSpecs(user.orgId) : undefined,
    subWeightWeek: weighsSubs(found.sections) ? await getStoreWeightWeek(location) : undefined,
  };

  const context: RunnerContext = {
    locationId: location.id,
    locationName: location.name,
    locationCode: location.code,
    timezone: location.timezone,
    // No schedule: this walk was started by a person, not owed by the store.
    scheduleId: null,
    scheduleName: found.name,
    daypart: "ANYTIME",
    dueTime: "23:59",
  };

  // Keyed on the visit rather than the day, so a re-check on the same date is
  // its own walk while an offline replay of this one is still recognised. A
  // void needs nothing special here: a new visit is a new key.
  const clientKey = `${location.id}:visit:${visitId}`;

  const nav = await getRunnerNav(user.orgId, location, { scheduleId: null, templateId: template.id });

  return (
    <ChecklistRunner
      template={template}
      context={context}
      clientKey={clientKey}
      nav={nav}
      subtitle={`#${location.code} ${location.name} · ${nav.dateLabel} · store visit by ${user.name}`}
    />
  );
}
