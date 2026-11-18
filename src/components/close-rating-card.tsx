"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui";
import { ThumbIcon, VerdictChip } from "@/components/close-verdict";
import { Button } from "@/components/buttons";
import { cn } from "@/lib/cn";
import { businessDateKey } from "@/lib/time";
import {
  CLOSE_NOTE_MAX,
  closeDateFor,
  closeRatingKey,
  closeRatingProblem,
  normalizeNote,
  verdictLabel,
  type CloseRatingArea,
  type CloseRatingCardData,
} from "@/lib/close-rating";
import { getQueued } from "@/lib/offline/db";
import { onSyncChange, queueCloseRating } from "@/lib/offline/sync";
import type { OfflineCloseRating, OutboxStatus } from "@/lib/offline/types";

interface Choice {
  acceptable: boolean | null;
  note: string;
}

/**
 * The opener's first screen: how did last night's close leave each area?
 * Thumbs up or down, and a note on a thumbs down. It blocks nothing and is in
 * no score — the checklists below it carry on exactly as before.
 *
 * Saved through the offline outbox like a walk, so a dropped connection costs
 * nothing. No time is sent: the server stamps the rating when it arrives.
 */
export function CloseRatingCard({ data }: { data: CloseRatingCardData }) {
  const router = useRouter();

  // The service worker serves the last copy of this page when the network is
  // down, and in a store that copy is often from yesterday. Rating the night
  // it shows would rate the wrong close, so a page older than today moves on
  // to last night and drops what it knew about the older one.
  const [deviceToday, setDeviceToday] = useState<string | null>(null);
  useEffect(() => setDeviceToday(businessDateKey(data.timezone)), [data.timezone]);
  const stale = deviceToday !== null && deviceToday > data.todayKey;
  const closeDate = stale ? closeDateFor(deviceToday) : data.closeDate;
  const areas: CloseRatingArea[] = stale
    ? data.areas.map((area) => ({ ...area, closer: null, rating: null }))
    : data.areas;
  const key = closeRatingKey(data.locationId, closeDate);

  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A rating on this device that the page has not caught up with yet.
  const [mine, setMine] = useState<{ rating: OfflineCloseRating; status: OutboxStatus | "sent" } | null>(
    null,
  );

  // Pick up a rating already waiting in the outbox, and follow it until sent.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const entry = await getQueued(key);
        if (cancelled) return;
        if (entry?.kind === "close-rating") {
          setMine({ rating: entry.rating, status: entry.status });
        } else {
          setMine((current) => {
            if (current && current.status !== "sent") {
              // It left the outbox, so the server has it: show the real record.
              router.refresh();
              return { ...current, status: "sent" };
            }
            return current;
          });
        }
      } catch {
        // No IndexedDB here; the save button says so if it is pressed.
      }
    };
    void check();
    const unsubscribe = onSyncChange(() => void check());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key, router]);

  // Once the refreshed page carries every area this device rated, show the
  // server's record — including who rated it — instead of the local copy.
  const caughtUp =
    !stale &&
    mine?.status === "sent" &&
    mine.rating.ratings.every((rating) => areas.some((area) => area.id === rating.areaId && area.rating));
  useEffect(() => {
    if (caughtUp) setMine(null);
  }, [caughtUp]);

  const unrated = areas.filter((area) => !area.rating);

  if (mine) {
    return <Rated data={data} closeDate={closeDate} areas={areas} pending={mine} />;
  }
  if (!unrated.length) {
    return <Rated data={data} closeDate={closeDate} areas={areas} />;
  }

  const choose = (areaId: string, patch: Partial<Choice>) => {
    setError(null);
    setChoices((current) => ({
      ...current,
      [areaId]: { ...(current[areaId] ?? { acceptable: null, note: "" }), ...patch },
    }));
  };

  const save = async () => {
    const verdicts = unrated.map((area) => ({
      areaId: area.id,
      acceptable: choices[area.id]?.acceptable ?? null,
      note: choices[area.id]?.note ?? "",
    }));
    const problem = closeRatingProblem(unrated, verdicts);
    if (problem) {
      setError(problem);
      return;
    }

    const rating: OfflineCloseRating = {
      locationId: data.locationId,
      locationName: data.locationName,
      closeDate,
      ratings: unrated.map((area) => {
        const acceptable = choices[area.id].acceptable === true;
        return {
          areaId: area.id,
          areaName: area.name,
          acceptable,
          note: normalizeNote(acceptable, choices[area.id].note),
        };
      }),
    };

    setSaving(true);
    try {
      await queueCloseRating(rating);
      // It may already have gone: sending is attempted before this returns.
      const entry = await getQueued(key);
      if (entry?.kind === "close-rating") {
        setMine({ rating: entry.rating, status: entry.status });
      } else {
        setMine({ rating, status: "sent" });
        router.refresh();
      }
    } catch {
      setError("This device couldn't hold the rating. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-5 overflow-hidden">
      <CardTitle closeDate={closeDate} />
      <p className="text-muted px-4 pb-3 text-[13px]">
        {stale
          ? "This screen was saved before today, so who closed will show once you're back online. Your rating still counts."
          : "How did the closing shift leave each area? A thumbs down needs a note."}
      </p>

      <ul className="border-t">
        {areas.map((area) => (
          <li key={area.id} className="border-b px-4 py-3 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-[15px] font-semibold">{area.name}</p>
              <Closer area={area} timezone={data.timezone} stale={stale} />
            </div>

            {area.rating ? (
              <div className="mt-2">
                <VerdictChip acceptable={area.rating.acceptable} />
                <p className="text-muted mt-1 text-[12px]">
                  Rated by {area.rating.ratedBy}
                  {area.rating.note ? ` — ${area.rating.note}` : ""}
                </p>
              </div>
            ) : (
              <AreaChoice
                area={area}
                choice={choices[area.id]}
                onChoose={(patch) => choose(area.id, patch)}
              />
            )}
          </li>
        ))}
      </ul>

      <div className="border-t px-4 py-3">
        {error ? (
          <p className="mb-2.5 text-[13px] font-medium" style={{ color: "var(--fail)" }} role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" size="lg" className="w-full" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save rating"}
        </Button>
      </div>
    </Card>
  );
}

function CardTitle({ closeDate, aside }: { closeDate: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 pt-4 pb-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <h2 className="text-[16px] font-semibold tracking-tight">
        Last night&rsquo;s close
        <span className="text-muted ml-2 text-[13px] font-normal whitespace-nowrap">
          {formatNight(closeDate)}
        </span>
      </h2>
      {aside}
    </div>
  );
}

function AreaChoice({
  area,
  choice,
  onChoose,
}: {
  area: CloseRatingArea;
  choice: Choice | undefined;
  onChoose: (patch: Partial<Choice>) => void;
}) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const down = choice?.acceptable === false;

  useEffect(() => {
    if (down) noteRef.current?.focus();
  }, [down]);

  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Rate ${area.name}`}>
        <ThumbButton
          up
          active={choice?.acceptable === true}
          onClick={() => onChoose({ acceptable: true })}
        />
        <ThumbButton
          up={false}
          active={down}
          onClick={() => onChoose({ acceptable: false })}
        />
      </div>
      {down ? (
        <label className="mt-2 block">
          <span className="sr-only">What was wrong with {area.name}?</span>
          <textarea
            ref={noteRef}
            value={choice?.note ?? ""}
            onChange={(event) => onChoose({ note: event.target.value })}
            maxLength={CLOSE_NOTE_MAX}
            rows={2}
            placeholder={`What was wrong with ${area.name}?`}
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--color-brand-500)]"
          />
        </label>
      ) : null}
    </div>
  );
}

function ThumbButton({
  up,
  active,
  onClick,
}: {
  up: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const tone = up ? "pass" : "fail";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-lg border text-[14px] font-semibold transition-colors",
        active && "text-white",
      )}
      style={
        active
          ? { background: `var(--${tone})`, borderColor: `var(--${tone})` }
          : { background: "var(--surface)" }
      }
    >
      <ThumbIcon up={up} className="h-5 w-5" />
      {verdictLabel(up)}
    </button>
  );
}

function Closer({
  area,
  timezone,
  stale,
}: {
  area: CloseRatingArea;
  timezone: string;
  stale: boolean;
}) {
  if (stale || !area.tracked) return null;
  if (!area.closer) {
    return (
      <p className="text-[12px] font-medium" style={{ color: "var(--warn)" }}>
        No closing checklist recorded
      </p>
    );
  }
  return (
    <p className="text-muted text-[12px]">
      Closed by <span className="font-medium text-[var(--text)]">{area.closer.name}</span> ·
      finished {formatClock(area.closer.finishedAt, timezone)}
    </p>
  );
}

/** The card once rated: a short summary that stays out of the way. */
function Rated({
  data,
  closeDate,
  areas,
  pending,
}: {
  data: CloseRatingCardData;
  closeDate: string;
  areas: CloseRatingArea[];
  pending?: { rating: OfflineCloseRating; status: OutboxStatus | "sent" };
}) {
  const rows = areas.map((area) => {
    const queued = pending?.rating.ratings.find((rating) => rating.areaId === area.id);
    return queued
      ? { id: area.id, name: area.name, acceptable: queued.acceptable, note: queued.note }
      : area.rating
        ? { id: area.id, name: area.name, acceptable: area.rating.acceptable, note: area.rating.note }
        : null;
  });

  const raters = [...new Set(areas.flatMap((area) => (area.rating ? [area.rating.ratedBy] : [])))];
  const firstRatedAt = areas
    .flatMap((area) => (area.rating ? [area.rating.ratedAt] : []))
    .sort()[0];

  let status: React.ReactNode = null;
  if (pending?.status === "failed") {
    status = (
      <Link href="/pending" className="text-[12px] font-medium" style={{ color: "var(--fail)" }}>
        Couldn&rsquo;t send — review ›
      </Link>
    );
  } else if (pending && pending.status !== "sent") {
    status = (
      <span className="text-[12px] font-medium" style={{ color: "var(--warn)" }}>
        Saved on this device · sends when online
      </span>
    );
  } else if (pending) {
    status = (
      <span className="text-[12px] font-medium" style={{ color: "var(--pass)" }}>
        ✓ Saved
      </span>
    );
  } else if (raters.length) {
    status = (
      <span className="text-muted text-[12px]">
        Rated by {raters.join(" and ")}
        {firstRatedAt ? ` · ${formatClock(firstRatedAt, data.timezone)}` : ""}
      </span>
    );
  }

  return (
    <Card className="mb-5 overflow-hidden">
      <CardTitle closeDate={closeDate} aside={status} />
      <ul className="flex flex-col gap-1.5 px-4 pt-2 pb-3.5">
        {rows.map((row, index) =>
          row ? (
            <li key={row.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="w-24 shrink-0 text-[13px] font-medium">{row.name}</span>
              <VerdictChip acceptable={row.acceptable} compact />
              {row.note ? <span className="text-muted min-w-0 text-[12px]">{row.note}</span> : null}
            </li>
          ) : (
            <li key={areas[index].id} className="flex items-center gap-2.5">
              <span className="w-24 shrink-0 text-[13px] font-medium">{areas[index].name}</span>
              <span className="text-faint text-[12px]">Not rated</span>
            </li>
          ),
        )}
      </ul>
    </Card>
  );
}

function formatNight(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));
}

function formatClock(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
