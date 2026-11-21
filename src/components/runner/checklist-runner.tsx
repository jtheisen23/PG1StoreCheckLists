"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { evaluateAnswer, scoreSubmission, type ScorableItem } from "@/lib/scoring";
import { getDraft, saveDraft } from "@/lib/offline/db";
import { queueSubmission } from "@/lib/offline/sync";
import type { OfflineAnswer, OfflineDraft } from "@/lib/offline/types";
import type { RunnerContext, RunnerNav, RunnerSection, RunnerTemplate } from "@/lib/runner-types";
import { ProgressRing } from "@/components/progress-ring";
import { ItemRow, isAnswered } from "./item-row";
import { WeightWeekPanel } from "./weight-week";

/**
 * A walk, in the PG1 layout: one scrolling page in the order the store is
 * actually walked, every section a numbered card with its own progress, chips
 * along the top to jump between them, and a bar along the bottom that always
 * says how much is left and what still needs a note.
 *
 * Everything it needs arrives with the page or lives in IndexedDB. Nothing on
 * the answering path fetches, so a walk-in with no signal changes nothing.
 */
export function ChecklistRunner({
  template,
  context,
  clientKey,
  nav,
  subtitle,
}: {
  template: RunnerTemplate;
  context: RunnerContext;
  clientKey: string;
  nav: RunnerNav;
  /** "#1001 Chicago Lakeview · Fri Nov 13 · due by 10:00". */
  subtitle: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, OfflineAnswer>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState(template.sections[0]?.id ?? "");
  const headerRef = useRef<HTMLElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => template.sections.flatMap((s) => s.items), [template]);

  // Restore any in-progress walk for this schedule.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await getDraft(clientKey);
        if (draft && !cancelled) {
          setAnswers(draft.answers ?? {});
          setNotes(draft.notes ?? "");
        }
      } catch {
        // Private browsing or storage denied — the walk still works in memory.
      } finally {
        if (!cancelled) setRestored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientKey]);

  const startedAtRef = useRef(new Date().toISOString());
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Geotagging is a nice-to-have, so it is resolved in the background while the
  // walk is under way. Submitting never waits on the permission prompt.
  useEffect(() => {
    void currentPosition().then((coords) => {
      coordsRef.current = coords;
    });
  }, []);

  const persist = useCallback(
    (nextAnswers: Record<string, OfflineAnswer>, nextNotes: string) => {
      const draft: OfflineDraft = {
        clientKey,
        locationId: context.locationId,
        locationName: `#${context.locationCode} ${context.locationName}`,
        templateId: template.id,
        templateName: template.name,
        scheduleId: context.scheduleId,
        daypart: context.daypart,
        startedAt: startedAtRef.current,
        updatedAt: new Date().toISOString(),
        answers: nextAnswers,
        notes: nextNotes,
      };
      void saveDraft(draft).catch(() => undefined);
      return draft;
    },
    [clientKey, context, template],
  );

  const setAnswer = (itemId: string, next: OfflineAnswer) => {
    setAnswers((prev) => {
      const updated = { ...prev, [itemId]: next };
      persist(updated, notes);
      return updated;
    });
  };

  const scorable: ScorableItem[] = useMemo(
    () =>
      items.map((i) => ({
        id: i.id,
        type: i.type,
        required: i.required,
        critical: i.critical,
        weight: i.weight,
        minValue: i.minValue,
        maxValue: i.maxValue,
        failingOptions: i.failingOptions,
      })),
    [items],
  );

  const live = useMemo(
    () => scoreSubmission(scorable, Object.values(answers), template.passingScore),
    [scorable, answers, template.passingScore],
  );

  const answered = (section: RunnerSection) =>
    section.items.filter((i) => answers[i.id] && isAnswered(answers[i.id], i.type)).length;
  const answeredCount = template.sections.reduce((sum, section) => sum + answered(section), 0);
  const problems = useMemo(() => findProblems(template, answers), [template, answers]);
  const needNote = problems.filter((p) => p.reason === "needs a note").length;
  const needPhoto = problems.filter((p) => p.reason === "needs a photo").length;
  const ready = problems.length === 0;
  const percent = items.length ? Math.round((answeredCount / items.length) * 100) : 0;
  const hasCheckLines = items.some((i) => i.type === "CHECKBOX");

  // --- moving around the page ------------------------------------------------
  const headerOffset = () => (headerRef.current?.offsetHeight ?? 0) + 12;

  function scrollToElement(element: Element | null) {
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - headerOffset();
    window.scrollTo({ top, behavior: "smooth" });
  }

  function goToSection(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: false }));
    setActiveSection(id);
    requestAnimationFrame(() => scrollToElement(document.getElementById(`section-${id}`)));
  }

  // The chip for the section in view follows the scroll.
  useEffect(() => {
    if (!restored) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = headerOffset() + 8;
        let current = template.sections[0]?.id ?? "";
        for (const section of template.sections) {
          const element = document.getElementById(`section-${section.id}`);
          if (element && element.getBoundingClientRect().top <= line) current = section.id;
        }
        // At the very bottom the last section is the one being read, however
        // short it is.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          current = template.sections[template.sections.length - 1]?.id ?? current;
        }
        setActiveSection(current);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [restored, template.sections]);

  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>(`[data-section="${activeSection}"]`);
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeSection]);

  async function handleSubmit() {
    if (problems.length) {
      setShowErrors(true);
      const first = problems[0];
      const section = template.sections.find((s) => s.items.some((i) => i.id === first.itemId));
      if (section) setCollapsed((prev) => ({ ...prev, [section.id]: false }));
      requestAnimationFrame(() => scrollToElement(document.getElementById(`item-${first.itemId}`)));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const draft = persist(answers, notes);
      await queueSubmission(draft, coordsRef.current);
      router.push(`/submitted?score=${live.score ?? ""}&passed=${live.passed}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not save the checklist. It stays on this device — try again.",
      );
      setSubmitting(false);
    }
  }

  const statusLine = [
    `${answeredCount} of ${items.length} done`,
    needNote ? `${needNote} ${needNote === 1 ? "needs" : "need"} a note` : null,
    needPhoto ? `${needPhoto} ${needPhoto === 1 ? "needs" : "need"} a photo` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-20 mx-auto max-w-[52rem] border-b"
        style={{ background: "var(--surface-raised)" }}
      >
        <div className="px-4 pt-1 pb-3 md:px-6">
          {/* The switcher's menu hangs from this row, so it lines up with the back
              arrow and never runs off the right edge of a phone. */}
          <div className="relative flex items-start gap-1.5">
            <Link
              href={nav.backHref}
              aria-label="Back to Today"
              className="-ml-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <div className="min-w-0 flex-1">
              <TitleSwitcher name={template.name} entries={nav.today} />
              <p className="text-muted line-clamp-2 text-[13px] md:text-[14px]">{subtitle}</p>
            </div>
            <ProgressRing percent={percent} className="mt-1.5" />
          </div>

          {nav.tabs ? (
            <nav aria-label="This checklist today" className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:-mx-6 md:px-6">
              {nav.tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={tab.current ? "page" : undefined}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap"
                  style={
                    tab.current
                      ? { background: "var(--info)", color: "var(--info-ink)" }
                      : { background: "var(--surface-sunken)", color: "var(--text-muted)" }
                  }
                >
                  {tab.done ? <span aria-label="done">✓</span> : null}
                  {tab.label}
                </Link>
              ))}
            </nav>
          ) : template.sections.length > 1 ? (
            <div ref={chipsRef} className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:-mx-6 md:px-6">
              {template.sections.map((section, index) => {
                const done = answered(section);
                const active = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    data-section={section.id}
                    onClick={() => goToSection(section.id)}
                    aria-current={active ? "true" : undefined}
                    className="flex h-9 shrink-0 items-center gap-2 rounded-full pr-3.5 pl-2.5 text-[13px] font-medium whitespace-nowrap"
                    style={
                      active
                        ? { background: "var(--info)", color: "var(--info-ink)" }
                        : { background: "var(--surface-sunken)", color: "var(--text-muted)" }
                    }
                  >
                    <MiniRing done={done} total={section.items.length} />
                    {index + 1} · {section.title}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[52rem] px-3 pt-4 pb-44 md:px-6">
        {!restored ? (
          <p className="text-muted py-10 text-center text-[13px]">Loading checklist…</p>
        ) : (
          <>
            {template.description ? (
              <p className="text-muted mb-3 px-1 text-[13px]">{template.description}</p>
            ) : null}

            <ToGoCard
              toGo={items.length - answeredCount}
              ready={ready}
              allAnswered={answeredCount === items.length}
              needNote={needNote}
              needPhoto={needPhoto}
              hint={hasCheckLines ? "Tap a line to check it off" : "Answer each line to finish"}
              score={template.passingScore !== null ? live.score : null}
              passingScore={template.passingScore}
              criticalFailure={live.criticalFailure}
            />

            <div className="mt-3 flex flex-col gap-3">
              {template.sections.map((section, index) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  number={index + 1}
                  done={answered(section)}
                  collapsed={Boolean(collapsed[section.id])}
                  onToggle={() => setCollapsed((prev) => ({ ...prev, [section.id]: !prev[section.id] }))}
                >
                  {section.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      subSpecs={template.subSpecs}
                      clientKey={clientKey}
                      answer={answers[item.id] ?? { itemId: item.id }}
                      onChange={(next) => setAnswer(item.id, next)}
                      showErrors={showErrors}
                    />
                  ))}
                </SectionCard>
              ))}
            </div>

            {template.subWeightWeek ? <WeightWeekPanel {...template.subWeightWeek} /> : null}

            <div className="mt-3 rounded-2xl border p-4 md:px-5" style={{ background: "var(--surface-raised)" }}>
              <label className="text-[14px] font-medium" htmlFor="submission-notes">
                Notes for this walk <span className="text-faint font-normal">(optional)</span>
              </label>
              <textarea
                id="submission-notes"
                value={notes}
                rows={3}
                onChange={(event) => {
                  setNotes(event.target.value);
                  persist(answers, event.target.value);
                }}
                placeholder="Anything the next shift or your DM should know"
                className="mt-1.5 w-full rounded-lg border bg-[var(--field)] px-3 py-2 outline-none focus:border-[var(--border-strong)]"
              />
            </div>

            {/*
              Said plainly on the screen where it happens. The browser's
              permission prompt discloses that location is being asked for but
              not what for, and a walk recorded with somebody's whereabouts
              should not be the first they hear of it.
            */}
            <p className="text-faint mt-4 px-1 text-[12px]">
              Submitting records where this device is, to show the walk was done at the store.
              Decline your browser&rsquo;s location request and the walk still submits without it.
            </p>
          </>
        )}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t"
        style={{
          background: "var(--surface-raised)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="mx-auto flex max-w-[52rem] items-center gap-4 px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1">
            {error ? (
              <p role="alert" className="mb-1.5 text-[13px] font-medium" style={{ color: "var(--fail)" }}>
                {error}
              </p>
            ) : showErrors && problems.length ? (
              <p role="status" className="mb-1.5 text-[13px] font-semibold" style={{ color: "var(--fail)" }}>
                {problems.length === 1 ? "1 line still needs you" : `${problems.length} lines still need you`}
              </p>
            ) : null}
            <p className="tabular truncate text-[14px] font-semibold">{statusLine}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${percent}%`, background: ready && percent === 100 ? "var(--pass)" : "var(--accent)" }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !restored}
            className="flex h-12 shrink-0 items-center gap-2 rounded-xl px-5 text-[16px] font-semibold transition-colors disabled:opacity-60"
            style={
              ready
                ? { background: "var(--accent)", color: "var(--accent-ink)" }
                : { background: "var(--surface-sunken)", color: "var(--text-faint)" }
            }
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </>
  );
}

