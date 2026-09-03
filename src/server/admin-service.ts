"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ItemType, Role, ScopeLevel, TemplateStatus, Daypart } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canManageTemplates, canManageUsers } from "@/lib/permissions";

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

export async function deleteItem(formData: FormData) {
  const user = await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");

  const item = await prisma.templateItem.findFirst({
    where: { id: itemId, section: { template: { orgId: user.orgId } } },
    select: { id: true, label: true, section: { select: { templateId: true } } },
  });
  if (!item) return;

  await prisma.templateItem.delete({ where: { id: item.id } });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.item_removed",
    entityType: "ChecklistTemplate",
    entityId: item.section.templateId,
    summary: `${user.name} removed item "${item.label}"`,
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
