import "server-only";

import type { Prisma } from "@prisma/client";

import type { SessionUser } from "@/lib/auth";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { ACTION_GROUPS, type ActivityFilters } from "@/lib/activity-filters";

/**
 * The log query for a viewer, with their filters applied.
 *
 * Each condition contributes its own clause under `AND`, so the scope filter
 * and the event-type filter can both use `OR` without overwriting each other.
 */
export async function activityWhere(
  user: SessionUser,
  filters: ActivityFilters,
): Promise<Prisma.ActivityLogWhereInput> {
  const accessible = await getAccessibleLocationIds(user);
  const clauses: Prisma.ActivityLogWhereInput[] = [];

  if (filters.locationId) {
    // Asking for a store outside the viewer's scope returns nothing rather
    // than quietly widening the query.
    clauses.push({
      locationId: accessible.includes(filters.locationId)
        ? filters.locationId
        : "__no_access__",
    });
  } else {
    // Org-scoped events (sign-ins, checklist changes) carry no location and
    // stay visible alongside the viewer's store events.
    clauses.push({
      OR: [{ locationId: { in: accessible } }, { locationId: null }],
    });
  }

  if (filters.group) {
    clauses.push({
      OR: ACTION_GROUPS[filters.group].prefixes.map((prefix) => ({
        action: { startsWith: prefix },
      })),
    });
  }

  if (filters.userId) clauses.push({ userId: filters.userId });

  const createdAt: Prisma.DateTimeFilter = {};
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null;
  if (from && !Number.isNaN(from.getTime())) createdAt.gte = from;
  if (to && !Number.isNaN(to.getTime())) createdAt.lte = to;
  if (Object.keys(createdAt).length) clauses.push({ createdAt });

  return { orgId: user.orgId, AND: clauses };
}
