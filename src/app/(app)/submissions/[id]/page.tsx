import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { Badge, Card, CardHeader, ScoreBadge, Stat } from "@/components/ui";
import { DAYPART_LABELS } from "@/lib/labels";
import { formatAnswer } from "@/lib/scoring";

export const metadata: Metadata = { title: "Submission" };
export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const locationIds = await getAccessibleLocationIds(user);

  const submission = await prisma.submission.findFirst({
    where: { id, orgId: user.orgId, locationId: { in: locationIds } },
    select: {
      id: true,
      score: true,
      passed: true,
      daypart: true,
      notes: true,
      itemsTotal: true,
      itemsPassed: true,
      itemsFailed: true,
      startedAt: true,
      submittedAt: true,
      businessDate: true,
      template: { select: { name: true, category: true, passingScore: true } },
      location: { select: { name: true, code: true, timezone: true } },
      user: { select: { name: true } },
      actions: {
        select: { id: true, title: true, status: true, priority: true },
      },
      responses: {
        select: {
          id: true,
          value: true,
          numericValue: true,
          boolValue: true,
          selected: true,
          passed: true,
          naFlag: true,
          note: true,
          photos: { select: { id: true, url: true } },
          item: {
            select: {
              id: true,
              label: true,
              type: true,
              unit: true,
              critical: true,
              position: true,
              section: { select: { title: true, position: true } },
            },
          },
        },
      },
    },
  });

  if (!submission) notFound();

  const minutes = submission.submittedAt
    ? Math.max(
        1,
        Math.round(
          (submission.submittedAt.getTime() - submission.startedAt.getTime()) / 60000,
        ),
      )
    : null;

  // Group responses back into their template sections for readability.
  const sections = new Map<string, typeof submission.responses>();
  const ordered = [...submission.responses].sort((a, b) => {
    const sectionDelta = a.item.section.position - b.item.section.position;
    return sectionDelta !== 0 ? sectionDelta : a.item.position - b.item.position;
  });
  for (const response of ordered) {
    const key = response.item.section.title;
    const list = sections.get(key);
    if (list) list.push(response);
    else sections.set(key, [response]);
  }

  return (
    <>
      <Link href="/submissions" className="text-muted text-[13px]">
        ‹ History
      </Link>

      <div className="mt-1.5 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {submission.template.name}
          </h1>
          <p className="text-muted mt-1 text-[13px]">
            #{submission.location.code} {submission.location.name} ·{" "}
            {submission.user.name} ·{" "}
            {submission.submittedAt
              ? new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: submission.location.timezone,
                }).format(submission.submittedAt)
              : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{DAYPART_LABELS[submission.daypart]}</Badge>
          <Badge tone={submission.passed ? "pass" : "fail"}>
            {submission.passed ? "Passed" : "Failed"}
          </Badge>
          <ScoreBadge score={submission.score} />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Score"
          value={submission.score === null ? "—" : `${submission.score}%`}
          hint={
            submission.template.passingScore
              ? `Passing is ${submission.template.passingScore}%`
              : undefined
          }
          tone={submission.passed ? "pass" : "fail"}
        />
        <Stat label="Items passed" value={submission.itemsPassed} />
        <Stat
          label="Items failed"
          value={submission.itemsFailed}
          tone={submission.itemsFailed > 0 ? "fail" : "neutral"}
        />
        <Stat label="Time to complete" value={minutes ? `${minutes} min` : "—"} />
      </div>

      {submission.actions.length > 0 ? (
        <Card className="mb-5">
          <CardHeader
            title="Corrective actions raised"
            subtitle="Created automatically from failed items."
          />
          <ul className="divide-y">
            {submission.actions.map((action) => (
              <li key={action.id}>
                <Link
                  href={`/actions/${action.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--surface-sunken)]"
                >
                  <span className="text-[13px]">{action.title}</span>
                  <span className="flex gap-2">
                    <Badge tone={action.priority === "CRITICAL" ? "fail" : "warn"}>
                      {action.priority}
                    </Badge>
                    <Badge
                      tone={
                        action.status === "OPEN" || action.status === "IN_PROGRESS"
                          ? "warn"
                          : "pass"
                      }
                    >
                      {action.status}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {submission.notes ? (
        <Card className="mb-5 p-4">
          <p className="text-faint text-[12px] font-medium tracking-wide uppercase">
            Notes
          </p>
          <p className="mt-1.5 text-[13px] whitespace-pre-wrap">{submission.notes}</p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4">
        {[...sections.entries()].map(([title, responses]) => (
          <Card key={title}>
            <CardHeader title={title} />
            <ul className="divide-y">
              {responses.map((response) => (
                <li key={response.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">
                        {response.item.label}
                        {response.item.critical ? (
                          <span
                            className="ml-1.5 text-[11px] font-semibold"
                            style={{ color: "var(--fail)" }}
                          >
                            CRITICAL
                          </span>
                        ) : null}
                      </p>
                      {response.note ? (
                        <p className="text-muted mt-1 text-[12px] whitespace-pre-wrap">
                          {response.note}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-[13px] font-medium">
                        {formatAnswer(
                          { id: response.item.id, type: response.item.type, unit: response.item.unit },
                          {
                            itemId: response.item.id,
                            boolValue: response.boolValue,
                            numericValue: response.numericValue,
                            value: response.value,
                            selected: response.selected,
                            naFlag: response.naFlag,
                          },
                        )}
                      </p>
                      {response.passed !== null ? (
                        <Badge tone={response.passed ? "pass" : "fail"} className="mt-1">
                          {response.passed ? "Pass" : "Fail"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {response.photos.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {response.photos.map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {/* Uploads come from Blob storage or /uploads; plain img keeps
                              both drivers working without remote-pattern config. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={`Photo for ${response.item.label}`}
                            className="h-20 w-20 rounded-lg border object-cover"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
