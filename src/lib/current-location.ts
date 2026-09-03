import "server-only";

import { cookies } from "next/headers";
import { prisma } from "./db";
import type { SessionUser } from "./auth";
import { getAccessibleLocationIds } from "./permissions";

export const LOCATION_COOKIE = "pg1_location";

export interface LocationOption {
  id: string;
  name: string;
  code: string;
  timezone: string;
  districtName: string;
  regionName: string;
}

export async function getAccessibleLocations(
  user: SessionUser,
): Promise<LocationOption[]> {
  const ids = await getAccessibleLocationIds(user);
  if (!ids.length) return [];

  const rows = await prisma.location.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      code: true,
      timezone: true,
      district: { select: { name: true, region: { select: { name: true } } } },
    },
    orderBy: [{ code: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    timezone: r.timezone,
    districtName: r.district.name,
    regionName: r.district.region.name,
  }));
}

/**
 * The store the user is currently working in. Remembered in a cookie so a
 * district manager can move between stores, and always re-validated against
 * their scopes.
 */
export async function getCurrentLocation(
  user: SessionUser,
  options?: LocationOption[],
): Promise<LocationOption | null> {
  const list = options ?? (await getAccessibleLocations(user));
  if (!list.length) return null;

  const store = await cookies();
  const preferred = store.get(LOCATION_COOKIE)?.value;
  return list.find((l) => l.id === preferred) ?? list[0];
}
