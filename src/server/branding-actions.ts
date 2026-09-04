"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { storePhoto, deletePhoto } from "@/lib/storage";
import { readPngSize, sniffImageFormat } from "@/lib/image-signature";
import { BRANDING_TAG } from "./branding";

export interface BrandingState {
  error?: string;
  ok?: boolean;
  message?: string;
}

const MAX_BYTES = 2 * 1024 * 1024;

/** Below this a logo is not artwork, it is an accident. */
const MIN_EDGE = 32;

/**
 * Dimensions the browser measured, used only for formats we do not read a
 * header for. They decide layout, never access, so the bounds just keep a
 * nonsense value from breaking the header.
 */
function reportedDimensions(formData: FormData) {
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  const sane = (n: number) => Number.isInteger(n) && n > 0 && n <= 20000;
  return sane(width) && sane(height) ? { width, height } : undefined;
}

function refresh() {
  revalidateTag(BRANDING_TAG);
  revalidatePath("/", "layout");
}

/** Replaces the organization's logo. Administrators only. */
export async function uploadLogo(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  const user = await requireUser();
  if (!canManageTemplates(user)) {
    return { error: "Administrator access is required." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file first." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "The logo must be 2 MB or smaller." };
  }
  // The format is taken from the bytes, not from `file.type` or the extension.
  // Both are the operating system's guess and are routinely wrong — the PG1
  // wordmark arrived named ".jpg" while actually being AVIF — and the declared
  // type is supplied by whoever is uploading, while this file is later served
  // from our own origin to signed-out visitors. SVG is deliberately absent from
  // the accepted list: it is a document that can carry script.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffImageFormat(bytes);
  if (!format) {
    return {
      error: "That file is not an image we can use. Try a PNG, JPG, WebP or AVIF.",
    };
  }

  // Measured from the file where we can read a header, from the browser
  // otherwise. Checked before anything is stored, so a decode that went wrong
  // upstream cannot quietly replace a good logo with a smudge.
  const dimensions = readPngSize(bytes) ?? reportedDimensions(formData);
  if (dimensions && Math.min(dimensions.width, dimensions.height) < MIN_EDGE) {
    return {
      error: `That image is only ${dimensions.width}×${dimensions.height}. A logo needs to be at least ${MIN_EDGE} pixels on each side.`,
    };
  }

  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, logoUrl: true },
  });
  if (!org) return { error: "No organization found." };

  let stored;
  try {
    stored = await storePhoto(new File([bytes], file.name, { type: format }), {
      orgId: org.id,
      kind: "branding",
      dimensions,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not store the logo.",
    };
  }

  const previous = org.logoUrl;
  await prisma.organization.update({
    where: { id: org.id },
    data: { logoUrl: stored.pathname },
  });

  // Only now that the new one is live is the old one safe to drop.
  if (previous) await deletePhoto(previous).catch(() => undefined);

  await logActivity({
    orgId: org.id,
    userId: user.id,
    action: "org.branding_updated",
    entityType: "Organization",
    entityId: org.id,
    summary: `${user.name} updated the ${org.name} logo`,
  });

  refresh();
  return { ok: true, message: "Logo updated." };
}

/** Returns to the default mark. */
export async function removeLogo(): Promise<void> {
  const user = await requireUser();
  if (!canManageTemplates(user)) return;

  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, logoUrl: true },
  });
  if (!org?.logoUrl) return;

  await prisma.organization.update({
    where: { id: org.id },
    data: { logoUrl: null },
  });
  await deletePhoto(org.logoUrl).catch(() => undefined);

  await logActivity({
    orgId: org.id,
    userId: user.id,
    action: "org.branding_updated",
    entityType: "Organization",
    entityId: org.id,
    summary: `${user.name} removed the ${org.name} logo`,
  });

  refresh();
}

/** Renames the organization; the name appears beside the logo everywhere. */
export async function renameOrganization(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  const user = await requireUser();
  if (!canManageTemplates(user)) {
    return { error: "Administrator access is required." };
  }

  const name = String(formData.get("orgName") ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    return { error: "The name must be between 2 and 120 characters." };
  }

  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!org) return { error: "No organization found." };

  await prisma.organization.update({ where: { id: org.id }, data: { name } });

  await logActivity({
    orgId: org.id,
    userId: user.id,
    action: "org.branding_updated",
    entityType: "Organization",
    entityId: org.id,
    summary: `${user.name} renamed the organization to "${name}"`,
  });

  refresh();
  return { ok: true, message: "Name updated." };
}
