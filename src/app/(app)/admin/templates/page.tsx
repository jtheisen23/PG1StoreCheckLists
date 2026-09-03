import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { NewTemplateForm } from "./new-template-form";

export const metadata: Metadata = { title: "Checklists" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireUser();

  const templates = await prisma.checklistTemplate.findMany({
    where: { orgId: user.orgId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      status: true,
      passingScore: true,
      updatedAt: true,
      sections: { select: { _count: { select: { items: true } } } },
      _count: { select: { schedules: true, submissions: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Checklists"
        description="Build the walks your stores run. Publish a checklist to make it schedulable."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          {templates.length === 0 ? (
            <Card>
              <EmptyState
                title="No checklists yet"
                description="Create your first checklist to get started."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul>
                {templates.map((template) => {
                  const items = template.sections.reduce(
                    (sum, s) => sum + s._count.items,
                    0,
                  );
                  return (
                    <li key={template.id} className="border-b last:border-b-0">
                      <Link
                        href={`/admin/templates/${template.id}`}
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-sunken)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[14px] font-medium">
                              {template.name}
                            </p>
                            {template.category ? (
                              <Badge tone="info">{template.category}</Badge>
                            ) : null}
                          </div>
                          <p className="text-muted mt-0.5 text-[12px]">
                            {items} items · {template._count.schedules} schedule
                            {template._count.schedules === 1 ? "" : "s"} ·{" "}
                            {template._count.submissions.toLocaleString()} submissions
                            {template.passingScore !== null
                              ? ` · passing ${template.passingScore}%`
                              : ""}
                          </p>
                        </div>
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
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <NewTemplateForm />
      </div>
    </>
  );
}
