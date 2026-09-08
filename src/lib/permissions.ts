import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "./db";
import type { SessionUser } from "./auth";

// The role rules live in `role-access.ts` so they can be unit tested without a
// server context. Re-exported here so every existing import keeps working and
// there is still one place to look.
export {
  ORG_ROLES,
  LEADER_ROLES,
  canManageTemplates,
  canManageUsers,
  canManageLocations,
  canAssignActions,
  canVerifyActions,
  canSeeDashboard,
  isLeader,
} from "./role-access";

/**
 * Every location the user may read or act on, derived from their scopes.
 * ADMINs and anyone holding an ORG scope get the whole organization.
 */
export async function getAccessibleLocationIds(
  user: SessionUser,
): Promise<string[]> {
  const scopes = await prisma.userScope.findMany({
    where: { userId: user.id },
    select: {
      level: true,
      regionId: true,
      districtId: true,
      locationId: true,
    },
  });

  const orgWide =
    user.role === Role.ADMIN || scopes.some((s) => s.level === "ORG");

  if (orgWide) {
    const all = await prisma.location.findMany({
      where: { orgId: user.orgId, active: true },
      select: { id: true },
    });
    return all.map((l) => l.id);
  }

  const regionIds = scopes.flatMap((s) => (s.regionId ? [s.regionId] : []));
  const districtIds = scopes.flatMap((s) => (s.districtId ? [s.districtId] : []));
  const locationIds = scopes.flatMap((s) => (s.locationId ? [s.locationId] : []));

  if (!regionIds.length && !districtIds.length && !locationIds.length) return [];

  const rows = await prisma.location.findMany({
    where: {
      orgId: user.orgId,
      active: true,
      OR: [
        locationIds.length ? { id: { in: locationIds } } : undefined,
        districtIds.length ? { districtId: { in: districtIds } } : undefined,
        regionIds.length ? { district: { regionId: { in: regionIds } } } : undefined,
      ].filter(Boolean) as object[],
    },
    select: { id: true },
  });

  return rows.map((r) => r.id);
}

/** Throws unless the user's scopes cover the location. */
export async function assertLocationAccess(
  user: SessionUser,
  locationId: string,
) {
  const ids = await getAccessibleLocationIds(user);
  if (!ids.includes(locationId)) {
    throw new Error("You do not have access to this location.");
  }
}

export { ROLE_LABELS } from "./role-labels";
