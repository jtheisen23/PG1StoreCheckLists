import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { ITEM_TYPE_LABELS } from "@/lib/labels";
import { removeItem, restoreItem } from "@/server/admin-service";
import { AddItemForm } from "./add-item-form";
import { AddSectionForm } from "./add-section-form";
import { BulkAddPanel } from "./bulk-add-panel";
import { PublishControls } from "./publish-controls";

export const metadata: Metadata = { title: "Edit checklist" };
export const dynamic = "force-dynamic";

export default async function TemplateBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const template = await prisma.checklistTemplate.findFirst({
    where: { id, orgId: user.orgId },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      status: true,
      passingScore: true,
      _count: { select: { schedules: true, submissions: true } },
      schedules: {
        where: { active: true },
        select: { locations: { select: { locationId: true } } },
      },
      sections: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          helpText: true,
          items: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              label: true,
              helpText: true,
              type: true,
              archivedAt: true,
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
            },
          },
        },
      },
    },
  });

  if (!template) notFound();

  const live = template.sections.flatMap((section) =>
    section.items.filter((item) => item.archivedAt === null),
  );
  const archivedCount = template.sections.reduce(
    (sum, section) => sum + section.items.filter((i) => i.archivedAt !== null).length,
    0,
  );
  const itemCount = live.length;

  // One master, many stores: this is how far an edit reaches.
  const storeIds = new Set(
    template.schedules.flatMap((schedule) =>
      schedule.locations.map((l) => l.locationId),
    ),
  );

  return (
    <>
      <Link href="/admin/templates" className="text-muted text-[13px]">
        ‹ Checklists
      </Link>

      <div className="mt-1.5 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{template.name}</h1>
            {template.category ? <Badge tone="info">{template.category}</Badge> : null}
            <Badge
              tone={
                template.status === "PUBLISHED"
                  ? "pass"
                  : template.status === "DRAFT"
                    ? "warn"
                    : "neutral"
              }
            >
              {template.status}
            </Badge>
          </div>
          <p className="text-muted mt-1 text-[13px]">
            {itemCount} items across {template.sections.length} section
            {template.sections.length === 1 ? "" : "s"} ·{" "}
            {template._count.submissions.toLocaleString()} submissions
            {archivedCount > 0 ? ` · ${archivedCount} archived` : ""}
          </p>
          {template.description ? (
            <p className="text-muted mt-2 max-w-2xl text-[13px]">
              {template.description}
            </p>
          ) : null}
        </div>

        <PublishControls templateId={template.id} status={template.status} />
      </div>

      <div
        className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2.5 text-[12px]"
        style={{ background: "var(--info-bg)", color: "var(--info)" }}
      >
        <span className="font-semibold">Master checklist.</span>
        {storeIds.size > 0 ? (
          <span>
            Used by {template._count.schedules} schedule
            {template._count.schedules === 1 ? "" : "s"} across {storeIds.size} store
            {storeIds.size === 1 ? "" : "s"}. Anything you change here applies to
            every one of them from their next walk.
          </span>
        ) : (
          <span>
            Not scheduled anywhere yet — publish it, then assign it to stores under{" "}
            <Link href="/admin/schedules" className="underline">
              Schedules
            </Link>
            .
          </span>
        )}
        {template._count.submissions > 0 ? (
          <span>
            Past submissions keep the answers they recorded.
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {template.sections.map((section) => (
          <Card key={section.id}>
            <CardHeader
              title={section.title}
              subtitle={section.helpText ?? `${section.items.length} items`}
            />

            {section.items.filter((i) => i.archivedAt === null).length === 0 ? (
              <EmptyState title="No items in this section yet" />
            ) : (
              <ul className="divide-y">
                {section.items.filter((i) => i.archivedAt === null).map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{item.label}</p>
                      {item.helpText ? (
                        <p className="text-muted mt-0.5 text-[12px]">{item.helpText}</p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge>{ITEM_TYPE_LABELS[item.type]}</Badge>
                        {item.critical ? <Badge tone="fail">Critical</Badge> : null}
                        {!item.required ? <Badge>Optional</Badge> : null}
                        {item.weight > 1 ? <Badge>Weight ×{item.weight}</Badge> : null}
                        {item.minValue !== null || item.maxValue !== null ? (
                          <Badge tone="info">
                            {item.minValue ?? "−∞"}–{item.maxValue ?? "∞"}
                            {item.unit ? ` ${item.unit}` : ""}
                          </Badge>
                        ) : null}
                        {item.requirePhoto ? <Badge tone="warn">Photo required</Badge> : null}
                        {item.photoOnFail ? <Badge>Photo on fail</Badge> : null}
                        {item.noteOnFail ? <Badge>Note on fail</Badge> : null}
                        {item.actionOnFail ? <Badge tone="warn">Raises action</Badge> : null}
                        {item.options.length ? (
                          <Badge>{item.options.join(" / ")}</Badge>
                        ) : null}
                      </div>
                    </div>

                    <form action={removeItem}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <button
                        type="submit"
                        className="text-[12px] font-medium"
                        style={{ color: "var(--fail)" }}
                        title="Removes it from future walks; past answers are kept"
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {section.items.some((i) => i.archivedAt !== null) ? (
              <details className="border-t px-5 py-3">
                <summary className="text-muted cursor-pointer text-[12px]">
                  {section.items.filter((i) => i.archivedAt !== null).length} archived
                  item(s) — kept for history, not shown on new walks
                </summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {section.items
                    .filter((i) => i.archivedAt !== null)
                    .map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3">
                        <span className="text-muted text-[13px] line-through">
                          {item.label}
                        </span>
                        <form action={restoreItem}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <button
                            type="submit"
                            className="text-[12px] font-medium"
                            style={{ color: "var(--info)" }}
                          >
                            Restore
                          </button>
                        </form>
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}

            <div className="border-t px-5 py-4">
              <AddItemForm sectionId={section.id} />
            </div>
          </Card>
        ))}

        <AddSectionForm templateId={template.id} />

        <BulkAddPanel templateId={template.id} storeCount={storeIds.size} />
      </div>
    </>
  );
}
