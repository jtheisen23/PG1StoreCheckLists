"use server";

import { randomInt } from "crypto";
import { Role, ScopeLevel } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { parseHierarchy } from "@/lib/hierarchy-import";
import { knownEmailDomains } from "./email-domains";

export interface HierarchyImportState {
  error?: string;
  ok?: boolean;
  message?: string;
  /** New accounts and the password each was given, to hand out. */
  created?: { email: string; name: string; role: Role; password: string }[];
  updated?: number;
  unknownStores?: string[];
  issues?: { row: number; message: string }[];
}

/**
 * Readable enough to read down a phone, without the characters people misread.
 * These are handed over in person and changed on first use.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function temporaryPassword(): string {
  let out = "";
  for (let i = 0; i < 14; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10)}`;
}

/**
 * Builds the org chart from a pasted sheet: one row per store naming its
 * operator and who it rolls up to.
 *
 * Re-running it is the point. Scopes are replaced from the sheet, so moving a
 * store between directors is an edit to the spreadsheet and another paste.
 * Nobody is deleted and nobody is deactivated — a person dropped from the sheet
 * keeps their account and simply stops holding stores, because removing access
 * is a decision to make deliberately in People.
 */
export async function importHierarchy(
  _prev: HierarchyImportState,
  formData: FormData,
): Promise<HierarchyImportState> {
  const actor = await requireUser();
  if (!canManageUsers(actor)) {
    return { error: "Administrator access is required." };
  }

  const text = String(formData.get("sheet") ?? "");
  if (!text.trim()) return { error: "Paste your hierarchy sheet first." };

  const parsed = parseHierarchy(text, {
    fixSuspectDomains: formData.get("fixDomains") === "on",
    knownDomains: await knownEmailDomains(actor.orgId),
  });
  if (!parsed.people.length) {
    return {
      error: parsed.issues[0]?.message ?? "No people found in that paste.",
      issues: parsed.issues,
    };
  }

  const locations = await prisma.location.findMany({
    where: { orgId: actor.orgId, code: { in: parsed.storeCodes } },
    select: { id: true, code: true },
  });
  const byCode = new Map(locations.map((l) => [l.code, l.id]));
  const unknownStores = parsed.storeCodes.filter((code) => !byCode.has(code));

  const created: NonNullable<HierarchyImportState["created"]> = [];
  let updated = 0;
  const issues = [...parsed.issues];

  for (const person of parsed.people) {
    const existing = await prisma.user.findUnique({
      where: { email: person.email },
      select: { id: true, orgId: true, name: true, role: true },
    });

    if (existing && existing.orgId !== actor.orgId) {
      issues.push({
        row: 0,
        message: `${person.email} belongs to another organization and was left alone.`,
      });
      continue;
    }

    let userId: string;
    if (existing) {
      // An administrator is never demoted by a spreadsheet. Somebody has to be
      // able to run the place, and that is not a decision a paste should make.
      const role = existing.role === Role.ADMIN ? Role.ADMIN : person.role;
      if (existing.role === Role.ADMIN && person.role !== Role.ADMIN) {
        issues.push({
          row: 0,
          message: `${person.email} is an administrator; their role was left as Administrator.`,
        });
      }
      await prisma.user.update({
        where: { id: existing.id },
        data: { role, name: person.name || existing.name },
      });
      userId = existing.id;
      updated += 1;
    } else {
      const password = temporaryPassword();
      const user = await prisma.user.create({
        data: {
          orgId: actor.orgId,
          name: person.name,
          email: person.email,
          role: person.role,
          passwordHash: await hashPassword(password),
        },
        select: { id: true },
      });
      userId = user.id;
      created.push({
        email: person.email,
        name: person.name,
        role: person.role,
        password,
      });
    }

    // Replace rather than merge: the sheet is the statement of who covers what.
    const scopeRows = person.wholeOrg
      ? [{ userId, level: ScopeLevel.ORG }]
      : person.storeCodes
          .map((code) => byCode.get(code))
          .filter((id): id is string => Boolean(id))
          .map((locationId) => ({
            userId,
            level: ScopeLevel.LOCATION,
            locationId,
          }));

    await prisma.$transaction([
      prisma.userScope.deleteMany({ where: { userId } }),
      ...(scopeRows.length
        ? [prisma.userScope.createMany({ data: scopeRows, skipDuplicates: true })]
        : []),
    ]);

    if (!person.wholeOrg && scopeRows.length === 0) {
      issues.push({
        row: 0,
        message: `${person.email} covers no store the app knows about, so they will see nothing yet.`,
      });
    }
  }

  await logActivity({
    orgId: actor.orgId,
    userId: actor.id,
    action: "user.hierarchy_imported",
    entityType: "User",
    summary: `${actor.name} imported the hierarchy — ${created.length} added, ${updated} updated, across ${byCode.size} store(s)`,
  });

  revalidatePath("/admin/users");

  const parts = [
    created.length ? `${created.length} added` : null,
    updated ? `${updated} updated` : null,
    unknownStores.length ? `${unknownStores.length} store(s) not found` : null,
  ].filter(Boolean);

  return {
    ok: true,
    message: parts.join(" · ") || "Nothing changed.",
    created,
    updated,
    unknownStores,
    issues,
  };
}
