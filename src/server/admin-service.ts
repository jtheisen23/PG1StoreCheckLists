"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ItemType, Role, ScopeLevel, TemplateStatus, Daypart } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser, hashPassword, verifyPassword, readClaims } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canManageTemplates, canManageUsers } from "@/lib/permissions";
import { parseChecklist } from "@/lib/checklist-import";
import { parseStores, slugCode, type Grouping } from "@/lib/store-import";
import { parseRecipients } from "@/lib/email-content";
import {
  BUNDLED_CHECKLISTS,
  readBundledChecklist,
} from "./bundled-checklists";

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
type TemplateTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Writes parsed sections and their items under a template, in order. */
async function writeSections(
  tx: TemplateTx,
  templateId: string,
  sections: ReturnType<typeof parseChecklist>["sections"],
) {
  for (const [index, section] of sections.entries()) {
    const row = await tx.templateSection.create({
      data: { templateId, title: section.title, position: index },
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
}

/**
 * Installs one of the checklists that ship with the app.
 *
 * The same parser and the same writes as a file import — the only difference is
 * where the text came from. Published straight away, because these are the
 * checklists this operation already runs and the next thing anyone wants to do
 * is put one on a schedule.
 */
export async function installBundledChecklist(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const key = String(formData.get("key") ?? "");
  const entry = BUNDLED_CHECKLISTS.find((item) => item.key === key);
  if (!entry) return { error: "That checklist is not one of the built-in ones." };

  const clash = await prisma.checklistTemplate.findFirst({
    where: { orgId: user.orgId, name: entry.name },
    select: { id: true },
  });
  if (clash) {
    return { error: `"${entry.name}" is already here. Open it to make changes.` };
  }

  const text = await readBundledChecklist(key);
  if (!text) {
    return {
      error: `"${entry.name}" could not be read from this deployment.`,
    };
  }

  const result = parseChecklist(text);
  if (result.issues.length || result.itemCount === 0) {
    return { error: `"${entry.name}" could not be read — the file is damaged.` };
  }

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.checklistTemplate.create({
      data: {
        orgId: user.orgId,
        name: entry.name,
        category: entry.category,
        description: entry.description,
        passingScore: entry.passingScore,
        status: TemplateStatus.PUBLISHED,
      },
      select: { id: true },
    });
    await writeSections(tx, created.id, result.sections);
    return created;
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.imported",
    entityType: "ChecklistTemplate",
    entityId: template.id,
    summary: `${user.name} installed the built-in "${entry.name}" — ${result.itemCount} items in ${result.sections.length} section(s)`,
  });

  revalidatePath("/admin/templates");
  return {
    ok: true,
    message: `"${entry.name}" is in and published — ${result.itemCount} items. Put it on a schedule next.`,
  };
}

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

    await writeSections(tx, created.id, result.sections);

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

/**
 * Sets who is emailed a summary when this checklist is submitted.
 *
 * Held on the checklist rather than per store, because the people who want a
 * completed audit want it for every store that runs it.
 */
export async function setChecklistRecipients(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const templateId = String(formData.get("templateId") ?? "");
  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, orgId: user.orgId },
    select: { id: true, name: true },
  });
  if (!template) return { error: "That checklist is not in your organization." };

  const { emails, invalid } = parseRecipients(String(formData.get("recipients") ?? ""));
  if (invalid.length) {
    return {
      error: `${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""} ${
        invalid.length === 1 ? "is not a valid address" : "are not valid addresses"
      }.`,
    };
  }
  if (emails.length > 25) {
    return { error: "That is more than 25 addresses. Use a distribution list instead." };
  }

  await prisma.checklistTemplate.update({
    where: { id: template.id },
    data: { notifyEmails: emails },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.recipients_updated",
    entityType: "ChecklistTemplate",
    entityId: template.id,
    summary: emails.length
      ? `${user.name} set "${template.name}" to email ${emails.length} recipient${emails.length === 1 ? "" : "s"}`
      : `${user.name} turned off email for "${template.name}"`,
  });

  revalidatePath(`/admin/templates/${template.id}`);
  return {
    ok: true,
    message: emails.length
      ? `Saved. ${emails.length} recipient${emails.length === 1 ? "" : "s"} will get this audit.`
      : "Saved. Nobody is emailed this checklist.",
  };
}

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

/**
 * Changes an existing schedule: its name, when it is due, which days it runs
 * and which stores it covers.
 *
 * Store coverage is replaced rather than merged, because the form always posts
 * the full set — a store dropped from the list means "no longer on this
 * schedule". Past submissions keep pointing at this schedule either way; what
 * a store already did is not undone by changing what it is asked to do next.
 */
