"use server";

import { randomInt } from "crypto";
import { Role, ScopeLevel } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { canManageLocations, canManageUsers } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { parseRoster } from "@/lib/roster-import";
import { isValidTimezone } from "@/lib/time";
import { knownEmailDomains } from "./email-domains";
import { structureBuilder } from "./org-structure";

export interface RosterImportState {
  error?: string;
  ok?: boolean;
  message?: string;
  /** New accounts and the password each was given, to hand out. */
  created?: { email: string; name: string; role: Role; password: string }[];
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
 * The organization from its roster: one row per store, naming the store and
 * the people over it. In one go it creates or updates the stores (address,
 * state and a timezone worked out from them), the regions and districts they
 * roll up into, the people and their roles, and the stores each person holds.
 *
 * Re-running it is the point: the roster is the statement of who covers what,
 * so moving a store between directors is an edit to the sheet and another
 * import. Scopes are replaced from the sheet. Somebody no longer on it stops
 * holding stores; deactivating them, and closing stores that are no longer on
 * it, are separate choices the administrator makes on the form — never a side
 * effect. Nothing is deleted, an administrator is never demoted or touched, and
 * nobody can lock themselves out.
 */
export async function importRoster(
  _prev: RosterImportState,
  formData: FormData,
): Promise<RosterImportState> {
  const actor = await requireUser();
  if (!canManageUsers(actor) || !canManageLocations(actor)) {
    return { error: "Administrator access is required." };
  }

  const text = String(formData.get("sheet") ?? "");
  if (!text.trim()) return { error: "Choose your roster file, or paste the sheet." };
  const deactivateMissing = formData.get("missingPeople") === "deactivate";
  const closeMissing = formData.get("missingStores") === "close";

  const existingPeople = await prisma.user.findMany({
    where: { orgId: actor.orgId },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  const knownNames = Object.fromEntries(existingPeople.map((p) => [p.email.toLowerCase(), p.name]));

  const parsed = parseRoster(text, {
    fixSuspectDomains: formData.get("fixDomains") === "on",
    knownDomains: await knownEmailDomains(actor.orgId),
    knownNames,
  });
  const issues = [...parsed.issues];

  const stores = parsed.stores.filter((store) => {
    if (isValidTimezone(store.timezone)) return true;
    issues.push({ row: store.sourceRow, message: `Store ${store.code}: "${store.timezone}" is not a timezone this system knows; row skipped.` });
    return false;
  });
  if (!stores.length) {
    return { error: issues[0]?.message ?? "No stores found in that roster.", issues };
  }

  // People who belong to another organization are left alone, and passwords
  // are hashed before the transaction opens: hashing is slow on purpose.
  const emails = parsed.people.map((p) => p.email);
  const elsewhere = await prisma.user.findMany({
    where: { email: { in: emails }, orgId: { not: actor.orgId } },
    select: { email: true },
  });
  const skip = new Set(elsewhere.map((u) => u.email));
  for (const email of skip) issues.push({ row: 0, message: `${email} belongs to another organization and was left alone.` });
  const byEmail = new Map(existingPeople.map((p) => [p.email.toLowerCase(), p]));
  const created: NonNullable<RosterImportState["created"]> = [];
  const hashes = new Map<string, string>();
  for (const person of parsed.people) {
    if (skip.has(person.email) || byEmail.has(person.email)) continue;
    const password = temporaryPassword();
    hashes.set(person.email, await hashPassword(password));
    created.push({ email: person.email, name: person.name, role: person.role, password });
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const structure = await structureBuilder(tx, actor.orgId);
      // Remembered so the regions and districts this import empties can go,
      // without touching one somebody set up ahead of its first store.
      const occupied = await tx.district.findMany({
        where: { orgId: actor.orgId, locations: { some: {} } },
        select: { id: true, regionId: true },
      });

      // --- stores ------------------------------------------------------------
      const live = await tx.location.findMany({
        where: { orgId: actor.orgId },
        select: { id: true, code: true, active: true },
      });
      const liveByCode = new Map(live.map((l) => [l.code, l]));
      const storeIds = new Map<string, string>();
      let storesCreated = 0;
      let storesUpdated = 0;
      for (const store of stores) {
        const districtId = await structure.districtIdFor(store.regionName, store.districtName);
        const data = {
          districtId,
          name: store.name,
          city: store.city ?? undefined,
          state: store.state ?? undefined,
          address: store.address ?? undefined,
          postalCode: store.postalCode ?? undefined,
          brand: store.brand ?? undefined,
          // On the roster means open.
          active: true,
        };
        const existing = liveByCode.get(store.code);
        if (existing) {
          // A store already open keeps the timezone it has unless the roster
          // settles it: moving a store's day on a guess shifts its whole day.
          await tx.location.update({
            where: { id: existing.id },
            data: { ...data, timezone: store.timezoneUncertain ? undefined : store.timezone },
          });
          storeIds.set(store.code, existing.id);
          storesUpdated += 1;
        } else {
          const row = await tx.location.create({
            data: { orgId: actor.orgId, code: store.code, ...data, timezone: store.timezone },
            select: { id: true },
          });
          storeIds.set(store.code, row.id);
          storesCreated += 1;
        }
      }

      const rosterCodes = new Set(stores.map((s) => s.code));
      const missingStores = live.filter((l) => l.active && !rosterCodes.has(l.code));
      if (closeMissing && missingStores.length) {
        await tx.location.updateMany({
          where: { id: { in: missingStores.map((l) => l.id) } },
          data: { active: false },
        });
      }

      // --- people ------------------------------------------------------------
      let peopleUpdated = 0;
      for (const person of parsed.people) {
        if (skip.has(person.email)) continue;
        const existing = byEmail.get(person.email);
        let userId: string;
        if (existing) {
          // An administrator is never demoted by a spreadsheet.
          if (existing.role === Role.ADMIN && person.role !== Role.ADMIN) {
            issues.push({ row: 0, message: `${person.email} is an administrator; their role was left as Administrator.` });
          }
          await tx.user.update({
            where: { id: existing.id },
            data: {
              role: existing.role === Role.ADMIN ? Role.ADMIN : person.role,
              // A leader the sheet only gives as an address keeps their name.
              name: person.namedInSheet ? person.name : undefined,
              phone: person.phone ?? undefined,
              active: true,
            },
          });
          userId = existing.id;
          peopleUpdated += 1;
        } else {
          const row = await tx.user.create({
            data: {
              orgId: actor.orgId,
              name: person.name,
              email: person.email,
              role: person.role,
              phone: person.phone,
              passwordHash: hashes.get(person.email)!,
            },
            select: { id: true },
          });
          userId = row.id;
        }

        // Replace rather than merge: the roster is the statement of who
        // covers what.
        const scopes = person.wholeOrg
          ? [{ userId, level: ScopeLevel.ORG }]
          : person.storeCodes
              .map((code) => storeIds.get(code))
              .filter((id): id is string => Boolean(id))
              .map((locationId) => ({ userId, level: ScopeLevel.LOCATION, locationId }));
        await tx.userScope.deleteMany({ where: { userId } });
        if (scopes.length) await tx.userScope.createMany({ data: scopes, skipDuplicates: true });
      }

      // Somebody no longer on the roster stops holding stores. Administrators
      // and the person importing are outside the roster's say.
      const rosterEmails = new Set(emails);
      const missingPeople = existingPeople.filter(
        (p) => p.role !== Role.ADMIN && p.id !== actor.id && !rosterEmails.has(p.email.toLowerCase()),
      );
      const missingIds = missingPeople.map((p) => p.id);
      if (missingIds.length) {
        await tx.userScope.deleteMany({ where: { userId: { in: missingIds } } });
        if (deactivateMissing) {
          await tx.user.updateMany({ where: { id: { in: missingIds } }, data: { active: false } });
          await tx.session.deleteMany({ where: { userId: { in: missingIds } } });
        }
      }

      // A region or district the roster emptied is only a name now.
      await tx.district.deleteMany({
        where: { id: { in: occupied.map((d) => d.id) }, locations: { none: {} } },
      });
      await tx.region.deleteMany({
        where: { id: { in: [...new Set(occupied.map((d) => d.regionId))] }, districts: { none: {} } },
      });

      return {
        storesCreated,
        storesUpdated,
        storesClosed: closeMissing ? missingStores.length : 0,
        storesLeftOpen: closeMissing ? 0 : missingStores.length,
        peopleUpdated,
        peopleDeactivated: deactivateMissing ? missingPeople.filter((p) => p.active).length : 0,
        peopleUnassigned: missingPeople.length,
        ...structure.created(),
      };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  const peopleLine = [
    created.length ? `${created.length} added` : null,
    result.peopleUpdated ? `${result.peopleUpdated} updated` : null,
    result.peopleDeactivated ? `${result.peopleDeactivated} deactivated` : null,
  ].filter(Boolean).join(", ");
  const storesLine = [
    result.storesCreated ? `${result.storesCreated} added` : null,
    result.storesUpdated ? `${result.storesUpdated} updated` : null,
    result.storesClosed ? `${result.storesClosed} closed` : null,
  ].filter(Boolean).join(", ");

  await logActivity({
    orgId: actor.orgId,
    userId: actor.id,
    action: "location.imported",
    entityType: "Location",
    summary: `${actor.name} imported the roster's ${stores.length} stores — ${storesLine || "no change"}`,
  });
  await logActivity({
    orgId: actor.orgId,
    userId: actor.id,
    action: "user.roster_imported",
    entityType: "User",
    summary: `${actor.name} imported the roster: ${parsed.people.length} people — ${peopleLine || "no change"}${result.peopleUnassigned ? `; ${result.peopleUnassigned} not on it no longer hold stores` : ""}`,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/locations");
  revalidatePath("/locations");
  revalidatePath("/dashboard");

  if (result.storesLeftOpen) {
    issues.push({ row: 0, message: `${result.storesLeftOpen} open store(s) are not on this roster and were left open.` });
  }

  return {
    ok: true,
    message: `Stores: ${storesLine || "no change"}. People: ${peopleLine || "no change"}.${
      result.peopleUnassigned ? ` ${result.peopleUnassigned} not on the roster no longer hold stores.` : ""
    }`,
    created,
    issues,
  };
}
