/**
 * Pure helpers for the activity log filters. Kept out of the server module so
 * the client-side filter bar can share the same event groups and query shape.
 */

/** Event families the log filter offers, in the order they are shown. */
export const ACTION_GROUPS = {
  submission: { label: "Submissions", prefixes: ["submission."] },
  action: { label: "Corrective actions", prefixes: ["action."] },
  template: { label: "Checklists", prefixes: ["template."] },
  schedule: { label: "Schedules", prefixes: ["schedule."] },
  stores: { label: "Stores & structure", prefixes: ["location.", "district.", "region."] },
  people: { label: "People & sign-ins", prefixes: ["user.", "org."] },
} as const;

export type ActionGroup = keyof typeof ACTION_GROUPS;

export function isActionGroup(value?: string): value is ActionGroup {
  return !!value && value in ACTION_GROUPS;
}

export interface ActivityFilters {
  group?: ActionGroup;
  locationId?: string;
  userId?: string;
  from?: string;
  to?: string;
}

/** Reads filters off a search-params object, ignoring anything unrecognised. */
export function readFilters(
  params: Record<string, string | undefined>,
): ActivityFilters {
  const isDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return {
    group: isActionGroup(params.group) ? params.group : undefined,
    locationId: params.location || undefined,
    userId: params.person || undefined,
    from: isDate(params.from) ? params.from : undefined,
    to: isDate(params.to) ? params.to : undefined,
  };
}

/** Rebuilds the query string, so links keep the filters the viewer set. */
export function filterQuery(
  filters: ActivityFilters,
  overrides: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    group: filters.group,
    location: filters.locationId,
    person: filters.userId,
    from: filters.from,
    to: filters.to,
    ...overrides,
  };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