export async function updateSchedule(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const scheduleId = String(formData.get("scheduleId") ?? "");
  const existing = await prisma.schedule.findFirst({
    where: { id: scheduleId, orgId: user.orgId },
    select: { id: true, name: true },
  });
  if (!existing) return { error: "That schedule is not in your organization." };

  const parsed = scheduleSchema
    .omit({ templateId: true })
    .safeParse({
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
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  if (!daysOfWeek.length) return { error: "Pick at least one day of the week." };

  const locationIds = formData
    .getAll("locationIds")
    .map(String)
    .filter(Boolean);
  if (!locationIds.length) return { error: "Pick at least one store." };

  const validLocations = await prisma.location.findMany({
    where: { id: { in: locationIds }, orgId: user.orgId },
    select: { id: true },
  });
  if (validLocations.length !== locationIds.length) {
    return { error: "One or more stores are not in your organization." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.schedule.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        daypart: parsed.data.daypart,
        startTime: parsed.data.startTime,
        dueTime: parsed.data.dueTime,
        daysOfWeek,
      },
    });
    await tx.scheduleLocation.deleteMany({ where: { scheduleId: existing.id } });
    await tx.scheduleLocation.createMany({
      data: validLocations.map((l) => ({ scheduleId: existing.id, locationId: l.id })),
    });
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "schedule.updated",
    entityType: "Schedule",
    entityId: existing.id,
    summary: `${user.name} updated the "${parsed.data.name}" schedule — ${validLocations.length} store(s)`,
  });

  revalidatePath("/admin/schedules");
  revalidatePath(`/admin/schedules/${existing.id}`);
  return {
    ok: true,
    message: `Saved. ${validLocations.length} store${validLocations.length === 1 ? "" : "s"} on this schedule.`,
  };
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
      brand: z.string().max(80).optional(),
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
      brand: formData.get("brand") || undefined,
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
      brand: parsed.data.brand ?? null,
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

export interface StoreImportState extends FormState {
  summary?: {
    created: number;
    updated: number;
    regionsCreated: number;
    districtsCreated: number;
  };
  issues?: { row: number; message: string }[];
}

/**
 * Creates or updates stores from a pasted spreadsheet, building whatever
 * regions and districts they roll up into along the way.
 *
 * The text is parsed here rather than trusting anything the browser worked out
 * for its preview. Re-running the same paste is safe: a store number that
 * already exists is updated in place, never duplicated and never deleted, so
 * this stays usable as the way to correct a typo in a store's city or timezone.
 */
