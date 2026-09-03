"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ItemType, Role, ScopeLevel, TemplateStatus, Daypart } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canManageTemplates, canManageUsers } from "@/lib/permissions";
import { parseChecklist } from "@/lib/checklist-import";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
}

async function requireAdmin() {
  const user = await requireUser();
  if (!canManageTemplates(user)) {
    throw new Error("Administrator access is required.");
  }
  return user;
}

// --- templates ------------------------------------------------------------

const templateSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  category: z.string().max(60).optional(),
  passingScore: z.coerce.number().int().min(0).max(100).default(90),
});

export async function createTemplate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
    passingScore: formData.get("passingScore") || 90,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const template = await prisma.checklistTemplate.create({
    data: {
      orgId: user.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      passingScore: parsed.data.passingScore,
      sections: { create: { title: "General", position: 0 } },
    },
    select: { id: true },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.created",
    entityType: "ChecklistTemplate",
    entityId: template.id,
    summary: `${user.name} created checklist "${parsed.data.name}"`,
  });

  redirect(`/admin/templates/${template.id}`);
}

export async function setTemplateStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();
  const templateId = String(formData.get("templateId") ?? "");
  const status = String(formData.get("status") ?? "") as TemplateStatus;

  if (!Object.values(TemplateStatus).includes(status)) {
    return { error: "Unknown status." };
  }

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, orgId: user.orgId },
    select: {
      id: true,
      name: true,
      sections: { select: { _count: { select: { items: true } } } },
    },
  });
  if (!template) return { error: "Checklist not found." };

  const itemCount = template.sections.reduce((sum, s) => sum + s._count.items, 0);
  if (status === TemplateStatus.PUBLISHED && itemCount === 0) {
    return { error: "Add at least one item before publishing." };
  }

  await prisma.checklistTemplate.update({
    where: { id: template.id },
    data: { status },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: `template.${status.toLowerCase()}`,
    entityType: "ChecklistTemplate",
    entityId: template.id,
    summary: `${user.name} set "${template.name}" to ${status.toLowerCase()}`,
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${template.id}`);
  return { ok: true };
}

export async function addSection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();
  const templateId = String(formData.get("templateId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2) return { error: "Give the section a name." };

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, orgId: user.orgId },
    select: { id: true, _count: { select: { sections: true } } },
  });
  if (!template) return { error: "Checklist not found." };

  await prisma.templateSection.create({
    data: {
      templateId: template.id,
      title,
      helpText: String(formData.get("helpText") ?? "").trim() || null,
      position: template._count.sections,
    },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.section_added",
    entityType: "ChecklistTemplate",
    entityId: template.id,
    summary: `${user.name} added section "${title}"`,
  });

  revalidatePath(`/admin/templates/${templateId}`);
  return { ok: true };
}

const itemSchema = z.object({
  sectionId: z.string().min(1),
  label: z.string().min(2).max(300),
  helpText: z.string().max(500).optional(),
  type: z.nativeEnum(ItemType),
  required: z.coerce.boolean().default(true),
  critical: z.coerce.boolean().default(false),
  weight: z.coerce.number().int().min(1).max(10).default(1),
  requirePhoto: z.coerce.boolean().default(false),
  photoOnFail: z.coerce.boolean().default(false),
  noteOnFail: z.coerce.boolean().default(true),
  actionOnFail: z.coerce.boolean().default(true),
  minValue: z.union([z.coerce.number(), z.literal("")]).optional(),
  maxValue: z.union([z.coerce.number(), z.literal("")]).optional(),
  unit: z.string().max(20).optional(),
  options: z.string().max(1000).optional(),
  failingOptions: z.string().max(1000).optional(),
});

export async function addItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const parsed = itemSchema.safeParse({
    sectionId: formData.get("sectionId"),
    label: formData.get("label"),
    helpText: formData.get("helpText") || undefined,
    type: formData.get("type"),
    required: formData.get("required") === "on",
    critical: formData.get("critical") === "on",
    weight: formData.get("weight") || 1,
    requirePhoto: formData.get("requirePhoto") === "on",
    photoOnFail: formData.get("photoOnFail") === "on",
    noteOnFail: formData.get("noteOnFail") === "on",
    actionOnFail: formData.get("actionOnFail") === "on",
    minValue: formData.get("minValue") === "" ? undefined : formData.get("minValue"),
    maxValue: formData.get("maxValue") === "" ? undefined : formData.get("maxValue"),
    unit: formData.get("unit") || undefined,
    options: formData.get("options") || undefined,
    failingOptions: formData.get("failingOptions") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the item details." };
  }
  const input = parsed.data;

  const section = await prisma.templateSection.findFirst({
    where: { id: input.sectionId, template: { orgId: user.orgId } },
    select: { id: true, templateId: true, _count: { select: { items: true } } },
  });
  if (!section) return { error: "Section not found." };

  const options = splitList(input.options);
  const failingOptions = splitList(input.failingOptions);

  if (
    (input.type === ItemType.SELECT || input.type === ItemType.MULTISELECT) &&
    options.length < 2
  ) {
    return { error: "Choice items need at least two options." };
  }
  const strayFailing = failingOptions.filter((o) => !options.includes(o));
  if (strayFailing.length) {
    return { error: `Failing option "${strayFailing[0]}" is not one of the options.` };
  }
  if (
    typeof input.minValue === "number" &&
    typeof input.maxValue === "number" &&
    input.minValue > input.maxValue
  ) {
    return { error: "The minimum cannot be greater than the maximum." };
  }

  await prisma.templateItem.create({
    data: {
      sectionId: section.id,
      label: input.label,
      helpText: input.helpText ?? null,
      type: input.type,
      position: section._count.items,
      required: input.required,
      critical: input.critical,
      weight: input.weight,
      requirePhoto: input.requirePhoto,
      photoOnFail: input.photoOnFail,
      noteOnFail: input.noteOnFail,
      actionOnFail: input.actionOnFail,
      minValue: typeof input.minValue === "number" ? input.minValue : null,
      maxValue: typeof input.maxValue === "number" ? input.maxValue : null,
      unit: input.unit || null,
      options,
      failingOptions,
    },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.item_added",
    entityType: "ChecklistTemplate",
    entityId: section.templateId,
    summary: `${user.name} added item "${input.label}" (${input.type})`,
  });

  revalidatePath(`/admin/templates/${section.templateId}`);
  return { ok: true };
}

/**
 * Takes an item off the master checklist.
 *
 * Archiving, never deleting: the row stays, so it is in the live database and
 * in every backup taken from now on. The item stops appearing in new walks and
 * every past submission keeps the answer it recorded, because an operations
 * record must not change shape because the checklist did.
 *
 * `purgeItem` is the deliberate way to remove one for good, and only ever for
 * an item nobody has answered.
 */
export async function removeItem(formData: FormData) {
  const user = await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");

  const item = await prisma.templateItem.findFirst({
    where: { id: itemId, section: { template: { orgId: user.orgId } } },
    select: {
      id: true,
      label: true,
      archivedAt: true,
      section: { select: { templateId: true } },
      _count: { select: { responses: true } },
    },
  });
  if (!item || item.archivedAt) return;

  await prisma.templateItem.update({
    where: { id: item.id },
    data: { archivedAt: new Date() },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.item_archived",
    entityType: "ChecklistTemplate",
    entityId: item.section.templateId,
    summary:
      item._count.responses > 0
        ? `${user.name} archived item "${item.label}" — ${item._count.responses.toLocaleString()} past answers kept`
        : `${user.name} archived item "${item.label}"`,
  });

  revalidatePath(`/admin/templates/${item.section.templateId}`);
}

/**
 * Permanently deletes an archived item that has never been answered.
 *
 * The guard is not only in this function: `ItemResponse.itemId` is RESTRICT, so
 * the database refuses to drop an item that history depends on even if this
 * check were wrong. Recording the full definition first means the log still
 * shows what was there.
 */
export async function purgeItem(formData: FormData) {
  const user = await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");

  const item = await prisma.templateItem.findFirst({
    where: { id: itemId, section: { template: { orgId: user.orgId } } },
    select: {
      id: true,
      label: true,
      type: true,
      helpText: true,
      critical: true,
      weight: true,
      minValue: true,
      maxValue: true,
      unit: true,
      options: true,
      failingOptions: true,
      archivedAt: true,
      section: { select: { templateId: true, title: true } },
      _count: { select: { responses: true } },
    },
  });

  if (!item || !item.archivedAt || item._count.responses > 0) return;

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.item_purged",
    entityType: "ChecklistTemplate",
    entityId: item.section.templateId,
    summary: `${user.name} permanently deleted the unused item "${item.label}"`,
    metadata: {
      section: item.section.title,
      label: item.label,
      type: item.type,
      helpText: item.helpText,
      critical: item.critical,
      weight: item.weight,
      minValue: item.minValue,
      maxValue: item.maxValue,
      unit: item.unit,
      options: item.options,
      failingOptions: item.failingOptions,
    },
  });

  await prisma.templateItem.delete({ where: { id: item.id } });
  revalidatePath(`/admin/templates/${item.section.templateId}`);
}

/** Puts an archived item back on the checklist for future walks. */
export async function restoreItem(formData: FormData) {
  const user = await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");

  const item = await prisma.templateItem.findFirst({
    where: { id: itemId, section: { template: { orgId: user.orgId } } },
    select: { id: true, label: true, section: { select: { templateId: true } } },
  });
  if (!item) return;

  await prisma.templateItem.update({
    where: { id: item.id },
    data: { archivedAt: null },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.item_restored",
    entityType: "ChecklistTemplate",
    entityId: item.section.templateId,
    summary: `${user.name} restored item "${item.label}"`,
  });

  revalidatePath(`/admin/templates/${item.section.templateId}`);
}

function splitList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// --- importing a checklist -------------------------------------------------

const importSchema = z.object({
  name: z.string().min(3).max(120),
  category: z.string().max(60).optional(),
  description: z.string().max(1000).optional(),
  passingScore: z.coerce.number().int().min(0).max(100).default(90),
  text: z.string().min(1).max(500_000),
});

export interface ImportState extends FormState {
  issues?: { row: number; message: string }[];
  /** Set when the file parsed but has problems the person should look at. */
  preview?: { sections: number; items: number; simpleMode: boolean };
}

/**
 * Creates a master checklist from a pasted table or an uploaded CSV.
 *
 * Anything that would produce a broken item is reported with its row number
 * and nothing is written — a half-imported checklist is worse than none.
 */
export async function importTemplate(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireAdmin();

  const upload = formData.get("file");
  const pasted = String(formData.get("text") ?? "");
  const text =
    upload instanceof File && upload.size > 0 ? await upload.text() : pasted;

  const parsed = importSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    description: formData.get("description") || undefined,
    passingScore: formData.get("passingScore") || 90,
    text,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.path[0] === "text"
          ? "Paste your checklist or choose a file first."
          : (parsed.error.issues[0]?.message ?? "Check the form."),
    };
  }

  const result = parseChecklist(parsed.data.text);
  if (result.issues.length || result.itemCount === 0) {
    return {
      error: `That file could not be imported — ${result.issues.length} problem(s) to fix.`,
      issues: result.issues,
      preview: {
        sections: result.sections.length,
        items: result.itemCount,
        simpleMode: result.simpleMode,
      },
    };
  }

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.checklistTemplate.create({
      data: {
        orgId: user.orgId,
        name: parsed.data.name,
        category: parsed.data.category ?? null,
        description: parsed.data.description ?? null,
        passingScore: parsed.data.passingScore,
      },
      select: { id: true },
    });

    for (const [index, section] of result.sections.entries()) {
      const row = await tx.templateSection.create({
        data: { templateId: created.id, title: section.title, position: index },
        select: { id: true },
      });
      await tx.templateItem.createMany({
        data: section.items.map((item, position) => ({
          sectionId: row.id,
          label: item.label,
          helpText: item.helpText,
          type: item.type,
          position,
          required: item.required,
          critical: item.critical,
          weight: item.weight,
          requirePhoto: item.requirePhoto,
          photoOnFail: item.photoOnFail,
          noteOnFail: item.noteOnFail,
          actionOnFail: item.actionOnFail,
          minValue: item.minValue,
          maxValue: item.maxValue,
          unit: item.unit,
          options: item.options,
          failingOptions: item.failingOptions,
        })),
      });
    }

    return created;
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.imported",
    entityType: "ChecklistTemplate",
    entityId: template.id,
    summary: `${user.name} imported "${parsed.data.name}" — ${result.itemCount} items in ${result.sections.length} section(s)`,
  });

  redirect(`/admin/templates/${template.id}`);
}

/** Appends imported items to an existing master, leaving what is there alone. */
export async function importIntoTemplate(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireAdmin();
  const templateId = String(formData.get("templateId") ?? "");

  const upload = formData.get("file");
  const text =
    upload instanceof File && upload.size > 0
      ? await upload.text()
      : String(formData.get("text") ?? "");

  if (!text.trim()) return { error: "Paste your items or choose a file first." };

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, orgId: user.orgId },
    select: {
      id: true,
      name: true,
      sections: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          _count: { select: { items: true } },
        },
      },
    },
  });
  if (!template) return { error: "Checklist not found." };

  const result = parseChecklist(text);
  if (result.issues.length || result.itemCount === 0) {
    return {
      error: `Nothing was imported — ${result.issues.length} problem(s) to fix.`,
      issues: result.issues,
    };
  }

  const byTitle = new Map(
    template.sections.map((section) => [section.title.toLowerCase(), section]),
  );
  let nextPosition = template.sections.length;

  await prisma.$transaction(async (tx) => {
    for (const section of result.sections) {
      const existing = byTitle.get(section.title.toLowerCase());
      const sectionId =
        existing?.id ??
        (
          await tx.templateSection.create({
            data: {
              templateId: template.id,
              title: section.title,
              position: nextPosition++,
            },
            select: { id: true },
          })
        ).id;

      const offset = existing?._count.items ?? 0;
      await tx.templateItem.createMany({
        data: section.items.map((item, index) => ({
          sectionId,
          label: item.label,
          helpText: item.helpText,
          type: item.type,
          position: offset + index,
          required: item.required,
          critical: item.critical,
          weight: item.weight,
          requirePhoto: item.requirePhoto,
          photoOnFail: item.photoOnFail,
          noteOnFail: item.noteOnFail,
          actionOnFail: item.actionOnFail,
          minValue: item.minValue,
          maxValue: item.maxValue,
          unit: item.unit,
          options: item.options,
          failingOptions: item.failingOptions,
        })),
      });
    }
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.imported",
    entityType: "ChecklistTemplate",
    entityId: template.id,
    summary: `${user.name} added ${result.itemCount} imported item(s) to "${template.name}"`,
  });

  revalidatePath(`/admin/templates/${template.id}`);
  return {
    ok: true,
    message: `Added ${result.itemCount} item(s) across ${result.sections.length} section(s).`,
  };
}

// --- schedules ------------------------------------------------------------

const scheduleSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(2).max(120),
  daypart: z.nativeEnum(Daypart),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function createSchedule(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const parsed = scheduleSchema.safeParse({
    templateId: formData.get("templateId"),
    name: formData.get("name"),
    daypart: formData.get("daypart"),
    startTime: formData.get("startTime"),
    dueTime: formData.get("dueTime"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the schedule details." };
  }

  const daysOfWeek = formData
    .getAll("daysOfWeek")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!daysOfWeek.length) return { error: "Pick at least one day of the week." };

  const locationIds = formData.getAll("locationIds").map(String).filter(Boolean);
  if (!locationIds.length) return { error: "Assign at least one store." };

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: parsed.data.templateId, orgId: user.orgId },
    select: { id: true, name: true },
  });
  if (!template) return { error: "Checklist not found." };

  const validLocations = await prisma.location.findMany({
    where: { id: { in: locationIds }, orgId: user.orgId },
    select: { id: true },
  });
  if (validLocations.length !== locationIds.length) {
    return { error: "One or more stores are not in your organization." };
  }

  const schedule = await prisma.schedule.create({
    data: {
      orgId: user.orgId,
      templateId: template.id,
      name: parsed.data.name,
      daypart: parsed.data.daypart,
      startTime: parsed.data.startTime,
      dueTime: parsed.data.dueTime,
      daysOfWeek,
      locations: {
        create: validLocations.map((l) => ({ locationId: l.id })),
      },
    },
    select: { id: true },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "schedule.created",
    entityType: "Schedule",
    entityId: schedule.id,
    summary: `${user.name} scheduled "${template.name}" for ${validLocations.length} store(s)`,
  });

  revalidatePath("/admin/schedules");
  return { ok: true, message: "Schedule created." };
}

export async function toggleSchedule(formData: FormData) {
  const user = await requireAdmin();
  const scheduleId = String(formData.get("scheduleId") ?? "");

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, orgId: user.orgId },
    select: { id: true, active: true, name: true },
  });
  if (!schedule) return;

  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { active: !schedule.active },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "schedule.updated",
    entityType: "Schedule",
    entityId: schedule.id,
    summary: `${user.name} ${schedule.active ? "paused" : "resumed"} "${schedule.name}"`,
  });

  revalidatePath("/admin/schedules");
}

// --- org hierarchy --------------------------------------------------------

const CODE = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9-]+$/, "Codes may use letters, numbers and hyphens only.");

export async function createRegion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = z
    .object({ name: z.string().min(2).max(80), code: CODE })
    .safeParse({
      name: formData.get("name"),
      code: String(formData.get("code") ?? "").trim().toUpperCase(),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the region details." };
  }

  const clash = await prisma.region.findFirst({
    where: { orgId: user.orgId, code: parsed.data.code },
    select: { id: true },
  });
  if (clash) return { error: `Region code "${parsed.data.code}" is already used.` };

  const region = await prisma.region.create({
    data: { orgId: user.orgId, name: parsed.data.name, code: parsed.data.code },
    select: { id: true, name: true },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "region.created",
    entityType: "Region",
    entityId: region.id,
    summary: `${user.name} created region "${region.name}"`,
  });

  revalidatePath("/admin/locations");
  return { ok: true, message: `Region "${region.name}" created.` };
}

export async function createDistrict(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = z
    .object({
      name: z.string().min(2).max(80),
      code: CODE,
      regionId: z.string().min(1, "Choose a region."),
    })
    .safeParse({
      name: formData.get("name"),
      code: String(formData.get("code") ?? "").trim().toUpperCase(),
      regionId: formData.get("regionId"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the district details." };
  }

  const region = await prisma.region.findFirst({
    where: { id: parsed.data.regionId, orgId: user.orgId },
    select: { id: true },
  });
  if (!region) return { error: "That region is not in your organization." };

  const clash = await prisma.district.findFirst({
    where: { orgId: user.orgId, code: parsed.data.code },
    select: { id: true },
  });
  if (clash) return { error: `District code "${parsed.data.code}" is already used.` };

  const district = await prisma.district.create({
    data: {
      orgId: user.orgId,
      regionId: region.id,
      name: parsed.data.name,
      code: parsed.data.code,
    },
    select: { id: true, name: true },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "district.created",
    entityType: "District",
    entityId: district.id,
    summary: `${user.name} created district "${district.name}"`,
  });

  revalidatePath("/admin/locations");
  return { ok: true, message: `District "${district.name}" created.` };
}

/** Rejects anything Intl cannot resolve, so store-local time always works. */
function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function createLocation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = z
    .object({
      name: z.string().min(2).max(120),
      code: CODE,
      districtId: z.string().min(1, "Choose a district."),
      timezone: z.string().min(1),
      address: z.string().max(200).optional(),
      city: z.string().max(80).optional(),
      state: z.string().max(40).optional(),
      postalCode: z.string().max(20).optional(),
      phone: z.string().max(40).optional(),
    })
    .safeParse({
      name: formData.get("name"),
      code: String(formData.get("code") ?? "").trim(),
      districtId: formData.get("districtId"),
      timezone: formData.get("timezone"),
      address: formData.get("address") || undefined,
      city: formData.get("city") || undefined,
      state: formData.get("state") || undefined,
      postalCode: formData.get("postalCode") || undefined,
      phone: formData.get("phone") || undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the store details." };
  }
  if (!isValidTimezone(parsed.data.timezone)) {
    return { error: `"${parsed.data.timezone}" is not a timezone this system knows.` };
  }

  const district = await prisma.district.findFirst({
    where: { id: parsed.data.districtId, orgId: user.orgId },
    select: { id: true, name: true },
  });
  if (!district) return { error: "That district is not in your organization." };

  const clash = await prisma.location.findFirst({
    where: { orgId: user.orgId, code: parsed.data.code },
    select: { id: true },
  });
  if (clash) return { error: `Store number "${parsed.data.code}" is already used.` };

  const location = await prisma.location.create({
    data: {
      orgId: user.orgId,
      districtId: district.id,
      name: parsed.data.name,
      code: parsed.data.code,
      timezone: parsed.data.timezone,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      postalCode: parsed.data.postalCode ?? null,
      phone: parsed.data.phone ?? null,
    },
    select: { id: true, name: true, code: true },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "location.created",
    entityType: "Location",
    entityId: location.id,
    locationId: location.id,
    summary: `${user.name} added store #${location.code} ${location.name} to ${district.name}`,
  });

  revalidatePath("/admin/locations");
  revalidatePath("/locations");
  return { ok: true, message: `Store #${location.code} ${location.name} added.` };
}

