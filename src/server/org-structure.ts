import "server-only";

import type { Prisma } from "@prisma/client";

import { slugCode } from "@/lib/store-import";

/**
 * Finds or creates the region and district a store rolls up into, by name,
 * inside an import's transaction. Shared by the store import and the roster
 * import so both build the same structure from the same names.
 */
export async function structureBuilder(tx: Prisma.TransactionClient, orgId: string) {
  const [regions, districts] = await Promise.all([
    tx.region.findMany({ where: { orgId }, select: { id: true, name: true, code: true } }),
    tx.district.findMany({ where: { orgId }, select: { id: true, name: true, code: true, regionId: true } }),
  ]);

  const regionCodes = new Set(regions.map((r) => r.code));
  const districtCodes = new Set(districts.map((d) => d.code));
  const regionByName = new Map(regions.map((r) => [r.name, r]));
  const districtByKey = new Map(districts.map((d) => [`${d.regionId}::${d.name}`, d]));
  let regionsCreated = 0;
  let districtsCreated = 0;

  async function districtIdFor(regionName: string, districtName: string): Promise<string> {
    let region = regionByName.get(regionName);
    if (!region) {
      region = await tx.region.create({
        data: { orgId, name: regionName, code: slugCode(regionName, regionCodes) },
        select: { id: true, name: true, code: true },
      });
      regionByName.set(regionName, region);
      regionsCreated += 1;
    }

    const key = `${region.id}::${districtName}`;
    let district = districtByKey.get(key);
    if (!district) {
      district = await tx.district.create({
        data: { orgId, regionId: region.id, name: districtName, code: slugCode(districtName, districtCodes) },
        select: { id: true, name: true, code: true, regionId: true },
      });
      districtByKey.set(key, district);
      districtsCreated += 1;
    }
    return district.id;
  }

  return {
    districtIdFor,
    created: () => ({ regionsCreated, districtsCreated }),
  };
}