function TitleSwitcher({ name, entries }: { name: string; entries: RunnerNav["today"] }) {
  const [open, setOpen] = useState(false);
  const others = entries.filter((entry) => !entry.current);
  const title = <h1 className="truncate text-[22px] leading-tight font-bold tracking-tight md:text-[28px]">{name}</h1>;
  if (!others.length) return <div className="pt-1.5">{title}</div>;

  return (
    <div className="pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex max-w-full items-center gap-2 text-left"
      >
        {title}
        <svg
          viewBox="0 0 24 24"
          className={cn("text-muted h-5 w-5 shrink-0 transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">Switch checklist</span>
      </button>

      {open ? (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full left-0 z-40 mt-1 w-full max-w-[24rem] overflow-hidden rounded-2xl border shadow-lg"
            style={{ background: "var(--surface-raised)" }}
          >
            <p className="eyebrow px-4 pt-3 pb-1.5">Today at this store</p>
            <ul>
              {entries.map((entry) => (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={() => setOpen(false)}
                    aria-current={entry.current ? "page" : undefined}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={entry.current ? { background: "var(--info-bg)" } : undefined}
                  >
                    <span
                      aria-hidden="true"
                      className="w-4 shrink-0 text-center text-[13px] font-bold"
                      style={{ color: entry.done ? "var(--pass)" : entry.overdue ? "var(--fail)" : "var(--text-faint)" }}
                    >
                      {entry.done ? "✓" : entry.overdue ? "●" : "○"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{entry.name}</span>
                      <span
                        className="block truncate text-[12px]"
                        style={{ color: entry.overdue ? "var(--fail)" : "var(--text-muted)" }}
                      >
                        {entry.detail}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MiniRing({ done, total }: { done: number; total: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  if (total && done >= total) {
    return (
      <span
        aria-hidden="true"
        className="flex h-4 w-4 items-center justify-center rounded-full"
        style={{ background: "var(--pass)", color: "var(--on-status)" }}
      >
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="4">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 -rotate-90" aria-hidden="true">
      <circle cx="8" cy="8" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.2" />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - (total ? done / total : 0))}
      />
    </svg>
  );
}

function ToGoCard({
  toGo,
  ready,
  allAnswered,
  needNote,
  needPhoto,
  hint,
  score,
  passingScore,
  criticalFailure,
}: {
  toGo: number;
  ready: boolean;
  allAnswered: boolean;
  needNote: number;
  needPhoto: number;
  hint: string;
  score: number | null;
  passingScore: number | null;
  criticalFailure: boolean;
}) {
  const done = ready && allAnswered;
  const headline = done
    ? "All done"
    : ready
      ? "Ready to submit"
      : toGo
        ? `${toGo} ${toGo === 1 ? "item" : "items"} to go`
        : "Almost there";
  const asks = [
    needNote ? `${needNote} ${needNote === 1 ? "needs" : "need"} a note` : null,
    needPhoto ? `${needPhoto} ${needPhoto === 1 ? "needs" : "need"} a photo` : null,
  ].filter(Boolean);
  const detail = done
    ? "Add a note for the next shift if there is one, then submit."
    : ready
      ? `${toGo} optional ${toGo === 1 ? "line" : "lines"} left — submit when you're ready.`
      : hint;

  return (
    <div
      className="flex items-center gap-3.5 rounded-2xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:px-5"
      style={{ background: "var(--surface-raised)" }}
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={done ? { background: "var(--pass-bg)", color: "var(--pass)" } : { background: "var(--warn-bg)", color: "var(--warn)" }}
      >
        {done ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="tabular text-[16px] font-semibold">{headline}</p>
        <p className="text-muted text-[13px]">
          {asks.length ? <span style={{ color: "var(--fail)" }}>{asks.join(" · ")}</span> : detail}
        </p>
        {criticalFailure ? (
          <p className="mt-0.5 text-[13px] font-medium" style={{ color: "var(--fail)" }}>
            ◆ A critical line failed — this walk fails whatever the score.
          </p>
        ) : null}
      </div>
      {score !== null ? (
        <div className="shrink-0 text-right">
          <p className="tabular text-[20px] leading-none font-bold" style={{ color: live(score, passingScore) }}>
            {score}%
          </p>
          <p className="text-faint mt-1 text-[11px]">
            score{passingScore !== null ? ` · pass ${passingScore}%` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

const live = (score: number, passing: number | null) =>
  passing === null ? "var(--text)" : score >= passing ? "var(--pass)" : "var(--fail)";

function SectionCard({
  section,
  number,
  done,
  collapsed,
  onToggle,
  children,
}: {
  section: RunnerSection;
  number: number;
  done: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const total = section.items.length;
  const complete = total > 0 && done >= total;
  // A section of nothing but readings lays out two to a row on a wide screen,
  // like the temp log: a fridge and a freezer side by side.
  const readings = section.items.every((item) => item.type === "TEMPERATURE" || item.type === "NUMBER");
  const bodyId = `section-body-${section.id}`;

  return (
    <section
      id={`section-${section.id}`}
      className="overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      style={{ background: "var(--surface-raised)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left md:px-5"
      >
        <span
          className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold"
          style={
            complete
              ? { background: "var(--pass)", color: "var(--on-status)" }
              : { background: "var(--surface-sunken)", color: "var(--text-muted)" }
          }
        >
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{section.title}</span>
          <span className="mt-1.5 flex items-center gap-3">
            <span className="h-1.5 w-full max-w-[13rem] overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
              <span
                className="block h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${total ? (done / total) * 100 : 0}%`,
                  background: complete ? "var(--pass)" : "var(--accent)",
                }}
              />
            </span>
            <span className="text-muted tabular shrink-0 text-[12px]">
              {done} of {total}
            </span>
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          className={cn("text-faint h-5 w-5 shrink-0 transition-transform", collapsed && "-rotate-90")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {collapsed ? null : (
        <div id={bodyId} className="border-t">
          {section.helpText ? (
            <p className="text-muted border-b px-4 py-2.5 text-[13px] md:px-5">{section.helpText}</p>
          ) : null}
          <div className={cn("runner-lines", readings && "runner-lines--grid")}>{children}</div>
        </div>
      )}
    </section>
  );
}

interface Problem {
  itemId: string;
  reason: "needs an answer" | "needs a note" | "needs a photo";
}

/** Mirrors the server's validation so a walk never queues only to be rejected. */
function findProblems(template: RunnerTemplate, answers: Record<string, OfflineAnswer>): Problem[] {
  const problems: Problem[] = [];

  for (const section of template.sections) {
    for (const item of section.items) {
      const answer = answers[item.id];

      if (item.required && (!answer || !isAnswered(answer, item.type))) {
        problems.push({ itemId: item.id, reason: "needs an answer" });
        continue;
      }
      if (!answer || answer.naFlag) continue;

      const failed =
        evaluateAnswer(
          {
            id: item.id,
            type: item.type,
            required: item.required,
            critical: item.critical,
            weight: item.weight,
            minValue: item.minValue,
            maxValue: item.maxValue,
            failingOptions: item.failingOptions,
          },
          answer,
        ) === false;

      if (failed && item.noteOnFail && !answer.note?.trim()) {
        problems.push({ itemId: item.id, reason: "needs a note" });
      } else if (failed && item.photoOnFail && !(answer.photoIds?.length ?? 0)) {
        problems.push({ itemId: item.id, reason: "needs a photo" });
      } else if (item.requirePhoto && !(answer.photoIds?.length ?? 0)) {
        problems.push({ itemId: item.id, reason: "needs a photo" });
      }
    }
  }

  return problems;
}

/** Best-effort geotag, resolved in the background; never blocks a submission. */
function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const done = (value: { latitude: number; longitude: number } | null) => resolve(value);
    const timer = setTimeout(() => done(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        done({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  });
}
