"use client";

import { cn } from "@/lib/cn";
import { evaluateAnswer } from "@/lib/scoring";
import type { RunnerItem } from "@/lib/runner-types";
import type { OfflineAnswer } from "@/lib/offline/types";
import { PhotoInput } from "./photo-input";

const inputClass =
  "h-11 w-full rounded-lg border bg-[var(--surface)] px-3 outline-none focus:border-[var(--color-brand-500)]";

export function ItemCard({
  item,
  answer,
  clientKey,
  onChange,
  showErrors,
}: {
  item: RunnerItem;
  answer: OfflineAnswer;
  clientKey: string;
  onChange: (next: OfflineAnswer) => void;
  showErrors: boolean;
}) {
  const passed = answer.naFlag
    ? null
    : evaluateAnswer(
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
      );

  const failed = passed === false;
  const needsNote = failed && item.noteOnFail && !answer.note?.trim();
  const needsPhoto =
    (failed && item.photoOnFail && !(answer.photoIds?.length ?? 0)) ||
    (item.requirePhoto && !(answer.photoIds?.length ?? 0));
  const unanswered = item.required && !isAnswered(answer);

  const update = (patch: Partial<OfflineAnswer>) =>
    onChange({ ...answer, ...patch, itemId: item.id });

  return (
    <div
      className={cn(
        "surface rounded-xl p-4 transition-colors",
        failed && "border-[var(--fail)]",
      )}
      style={failed ? { background: "var(--fail-bg)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] leading-snug font-medium">
            {item.label}
            {item.critical ? (
              <span
                className="ml-1.5 align-middle text-[11px] font-semibold"
                style={{ color: "var(--fail)" }}
                title="Critical item — failing this fails the whole checklist"
              >
                CRITICAL
              </span>
            ) : null}
            {item.required ? null : (
              <span className="text-faint ml-1.5 text-[12px]">optional</span>
            )}
          </p>
          {item.helpText ? (
            <p className="text-muted mt-1 text-[12px]">{item.helpText}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() =>
            update({
              naFlag: !answer.naFlag,
              ...(answer.naFlag
                ? {}
                : { boolValue: null, numericValue: null, value: null, selected: [] }),
            })
          }
          className={cn(
            "shrink-0 rounded-md px-2 py-1 text-[12px] font-medium",
            answer.naFlag ? "text-white" : "text-muted",
          )}
          style={{
            background: answer.naFlag ? "var(--text-muted)" : "var(--surface-sunken)",
          }}
        >
          N/A
        </button>
      </div>

      {answer.naFlag ? null : (
        <div className="mt-3">
          <AnswerInput item={item} answer={answer} update={update} />
        </div>
      )}

      {failed || answer.note ? (
        <textarea
          value={answer.note ?? ""}
          onChange={(event) => update({ note: event.target.value })}
          rows={2}
          placeholder={
            item.noteOnFail && failed
              ? "Required: what went wrong and what you did about it"
              : "Add a note (optional)"
          }
          className="mt-2.5 w-full rounded-lg border bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--color-brand-500)]"
          style={
            showErrors && needsNote ? { borderColor: "var(--fail)" } : undefined
          }
        />
      ) : null}

      {!answer.naFlag && (item.requirePhoto || failed || (answer.photoIds?.length ?? 0) > 0) ? (
        <PhotoInput
          clientKey={clientKey}
          itemId={item.id}
          photoIds={answer.photoIds ?? []}
          onChange={(ids) => update({ photoIds: ids })}
          required={showErrors && needsPhoto}
        />
      ) : null}

      {showErrors && (unanswered || needsNote || needsPhoto) ? (
        <p className="mt-2 text-[12px] font-medium" style={{ color: "var(--fail)" }}>
          {unanswered
            ? "This item needs an answer."
            : needsNote
              ? "A note is required for a failed item."
              : "A photo is required."}
        </p>
      ) : null}
    </div>
  );
}

function AnswerInput({
  item,
  answer,
  update,
}: {
  item: RunnerItem;
  answer: OfflineAnswer;
  update: (patch: Partial<OfflineAnswer>) => void;
}) {
  switch (item.type) {
    case "CHECKBOX":
    case "PASS_FAIL": {
      const yes = item.type === "CHECKBOX" ? "Done" : "Pass";
      const no = item.type === "CHECKBOX" ? "Not done" : "Fail";
      return (
        <div className="grid grid-cols-2 gap-2">
          <ToggleButton
            label={yes}
            tone="pass"
            active={answer.boolValue === true}
            onClick={() => update({ boolValue: true })}
          />
          <ToggleButton
            label={no}
            tone="fail"
            active={answer.boolValue === false}
            onClick={() => update({ boolValue: false })}
          />
        </div>
      );
    }

    case "TEMPERATURE":
    case "NUMBER": {
      const range =
        item.minValue !== null && item.maxValue !== null
          ? `${item.minValue}–${item.maxValue}`
          : item.minValue !== null
            ? `min ${item.minValue}`
            : item.maxValue !== null
              ? `max ${item.maxValue}`
              : null;
      return (
        <div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={answer.numericValue ?? ""}
              onChange={(event) =>
                update({
                  numericValue:
                    event.target.value === "" ? null : Number(event.target.value),
                })
              }
              placeholder={item.type === "TEMPERATURE" ? "Reading" : "Value"}
              className={cn(inputClass, "max-w-[10rem] tabular")}
            />
            {item.unit ? (
              <span className="text-muted text-[13px]">{item.unit}</span>
            ) : null}
          </div>
          {range ? (
            <p className="text-faint mt-1 text-[12px]">
              Acceptable range: {range}
              {item.unit ? ` ${item.unit}` : ""}
            </p>
          ) : null}
        </div>
      );
    }

    case "RATING":
      return (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update({ numericValue: n })}
              className={cn(
                "tabular h-11 flex-1 rounded-lg border text-[15px] font-medium",
                answer.numericValue === n && "text-white",
              )}
              style={
                answer.numericValue === n
                  ? { background: "var(--info)", borderColor: "var(--info)" }
                  : { background: "var(--surface)" }
              }
            >
              {n}
            </button>
          ))}
        </div>
      );

    case "SELECT":
      return (
        <div className="flex flex-wrap gap-2">
          {item.options.map((option) => {
            const active = answer.selected?.[0] === option;
            const failing = item.failingOptions.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => update({ selected: [option] })}
                className={cn(
                  "h-10 rounded-lg border px-3.5 text-[13px] font-medium",
                  active && "text-white",
                )}
                style={
                  active
                    ? {
                        background: failing ? "var(--fail)" : "var(--pass)",
                        borderColor: failing ? "var(--fail)" : "var(--pass)",
                      }
                    : { background: "var(--surface)" }
                }
              >
                {option}
              </button>
            );
          })}
        </div>
      );

    case "MULTISELECT":
      return (
        <div className="flex flex-wrap gap-2">
          {item.options.map((option) => {
            const selected = answer.selected ?? [];
            const active = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() =>
                  update({
                    selected: active
                      ? selected.filter((s) => s !== option)
                      : [...selected, option],
                  })
                }
                className={cn(
                  "h-10 rounded-lg border px-3.5 text-[13px] font-medium",
                  active && "text-white",
                )}
                style={
                  active
                    ? { background: "var(--info)", borderColor: "var(--info)" }
                    : { background: "var(--surface)" }
                }
              >
                {option}
              </button>
            );
          })}
        </div>
      );

    case "SIGNATURE":
      return (
        <input
          type="text"
          value={answer.value ?? ""}
          onChange={(event) => update({ value: event.target.value })}
          placeholder="Type your full name to sign"
          className={inputClass}
        />
      );

    case "PHOTO":
      return (
        <p className="text-muted text-[12px]">Attach a photo below.</p>
      );

    case "TEXT":
    default:
      return (
        <textarea
          value={answer.value ?? ""}
          onChange={(event) => update({ value: event.target.value })}
          rows={3}
          placeholder="Your answer"
          className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--color-brand-500)]"
        />
      );
  }
}

function ToggleButton({
  label,
  tone,
  active,
  onClick,
}: {
  label: string;
  tone: "pass" | "fail";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-12 rounded-lg border text-[14px] font-semibold transition-colors",
        active && "text-white",
      )}
      style={
        active
          ? { background: `var(--${tone})`, borderColor: `var(--${tone})` }
          : { background: "var(--surface)" }
      }
    >
      {label}
    </button>
  );
}

export function isAnswered(answer: OfflineAnswer): boolean {
  if (answer.naFlag) return true;
  if (answer.boolValue !== null && answer.boolValue !== undefined) return true;
  if (answer.numericValue !== null && answer.numericValue !== undefined) return true;
  if (answer.value?.trim()) return true;
  if (answer.selected?.length) return true;
  if (answer.photoIds?.length) return true;
  return false;
}
