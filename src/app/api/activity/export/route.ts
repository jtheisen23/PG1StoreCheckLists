import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLeader } from "@/lib/permissions";
import { readFilters } from "@/lib/activity-filters";
import { activityWhere } from "@/server/activity-query";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enough for a quarter of a busy fleet; beyond that, narrow the date range. */
const MAX_ROWS = 50_000;
const BATCH = 2_000;

const COLUMNS = [
  "timestamp",
  "action",
  "summary",
  "person",
  "person_email",
  "store_code",
  "store_name",
  "entity_type",
  "entity_id",
  "ip",
];

/**
 * Streams the activity log as CSV, honouring the same filters and the same
 * location scope as the on-screen log. Rows are fetched in batches so a large
 * export never holds the whole result set in memory.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isLeader(user)) {
    return NextResponse.json(
      { error: "The activity log is available to district leadership and administrators." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const filters = readFilters(Object.fromEntries(url.searchParams));
  const where = await activityWhere(user, filters);

  // Store names are not on the log row; resolve them once up front.
  const locations = await prisma.location.findMany({
    where: { orgId: user.orgId },
    select: { id: true, code: true, name: true },
  });
  const byLocation = new Map(locations.map((l) => [l.id, l]));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(COLUMNS.join(",") + "\n"));

      let cursor: string | undefined;
      let written = 0;

      try {
        while (written < MAX_ROWS) {
          const rows = await prisma.activityLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: Math.min(BATCH, MAX_ROWS - written),
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              createdAt: true,
              action: true,
              summary: true,
              entityType: true,
              entityId: true,
              locationId: true,
              ip: true,
              user: { select: { name: true, email: true } },
            },
          });

          if (!rows.length) break;

          for (const row of rows) {
            const location = row.locationId ? byLocation.get(row.locationId) : undefined;
            controller.enqueue(
              encoder.encode(
                [
                  row.createdAt.toISOString(),
                  row.action,
                  row.summary,
                  row.user?.name ?? "",
                  row.user?.email ?? "",
                  location?.code ?? "",
                  location?.name ?? "",
                  row.entityType ?? "",
                  row.entityId ?? "",
                  row.ip ?? "",
                ]
                  .map(csvCell)
                  .join(",") + "\n",
              ),
            );
          }

          written += rows.length;
          cursor = rows[rows.length - 1].id;
          if (rows.length < BATCH) break;
        }
      } catch (error) {
        console.error("[activity/export] failed", error);
      } finally {
        controller.close();
      }
    },
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "activity.exported",
    summary: `${user.name} exported the activity log`,
    metadata: { ...filters },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Quotes a CSV cell, and defuses spreadsheet formula injection. */
function csvCell(value: string): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
