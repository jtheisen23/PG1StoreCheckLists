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
 * user's `UserScope` rows still decide which stores they see. A President is
 * given the whole organization by holding an ORG scope, not by being a
 * President.
 */

/** Just enough of a signed-in user to answer a role question. */
export interface RoleHolder {
  role: Role;
}

/** Roles that see org-wide rollups and can administer configuration. */
export const ORG_ROLES: Role[] = [Role.ADMIN];

/**
 * Multi-store leadership: the Activity log, the Locations rollup and the
 * activity export. Company officers belong here — the whole reason the role
 * exists is to look across the fleet — while an Operator does not, because an
 * Operator runs stores rather than oversees them.
 */
export const LEADER_ROLES: Role[] = [
  Role.ADMIN,
  Role.PRESIDENT,
  Role.VICE_PRESIDENT,
  Role.DIRECTOR_OF_OPS,
  Role.REGIONAL,
  Role.DISTRICT,
];

/** Runs stores rather than oversees them, but answers for their numbers. */
const STORE_LEADERSHIP: Role[] = [Role.OPERATOR, Role.GM];

/**
 * Creating, editing, publishing, archiving and deleting checklists — and the
 * gate on the whole Admin section. Administrators only, deliberately: a
 * checklist is the definition every store in the fleet walks, so changing one
 * reaches all of them and removing part of one reaches the record of what they
 * did. Seniority is not the same as system administration, so a President sees
 * everything and configures nothing.
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

/** The scored rollup: leadership, plus whoever answers for a single store. */
export function canSeeDashboard(user: RoleHolder) {
  return isLeader(user) || STORE_LEADERSHIP.includes(user.role);
}

/** Leaders and store leadership can raise/assign work; staff resolve their own. */
export function canAssignActions(user: RoleHolder) {
  return (
    isLeader(user) ||
    STORE_LEADERSHIP.includes(user.role) ||
    user.role === Role.MANAGER
  );
}

/**
 * Verifying a resolved action is a leadership check, not self-service. It stops
 * above the shift manager who most often resolved the thing in the first place.
 */
export function canVerifyActions(user: RoleHolder) {
  return isLeader(user) || STORE_LEADERSHIP.includes(user.role);
}

export function isLeader(user: RoleHolder) {
  return LEADER_ROLES.includes(user.role);
}
