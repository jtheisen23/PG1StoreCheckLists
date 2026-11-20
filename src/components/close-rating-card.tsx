"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui";
import { Button } from "@/components/buttons";
import { ThumbIcon, VerdictChip } from "@/components/close-verdict";
import { cn } from "@/lib/cn";
import { businessDateKey } from "@/lib/time";
import {
  CLOSE_NOTE_MAX,
  closeDateFor,
  closeRatingKey,
  normalizeNote,
  verdictLabel,
  type CloseRatingArea,
  type CloseRatingCardData,
} from "@/lib/close-rating";
import { getQueued } from "@/lib/offline/db";
import { onSyncChange, queueCloseRating } from "@/lib/offline/sync";
import type { OutboxStatus } from "@/lib/offline/types";

/** What this device has done to an area this morning. */
interface Pick {
  acceptable: boolean;
  note: string;
  /** The note as last sent; differs from `note` while it is being edited. */
  sentNote: string | null;
  /** When this device sent it, for "Sent 7:04 AM". Null until sent. */
  sentAt: string | null;
}

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const word = (n: number) => NUMBER_WORDS[n] ?? String(n);

/**
 * The opener's first screen, after the PG1 morning screen: walk the store,
 * then rate how each area was left — Good handoff or Needs better, and a
 * Needs better says what was walked into. Each area is saved as it is rated,
 * so a phone that loses signal halfway loses nothing.
 *
 * It is a gate, not a score: no grade, no percentage, and it blocks nothing.
 * Rated, it gets out of the way to one button that starts the open.
 */
