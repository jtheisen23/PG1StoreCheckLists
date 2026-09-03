import "server-only";

import { prisma } from "@/lib/db";
import type { DirectoryOptions } from "@/components/new-user-form";

/** Regions, districts and stores an administrator can assign someone to. */
export async function getDirectoryOptions(
  orgId: string,
): Promise<DirectoryOptions> {
  const [regions, districts, locations] = await Promise.all([
    prisma.region.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.district.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.location.findMany({
      where: { orgId, active: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  return { regions, districts, locations };
}
