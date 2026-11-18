import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { STANDARD_CLOSE_AREAS } from "@/lib/close-rating";
import {
  moveCloseArea,
  setCloseAreaArchived,
  setUpStandardCloseAreas,
} from "@/server/close-area-actions";
import { CloseAreaForm } from "./area-form";

export const metadata: Metadata = { title: "Close rating" };
export const dynamic = "force-dynamic";

export default async function CloseRatingAdminPage() {
  const user = await requireUser();

  const [areas, templates, lastWeek] = await Promise.all([
    prisma.closeArea.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        archivedAt: true,
        templateId: true,
        template: { select: { name: true, status: true } },
      },
    }),
    prisma.checklistTemplate.findMany({
      where: { orgId: user.orgId, status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
    prisma.closeRating.groupBy({
      by: ["acceptable"],
      where: {
        orgId: user.orgId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
    }),
  ]);

  const active = areas.filter((area) => !area.archivedAt);
  const archived = areas.filter((area) => area.archivedAt);
  const up = lastWeek.find((row) => row.acceptable)?._count._all ?? 0;
  const down = lastWeek.find((row) => !row.acceptable)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Close rating"
        description="Each morning the opener rates how last night's close left each area — thumbs up or down, with a note on a thumbs down. It sits at the top of every store's Today screen, blocks nothing, and is kept out of checklist completion and every score."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-4">
          {active.length === 0 ? (
            <Card>
              <EmptyState
                title="No areas are rated yet"
                description={`Start with the standard three — ${STANDARD_CLOSE_AREAS.join(", ")} — then link each to the closing checklist behind it.`}
              />
              <form action={setUpStandardCloseAreas} className="flex justify-center px-5 pb-6">
                <Button type="submit" variant="primary">
                  Set up {STANDARD_CLOSE_AREAS.join(", ")}
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader
                title="Rated each morning"
                subtitle={`In this order on every store's Today screen.${
                  up + down ? ` Last 7 days: ${up} thumbs up, ${down} thumbs down.` : ""
                }`}
              />
              <ul>
                {active.map((area, index) => (
                  <li key={area.id} className="border-b px-4 py-3.5 last:border-b-0">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium">{area.name}</p>
                        {area.template ? (
                          <p className="text-muted mt-0.5 text-[12px]">
                            Closed on {area.template.name}
                            {area.template.status !== "PUBLISHED" ? (
                              <Badge tone="warn" className="ml-2">
                                Checklist {area.template.status.toLowerCase()}
                              </Badge>
                            ) : null}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[12px]" style={{ color: "var(--warn)" }}>
                            No closing checklist linked — the opener won&rsquo;t see who closed.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <MoveButton areaId={area.id} direction="up" disabled={index === 0} />
                        <MoveButton
                          areaId={area.id}
                          direction="down"
                          disabled={index === active.length - 1}
                        />
                        <form action={setCloseAreaArchived}>
                          <input type="hidden" name="areaId" value={area.id} />
                          <input type="hidden" name="archive" value="true" />
                          <button type="submit" className="text-muted ml-2 text-[12px] font-medium">
                            Stop rating
                          </button>
                        </form>
                      </div>
                    </div>
                    <details className="mt-2">
                      <summary
                        className="cursor-pointer text-[12px] font-medium"
                        style={{ color: "var(--info)" }}
                      >
                        Edit
                      </summary>
                      <div className="mt-3 max-w-sm">
                        <CloseAreaForm
                          templates={templates}
                          area={{ id: area.id, name: area.name, templateId: area.templateId }}
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {archived.length ? (
            <Card className="overflow-hidden">
              <CardHeader
                title="No longer rated"
                subtitle="Past ratings of these areas stay in each store's history."
              />
              <ul>
                {archived.map((area) => (
                  <li
                    key={area.id}
                    className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                  >
                    <p className="text-muted text-[13px]">{area.name}</p>
                    <form action={setCloseAreaArchived}>
                      <input type="hidden" name="areaId" value={area.id} />
                      <input type="hidden" name="archive" value="false" />
                      <button
                        type="submit"
                        className="text-[12px] font-medium"
                        style={{ color: "var(--info)" }}
                      >
                        Rate again
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit p-4">
          <p className="mb-3 text-[14px] font-semibold">Add an area</p>
          <CloseAreaForm templates={templates} />
        </Card>
      </div>
    </>
  );
}

function MoveButton({
  areaId,
  direction,
  disabled,
}: {
  areaId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={moveCloseArea}>
      <input type="hidden" name="areaId" value={areaId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Move ${direction}`}
        className="text-muted flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)] disabled:opacity-30"
      >
        {direction === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}
