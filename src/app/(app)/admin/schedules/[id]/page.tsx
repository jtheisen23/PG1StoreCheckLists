import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageTemplates } from "@/lib/permissions";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { DAY_NAMES, DAYPART_LABELS } from "@/lib/labels";
import { ScheduleForm } from "../schedule-form";

export const metadata: Metadata = { title: "Edit schedule" };
export const dynamic = "force-dynamic";

export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  if (!canManageTemplates(user)) notFound();

  const [schedule, locations] = await Promise.all([
    prisma.schedule.findFirst({
      where: { id, orgId: user.orgId },
      select: {
        id: true,
        name: true,
        daypart: true,
        startTime: true,
        dueTime: true,
        daysOfWeek: true,
        active: true,
        template: { select: { id: true, name: true } },
        locations: { select: { locationId: true } },
        _count: { select: { submissions: true } },
      },
    }),
    prisma.location.findMany({
      where: { orgId: user.orgId, active: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        district: { select: { name: true } },
      },
    }),
  ]);
  if (!schedule) notFound();

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/schedules" className="text-muted text-[13px]">
          ‹ Schedules
        </Link>
      </div>

      <PageHeader
        title={schedule.name}
        description={`${schedule.template.name} · ${schedule._count.submissions.toLocaleString()} submissions so far`}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <Card className="h-fit">
          <CardHeader
            title="What this schedule does now"
            subtitle="Changes take effect from each store's next walk."
          />
          <dl className="flex flex-col gap-3 px-5 py-4 text-[13px]">
            <Row label="Checklist" value={schedule.template.name} />
            <Row label="Daypart" value={DAYPART_LABELS[schedule.daypart]} />
            <Row
              label="Window"
              value={`${schedule.startTime} — due by ${schedule.dueTime}, each store's own time`}
            />
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="text-muted w-24 shrink-0 text-[12px]">Days</dt>
              <dd className="flex flex-wrap gap-1">
                {DAY_NAMES.map((day, index) => (
                  <Badge
                    key={day}
                    tone={schedule.daysOfWeek.includes(index) ? "info" : "neutral"}
                  >
                    {day}
                  </Badge>
                ))}
              </dd>
            </div>
            <Row
              label="Stores"
              value={`${schedule.locations.length} of ${locations.length}`}
            />
            <Row label="Status" value={schedule.active ? "Active" : "Paused"} />
          </dl>

          {schedule._count.submissions > 0 ? (
            <p className="text-muted border-t px-5 py-3 text-[12px]">
              Walks already completed against this schedule keep their answers and
              scores. Changing it only changes what stores are asked next.
            </p>
          ) : null}
        </Card>

        <ScheduleForm
          templates={[]}
          locations={locations}
          schedule={{
            id: schedule.id,
            templateName: schedule.template.name,
            name: schedule.name,
            daypart: schedule.daypart,
            startTime: schedule.startTime,
            dueTime: schedule.dueTime,
            daysOfWeek: schedule.daysOfWeek,
            locationIds: schedule.locations.map((l) => l.locationId),
          }}
        />
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="text-muted w-24 shrink-0 text-[12px]">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}
