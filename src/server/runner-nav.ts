import "server-only";

import { DAYPART_LABELS } from "@/lib/labels";
import { businessDateKey } from "@/lib/time";
import type { RunnerNav } from "@/lib/runner-types";
import { getDueChecklists } from "./schedules";

/**
 * The store's day around a walk: everything due today, for the switcher under
 * the title, and the same checklist's other times today (a temp log at
 * Opening, Midday and Close) as tabs. One call, made by the page, so the
 * runner itself never has to ask.
 */
export async function getRunnerNav(
  orgId: string,
  location: { id: string; timezone: string },
  current: { scheduleId: string | null; templateId: string },
  now: Date = new Date(),
): Promise<RunnerNav> {
  const due = await getDueChecklists(orgId, location.id, now);
  const key = businessDateKey(location.timezone, now);
  const dateLabel = new Date(`${key}T12:00:00Z`)
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .replace(",", "");

  const repeats = (templateId: string) => due.filter((entry) => entry.templateId === templateId).length > 1;
  const today = due.map((entry) => ({
    href: `/run/${entry.scheduleId}`,
    // A checklist run more than once a day is told apart by when.
    name: repeats(entry.templateId) ? `${entry.templateName} · ${DAYPART_LABELS[entry.daypart]}` : entry.templateName,
    detail: entry.completed
      ? `Done${entry.completedBy ? ` · ${entry.completedBy}` : ""}`
      : entry.overdue
        ? `Overdue · due by ${entry.dueTime}`
        : `Due by ${entry.dueTime}`,
    done: entry.completed,
    overdue: entry.overdue,
    current: entry.scheduleId === current.scheduleId,
  }));

  // Tabs only for a scheduled walk whose checklist recurs today.
  const siblings = current.scheduleId ? due.filter((entry) => entry.templateId === current.templateId) : [];
  const labels = siblings.map((entry) => DAYPART_LABELS[entry.daypart]);
  const tabs =
    siblings.length > 1
      ? siblings.map((entry, index) => ({
          href: `/run/${entry.scheduleId}`,
          // Two at the same daypart are told apart by their own names.
          label: labels.filter((label) => label === labels[index]).length > 1 ? entry.scheduleName : labels[index],
          done: entry.completed,
          current: entry.scheduleId === current.scheduleId,
        }))
      : null;

  return { backHref: "/", dateLabel, today, tabs };
}
