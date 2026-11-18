import "server-only";

import { SubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { businessDateKey } from "@/lib/time";
import {
  closeDateFor,
  closeRatingProblem,
  closeWindow,
  describeVerdicts,
  isRateableCloseDate,
  normalizeNote,
  shiftDateKey,
  type CloseCloser,
  type CloseRatingCardData,
  type CloseVerdict,
} from "@/lib/close-rating";

/*
 * The morning close rating. Kept entirely apart from checklists: it is not a
 * Schedule, not a Submission and not in any score, so completion and scoring
 * cannot pick it up by accident. Anything that reports it reads it from here.
 */

export class CloseRatingError extends Error {}

/** A `@db.Date` column takes UTC midnight. */
function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function keyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function activeAreas(orgId: string) {
  return prisma.closeArea.findMany({
    where: { orgId, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, templateId: true },
  });
}

/**
 * Who closed each linked checklist that night: the last submitted walk of it
 * at the store inside the night's window. Keyed by template.
 */
async function findClosers(
  locationId: string,
  timezone: string,
  closeDateKey: string,
  templateIds: string[],
): Promise<Map<string, CloseCloser>> {
  const closers = new Map<string, CloseCloser>();
  if (!templateIds.length) return closers;

  const { from, to } = closeWindow(timezone, closeDateKey);
  const walks = await prisma.submission.findMany({
    where: {
      locationId,
      templateId: { in: templateIds },
      status: SubmissionStatus.SUBMITTED,
      submittedAt: { gte: from, lt: to },
    },
    orderBy: { submittedAt: "desc" },
    select: { id: true, templateId: true, submittedAt: true, user: { select: { name: true } } },
  });

  for (const walk of walks) {
    if (closers.has(walk.templateId) || !walk.submittedAt) continue;
    closers.set(walk.templateId, {
      submissionId: walk.id,
      name: walk.user.name,
      finishedAt: walk.submittedAt.toISOString(),
    });
  }
  return closers;
}

/**
 * What the opener sees first thing: each area, who closed it last night and
 * when, and any rating already given. Null when the organization rates no
 * areas, so the card simply is not there.
 */
export async function getCloseRatingCard(
  orgId: string,
  location: { id: string; name: string; timezone: string },
  now: Date = new Date(),
): Promise<CloseRatingCardData | null> {
  const areas = await activeAreas(orgId);
  if (!areas.length) return null;

  const todayKey = businessDateKey(location.timezone, now);
  const closeDate = closeDateFor(todayKey);
  const templateIds = [...new Set(areas.flatMap((area) => (area.templateId ? [area.templateId] : [])))];

  const [closers, ratings] = await Promise.all([
    findClosers(location.id, location.timezone, closeDate, templateIds),
    prisma.closeRating.findMany({
      where: {
        locationId: location.id,
        closeDate: dateFromKey(closeDate),
        areaId: { in: areas.map((area) => area.id) },
      },
      select: {
        areaId: true,
        acceptable: true,
        note: true,
        createdAt: true,
        ratedBy: { select: { name: true } },
      },
    }),
  ]);
  const ratingByArea = new Map(ratings.map((rating) => [rating.areaId, rating]));

  return {
    locationId: location.id,
    locationName: location.name,
    timezone: location.timezone,
    todayKey,
    closeDate,
    areas: areas.map((area) => {
      const rating = ratingByArea.get(area.id);
      return {
        id: area.id,
        name: area.name,
        tracked: Boolean(area.templateId),
        closer: area.templateId ? (closers.get(area.templateId) ?? null) : null,
        rating: rating
          ? {
              acceptable: rating.acceptable,
              note: rating.note,
              ratedBy: rating.ratedBy.name,
              ratedAt: rating.createdAt.toISOString(),
            }
          : null,
      };
    }),
  };
}

export interface CloseRatingPayload {
  locationId: string;
  closeDate: string;
  ratings: CloseVerdict[];
}

/**
 * Saves an opener's ratings. Replays and a second opener rating the same night
 * are both expected — devices queue ratings offline — so the first verdict on
 * an area stands and later ones are reported back as already rated.
 */
export async function submitCloseRating(
  user: SessionUser,
  payload: CloseRatingPayload,
  allowedLocationIds: string[],
): Promise<{ saved: number; alreadyRated: number }> {
  if (!allowedLocationIds.includes(payload.locationId)) {
    throw new CloseRatingError("You do not have access to this location.");
  }

  const location = await prisma.location.findFirst({
    where: { id: payload.locationId, orgId: user.orgId },
    select: { id: true, code: true, name: true, timezone: true },
  });
  if (!location) throw new CloseRatingError("That store could not be found.");

  // The server's clock decides which nights are open for rating.
  const todayKey = businessDateKey(location.timezone);
  if (!isRateableCloseDate(payload.closeDate, todayKey)) {
    throw new CloseRatingError(
      payload.closeDate >= todayKey
        ? "Tonight's close can't be rated until it has happened."
        : "That night is too long ago to rate now.",
    );
  }

  const ids = [...new Set(payload.ratings.map((rating) => rating.areaId))];
  const known = await prisma.closeArea.findMany({
    where: { orgId: user.orgId, id: { in: ids } },
    select: { id: true, name: true, templateId: true, archivedAt: true },
  });
  if (known.length !== ids.length) {
    throw new CloseRatingError("That area is no longer being rated. Reload and try again.");
  }

  // An area retired after the card was drawn is not worth failing the rest for.
  const areas = known.filter((area) => !area.archivedAt);
  const verdicts = payload.ratings.filter((rating) => areas.some((area) => area.id === rating.areaId));
  const problem = closeRatingProblem(areas, verdicts);
  if (problem) throw new CloseRatingError(problem);

  const closeDate = dateFromKey(payload.closeDate);
  const existing = await prisma.closeRating.findMany({
    where: { locationId: location.id, closeDate, areaId: { in: areas.map((area) => area.id) } },
    select: { areaId: true },
  });
  const rated = new Set(existing.map((rating) => rating.areaId));
  const fresh = verdicts.filter((verdict) => !rated.has(verdict.areaId));
  if (!fresh.length) return { saved: 0, alreadyRated: verdicts.length };

  const closers = await findClosers(
    location.id,
    location.timezone,
    payload.closeDate,
    [...new Set(areas.flatMap((area) => (area.templateId ? [area.templateId] : [])))],
  );
  const areaById = new Map(areas.map((area) => [area.id, area]));

  // skipDuplicates covers the race the read above cannot: two devices
  // arriving in the same instant.
  const { count } = await prisma.closeRating.createMany({
    data: fresh.map((verdict) => {
      const area = areaById.get(verdict.areaId)!;
      const acceptable = verdict.acceptable === true;
      return {
        orgId: user.orgId,
        locationId: location.id,
        areaId: area.id,
        closeDate,
        acceptable,
        note: normalizeNote(acceptable, verdict.note),
        ratedById: user.id,
        closingSubmissionId: area.templateId
          ? (closers.get(area.templateId)?.submissionId ?? null)
          : null,
      };
    }),
    skipDuplicates: true,
  });

  if (count > 0) {
    const described = fresh.map((verdict) => ({
      areaName: areaById.get(verdict.areaId)!.name,
      acceptable: verdict.acceptable === true,
    }));
    await logActivity({
      orgId: user.orgId,
      userId: user.id,
      action: "close_rating.submitted",
      entityType: "Location",
      entityId: location.id,
      locationId: location.id,
      summary: `${user.name} rated the ${payload.closeDate} close at #${location.code}: ${describeVerdicts(described)}`,
      metadata: {
        closeDate: payload.closeDate,
        ratings: fresh.map((verdict) => ({
          area: areaById.get(verdict.areaId)!.name,
          acceptable: verdict.acceptable === true,
          note: normalizeNote(verdict.acceptable === true, verdict.note),
        })),
      },
    });
  }

  return { saved: count, alreadyRated: verdicts.length - count };
}

export interface CloseRatingNight {
  closeDate: string;
  ratings: Record<
    string,
    { acceptable: boolean; note: string | null; ratedBy: string; closer: string | null }
  >;
}

/**
 * A store's recent nights, newest first, for the store page. Areas retired
 * since still show where they were rated.
 */
export async function getRecentCloseRatings(
  orgId: string,
  location: { id: string; timezone: string },
  nights = 14,
  now: Date = new Date(),
): Promise<{ areas: { id: string; name: string }[]; nights: CloseRatingNight[] } | null> {
  const lastNight = closeDateFor(businessDateKey(location.timezone, now));
  const earliest = shiftDateKey(lastNight, -(nights - 1));

  const [areas, ratings] = await Promise.all([
    activeAreas(orgId),
    prisma.closeRating.findMany({
      where: {
        locationId: location.id,
        closeDate: { gte: dateFromKey(earliest), lte: dateFromKey(lastNight) },
      },
      select: {
        areaId: true,
        closeDate: true,
        acceptable: true,
        note: true,
        ratedBy: { select: { name: true } },
        area: { select: { name: true, position: true } },
        closingSubmission: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);
  if (!areas.length && !ratings.length) return null;

  const columns = [...areas.map((area) => ({ id: area.id, name: area.name }))];
  for (const rating of ratings) {
    if (!columns.some((column) => column.id === rating.areaId)) {
      columns.push({ id: rating.areaId, name: rating.area.name });
    }
  }

  const byNight = new Map<string, CloseRatingNight>();
  for (let i = 0; i < nights; i++) {
    const key = shiftDateKey(lastNight, -i);
    byNight.set(key, { closeDate: key, ratings: {} });
  }
  for (const rating of ratings) {
    byNight.get(keyFromDate(rating.closeDate))!.ratings[rating.areaId] = {
      acceptable: rating.acceptable,
      note: rating.note,
      ratedBy: rating.ratedBy.name,
      closer: rating.closingSubmission?.user.name ?? null,
    };
  }

  return { areas: columns, nights: [...byNight.values()] };
}

export interface LastNightSummary {
  closeDate: string;
  /** Active areas, in order, with the verdict if one was given. */
  areas: { name: string; acceptable: boolean | null }[];
}

/**
 * Last night's verdicts for many stores at once, each on its own clock, in
 * two queries however many stores there are. Empty when no areas are rated.
 */
export async function getLastNightRatings(
  orgId: string,
  locations: { id: string; timezone: string }[],
  now: Date = new Date(),
): Promise<Map<string, LastNightSummary>> {
  const summaries = new Map<string, LastNightSummary>();
  const areas = await activeAreas(orgId);
  if (!areas.length || !locations.length) return summaries;

  const nightFor = new Map(
    locations.map((location) => [
      location.id,
      closeDateFor(businessDateKey(location.timezone, now)),
    ]),
  );
  const ratings = await prisma.closeRating.findMany({
    where: {
      locationId: { in: locations.map((location) => location.id) },
      closeDate: { in: [...new Set(nightFor.values())].map(dateFromKey) },
      areaId: { in: areas.map((area) => area.id) },
    },
    select: { locationId: true, areaId: true, closeDate: true, acceptable: true },
  });

  const verdict = new Map<string, boolean>();
  for (const rating of ratings) {
    // A store only counts the night that is "last night" on its own clock.
    if (keyFromDate(rating.closeDate) !== nightFor.get(rating.locationId)) continue;
    verdict.set(`${rating.locationId}:${rating.areaId}`, rating.acceptable);
  }

  for (const location of locations) {
    summaries.set(location.id, {
      closeDate: nightFor.get(location.id)!,
      areas: areas.map((area) => ({
        name: area.name,
        acceptable: verdict.get(`${location.id}:${area.id}`) ?? null,
      })),
    });
  }
  return summaries;
}
