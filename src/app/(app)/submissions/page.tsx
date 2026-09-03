import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader, ScoreBadge } from "@/components/ui";
import { DAYPART_LABELS } from "@/lib/labels";
import { relativeTime } from "@/lib/time";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; result?: string }>;
}) {
  const { page: pageParam, result } = await searchParams;
  const user = await requireUser();
  const locationIds = await getAccessibleLocationIds(user);
  const page = Math.max(1, Number(pageParam) || 1);

  const where = {
    orgId: user.orgId,
    locationId: { in: locationIds },
    status: "SUBMITTED" as const,
    ...(result === "failed" ? { passed: false } : {}),
  };

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        score: true,
        passed: true,
        daypart: true,
        itemsFailed: true,
        submittedAt: true,
        template: { select: { name: true } },
        location: { select: { name: true, code: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.submission.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Submission history"
        description={`${total.toLocaleString()} completed checklist${total === 1 ? "" : "s"} across your stores.`}
        action={
          <div className="flex gap-1.5">
            <FilterLink href="/submissions" label="All" active={result !== "failed"} />
            <FilterLink
              href="/submissions?result=failed"
              label="Failed only"
              active={result === "failed"}
            />
          </div>
        }
      />

      {submissions.length === 0 ? (
        <Card>
          <EmptyState
            title="No submissions yet"
            description="Completed checklists will appear here."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {submissions.map((submission) => (
              <li key={submission.id} className="border-b last:border-b-0">
                <Link
                  href={`/submissions/${submission.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14px] font-medium">
                        {submission.template.name}
                      </p>
                      <Badge>{DAYPART_LABELS[submission.daypart]}</Badge>
                      {submission.itemsFailed > 0 ? (
                        <Badge tone="fail">{submission.itemsFailed} failed</Badge>
                      ) : null}
                    </div>
                    <p className="text-muted mt-0.5 text-[12px]">
                      #{submission.location.code} {submission.location.name} ·{" "}
                      {submission.user.name} ·{" "}
                      {submission.submittedAt
                        ? relativeTime(submission.submittedAt)
                        : "—"}
                    </p>
                  </div>
                  <ScoreBadge score={submission.score} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/submissions?page=${page - 1}${result ? `&result=${result}` : ""}`}
                className="font-medium"
                style={{ color: "var(--info)" }}
              >
                ‹ Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={`/submissions?page=${page + 1}${result ? `&result=${result}` : ""}`}
                className="font-medium"
                style={{ color: "var(--info)" }}
              >
                Next ›
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border px-3 py-1.5 text-[13px] font-medium"
      style={
        active
          ? { background: "var(--info-bg)", color: "var(--info)", borderColor: "transparent" }
          : { background: "var(--surface-raised)" }
      }
    >
      {label}
    </Link>
  );
}
