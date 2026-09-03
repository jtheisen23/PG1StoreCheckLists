"use server";

import { revalidatePath } from "next/cache";
import { ActionStatus, ActionPriority } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  canAssignActions,
  canVerifyActions,
  getAccessibleLocationIds,
} from "@/lib/permissions";
import { storePhoto } from "@/lib/storage";

export interface ActionFormState {
  error?: string;
  ok?: boolean;
}

const updateSchema = z.object({
  actionId: z.string().min(1),
  status: z.nativeEnum(ActionStatus).optional(),
  priority: z.nativeEnum(ActionPriority).optional(),
  assigneeId: z.string().nullish(),
  dueAt: z.string().nullish(),
  resolutionNote: z.string().max(2000).nullish(),
});

/** Applies a status/assignment change and records it in the audit trail. */
export async function updateAction(
  _prev: ActionFormState,
  formData: FormData,
): Promise<ActionFormState> {
  const user = await requireUser();

  const parsed = updateSchema.safeParse({
    actionId: formData.get("actionId"),
    status: formData.get("status") || undefined,
    priority: formData.get("priority") || undefined,
    assigneeId: formData.get("assigneeId") ?? undefined,
    dueAt: formData.get("dueAt") || null,
    resolutionNote: formData.get("resolutionNote") || null,
  });

  if (!parsed.success) return { error: "That change could not be read." };
  const input = parsed.data;

  const locationIds = await getAccessibleLocationIds(user);
  const action = await prisma.correctiveAction.findFirst({
    where: {
      id: input.actionId,
      orgId: user.orgId,
      locationId: { in: locationIds },
    },
    select: {
      id: true,
      status: true,
      title: true,
      locationId: true,
      assigneeId: true,
      location: { select: { name: true, code: true } },
    },
  });

  if (!action) return { error: "This action is not available to you." };

  const wantsReassign =
    input.assigneeId !== undefined && input.assigneeId !== action.assigneeId;
  if (wantsReassign && !canAssignActions(user)) {
    return { error: "You do not have permission to reassign actions." };
  }
  if (input.status === ActionStatus.VERIFIED && !canVerifyActions(user)) {
    return { error: "Only a manager or above can verify an action." };
  }
  if (
    input.status === ActionStatus.RESOLVED &&
    !input.resolutionNote?.trim()
  ) {
    return { error: "Describe what was done before resolving." };
  }

  // A named assignee must actually work somewhere the action lives.
  if (input.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: input.assigneeId, orgId: user.orgId, active: true },
      select: { id: true },
    });
    if (!assignee) return { error: "That assignee is not available." };
  }

  const resolving =
    input.status === ActionStatus.RESOLVED || input.status === ActionStatus.VERIFIED;

  const photos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  await prisma.correctiveAction.update({
    where: { id: action.id },
    data: {
      status: input.status ?? undefined,
      priority: input.priority ?? undefined,
      assigneeId:
        input.assigneeId === undefined
          ? undefined
          : input.assigneeId === ""
            ? null
            : input.assigneeId,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      resolutionNote: input.resolutionNote ?? undefined,
      resolvedAt: resolving ? new Date() : undefined,
    },
  });

  for (const photo of photos.slice(0, 5)) {
    try {
      const stored = await storePhoto(photo, { orgId: user.orgId, kind: "actions" });
      await prisma.attachment.create({
        data: {
          actionId: action.id,
          url: stored.url,
          pathname: stored.pathname,
          mimeType: stored.mimeType,
          size: stored.size,
        },
      });
    } catch (error) {
      console.error("[actions] photo upload failed", error);
      return { error: "The update saved, but a photo could not be uploaded." };
    }
  }

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "action.updated",
    entityType: "CorrectiveAction",
    entityId: action.id,
    locationId: action.locationId,
    summary: `${user.name} ${describeChange(action.status, input.status)} "${action.title}" at ${action.location.name}`,
    metadata: { from: action.status, to: input.status ?? action.status },
  });

  revalidatePath("/actions");
  revalidatePath(`/actions/${action.id}`);
  return { ok: true };
}

function describeChange(from: ActionStatus, to?: ActionStatus) {
  if (!to || to === from) return "updated";
  switch (to) {
    case ActionStatus.RESOLVED:
      return "resolved";
    case ActionStatus.VERIFIED:
      return "verified";
    case ActionStatus.CANCELLED:
      return "cancelled";
    case ActionStatus.IN_PROGRESS:
      return "started work on";
    default:
      return "reopened";
  }
}

const createSchema = z.object({
  locationId: z.string().min(1),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  priority: z.nativeEnum(ActionPriority).default(ActionPriority.MEDIUM),
  assigneeId: z.string().optional(),
  dueAt: z.string().optional(),
});

/** Raises an ad-hoc action outside a checklist (a walk-through find, a callback). */
export async function createAction(
  _prev: ActionFormState,
  formData: FormData,
): Promise<ActionFormState> {
  const user = await requireUser();
  if (!canAssignActions(user)) {
    return { error: "You do not have permission to raise actions." };
  }

  const parsed = createSchema.safeParse({
    locationId: formData.get("locationId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    priority: formData.get("priority") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    dueAt: formData.get("dueAt") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const locationIds = await getAccessibleLocationIds(user);
  if (!locationIds.includes(parsed.data.locationId)) {
    return { error: "You do not have access to that location." };
  }

  const created = await prisma.correctiveAction.create({
    data: {
      orgId: user.orgId,
      locationId: parsed.data.locationId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority,
      assigneeId: parsed.data.assigneeId || null,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      raisedById: user.id,
    },
    select: { id: true },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "action.created",
    entityType: "CorrectiveAction",
    entityId: created.id,
    locationId: parsed.data.locationId,
    summary: `${user.name} raised "${parsed.data.title}"`,
  });

  revalidatePath("/actions");
  return { ok: true };
}
