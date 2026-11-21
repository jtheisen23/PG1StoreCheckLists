import Link from "next/link";

import { ProgressRing } from "@/components/progress-ring";
import { clockLabel, windowLabel } from "@/lib/time";
import type { DueChecklist } from "@/server/schedules";

/**
 * The store's day, in the walk's own visual language: a summary card like the
 * walk's "items to go", then one card with every checklist in time order. Each
 * row says where it stands with a word and a shape — Done ✓, Late ●, Due now ◆,
 * Later ○ — so it reads on a store iPad in bad light, and the next one owed
 * carries the one amber button.
 */

type Status = "done" | "late" | "now" | "later";

const STATUS: Record<Status, { word: string; mark: string; tone: string; bg: string }> = {
  done: { word: "Done", mark: "✓", tone: "var(--pass)", bg: "var(--pass-bg)" },
  late: { word: "Late", mark: "●", tone: "var(--fail)", bg: "var(--fail-bg)" },
  now: { word: "Due now", mark: "◆", tone: "var(--warn)", bg: "var(--warn-bg)" },
  later: { word: "Later today", mark: "○", tone: "var(--text-faint)", bg: "var(--surface-sunken)" },
};

function statusOf(item: DueChecklist, now: Date): Status {
  if (item.completed) return "done";
  if (item.overdue) return "late";
  return now >= item.startsAt ? "now" : "later";
}

const lines = (n: number) => `${n} line${n === 1 ? "" : "s"}`;

export function TodaySummary({ checklists }: { checklists: DueChecklist[] }) {
  const done = checklists.filter((c) => c.completed).length;
  const late = checklists.filter((c) => c.overdue).length;
  const left = checklists.length - done;
  const next = checklists.find((c) => !c.completed);
  const percent = checklists.length ? Math.round((done / checklists.length) * 100) : 0;
  const allDone = checklists.length > 0 && left === 0;
  const tile = allDone ? STATUS.done : late ? STATUS.late : { ...STATUS.now, mark: "!" };

  return (
    <div
      id="today-list"
      className="mb-3 flex scroll-mt-20 items-center gap-3.5 rounded-2xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:px-5"
      style={{ background: "var(--surface-raised)" }}
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[17px] font-bold"
        style={{ background: tile.bg, color: tile.tone }}
      >
        {tile.mark}
      </span>
      <div className="min-w-0 flex-1">
        <p className="tabular text-[16px] font-semibold">
          {allDone ? "All done for today" : `${left} ${left === 1 ? "checklist" : "checklists"} to go today`}
        </p>
        <p className="text-muted text-[13px]">
          {late ? (
            <span className="font-medium" style={{ color: "var(--fail)" }}>
              {late} late ·{" "}
            </span>
          ) : null}
          {done} of {checklists.length} done
          {next && !next.overdue ? ` · next: ${next.templateName}, due by ${clockLabel(next.dueTime)}` : ""}
        </p>
      </div>
      <ProgressRing percent={percent} label={`${done} of ${checklists.length} done today`} />
    </div>
  );
}

export function TodayList({ checklists, now }: { checklists: DueChecklist[]; now: Date }) {
  const ordered = [...checklists].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const next = ordered.find((c) => !c.completed);

  return (
    <section
      className="overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      style={{ background: "var(--surface-raised)" }}
      aria-label="Today's checklists"
    >
      <ul>
        {ordered.map((item) => {
          const status = statusOf(item, now);
          const look = STATUS[status];
          const isNext = item === next;
          const detail =
            status === "done"
              ? [item.completedBy ? `by ${item.completedBy}` : null, item.score !== null ? `${item.score}%` : null]
              : status === "late"
                ? [`was due by ${clockLabel(item.dueTime)}`, lines(item.itemCount)]
                : status === "now"
                  ? [`due by ${clockLabel(item.dueTime)}`, lines(item.itemCount)]
                  : [windowLabel(item.startTime, item.dueTime), lines(item.itemCount)];
          return (
            <li key={item.scheduleId} className="border-b last:border-b-0">
              <Link
                href={item.completed ? `/submissions/${item.submissionId}` : `/run/${item.scheduleId}`}
                className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[var(--surface-sunken)] md:px-5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[16px] font-bold"
                  style={{ background: look.bg, color: look.tone }}
                >
                  {look.mark}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[16px] leading-snug font-semibold ${status === "done" ? "text-muted" : ""}`}>
                    {item.templateName}
                  </span>
                  <span className="text-muted mt-0.5 block text-[13px] leading-snug">
                    <span className="font-medium" style={{ color: look.tone }}>
                      {look.word}
                    </span>
                    {detail.filter(Boolean).map((part) => ` · ${part}`).join("")}
                  </span>
                </span>
                {isNext ? (
                  <span
                    className="flex h-10 shrink-0 items-center rounded-xl px-4 text-[15px] font-semibold"
                    style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                  >
                    {status === "late" ? "Start now" : "Start"}
                  </span>
                ) : (
                  <span className="text-faint shrink-0 text-[14px] font-medium">
                    {item.completed ? "View" : "Start"} ›
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
