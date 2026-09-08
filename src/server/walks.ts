"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { getCurrentLocation } from "@/lib/current-location";

/**
 * Starts a checklist right now, outside any schedule.
 *
 * Schedules answer "what does this store owe today". They are the wrong shape
 * for a visit: a Director of Operations arriving unannounced, or a food safety
 * audit run when someone is in the building. Scheduling those daily at every
 * store would put three audits on every general manager's Today screen, all of
 * them going overdue by evening.
 *
 * The walk it produces is a first-class submission with no schedule attached,
 * so it scores, raises corrective actions and emails exactly like any other.
 */
export async function startChecklistNow(formData: FormData): Promise<void> {
  const user = await requireUser();

  const location = await getCurrentLocation(user);
  if (!location) redirect("/");

  const allowed = await getAccessibleLocationIds(user);
  if (!allowed.includes(location.id)) redirect("/");

  const templateId = String(formData.get("templateId") ?? "");
  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, orgId: user.orgId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!template) redirect("/");

  // Identifies this visit, not this day: the same audit may legitimately be run
  // twice at one store — a re-check after a failure — and the second must not
  // be mistaken for a replay of the first. Generated once, then carried in the
  // URL so a refresh or a reconnect resumes the same walk.
  const visitId = randomUUID().slice(0, 12);
  redirect(`/run/checklist/${template.id}/${visitId}`);
}
