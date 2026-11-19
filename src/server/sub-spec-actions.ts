"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canManageTemplates } from "@/lib/permissions";
import { MAX_SUB_OZ, SUB_SIZE_LABELS, parseSubSpecs } from "@/lib/sub-weight";
import type { FormState } from "./admin-service";

/*
 * The sub spec sheet. A spec is edited in place rather than versioned: every
 * weighing keeps the spec it was judged against, so changing a weight here
 * changes tomorrow's verdicts and never yesterday's. Subs that come off the
 * menu are archived, not deleted — past weighings point at them.
 */

async function requireAdmin() {
  const user = await requireUser();
  if (!canManageTemplates(user)) {
    throw new Error("Administrator access is required.");
  }
  return user;
}

function refresh() {
  revalidatePath("/admin/sub-specs");
}

export interface SpecImportState extends FormState {
  issues?: { row: number; message: string }[];
}

/**
 * Adds or updates every row of a pasted spec sheet, matched on sub number and
 * size. Re-importing the same sheet is safe, and is how a corrected sheet is
 * loaded: changed weights update, a sub that had been taken off the menu and
 * reappears is offered again.
 */
export async function importSubSpecs(
  _prev: SpecImportState,
  formData: FormData,
): Promise<SpecImportState> {
  const user = await requireAdmin();
  const { specs, issues } = parseSubSpecs(String(formData.get("sheet") ?? ""));
  if (!specs.length) {
    return { error: issues[0]?.message ?? "Nothing to import.", issues };
  }

  const existing = await prisma.subSpec.findMany({
    where: { orgId: user.orgId },
    select: { id: true, number: true, size: true, name: true, specOz: true, archivedAt: true },
  });
  const byKey = new Map(existing.map((spec) => [`${spec.number}:${spec.size}`, spec]));

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  await prisma.$transaction(async (tx) => {
    for (const spec of specs) {
      const current = byKey.get(`${spec.number}:${spec.size}`);
      if (!current) {
        await tx.subSpec.create({
          data: { orgId: user.orgId, number: spec.number, name: spec.name, size: spec.size, specOz: spec.specOz },
        });
        added += 1;
      } else if (
        current.name !== spec.name ||
        current.specOz !== spec.specOz ||
        current.archivedAt !== null
      ) {
        await tx.subSpec.update({
          where: { id: current.id },
          data: { name: spec.name, specOz: spec.specOz, archivedAt: null },
        });
        updated += 1;
      } else {
        unchanged += 1;
      }
    }
  });

  if (added || updated) {
    await logActivity({
      orgId: user.orgId,
      userId: user.id,
      action: "sub_spec.imported",
      entityType: "SubSpec",
      summary: `${user.name} loaded the sub spec sheet: ${added} added, ${updated} updated`,
      metadata: { added, updated, unchanged, skipped: issues.length },
    });
  }

  refresh();
  const parts = [
    added && `${added} added`,
    updated && `${updated} updated`,
    unchanged && `${unchanged} already up to date`,
  ].filter(Boolean);
  return {
    ok: true,
    message: `${parts.join(", ")}.${issues.length ? ` ${issues.length} row${issues.length === 1 ? "" : "s"} skipped — see below.` : ""}`,
    issues,
  };
}

/** Sets one spec's weight; blank means no target yet (logged, not judged). */
export async function updateSubSpec(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const id = String(formData.get("specId") ?? "");
  const raw = String(formData.get("specOz") ?? "").trim();
  const specOz = raw === "" ? null : Number(raw);
  if (specOz !== null && !(Number.isFinite(specOz) && specOz > 0 && specOz <= MAX_SUB_OZ)) {
    return { error: "Enter the spec weight in ounces, or leave it blank for no target." };
  }

  const spec = await prisma.subSpec.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, number: true, name: true, size: true, specOz: true },
  });
  if (!spec) return { error: "That sub could not be found." };
  if (spec.specOz === specOz) return { ok: true, message: "No change." };

  await prisma.subSpec.update({ where: { id: spec.id }, data: { specOz } });
  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "sub_spec.updated",
    entityType: "SubSpec",
    entityId: spec.id,
    summary: `${user.name} set #${spec.number} ${spec.name} (${SUB_SIZE_LABELS[spec.size]}) to ${
      specOz === null ? "no spec weight" : `${specOz} oz`
    }${spec.specOz === null ? "" : ` (was ${spec.specOz} oz)`}`,
  });

  refresh();
  return { ok: true, message: "Saved." };
}

export async function setSubSpecArchived(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("specId") ?? "");
  const archive = formData.get("archive") === "true";
  const spec = await prisma.subSpec.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, number: true, name: true, size: true, archivedAt: true },
  });
  if (!spec || Boolean(spec.archivedAt) === archive) return;

  await prisma.subSpec.update({
    where: { id: spec.id },
    data: { archivedAt: archive ? new Date() : null },
  });
  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: archive ? "sub_spec.archived" : "sub_spec.restored",
    entityType: "SubSpec",
    entityId: spec.id,
    summary: `${user.name} ${archive ? "took" : "put"} #${spec.number} ${spec.name} (${
      SUB_SIZE_LABELS[spec.size]
    }) ${archive ? "off" : "back on"} the scale`,
  });
  refresh();
}
