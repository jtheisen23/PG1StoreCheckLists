import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { SUB_SIZES, SUB_SIZE_LABELS, acceptableRange } from "@/lib/sub-weight";
import { setSubSpecArchived } from "@/server/sub-spec-actions";
import { menuOrder } from "@/server/sub-specs";
import { SpecImportForm, SpecWeightForm } from "./spec-forms";

export const metadata: Metadata = { title: "Sub specs" };
export const dynamic = "force-dynamic";

export default async function SubSpecsPage() {
  const user = await requireUser();
  const specs = menuOrder(
    await prisma.subSpec.findMany({
      where: { orgId: user.orgId },
      select: { id: true, number: true, name: true, size: true, specOz: true, archivedAt: true },
    }),
  );

  const onMenu = specs.filter((spec) => !spec.archivedAt);
  const offMenu = specs.filter((spec) => spec.archivedAt);
  const subs = [...new Map(onMenu.map((spec) => [spec.number, spec.name])).entries()];
  const noTarget = onMenu.filter((spec) => spec.specOz === null).length;

  return (
    <>
      <PageHeader
        title="Sub specs"
        description="The weight each sub is made to. The spec weight is the floor — a sub may never be under it — and up to 0.5 oz over is acceptable. Under and over are counted separately. A sub with no spec weight can be weighed but is not judged."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-4">
          {onMenu.length === 0 ? (
            <Card>
              <EmptyState
                title="No sub specs yet"
                description="Paste your spec sheet to load every sub and size at once. Then install the Sub Weight Log under Checklists and schedule it at Lunch and at Dinner."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader
                title="On the scale"
                subtitle={`${subs.length} subs · ${onMenu.length} sizes${
                  noTarget ? ` · ${noTarget} without a spec weight yet` : ""
                }`}
              />
              <ul>
                {subs.map(([number, name]) => (
                  <li key={number} className="border-b px-4 py-3 last:border-b-0">
                    <p className="text-[14px] font-medium">
                      #{number} {name}
                    </p>
                    <div className="mt-2 flex flex-col gap-2">
                      {SUB_SIZES.map((size) => {
                        const spec = onMenu.find((s) => s.number === number && s.size === size);
                        if (!spec) return null;
                        return (
                          <div key={size} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span className="w-16 text-[13px]">{SUB_SIZE_LABELS[size]}</span>
                            <SpecWeightForm specId={spec.id} specOz={spec.specOz} />
                            {spec.specOz === null ? (
                              <Badge tone="warn">Not judged</Badge>
                            ) : (
                              <span className="text-faint text-[12px]">
                                Acceptable {acceptableRange(spec.specOz)}
                              </span>
                            )}
                            <form action={setSubSpecArchived} className="ml-auto">
                              <input type="hidden" name="specId" value={spec.id} />
                              <input type="hidden" name="archive" value="true" />
                              <button type="submit" className="text-muted text-[12px] font-medium">
                                Take off the scale
                              </button>
                            </form>
                          </div>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {offMenu.length ? (
            <Card className="overflow-hidden">
              <CardHeader
                title="Off the scale"
                subtitle="Not offered when weighing. Past weighings of these keep their spec."
              />
              <ul>
                {offMenu.map((spec) => (
                  <li
                    key={spec.id}
                    className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <span className="text-muted text-[13px]">
                      #{spec.number} {spec.name} · {SUB_SIZE_LABELS[spec.size]}
                    </span>
                    <form action={setSubSpecArchived}>
                      <input type="hidden" name="specId" value={spec.id} />
                      <input type="hidden" name="archive" value="false" />
                      <button
                        type="submit"
                        className="text-[12px] font-medium"
                        style={{ color: "var(--info)" }}
                      >
                        Put back
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit p-4">
          <p className="mb-3 text-[14px] font-semibold">Load the spec sheet</p>
          <SpecImportForm />
        </Card>
      </div>
    </>
  );
}
