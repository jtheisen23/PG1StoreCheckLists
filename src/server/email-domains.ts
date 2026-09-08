import "server-only";

import { prisma } from "@/lib/db";
import type { KnownDomain } from "@/lib/hierarchy-import";

/**
 * The email domains people in this organization actually sign in with.
 *
 * Gives an import something to measure a new address against, so a two-row
 * paste is checkable even though two rows say nothing about what is normal.
 * Deactivated accounts still count: somebody who has left is still evidence of
 * how addresses here are spelled.
 */
export async function knownEmailDomains(orgId: string): Promise<KnownDomain[]> {
  const users = await prisma.user.findMany({
    where: { orgId },
    select: { email: true },
  });

  const counts = new Map<string, number>();
  for (const { email } of users) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts.entries()].map(([domain, users]) => ({ domain, users }));
}
