import "server-only";

import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export interface ActivityInput {
  orgId: string;
  userId?: string | null;
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  locationId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Appends to the audit trail. Logging must never break the request that
 * triggered it, so failures are swallowed after being reported to the server
 * console.
 */
export async function logActivity(input: ActivityInput) {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null;
      userAgent = h.get("user-agent");
    } catch {
      // Called outside a request context (seed script, cron).
    }

    await prisma.activityLog.create({
      data: {
        orgId: input.orgId,
        userId: input.userId ?? null,
        action: input.action,
        summary: input.summary,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        locationId: input.locationId ?? null,
        metadata: input.metadata,
        ip,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error("[activity] failed to record", input.action, error);
  }
}
