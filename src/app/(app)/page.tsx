import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { getAccessibleLocations, getCurrentLocation } from "@/lib/current-location";
import { getDueChecklists } from "@/server/schedules";
import { prisma } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { TodayList, TodaySummary } from "@/components/today-list";
import { canManageLocations } from "@/lib/permissions";
import { LinkButton } from "@/components/buttons";
import { ResumeDrafts } from "@/components/resume-drafts";
import { StartWalk } from "@/components/start-walk";
import { CloseRatingCard } from "@/components/close-rating-card";
import { getCloseRatingCard } from "@/server/close-ratings";
import { localDayOfWeek, wallClockIn } from "@/lib/time";
import { runsOn } from "@/lib/weekdays";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await requireUser();
  const locations = await getAccessibleLocations(user);
  const location = await getCurrentLocation(user, locations);

  if (!location) {
    // An administrator on a brand-new organization is not stuck — they are the
    // person who sets this up, so send them to the first step rather than
    // telling them to ask someone else.
    if (canManageLocations(user)) {
      const stores = await prisma.location.count({ where: { orgId: user.orgId } });
      return (
        <>
          <PageHeader
            title="Let's get your stores set up"
            description="Three steps and your teams can start walking checklists."
          />
          <Card className="p-5">
            <ol className="flex flex-col gap-4">
              <SetupStep
                number={1}
                title="Add your stores"
                description="Create a region, a district under it, then your stores. Each store carries its own timezone, which decides when its checklists are due."
                href="/admin/locations"
                cta={stores > 0 ? "Add more stores" : "Add your first store"}
                done={stores > 0}
              />
              <SetupStep
                number={2}
                title="Build a checklist"
                description="Sections and items — temperatures with pass/fail ranges, photo requirements, critical items that fail the whole walk. Publish it when it's ready."
                href="/admin/templates"
                cta="Build a checklist"
              />
              <SetupStep
                number={3}
                title="Schedule it"
                description="Assign a published checklist to stores, at a daypart, on the days it should run."
                href="/admin/schedules"
                cta="Create a schedule"
              />
            </ol>
          </Card>
          <p className="text-muted mt-4 text-[13px]">
            Then add your teams under{" "}
            <Link href="/admin/users" className="font-medium" style={{ color: "var(--info)" }}>
              People
            </Link>
            {" "}— a person&rsquo;s scope decides which stores they see.
          </p>
        </>
      );
    }

    return (
      <Card>
        <EmptyState
          title="No stores assigned yet"
          description="Ask an administrator to add you to a location, region or district."
        />
      </Card>
    );
  }

  const [checklists, openActions, startable, closeRating] = await Promise.all([
    getDueChecklists(user.orgId, location.id),
    prisma.correctiveAction.count({
      where: {
        locationId: location.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    // Anything published can be walked on a visit, whether or not this store is
    // scheduled for it.
    prisma.checklistTemplate.findMany({
      where: { orgId: user.orgId, status: "PUBLISHED" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        category: true,
        sections: {
          select: { daysOfWeek: true, _count: { select: { items: { where: { archivedAt: null } } } } },
        },
      },
    }),
    // Its own card, its own table: the rating is never part of the
    // completion count below.
    getCloseRatingCard(user.orgId, location, user.id),
  ]);

  // The morning screen leads into the open: the opening checklist if one is
  // still owed, otherwise whatever is next.
  const owed = checklists.filter((c) => !c.completed);
  const next = owed.find((c) => c.daypart === "OPENING") ?? owed[0];
  const startHref = next ? `/run/${next.scheduleId}` : null;
  const hour = wallClockIn(location.timezone).hour;
  const greeting = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
  const ratedAlready = closeRating?.areas.every((area) => area.rating) ?? false;
  const morning = closeRating ? (
    <CloseRatingCard data={closeRating} greeting={greeting} startHref={startHref} />
  ) : null;

  const now = new Date();

  return (
    <>
      {/* The opener's first screen, until last night's close is rated. */}
      {ratedAlready ? null : morning}

      <PageHeader
        title={`#${location.code} ${location.name}`}
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

      {ratedAlready ? morning : null}

      <ResumeDrafts locationId={location.id} />

      {checklists.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing scheduled today"
            description="No checklists are assigned to this store for today."
          />
        </Card>
      ) : (
        <div className="mb-5">
          <TodaySummary checklists={checklists} />
          <TodayList checklists={checklists} now={now} />
        </div>
      )}

      <StartWalk
        storeName={location.name}
        checklists={startable.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          // As many as a walk started now would ask: today's sections only.
          items: t.sections.reduce(
            (sum, s) => sum + (runsOn(s.daysOfWeek, localDayOfWeek(location.timezone)) ? s._count.items : 0),
            0,
          ),
        }))}
      />
    </>
  );
}

function SetupStep({
  number,
  title,
  description,
  href,
  cta,
  done,
}: {
  number: number;
  title: string;
  description: string;
  href: string;
  cta: string;
  done?: boolean;
}) {
  return (
    <li className="flex gap-3.5">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
        style={
          done
            ? { background: "var(--pass-bg)", color: "var(--pass)" }
            : { background: "var(--info-bg)", color: "var(--info)" }
        }
        aria-hidden="true"
      >
        {done ? "✓" : number}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-muted mt-0.5 text-[13px]">{description}</p>
        <Link
          href={href}
          className="mt-1.5 inline-block text-[13px] font-medium"
          style={{ color: "var(--info)" }}
        >
          {cta} ›
        </Link>
      </div>
    </li>
  );
}
