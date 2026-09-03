import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { getAccessibleLocations, getCurrentLocation } from "@/lib/current-location";
import { getDueChecklists, type DueChecklist } from "@/server/schedules";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, Meter, PageHeader, ScoreBadge } from "@/components/ui";
import { LinkButton } from "@/components/buttons";
import { DAYPART_LABELS } from "@/lib/labels";
import { ResumeDrafts } from "@/components/resume-drafts";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await requireUser();
  const locations = await getAccessibleLocations(user);
  const location = await getCurrentLocation(user, locations);

  if (!location) {
    return (
      <Card>
        <EmptyState
          title="No stores assigned yet"
          description="Ask an administrator to add you to a location, region or district."
        />
      </Card>
    );
  }

  const [checklists, openActions] = await Promise.all([
    getDueChecklists(user.orgId, location.id),
    prisma.correctiveAction.count({
      where: {
        locationId: location.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
  ]);

  const completed = checklists.filter((c) => c.completed).length;
  const overdue = checklists.filter((c) => c.overdue).length;
  const pct = checklists.length
    ? Math.round((completed / checklists.length) * 100)
    : 0;

  const now = new Date();
  const upcoming = checklists.filter((c) => !c.completed && !c.overdue);
  const late = checklists.filter((c) => c.overdue);
  const done = checklists.filter((c) => c.completed);

  return (
    <>
      <PageHeader
        title={`#${location.code} — ${location.name}`}
        description={new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: location.timezone,
        }).format(now)}
        action={
          openActions > 0 ? (
            <LinkButton href="/actions" variant="secondary">
              {openActions} open action{openActions === 1 ? "" : "s"}
            </LinkButton>
          ) : null
        }
      />

      <ResumeDrafts locationId={location.id} />

      <Card className="mb-5 p-4">
        <div className="mb-2.5 flex items-baseline justify-between">
          <p className="text-[13px] font-medium">Today&rsquo;s completion</p>
          <p className="tabular text-[13px] font-semibold">
            {completed} of {checklists.length}
          </p>
        </div>
        <Meter value={pct} tone={overdue ? "warn" : pct === 100 ? "pass" : "info"} />
        {overdue > 0 ? (
          <p className="mt-2.5 text-[12px]" style={{ color: "var(--fail)" }}>
            {overdue} checklist{overdue === 1 ? " is" : "s are"} past due.
          </p>
        ) : null}
      </Card>

      {checklists.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing scheduled today"
            description="No checklists are assigned to this store for today."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <ChecklistGroup title="Past due" items={late} tone="fail" />
          <ChecklistGroup title="Due today" items={upcoming} tone="info" />
          <ChecklistGroup title="Completed" items={done} tone="pass" />
        </div>
      )}
    </>
  );
}

function ChecklistGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: DueChecklist[];
  tone: "fail" | "info" | "pass";
}) {
  if (!items.length) return null;

  return (
    <section>
      <h2 className="text-faint mb-2 text-[12px] font-semibold tracking-wide uppercase">
        {title} · {items.length}
      </h2>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <ChecklistRow key={item.scheduleId} item={item} tone={tone} />
        ))}
      </div>
    </section>
  );
}

function ChecklistRow({
  item,
  tone,
}: {
  item: DueChecklist;
  tone: "fail" | "info" | "pass";
}) {
  const href = item.completed
    ? `/submissions/${item.submissionId}`
    : `/run/${item.scheduleId}`;

  return (
    <Link
      href={href}
      className="surface flex items-center gap-3 rounded-xl px-4 py-3.5 transition-colors hover:bg-[var(--surface-sunken)]"
    >
      <span
        className="h-9 w-1 shrink-0 rounded-full"
        style={{ background: `var(--${tone})` }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14px] font-medium">{item.templateName}</p>
          <Badge>{DAYPART_LABELS[item.daypart]}</Badge>
          {item.category ? <Badge tone="info">{item.category}</Badge> : null}
        </div>
        <p className="text-muted mt-0.5 text-[12px]">
          {item.completed
            ? `Completed by ${item.completedBy}`
            : `Due by ${item.dueTime} · ${item.itemCount} items`}
        </p>
      </div>
      {item.completed ? (
        <ScoreBadge score={item.score} />
      ) : (
        <span className="text-faint text-[13px]">{item.overdue ? "Late" : "Start"} ›</span>
      )}
    </Link>
  );
}
