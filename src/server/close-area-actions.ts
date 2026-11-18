"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canManageTemplates } from "@/lib/permissions";
import { STANDARD_CLOSE_AREAS } from "@/lib/close-rating";
import type { FormState } from "./admin-service";

/*
 * The areas an opener rates each morning. Areas are archived, never deleted:
 * past ratings point at them, and a store's history should still say
 * "Grill" after the organization stops rating it.
 */

async function requireAdmin() {
  const user = await requireUser();
  if (!canManageTemplates(user)) {
    throw new Error("Administrator access is required.");
  }
  return user;
}

function refresh() {
  revalidatePath("/admin/close-rating");
  revalidatePath("/");
}

const areaSchema = z.object({
  name: z.string().trim().min(1, "Give the area a name.").max(40, "Keep the name under 40 characters."),
  templateId: z.string().trim().optional(),
});

async function checkTemplate(orgId: string, templateId: string | undefined) {
  if (!templateId) return null;
  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, orgId },
    select: { id: true, name: true },
  });
  if (!template) throw new Error("That checklist could not be found.");
  return template;
}

async function nameTaken(orgId: string, name: string, exceptId?: string) {
  const clash = await prisma.closeArea.findFirst({
    where: {
      orgId,
      archivedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(clash);
}

/** Frontline, Grill and Backroom in one click, for an organization starting out. */
export async function setUpStandardCloseAreas() {
  const user = await requireAdmin();
  const existing = await prisma.closeArea.findMany({
    where: { orgId: user.orgId, archivedAt: null },
    select: { name: true, position: true },
  });
  const have = new Set(existing.map((area) => area.name.toLowerCase()));
  const missing = STANDARD_CLOSE_AREAS.filter((name) => !have.has(name.toLowerCase()));
  if (!missing.length) return;

  const start = existing.reduce((max, area) => Math.max(max, area.position + 1), 0);
  await prisma.closeArea.createMany({
    data: missing.map((name, index) => ({ orgId: user.orgId, name, position: start + index })),
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "close_area.created",
    entityType: "CloseArea",
    summary: `${user.name} set up the close rating: ${missing.join(", ")}`,
  });
  refresh();
}

export async function addCloseArea(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = areaSchema.safeParse({
    name: formData.get("name"),
    templateId: formData.get("templateId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const template = await checkTemplate(user.orgId, parsed.data.templateId);
    if (await nameTaken(user.orgId, parsed.data.name)) {
      return { error: `There is already an area called ${parsed.data.name}.` };
    }
    const last = await prisma.closeArea.findFirst({
      where: { orgId: user.orgId, archivedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const area = await prisma.closeArea.create({
      data: {
        orgId: user.orgId,
        name: parsed.data.name,
        templateId: template?.id ?? null,
        position: (last?.position ?? -1) + 1,
      },
    });

    await logActivity({
      orgId: user.orgId,
      userId: user.id,
      action: "close_area.created",
      entityType: "CloseArea",
      entityId: area.id,
      summary: `${user.name} added "${area.name}" to the close rating${template ? `, closed on "${template.name}"` : ""}`,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The area could not be added." };
  }

  refresh();
  return { ok: true, message: `Added ${parsed.data.name}.` };
}

export async function updateCloseArea(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const id = String(formData.get("areaId") ?? "");
  const parsed = areaSchema.safeParse({
    name: formData.get("name"),
    templateId: formData.get("templateId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const area = await prisma.closeArea.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, name: true, templateId: true },
  });
  if (!area) return { error: "That area could not be found." };

  try {
    const template = await checkTemplate(user.orgId, parsed.data.templateId);
    if (await nameTaken(user.orgId, parsed.data.name, area.id)) {
      return { error: `There is already an area called ${parsed.data.name}.` };
    }
    await prisma.closeArea.update({
      where: { id: area.id },
      data: { name: parsed.data.name, templateId: template?.id ?? null },
    });

    const changes = [
      area.name !== parsed.data.name ? `renamed "${area.name}" to "${parsed.data.name}"` : null,
      area.templateId !== (template?.id ?? null)
        ? template
          ? `linked "${parsed.data.name}" to "${template.name}"`
          : `unlinked "${parsed.data.name}" from its closing checklist`
        : null,
    ].filter(Boolean);
    if (changes.length) {
      await logActivity({
        orgId: user.orgId,
        userId: user.id,
        action: "close_area.updated",
        entityType: "CloseArea",
        entityId: area.id,
        summary: `${user.name} ${changes.join(" and ")}`,
      });
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The area could not be saved." };
  }

  refresh();
  return { ok: true, message: "Saved." };
}

export async function moveCloseArea(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("areaId") ?? "");
  const step = formData.get("direction") === "up" ? -1 : 1;

  const areas = await prisma.closeArea.findMany({
    where: { orgId: user.orgId, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
  const from = areas.findIndex((area) => area.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= areas.length) return;

  [areas[from], areas[to]] = [areas[to], areas[from]];
  // Renumber the whole list so positions stay dense whatever came before.
  await prisma.$transaction(
    areas.map((area, position) =>
      prisma.closeArea.update({ where: { id: area.id }, data: { position } }),
    ),
  );

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "close_area.updated",
    entityType: "CloseArea",
    entityId: id,
    summary: `${user.name} reordered the close rating: ${areas.map((area) => area.name).join(", ")}`,
  });
  refresh();
}

export async function setCloseAreaArchived(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("areaId") ?? "");
  const archive = formData.get("archive") === "true";

  const area = await prisma.closeArea.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!area || Boolean(area.archivedAt) === archive) return;

  if (!archive && (await nameTaken(user.orgId, area.name))) {
    // Restoring would put two areas of the same name on the opener's screen.
    return;
  }

  const last = await prisma.closeArea.findFirst({
    where: { orgId: user.orgId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await prisma.closeArea.update({
    where: { id: area.id },
    data: archive
      ? { archivedAt: new Date() }
      : { archivedAt: null, position: (last?.position ?? -1) + 1 },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: archive ? "close_area.archived" : "close_area.restored",
    entityType: "CloseArea",
    entityId: area.id,
    summary: archive
      ? `${user.name} stopped rating "${area.name}" at close`
      : `${user.name} started rating "${area.name}" at close again`,
  });
  refresh();
}
