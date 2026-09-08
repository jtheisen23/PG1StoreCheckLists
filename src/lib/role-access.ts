import { Role } from "@prisma/client";

/**
 * What a role may do, independent of which stores they are scoped to.
 *
 * Kept out of `permissions.ts` — and away from `server-only` and Prisma — for
 * one reason: these are the rules that decide who can destroy a checklist, and
 * a rule that cannot be unit tested is a rule nobody notices loosening. The
 * scope-based checks, which need the database, stay next door.
 *
 * Role is necessary but never sufficient for anything touching store data: a
 * user's `UserScope` rows still decide which stores they see.
 */

/** Just enough of a signed-in user to answer a role question. */
export interface RoleHolder {
  role: Role;
}

/** Roles that see org-wide rollups and can administer configuration. */
export const ORG_ROLES: Role[] = [Role.ADMIN];
export const LEADER_ROLES: Role[] = [Role.ADMIN, Role.REGIONAL, Role.DISTRICT];

/**
 * Creating, editing, publishing, archiving and deleting checklists — and the
 * gate on the whole Admin section. Administrators only: a checklist is the
 * definition every store in the fleet walks, so changing one reaches all of
 * them, and removing part of one reaches the record of what they did.
 */
export function canManageTemplates(user: RoleHolder) {
  return user.role === Role.ADMIN;
}

export function canManageUsers(user: RoleHolder) {
  return user.role === Role.ADMIN;
}

export function canManageLocations(user: RoleHolder) {
  return user.role === Role.ADMIN;
}

/** Leaders and GMs can raise/assign work to others; staff resolve their own. */
export function canAssignActions(user: RoleHolder) {
  return (
    user.role === Role.ADMIN ||
    user.role === Role.REGIONAL ||
    user.role === Role.DISTRICT ||
    user.role === Role.GM ||
    user.role === Role.MANAGER
  );
}

/** Verifying a resolved action is a leadership check, not self-service. */
export function canVerifyActions(user: RoleHolder) {
  return (
    user.role === Role.ADMIN ||
    user.role === Role.REGIONAL ||
    user.role === Role.DISTRICT ||
    user.role === Role.GM
  );
}

export function isLeader(user: RoleHolder) {
  return LEADER_ROLES.includes(user.role);
}