export async function importStores(
  _prev: StoreImportState,
  formData: FormData,
): Promise<StoreImportState> {
  const user = await requireAdmin();

  const text = String(formData.get("stores") ?? "");
  if (!text.trim()) return { error: "Paste your store list first." };

  const grouping: Grouping =
    formData.get("grouping") === "state" ? "state" : "brand";
  const parsed = parseStores(text, grouping);

  const issues = [...parsed.issues];
  const usable = parsed.stores.filter((store) => {
    if (isValidTimezone(store.timezone)) return true;
    issues.push({
      row: store.sourceRow,
      message: `Store ${store.code}: "${store.timezone}" is not a timezone this system knows; row skipped.`,
    });
    return false;
  });

  if (usable.length === 0) {
    return {
      error: issues[0]?.message ?? "No stores found in that paste.",
      issues,
    };
  }

  const counts = await prisma.$transaction(
    async (tx) => {
      const [regions, districts] = await Promise.all([
        tx.region.findMany({
          where: { orgId: user.orgId },
          select: { id: true, name: true, code: true },
        }),
        tx.district.findMany({
          where: { orgId: user.orgId },
          select: { id: true, name: true, code: true, regionId: true },
        }),
      ]);

      const regionCodes = new Set(regions.map((r) => r.code));
      const districtCodes = new Set(districts.map((d) => d.code));
      const regionByName = new Map(regions.map((r) => [r.name, r]));
      const districtByKey = new Map(
        districts.map((d) => [`${d.regionId}::${d.name}`, d]),
      );

      let regionsCreated = 0;
      let districtsCreated = 0;

      const districtIdFor = async (regionName: string, districtName: string) => {
        let region = regionByName.get(regionName);
        if (!region) {
          region = await tx.region.create({
            data: {
              orgId: user.orgId,
              name: regionName,
              code: slugCode(regionName, regionCodes),
            },
            select: { id: true, name: true, code: true },
          });
          regionByName.set(regionName, region);
          regionsCreated += 1;
        }

        const key = `${region.id}::${districtName}`;
        let district = districtByKey.get(key);
        if (!district) {
          district = await tx.district.create({
            data: {
              orgId: user.orgId,
              regionId: region.id,
              name: districtName,
              code: slugCode(districtName, districtCodes),
            },
            select: { id: true, name: true, code: true, regionId: true },
          });
          districtByKey.set(key, district);
          districtsCreated += 1;
        }
        return district.id;
      };

      let created = 0;
      let updated = 0;

      for (const store of usable) {
        const districtId = await districtIdFor(store.regionName, store.districtName);
        const existing = await tx.location.findFirst({
          where: { orgId: user.orgId, code: store.code },
          select: { id: true },
        });

        const data = {
          districtId,
          name: store.name,
          city: store.city,
          state: store.state,
          brand: store.brand,
          timezone: store.timezone,
        };

        if (existing) {
          // A store already open is keeping its day by the timezone it has. If
          // this paste could not settle which side of a state line it is on,
          // leave that alone rather than moving its day by an hour on a guess.
          if (store.timezoneUncertain) {
            issues.push({
              row: store.sourceRow,
              message: `Store ${store.code}: kept its current timezone, since this paste could not tell which one it should be.`,
            });
            await tx.location.update({
              where: { id: existing.id },
              data: { ...data, timezone: undefined },
            });
          } else {
            await tx.location.update({ where: { id: existing.id }, data });
          }
          updated += 1;
        } else {
          await tx.location.create({
            data: { orgId: user.orgId, code: store.code, ...data },
          });
          created += 1;
        }
      }

      return { created, updated, regionsCreated, districtsCreated };
    },
    { timeout: 60_000 },
  );

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "location.imported",
    entityType: "Location",
    summary: `${user.name} imported ${usable.length} store${usable.length === 1 ? "" : "s"} (${counts.created} added, ${counts.updated} updated)`,
  });

  revalidatePath("/admin/locations");
  revalidatePath("/locations");

  const parts = [
    counts.created ? `${counts.created} added` : null,
    counts.updated ? `${counts.updated} updated` : null,
    counts.regionsCreated ? `${counts.regionsCreated} new region${counts.regionsCreated === 1 ? "" : "s"}` : null,
    counts.districtsCreated ? `${counts.districtsCreated} new district${counts.districtsCreated === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return {
    ok: true,
    message: parts.join(" · ") || "Nothing changed.",
    summary: counts,
    issues,
  };
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

/**
 * Gives someone a new password.
 *
 * People forget passwords, and an operations system with a hundred accounts and
 * no way to issue a new one is a system people get locked out of. Every session
 * that account had open is dropped at the same time: a password is reset
 * because the old one is no longer trusted, and leaving a signed-in phone alive
 * would defeat the point.
 */
export async function resetUserPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!canManageUsers(user)) return { error: "Administrator access is required." };

  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) {
    return { error: "The new password must be at least 10 characters." };
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, orgId: user.orgId },
    select: { id: true, name: true, email: true },
  });
  if (!target) return { error: "That person is not in your organization." };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
  ]);

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "user.password_reset",
    entityType: "User",
    entityId: target.id,
    summary: `${user.name} set a new password for ${target.name} (${target.email})`,
  });

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `New password set for ${target.name}. Give it to them directly — it is not emailed.`,
  };
}

/**
 * Changing your own password. The current one is required, so someone who walks
 * up to an unlocked phone cannot take the account over. Other sessions are
 * dropped; this one is kept, because signing someone out of the form they just
 * submitted is a poor way to confirm it worked.
 */
export async function changeOwnPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 10) {
    return { error: "The new password must be at least 10 characters." };
  }
  if (next !== confirm) return { error: "The two new passwords do not match." };

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return { error: "That is not your current password." };
  }
  if (await verifyPassword(next, row.passwordHash)) {
    return { error: "That is the password you already have." };
  }

  const claims = await readClaims();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(next) },
    }),
    prisma.session.deleteMany({
      where: { userId: user.id, ...(claims ? { id: { not: claims.sid } } : {}) },
    }),
  ]);

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "user.password_changed",
    entityType: "User",
    entityId: user.id,
    summary: `${user.name} changed their own password`,
  });

  return { ok: true, message: "Password changed. Any other device is now signed out." };
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
