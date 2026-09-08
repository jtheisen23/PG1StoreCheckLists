import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DAY_NAMES, DAYPART_LABELS } from "@/lib/labels";
import { toggleSchedule } from "@/server/admin-service";
import Link from "next/link";
import { ScheduleForm } from "./schedule-form";

export const metadata: Metadata = { title: "Schedules" };
export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const user = await requireUser();

  const [schedules, templates, locations] = await Promise.all([
    prisma.schedule.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ active: "desc" }, { dueTime: "asc" }],
      select: {
        id: true,
        name: true,
        daypart: true,
        startTime: true,
        dueTime: true,
        daysOfWeek: true,
        active: true,
        template: { select: { name: true, status: true } },
        locations: { select: { locationId: true } },
        _count: { select: { locations: true } },
      },
    }),
    prisma.checklistTemplate.findMany({
      where: { orgId: user.orgId, status: "PUBLISHED" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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

  // A store that no active schedule reaches shows nothing on its Today screen.
  // That is easy to create by accident when a schedule is built by ticking 43
  // boxes, and invisible unless it is counted here.
  const covered = new Set(
    schedules
      .filter((s) => s.active && s.template.status === "PUBLISHED")
      .flatMap((s) => s.locations.map((l) => l.locationId)),
  );
  const uncovered = locations.filter((l) => !covered.has(l.id));

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Assign a published checklist to stores, at a daypart, on the days it should run."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div>
          {schedules.length === 0 ? (
            <Card>
              <EmptyState
                title="No schedules yet"
                description="Publish a checklist, then schedule it here."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul>
                {schedules.map((schedule) => (
                  <li
                    key={schedule.id}
                    className="flex items-start gap-3 border-b px-4 py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-medium">{schedule.name}</p>
                        <Badge>{DAYPART_LABELS[schedule.daypart]}</Badge>
                        {schedule.template.status !== "PUBLISHED" ? (
                          <Badge tone="warn">Checklist not published</Badge>
                        ) : null}
                        {!schedule.active ? <Badge tone="neutral">Paused</Badge> : null}
                      </div>
                      <p className="text-muted mt-0.5 text-[12px]">
                        {schedule.template.name} · {schedule.startTime}–
                        {schedule.dueTime} · {schedule._count.locations} store
                        {schedule._count.locations === 1 ? "" : "s"}
                      </p>
                      <div className="mt-1.5 flex gap-1">
                        {DAY_NAMES.map((day, index) => (
                          <span
                            key={day}
                            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                            style={
                              schedule.daysOfWeek.includes(index)
                                ? { background: "var(--info-bg)", color: "var(--info)" }
                                : {
                                    background: "var(--surface-sunken)",
                                    color: "var(--text-faint)",
                                  }
                            }
                          >
                            {day}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Link
                        href={`/admin/schedules/${schedule.id}`}
                        className="text-[12px] font-medium"
                        style={{ color: "var(--info)" }}
                      >
                        Edit
                      </Link>
                      <form action={toggleSchedule}>
                        <input type="hidden" name="scheduleId" value={schedule.id} />
                        <button type="submit" className="text-muted text-[12px] font-medium">
                          {schedule.active ? "Pause" : "Resume"}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {locations.length > 0 ? (
            <Card className="mt-4 overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
                <p className="text-[13px] font-semibold">Store coverage</p>
                <p className="text-muted text-[12px]">
                  {locations.length - uncovered.length} of {locations.length} stores
                  on an active schedule
                </p>
              </div>
              {uncovered.length === 0 ? (
                <p className="px-4 py-3 text-[12px]" style={{ color: "var(--pass)" }}>
                  Every open store has at least one checklist scheduled.
                </p>
              ) : (
                <div className="px-4 py-3">
                  <p className="mb-2 text-[12px]" style={{ color: "var(--warn)" }}>
                    {uncovered.length} store{uncovered.length === 1 ? "" : "s"} have
                    nothing scheduled — their Today screen will be empty. They can
                    still be walked on the spot.
                  </p>
                  <p className="text-muted text-[12px]">
                    {uncovered.slice(0, 24).map((l) => `#${l.code} ${l.name}`).join(" · ")}
                    {uncovered.length > 24 ? ` · and ${uncovered.length - 24} more` : ""}
                  </p>
                </div>
              )}
            </Card>
          ) : null}
        </div>

        <ScheduleForm templates={templates} locations={locations} />
      </div>
    </>
  );
}