export function CloseRatingCard({
  data,
  greeting,
  startHref,
}: {
  data: CloseRatingCardData;
  greeting: string;
  /** Where "Start the open" goes: the opening checklist, when one is due. */
  startHref: string | null;
}) {
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

  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [queue, setQueue] = useState<OutboxStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Rated before this page was opened: show the summary, not the ritual.
  const [alreadyDone] = useState(() => data.areas.every((area) => area.rating));

  // Follow anything this device still has waiting to send.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const entry = await getQueued(key);
        if (!cancelled) setQueue(entry?.kind === "close-rating" ? entry.status : null);
      } catch {
        // No IndexedDB here; sending says so if it fails.
      }
    };
    void check();
    const unsubscribe = onSyncChange(() => void check());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key]);

  const send = async (area: CloseRatingArea, acceptable: boolean, note: string | null) => {
    setError(null);
    try {
      await queueCloseRating({
        locationId: data.locationId,
        locationName: data.locationName,
        closeDate,
        ratings: [
          { areaId: area.id, areaName: area.name, acceptable, note: normalizeNote(acceptable, note) },
        ],
      });
      return new Date().toISOString();
    } catch {
      setError("This device couldn't hold the rating. Check your connection and try again.");
      return null;
    }
  };

  const choose = async (area: CloseRatingArea, acceptable: boolean) => {
    const current = picks[area.id];
    if (acceptable) {
      setPicks((all) => ({
        ...all,
        [area.id]: { acceptable: true, note: "", sentNote: null, sentAt: null },
      }));
      const sentAt = await send(area, true, null);
      setPicks((all) => ({ ...all, [area.id]: { ...all[area.id], sentAt } }));
    } else {
      // Needs better is not sent until it says what was wrong.
      setPicks((all) => ({
        ...all,
        [area.id]: {
          acceptable: false,
          note: current && !current.acceptable ? current.note : (area.rating?.note ?? ""),
          sentNote: null,
          sentAt: null,
        },
      }));
    }
  };

  const sendNote = async (area: CloseRatingArea) => {
    const pick = picks[area.id];
    const note = normalizeNote(false, pick?.note);
    if (!note) {
      setError(`Say what you walked into at ${area.name} before sending.`);
      return;
    }
    if (note.length > CLOSE_NOTE_MAX) {
      setError(`Keep the note on ${area.name} under ${CLOSE_NOTE_MAX} characters.`);
      return;
    }
    const sentAt = await send(area, false, note);
    if (sentAt) {
      setPicks((all) => ({ ...all, [area.id]: { ...all[area.id], sentNote: note, sentAt } }));
    }
  };

  // An area counts as rated once its verdict has been sent — by this device
  // this morning, or by anyone before the page was opened.
  const verdictOf = (area: CloseRatingArea): boolean | null => {
    const pick = picks[area.id];
    if (pick) return pick.acceptable;
    return area.rating ? area.rating.acceptable : null;
  };
  const isRated = (area: CloseRatingArea) => {
    const pick = picks[area.id];
    if (pick) return pick.sentAt !== null;
    return Boolean(area.rating);
  };
  const remaining = areas.filter((area) => !isRated(area)).length;
  const done = remaining === 0;

  useEffect(() => {
    // Everything is in and has left the device: let the page catch up, so the
    // rest of today shows the record as the server holds it.
    if (done && Object.keys(picks).length && queue === null) router.refresh();
  }, [done, picks, queue, router]);

  if ((alreadyDone && !stale && !Object.keys(picks).length) || (done && collapsed)) {
    return <RatedSummary data={data} closeDate={closeDate} areas={areas} />;
  }

  const total = areas.length;
  const line1 = done
    ? "All set."
    : remaining === total
      ? `${word(total)} area${total === 1 ? "" : "s"}`
      : `${word(remaining)} to go`;
  const line2 = done ? "Have a good one." : "before you start.";

  return (
    <section
      className="-mx-4 -mt-5 mb-6 overflow-hidden border-b md:mx-0 md:mt-0 md:rounded-2xl md:border"
      style={{ background: "var(--surface-raised)" }}
      aria-labelledby="morning-heading"
    >
      <div
        className="px-5 pt-5 pb-6"
        style={{
          background:
            "linear-gradient(180deg, var(--sunrise-top) 0%, var(--sunrise-mid) 58%, var(--surface-raised) 100%)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="h-7 w-7 shrink-0 rounded-full"
            style={{
              background: "radial-gradient(circle at 38% 35%, #fff4cc, #f6c447 58%, #efa200)",
              boxShadow: "0 0 18px rgba(239, 162, 0, 0.45)",
            }}
            aria-hidden="true"
          />
          <p className="text-[17px] font-semibold tracking-tight">{greeting}</p>
        </div>
        <h2
          id="morning-heading"
          className="mt-4 text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em]"
        >
          {line1}
          <br />
          <span style={{ color: "var(--headline-accent)" }}>{line2}</span>
        </h2>
        <p className="mt-3 text-[15px]" style={{ color: "var(--sunrise-ink)" }}>
          {done
            ? "Thanks — that is logged against last night's close."
            : "Walk the store, then tell us how each one was left."}
        </p>
        {stale ? (
          <p className="mt-2 text-[12px]" style={{ color: "var(--sunrise-ink)" }}>
            This screen was saved before today, so who closed will show once you&rsquo;re back online.
          </p>
        ) : null}
      </div>

      <p className="eyebrow px-5 pt-1 pb-3">
        Last night&rsquo;s close{" "}
        <span className="font-medium tracking-normal normal-case">· {formatNight(closeDate)}</span>
      </p>

      <ul className="border-t">
        {areas.map((area) => (
          <AreaRow
            key={area.id}
            area={area}
            timezone={data.timezone}
            verdict={verdictOf(area)}
            pick={picks[area.id]}
            locked={Boolean(area.rating && !area.rating.mine)}
            onChoose={(acceptable) => void choose(area, acceptable)}
            onNote={(note) =>
              setPicks((all) => ({ ...all, [area.id]: { ...all[area.id], note } }))
            }
            onSendNote={() => void sendNote(area)}
          />
        ))}
      </ul>

      <div className="px-5 pt-4 pb-5">
        {error ? (
          <p className="mb-3 text-[13px] font-medium" style={{ color: "var(--fail)" }} role="alert">
            {error}
          </p>
        ) : null}
        {done ? (
          startHref ? (
            <Link
              href={startHref}
              className="flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              Start the open
            </Link>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="h-12 w-full rounded-xl"
              onClick={() => {
                setCollapsed(true);
                document.getElementById("today-list")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Start the open
            </Button>
          )
        ) : (
          <Button variant="primary" size="lg" className="h-12 w-full rounded-xl" disabled>
            {remaining === total
              ? total === 1
                ? "Rate it to get started"
                : `Rate all ${word(total).toLowerCase()} to get started`
              : `${remaining} area${remaining === 1 ? "" : "s"} left`}
          </Button>
        )}
        <p className="text-muted mt-3 text-center text-[13px]">
          {queue === "failed" ? (
            <Link href="/pending" style={{ color: "var(--fail)" }} className="font-medium">
              A rating couldn&rsquo;t be sent — review ›
            </Link>
          ) : queue ? (
            <span style={{ color: "var(--warn)" }} className="font-medium">
              Saved on this device · sends when you&rsquo;re back online
            </span>
          ) : (
            "Your operator and Director of Operations see this on the store's page."
          )}
        </p>
      </div>
    </section>
  );
}

function AreaRow({
  area,
  timezone,
  verdict,
  pick,
  locked,
  onChoose,
  onNote,
  onSendNote,
}: {
  area: CloseRatingArea;
  timezone: string;
  verdict: boolean | null;
  pick: Pick | undefined;
  locked: boolean;
  onChoose: (acceptable: boolean) => void;
  onNote: (note: string) => void;
  onSendNote: () => void;
}) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const needsBetter = verdict === false && Boolean(pick) && !locked;

  useEffect(() => {
    if (needsBetter && !pick?.sentAt) noteRef.current?.focus();
  }, [needsBetter, pick?.sentAt]);

  const unsentEdit = Boolean(pick?.sentAt) && (pick?.note.trim() ?? "") !== (pick?.sentNote ?? "");

  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold tracking-tight">{area.name}</p>
          <Closer area={area} timezone={timezone} locked={locked} />
        </div>
        <div className="flex shrink-0 gap-2" role="group" aria-label={`How was ${area.name} left?`}>
          <HandoffButton up active={verdict === true} disabled={locked} onClick={() => onChoose(true)} />
          <HandoffButton
            up={false}
            active={verdict === false}
            disabled={locked}
            onClick={() => onChoose(false)}
          />
        </div>
      </div>

      {needsBetter ? (
        <div className="px-5 pb-4">
          <div className="rounded-xl p-3.5" style={{ background: "var(--fail-bg)" }}>
            <label className="block">
              <span className="text-[14px] font-semibold" style={{ color: "var(--fail)" }}>
                What did you walk into that needs fixing?
              </span>
              <textarea
                ref={noteRef}
                value={pick?.note ?? ""}
                onChange={(event) => onNote(event.target.value)}
                maxLength={CLOSE_NOTE_MAX}
                rows={2}
                placeholder="Keep it short — what you walked into."
                className="mt-2 w-full rounded-lg border-2 bg-[var(--field)] px-3 py-2 outline-none"
                style={{ borderColor: "var(--fail)" }}
              />
            </label>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium" style={{ color: "var(--fail)" }}>
                {pick?.sentAt && !unsentEdit ? `Sent ${formatClock(pick.sentAt, timezone)}` : ""}
              </span>
              {!pick?.sentAt || unsentEdit ? (
                <Button size="sm" onClick={onSendNote}>
                  {pick?.sentAt ? "Send update" : "Send"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Icon over word, as on the PG1 screens: a status never rests on colour. */
function HandoffButton({
  up,
  active,
  disabled,
  onClick,
}: {
  up: boolean;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone = up ? "pass" : "fail";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex h-[62px] w-[88px] flex-col items-center justify-center gap-1 rounded-xl border text-[12px] font-medium transition-colors sm:w-[104px]",
        disabled && !active && "opacity-40",
      )}
      style={
        active
          ? { background: `var(--${tone}-bg)`, borderColor: `var(--${tone})`, color: `var(--${tone})` }
          : { background: "var(--field)", borderColor: "var(--border-strong)", color: "var(--text-muted)" }
      }
    >
      <ThumbIcon up={up} className="h-5 w-5" />
      {verdictLabel(up)}
    </button>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join("");
}

function Closer({ area, timezone, locked }: { area: CloseRatingArea; timezone: string; locked: boolean }) {
  if (locked && area.rating) {
    return <p className="text-muted mt-0.5 text-[13px]">Rated by {area.rating.ratedBy}</p>;
  }
  if (!area.tracked) return null;
  if (!area.closer) {
    return (
      <p className="mt-0.5 text-[13px] font-medium" style={{ color: "var(--warn)" }}>
        No closing checklist recorded
      </p>
    );
  }
  return (
    <p className="text-muted mt-0.5 text-[13px]">
      Closed by{" "}
      <b className="font-semibold text-[var(--text)]" title={area.closer.name}>
        {initials(area.closer.name)}
      </b>{" "}
      · {formatClock(area.closer.finishedAt, timezone)}
    </p>
  );
}

/** The rest of the day: last night's close as a short record, out of the way. */
function RatedSummary({
  data,
  closeDate,
  areas,
}: {
  data: CloseRatingCardData;
  closeDate: string;
  areas: CloseRatingArea[];
}) {
  const raters = [...new Set(areas.flatMap((area) => (area.rating ? [area.rating.ratedBy] : [])))];
  const firstRatedAt = areas.flatMap((area) => (area.rating ? [area.rating.ratedAt] : [])).sort()[0];
  return (
    <Card className="mb-5 overflow-hidden">
      <div className="flex flex-col gap-0.5 px-4 pt-3.5 pb-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="eyebrow">
          Last night&rsquo;s close{" "}
          <span className="font-medium tracking-normal normal-case">· {formatNight(closeDate)}</span>
        </p>
        {raters.length ? (
          <span className="text-muted text-[12px]">
            Rated by {raters.join(" and ")}
            {firstRatedAt ? ` · ${formatClock(firstRatedAt, data.timezone)}` : ""}
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1.5 px-4 pt-2 pb-3.5">
        {areas.map((area) => (
          <li key={area.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="w-24 shrink-0 text-[13px] font-medium">{area.name}</span>
            {area.rating ? (
              <>
                <VerdictChip acceptable={area.rating.acceptable} compact />
                {area.rating.note ? (
                  <span className="text-muted min-w-0 text-[12px]">{area.rating.note}</span>
                ) : null}
              </>
            ) : (
              <span className="text-faint text-[12px]">Not rated</span>
            )}
          </li>
        ))}
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
