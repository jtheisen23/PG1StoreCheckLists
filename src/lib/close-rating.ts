/**
 * The morning close rating's rules. Pure, so the card the opener taps and the
 * server that saves it cannot disagree, and so the tests can hold them.
 *
 * The rating is a gate, not a score. Nothing here feeds checklist completion
 * or any score, and nothing should: "was last night acceptable" is a different
 * question from "did we do our tasks", and folding one into the other has
 * been got wrong once already.
 */
import { zonedTimeToUtc } from "./time";

/** The areas an organization starts with, offered as one click in Admin. */
export const STANDARD_CLOSE_AREAS = ["Frontline", "Grill", "Backroom"] as const;

export const CLOSE_NOTE_MAX = 1000;

/**
 * How many nights back a rating may still be accepted. A device that rated
 * offline in the morning and only found the network the next day is still
 * reporting a real rating; a week-old one is not a morning rating any more.
 */
export const RATEABLE_NIGHTS = 3;

/**
 * A night's close is looked for from local noon on its date to local noon the
 * next day. A close finished at 00:20 is still last night's, and nothing done
 * the following afternoon is.
 */
const CLOSE_WINDOW_STARTS = 12;

export interface CloseVerdict {
  areaId: string;
  /** Thumbs up (true), thumbs down (false), or not yet chosen (null). */
  acceptable: boolean | null;
  note?: string | null;
}

/* What the Today card is drawn from — built by src/server/close-ratings.ts. */

export interface CloseCloser {
  submissionId: string;
  name: string;
  /** When the closing checklist was submitted. */
  finishedAt: string;
}

export interface CloseRatingArea {
  id: string;
  name: string;
  /** Whether a closing checklist is linked, so "nobody recorded" means something. */
  tracked: boolean;
  closer: CloseCloser | null;
  rating: {
    acceptable: boolean;
    note: string | null;
    ratedBy: string;
    ratedAt: string;
  } | null;
}

export interface CloseRatingCardData {
  locationId: string;
  locationName: string;
  timezone: string;
  /** The store's business date when the page was rendered. */
  todayKey: string;
  /** The night being rated. */
  closeDate: string;
  areas: CloseRatingArea[];
}

export function verdictLabel(acceptable: boolean): string {
  return acceptable ? "Good" : "Not good";
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Moves a "YYYY-MM-DD" key by whole days. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The night an opener is rating: the business day before their own. */
export function closeDateFor(todayKey: string): string {
  return shiftDateKey(todayKey, -1);
}

/**
 * Whether a rating of `closeDateKey` can be accepted on `todayKey` — a recent
 * night that has already closed. Tonight's close cannot be rated yet.
 */
export function isRateableCloseDate(closeDateKey: string, todayKey: string): boolean {
  if (!isDateKey(closeDateKey) || !isDateKey(todayKey)) return false;
  // Keys are zero-padded, so they compare correctly as strings.
  return (
    closeDateKey <= shiftDateKey(todayKey, -1) &&
    closeDateKey >= shiftDateKey(todayKey, -RATEABLE_NIGHTS)
  );
}

/** The instants between which a night's close is looked for. */
export function closeWindow(timeZone: string, closeDateKey: string): { from: Date; to: Date } {
  const [y, m, d] = closeDateKey.split("-").map(Number);
  const [ny, nm, nd] = shiftDateKey(closeDateKey, 1).split("-").map(Number);
  return {
    from: zonedTimeToUtc(timeZone, y, m, d, CLOSE_WINDOW_STARTS),
    to: zonedTimeToUtc(timeZone, ny, nm, nd, CLOSE_WINDOW_STARTS),
  };
}

/** A note is only kept on a thumbs down; blank is no note. */
export function normalizeNote(acceptable: boolean, note: string | null | undefined): string | null {
  if (acceptable) return null;
  const trimmed = (note ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * What stops a set of verdicts being saved, in words for the person holding
 * the iPad, or null when it can be. Every area offered needs a verdict, and a
 * thumbs down needs a note saying what was wrong.
 */
export function closeRatingProblem(
  areas: { id: string; name: string }[],
  verdicts: CloseVerdict[],
): string | null {
  if (!areas.length) return "There is nothing to rate.";

  const offered = new Map(areas.map((area) => [area.id, area]));
  const seen = new Set<string>();
  for (const verdict of verdicts) {
    if (!offered.has(verdict.areaId)) return "That area is no longer being rated. Reload and try again.";
    if (seen.has(verdict.areaId)) return `${offered.get(verdict.areaId)!.name} was rated twice.`;
    seen.add(verdict.areaId);
  }

  const byArea = new Map(verdicts.map((verdict) => [verdict.areaId, verdict]));
  for (const area of areas) {
    const verdict = byArea.get(area.id);
    if (!verdict || verdict.acceptable === null || verdict.acceptable === undefined) {
      return `Rate ${area.name}.`;
    }
    if (!verdict.acceptable) {
      const note = normalizeNote(false, verdict.note);
      if (!note) return `Say what was wrong with ${area.name}.`;
      if (note.length > CLOSE_NOTE_MAX) {
        return `The note on ${area.name} is too long — keep it under ${CLOSE_NOTE_MAX} characters.`;
      }
    }
  }
  return null;
}

/** The outbox key: one rating per store per night, however often it is replayed. */
export function closeRatingKey(locationId: string, closeDateKey: string): string {
  return `close:${locationId}:${closeDateKey}`;
}

/** "Frontline good · Grill not good · Backroom good", for the activity log. */
export function describeVerdicts(
  verdicts: { areaName: string; acceptable: boolean }[],
): string {
  return verdicts
    .map((verdict) => `${verdict.areaName} ${verdictLabel(verdict.acceptable).toLowerCase()}`)
    .join(" · ");
}