export async function toggleLocationActive(formData: FormData) {
  const user = await requireAdmin();
  const locationId = String(formData.get("locationId") ?? "");

  const location = await prisma.location.findFirst({
    where: { id: locationId, orgId: user.orgId },
    select: { id: true, active: true, name: true, code: true },
  });
  if (!location) return;

  await prisma.location.update({
    where: { id: location.id },
    data: { active: !location.active },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "location.updated",
    entityType: "Location",
    entityId: location.id,
    locationId: location.id,
    summary: `${user.name} ${location.active ? "closed" : "reopened"} store #${location.code} ${location.name}`,
  });

  revalidatePath("/admin/locations");
  revalidatePath("/locations");
}

// --- users ----------------------------------------------------------------

const userSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  role: z.nativeEnum(Role),
  password: z.string().min(10).max(200),
});

export async function createUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!canManageUsers(user)) return { error: "Administrator access is required." };

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.path[0] === "password"
          ? "The temporary password must be at least 10 characters."
          : (parsed.error.issues[0]?.message ?? "Check the form."),
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) return { error: "Someone already uses that email address." };

  const scopeLevel = String(formData.get("scopeLevel") ?? "LOCATION") as ScopeLevel;
  const scopeIds = formData.getAll("scopeIds").map(String).filter(Boolean);

  if (scopeLevel !== ScopeLevel.ORG && !scopeIds.length) {
    return { error: "Choose at least one region, district or store for this person." };
  }

  const created = await prisma.user.create({
    data: {
      orgId: user.orgId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
      scopes: {
        create:
          scopeLevel === ScopeLevel.ORG
            ? [{ level: ScopeLevel.ORG }]
            : scopeIds.map((id) => ({
                level: scopeLevel,
                regionId: scopeLevel === ScopeLevel.REGION ? id : null,
                districtId: scopeLevel === ScopeLevel.DISTRICT ? id : null,
                locationId: scopeLevel === ScopeLevel.LOCATION ? id : null,
              })),
      },
    },
    select: { id: true, name: true },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "user.created",
    entityType: "User",
    entityId: created.id,
    summary: `${user.name} added ${created.name} as ${parsed.data.role}`,
  });

  revalidatePath("/admin/users");
  return { ok: true, message: `${created.name} can now sign in.` };
}

export async function toggleUserActive(formData: FormData) {
  const user = await requireUser();
  if (!canManageUsers(user)) return;

  const userId = String(formData.get("userId") ?? "");
  if (userId === user.id) return; // never lock yourself out

  const target = await prisma.user.findFirst({
    where: { id: userId, orgId: user.orgId },
    select: { id: true, active: true, name: true },
  });
  if (!target) return;

  await prisma.user.update({
    where: { id: target.id },
    data: { active: !target.active },
  });

  // Deactivating revokes every live session immediately.
  if (target.active) {
    await prisma.session.deleteMany({ where: { userId: target.id } });
  }

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "user.updated",
    entityType: "User",
    entityId: target.id,
    summary: `${user.name} ${target.active ? "deactivated" : "reactivated"} ${target.name}`,
  });

  revalidatePath("/admin/users");
}
