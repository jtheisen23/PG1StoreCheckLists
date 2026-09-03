import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "./db";
import type { SessionUser } from "./auth";

/** Roles that see org-wide rollups and can administer configuration. */
export const ORG_ROLES: Role[] = [Role.ADMIN];
export const LEADER_ROLES: Role[] = [Role.ADMIN, Role.REGIONAL, Role.DISTRICT];

export function canManageTemplates(user: SessionUser) {
  return user.role === Role.ADMIN;
}

export function canManageUsers(user: SessionUser) {
  return user.role === Role.ADMIN;
}

export function canManageLocations(user: SessionUser) {
  return user.role === Role.ADMIN;
}

/** Leaders and GMs can raise/assign work to others; staff resolve their own. */
export function canAssignActions(user: SessionUser) {
  return (
    user.role === Role.ADMIN ||
    user.role === Role.REGIONAL ||
    user.role === Role.DISTRICT ||
    user.role === Role.GM ||
    user.role === Role.MANAGER
  );
}

/** Verifying a resolved action is a leadership check, not self-service. */
export function canVerifyActions(user: SessionUser) {
  return (
    user.role === Role.ADMIN ||
    user.role === Role.REGIONAL ||
    user.role === Role.DISTRICT ||
    user.role === Role.GM
  );
}

export function isLeader(user: SessionUser) {
  return LEADER_ROLES.includes(user.role);
}

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
