import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageTemplates } from "@/lib/permissions";
import { toCsv } from "@/lib/checklist-import";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exports a master checklist in the same shape the importer reads, so it
 * round-trips. Archived items are included and marked, which makes this a
 * complete snapshot of the definition rather than only its current state.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!canManageTemplates(user)) {
    return NextResponse.json(
      { error: "Administrator access is required." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const template = await prisma.checklistTemplate.findFirst({
    where: { id, orgId: user.orgId },
    select: {
      name: true,
      sections: {
        orderBy: { position: "asc" },
        select: {
          title: true,
          items: {
            orderBy: { position: "asc" },
            select: {
              label: true,
              helpText: true,
              type: true,
              required: true,
              critical: true,
              weight: true,
              requirePhoto: true,
              photoOnFail: true,
              noteOnFail: true,
              actionOnFail: true,
              minValue: true,
              maxValue: true,
              unit: true,
              options: true,
              failingOptions: true,
              archivedAt: true,
            },
          },
        },
      },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Checklist not found." }, { status: 404 });
  }

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "template.exported",
    entityType: "ChecklistTemplate",
    entityId: id,
    summary: `${user.name} exported "${template.name}"`,
  });

  const slug =
    template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "checklist";
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(toCsv(template.sections), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
