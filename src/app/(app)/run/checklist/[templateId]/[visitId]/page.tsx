import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { getCurrentLocation } from "@/lib/current-location";
import { Badge } from "@/components/ui";
import { ChecklistRunner } from "@/components/runner/checklist-runner";
import type { RunnerContext, RunnerTemplate } from "@/lib/runner-types";

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
  // its own walk while an offline replay of this one is still recognised.
  const clientKey = `${location.id}:visit:${visitId}`;

  return (
    <>
      <div className="mb-4">
        <Link href="/" className="text-muted text-[13px]">
          ‹ Today
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{template.name}</h1>
          <Badge tone="info">Store visit</Badge>
          {template.category ? <Badge>{template.category}</Badge> : null}
        </div>
        <p className="text-muted mt-1 text-[13px]">
          #{location.code} {location.name} · started {user.name}
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
