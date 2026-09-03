import "server-only";

import { SubmissionStatus, type Daypart } from "@prisma/client";

import { prisma } from "@/lib/db";
import { businessDate, localDayOfWeek, scheduleDueAt } from "@/lib/time";

export interface DueChecklist {
  scheduleId: string;
  scheduleName: string;
  templateId: string;
  templateName: string;
  category: string | null;
  daypart: Daypart;
  startTime: string;
  dueTime: string;
  dueAt: Date;
  overdue: boolean;
  completed: boolean;
  submissionId: string | null;
  score: number | null;
  passed: boolean | null;
  completedBy: string | null;
  itemCount: number;
}

/**
 * What a store owes right now: every active schedule that lands on today's
 * local day-of-week, paired with the submission that satisfied it (if any).
 */
export async function getDueChecklists(
  orgId: string,
  locationId: string,
  now: Date = new Date(),
): Promise<DueChecklist[]> {
  const location = await prisma.location.findFirst({
    where: { id: locationId, orgId },
    select: { timezone: true },
  });
  if (!location) return [];

  const day = businessDate(location.timezone, now);
  const dow = localDayOfWeek(location.timezone, now);

  const schedules = await prisma.schedule.findMany({
    where: {
      orgId,
      active: true,
      locations: { some: { locationId } },
      template: { status: "PUBLISHED" },
    },
    select: {
      id: true,
      name: true,
      daypart: true,
      startTime: true,
      dueTime: true,
      daysOfWeek: true,
      template: {
        select: {
          id: true,
          name: true,
          category: true,
          sections: {
            select: {
              // Archived items are not part of the walk, so they are not part
              // of the count a store sees before starting it.
              _count: { select: { items: { where: { archivedAt: null } } } },
            },
          },
        },
      },
    },
    orderBy: { dueTime: "asc" },
  });

  const todays = schedules.filter((s) => s.daysOfWeek.includes(dow));
  if (!todays.length) return [];

  const submissions = await prisma.submission.findMany({
    where: {
      locationId,
      businessDate: day,
      status: SubmissionStatus.SUBMITTED,
      scheduleId: { in: todays.map((s) => s.id) },
    },
    select: {
      id: true,
      scheduleId: true,
      score: true,
      passed: true,
      submittedAt: true,
      user: { select: { name: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const bySchedule = new Map(
    submissions.map((s) => [s.scheduleId as string, s]),
  );

  return todays.map((schedule) => {
    const submission = bySchedule.get(schedule.id);
    const dueAt = scheduleDueAt(location.timezone, day, schedule.dueTime);
    return {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      templateId: schedule.template.id,
      templateName: schedule.template.name,
      category: schedule.template.category,
      daypart: schedule.daypart,
      startTime: schedule.startTime,
      dueTime: schedule.dueTime,
      dueAt,
      overdue: !submission && dueAt < now,
      completed: Boolean(submission),
      submissionId: submission?.id ?? null,
      score: submission?.score ?? null,
      passed: submission?.passed ?? null,
      completedBy: submission?.user.name ?? null,
      itemCount: schedule.template.sections.reduce(
        (sum, s) => sum + s._count.items,
        0,
      ),
    };
  });
}

export interface LocationCompletion {
  locationId: string;
  due: number;
  completed: number;
  overdue: number;
  scoreSum: number;
  scoreCount: number;
}

/**
 * Completion across many locations for their own local day, in three queries
 * regardless of fleet size. Each location resolves its own business date, so
 * stores in different timezones are compared on the same operating day.
 */
export async function getCompletionByLocation(
  orgId: string,
  locationIds: string[],
  now: Date = new Date(),
): Promise<Map<string, LocationCompletion>> {
  const summary = new Map<string, LocationCompletion>();
  if (!locationIds.length) return summary;

  const locations = await prisma.location.findMany({
    where: { id: { in: locationIds }, orgId, active: true },
    select: { id: true, timezone: true },
  });
  if (!locations.length) return summary;

  const schedules = await prisma.schedule.findMany({
    where: {
      orgId,
      active: true,
      template: { status: "PUBLISHED" },
      locations: { some: { locationId: { in: locationIds } } },
    },
    select: {
      id: true,
      dueTime: true,
      daysOfWeek: true,
      locations: { select: { locationId: true } },
    },
  });

  // Schedules a given location is subscribed to.
  const byLocation = new Map<string, typeof schedules>();
  for (const schedule of schedules) {
    for (const { locationId } of schedule.locations) {
      const list = byLocation.get(locationId);
      if (list) list.push(schedule);
      else byLocation.set(locationId, [schedule]);
    }
  }

  const localDay = new Map<string, Date>();
  for (const location of locations) {
    localDay.set(location.id, businessDate(location.timezone, now));
  }

  const distinctDays = [
    ...new Map(
      [...localDay.values()].map((d) => [d.getTime(), d] as const),
    ).values(),
  ];

  const submissions = await prisma.submission.findMany({
    where: {
      orgId,
      locationId: { in: locations.map((l) => l.id) },
      businessDate: { in: distinctDays },
      status: SubmissionStatus.SUBMITTED,
      scheduleId: { not: null },
    },
    select: {
      locationId: true,
      scheduleId: true,
      businessDate: true,
      score: true,
    },
  });

  const done = new Map<string, number | null>();
  for (const s of submissions) {
    const day = localDay.get(s.locationId);
    if (!day || day.getTime() !== s.businessDate.getTime()) continue;
    done.set(`${s.locationId}:${s.scheduleId}`, s.score);
  }

  for (const location of locations) {
    const day = localDay.get(location.id)!;
    const dow = localDayOfWeek(location.timezone, now);
    const row: LocationCompletion = {
      locationId: location.id,
      due: 0,
      completed: 0,
      overdue: 0,
      scoreSum: 0,
      scoreCount: 0,
    };

    for (const schedule of byLocation.get(location.id) ?? []) {
      if (!schedule.daysOfWeek.includes(dow)) continue;
      row.due += 1;

      const key = `${location.id}:${schedule.id}`;
      if (done.has(key)) {
        row.completed += 1;
        const score = done.get(key);
        if (score !== null && score !== undefined) {
          row.scoreSum += score;
          row.scoreCount += 1;
        }
      } else if (scheduleDueAt(location.timezone, day, schedule.dueTime) < now) {
        row.overdue += 1;
      }
    }

    summary.set(location.id, row);
  }

  return summary;
}

/** Fleet-wide totals for one local day. */
export async function getCompletionSummary(
  orgId: string,
  locationIds: string[],
  now: Date = new Date(),
) {
  const byLocation = await getCompletionByLocation(orgId, locationIds, now);
  let due = 0;
  let completed = 0;
  let overdue = 0;
  for (const row of byLocation.values()) {
    due += row.due;
    completed += row.completed;
    overdue += row.overdue;
  }
  return { due, completed, overdue };
}
