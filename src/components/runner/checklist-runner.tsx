"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/buttons";
import { Badge, Meter } from "@/components/ui";
import { cn } from "@/lib/cn";
import { evaluateAnswer, scoreSubmission, type ScorableItem } from "@/lib/scoring";
import { getDraft, saveDraft } from "@/lib/offline/db";
import { queueSubmission } from "@/lib/offline/sync";
import type { OfflineAnswer, OfflineDraft } from "@/lib/offline/types";
import type { RunnerContext, RunnerTemplate } from "@/lib/runner-types";
import { ItemCard, isAnswered } from "./item-card";

export function ChecklistRunner({
  template,
  context,
  clientKey,
}: {
  template: RunnerTemplate;
  context: RunnerContext;
  clientKey: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, OfflineAnswer>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => template.sections.flatMap((s) => s.items),
    [template],
  );

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
    () =>
      scoreSubmission(
        scorable,
        Object.values(answers),
        template.passingScore,
      ),
    [scorable, answers, template.passingScore],
  );

  const answeredCount = items.filter((i) => {
    const answer = answers[i.id];
    return answer && isAnswered(answer);
  }).length;

  const problems = useMemo(
    () => findProblems(template, answers),
    [template, answers],
  );

  const section = template.sections[sectionIndex];
  const isLastSection = sectionIndex === template.sections.length - 1;

  function goToSection(index: number) {
    setSectionIndex(index);
    setShowErrors(false);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit() {
    if (problems.length) {
      setShowErrors(true);
      const first = problems[0];
      const index = template.sections.findIndex((s) =>
        s.items.some((i) => i.id === first.itemId),
      );
      if (index >= 0 && index !== sectionIndex) setSectionIndex(index);
      setError(
        problems.length === 1
          ? "1 item still needs attention."
          : `${problems.length} items still need attention.`,
      );
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  if (!restored) {
    return <p className="text-muted py-10 text-center text-[13px]">Loading checklist…</p>;
  }

  return (
    <div ref={topRef} className="pb-32">
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="tabular text-[13px] font-medium">
            {answeredCount} of {items.length} answered
          </p>
          {live.score !== null ? (
            <Badge tone={live.passed ? "pass" : "fail"} className="tabular">
              Running score {live.score}%
            </Badge>
          ) : null}
        </div>
        <Meter
          value={items.length ? (answeredCount / items.length) * 100 : 0}
          tone={live.criticalFailure ? "fail" : "info"}
        />
      </div>

      {template.sections.length > 1 ? (
        <div className="mb-4 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {template.sections.map((s, index) => {
            const total = s.items.length;
            const done = s.items.filter((i) => {
              const answer = answers[i.id];
              return answer && isAnswered(answer);
            }).length;
            const failedHere = s.items.some(
              (i) =>
                answers[i.id] &&
                !answers[i.id].naFlag &&
                evaluateAnswer(
                  scorable.find((sc) => sc.id === i.id)!,
                  answers[i.id],
                ) === false,
            );
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goToSection(index)}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap",
                  index === sectionIndex && "border-transparent text-white",
                )}
                style={
                  index === sectionIndex
                    ? { background: "var(--info)" }
                    : {
                        background: "var(--surface-raised)",
                        color: failedHere ? "var(--fail)" : undefined,
                      }
                }
              >
                {s.title}{" "}
                <span className="tabular opacity-70">
                  {done}/{total}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {section ? (
        <section>
          <h2 className="mb-1 text-[15px] font-semibold tracking-tight">
            {section.title}
          </h2>
          {section.helpText ? (
            <p className="text-muted mb-3 text-[13px]">{section.helpText}</p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2.5">
            {section.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                clientKey={clientKey}
                answer={answers[item.id] ?? { itemId: item.id }}
                onChange={(next) => setAnswer(item.id, next)}
                showErrors={showErrors}
              />
            ))}
          </div>
        </section>
      ) : null}

      {isLastSection ? (
        <div className="surface mt-4 rounded-xl p-4">
          <label className="text-[13px] font-medium" htmlFor="submission-notes">
            Notes for this walk (optional)
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
            className="mt-1.5 w-full rounded-lg border bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--color-brand-500)]"
          />
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg px-3 py-2 text-[13px]"
          style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
        >
          {error}
        </p>
      ) : null}

      <div
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t px-4 py-3 md:pl-60"
        style={{
          background: "var(--surface-raised)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
        }}
      >
        <Button
          size="lg"
          onClick={() => goToSection(Math.max(0, sectionIndex - 1))}
          disabled={sectionIndex === 0 || submitting}
          className="min-w-24"
        >
          Back
        </Button>

        {isLastSection ? (
          <Button
            size="lg"
            variant="primary"
            className="flex-1"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit checklist"}
          </Button>
        ) : (
          <Button
            size="lg"
            variant="primary"
            className="flex-1"
            onClick={() => goToSection(sectionIndex + 1)}
          >
            Next section
          </Button>
        )}
      </div>
    </div>
  );
}

interface Problem {
  itemId: string;
  reason: string;
}

/** Mirrors the server's validation so a walk never queues only to be rejected. */
function findProblems(
  template: RunnerTemplate,
  answers: Record<string, OfflineAnswer>,
): Problem[] {
  const problems: Problem[] = [];

  for (const section of template.sections) {
    for (const item of section.items) {
      const answer = answers[item.id];

      if (item.required && (!answer || !isAnswered(answer))) {
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
    const done = (value: { latitude: number; longitude: number } | null) =>
      resolve(value);
    const timer = setTimeout(() => done(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        done({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  });
}
