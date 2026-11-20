"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import { evaluateAnswer } from "@/lib/scoring";
import type { RunnerItem, RunnerSubSpec } from "@/lib/runner-types";
import type { OfflineAnswer } from "@/lib/offline/types";
import { weighSub, weighingComplete } from "@/lib/sub-weight";
import { PhotoInput } from "./photo-input";
import { ReadingInput } from "./reading-input";
import { SubWeightInput } from "./sub-weight-input";

const fieldClass =
  "w-full rounded-lg border bg-[var(--field)] px-3 outline-none focus:border-[var(--border-strong)]";

/** Everything an answer is cleared of when the line is marked not applicable. */
const CLEARED = {
  boolValue: null,
  numericValue: null,
  value: null,
  selected: [],
  subSpecId: null,
  specOz: null,
} satisfies Partial<OfflineAnswer>;

/**
 * One line of a walk, in the PG1 layout: a row in its section's card rather
 * than a card of its own. A checkbox line is checked off with one tap anywhere
 * on it; everything that is not the common case — not done, not applicable, a
 * note, a photo — waits behind the "⋯" so a 47-line opening checklist reads
 * as 47 lines, not 47 forms.
 */
export function ItemRow({
  item,
  answer,
  clientKey,
  onChange,
  showErrors,
  subSpecs,
}: {
  item: RunnerItem;
  answer: OfflineAnswer;
  clientKey: string;
  onChange: (next: OfflineAnswer) => void;
  showErrors: boolean;
  /** The subs a SUB_WEIGHT item can be told about. */
  subSpecs?: RunnerSubSpec[];
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

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
  const weighing =
    item.type === "SUB_WEIGHT" && answer.numericValue != null
      ? weighSub(answer.numericValue, answer.specOz ?? null).verdict
      : null;
  // Over is a different kind of wrong from under: amber, not red.
  const tone = failed && weighing === "OVER" ? "warn" : "fail";
  const photoCount = answer.photoIds?.length ?? 0;
  const needsNote = failed && item.noteOnFail && !answer.note?.trim();
  const needsPhoto = (failed && item.photoOnFail && !photoCount) || (item.requirePhoto && !photoCount);
  const unanswered = item.required && !isAnswered(answer, item.type);
  const flagged = showErrors && (unanswered || needsNote || needsPhoto);

  const update = (patch: Partial<OfflineAnswer>) => onChange({ ...answer, ...patch, itemId: item.id });
  const toggleNa = () => {
    update(answer.naFlag ? { naFlag: false } : { naFlag: true, ...CLEARED });
    setMoreOpen(false);
  };

  const photoBox = item.type === "PHOTO" || item.requirePhoto;
  const showPhoto = !answer.naFlag && (photoBox || failed || photoCount > 0 || photoOpen);
  const showNote = !failed && (noteOpen || Boolean(answer.note));

  const more = (
    <MoreButton
      open={moreOpen}
      onClick={() => setMoreOpen((open) => !open)}
      label={`More for “${item.label}”`}
    />
  );

  return (
    <div
      id={`item-${item.id}`}
      data-wide={failed || moreOpen || showNote || (showPhoto && !photoBox) ? "" : undefined}
      className="px-4 py-3.5 md:px-5"
      style={
        flagged
          ? { boxShadow: "inset 3px 0 0 var(--fail), 0 1px 0 var(--border), 1px 0 0 var(--border)" }
          : undefined
      }
    >
      {item.type === "CHECKBOX" ? (
        <div className="flex items-start gap-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={answer.boolValue === true}
            onClick={() =>
              update(
                answer.boolValue === true ? { boolValue: null } : { boolValue: true, naFlag: false },
              )
            }
            className="flex min-h-9 min-w-0 flex-1 items-start gap-3.5 text-left"
          >
            <CheckBox state={answer.naFlag ? "na" : answer.boolValue === true ? "done" : answer.boolValue === false ? "not-done" : "open"} />
            <Label item={item} answer={answer} dim={answer.boolValue === true || Boolean(answer.naFlag)} />
          </button>
          {more}
        </div>
      ) : item.type === "TEMPERATURE" || item.type === "NUMBER" ? (
        <ReadingInput item={item} answer={answer} update={update} more={more} />
      ) : (
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <Label item={item} answer={answer} dim={Boolean(answer.naFlag)} className="sm:flex-1" />
            {item.type === "PASS_FAIL" && !answer.naFlag ? (
              <PassFail item={item} answer={answer} update={update} />
            ) : null}
          </div>
          {more}
        </div>
      )}

      {answer.naFlag ? (
        <p className="text-muted mt-2 flex items-center gap-2 text-[13px]">
          <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "var(--surface-sunken)" }}>
            N/A
          </span>
          Marked not applicable
          <button type="button" onClick={toggleNa} className="font-medium underline underline-offset-2">
            Undo
          </button>
        </p>
      ) : item.type !== "CHECKBOX" && item.type !== "PASS_FAIL" && item.type !== "TEMPERATURE" && item.type !== "NUMBER" ? (
        <div className="mt-3">
          <AnswerInput item={item} answer={answer} update={update} subSpecs={subSpecs} />
        </div>
      ) : null}

      {moreOpen ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.type === "CHECKBOX" ? (
            <Chip
              active={answer.boolValue === false}
              onClick={() => {
                update(answer.boolValue === false ? { boolValue: null } : { boolValue: false, naFlag: false });
                setMoreOpen(false);
              }}
            >
              ✕ Not done
            </Chip>
          ) : null}
          <Chip active={Boolean(answer.naFlag)} onClick={toggleNa}>
            N/A
          </Chip>
          {!failed ? (
            <Chip
              active={showNote}
              onClick={() => {
                setNoteOpen(true);
                setMoreOpen(false);
              }}
            >
              Add a note
            </Chip>
          ) : null}
          {!answer.naFlag && !showPhoto ? (
            <Chip
              onClick={() => {
                setPhotoOpen(true);
                setMoreOpen(false);
              }}
            >
              Add a photo
            </Chip>
          ) : null}
        </div>
      ) : null}

      {failed ? (
        <div className="mt-3 rounded-xl p-3.5" style={{ background: `var(--${tone}-bg)` }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[14px] font-semibold" style={{ color: `var(--${tone})` }}>
              {failTitle(item, answer, weighing)}
            </p>
            <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: `var(--${tone})` }}>
              {item.noteOnFail ? "Required" : "Optional"}
            </span>
          </div>
          <textarea
            value={answer.note ?? ""}
            onChange={(event) => update({ note: event.target.value })}
            rows={2}
            placeholder="What you found, and the action you took"
            className={cn(fieldClass, "mt-2 py-2")}
            style={showErrors && needsNote ? { borderColor: "var(--fail)" } : { borderColor: `var(--${tone})` }}
          />
          {item.actionOnFail ? (
            <p className="mt-1.5 text-[12px]" style={{ color: `var(--${tone})` }}>
              Raises a corrective action for the store{item.critical ? ", due within 4 hours" : ""}.
            </p>
          ) : null}
        </div>
      ) : showNote ? (
        <textarea
          value={answer.note ?? ""}
          onChange={(event) => update({ note: event.target.value })}
          rows={2}
          autoFocus={noteOpen && !answer.note}
          placeholder="Add a note"
          className={cn(fieldClass, "mt-3 py-2")}
        />
      ) : null}

      {/*
        A PHOTO item is one whose answer *is* the photo, so it always offers the
        camera. Everything else offers it when the item demands one, when the
        answer failed and a picture is worth having, when one is already
        attached, or when someone asked for it from the "⋯".
      */}
      {showPhoto ? (
        <PhotoInput
          clientKey={clientKey}
          itemId={item.id}
          photoIds={answer.photoIds ?? []}
          onChange={(ids) => update({ photoIds: ids })}
          required={showErrors && needsPhoto}
          box={photoBox}
        />
      ) : null}

      {flagged ? (
        <p className="mt-2 text-[12px] font-medium" style={{ color: "var(--fail)" }}>
          {unanswered
            ? "This line needs an answer."
            : needsNote
              ? "Say what you found and what you did."
              : "This line needs a photo."}
        </p>
      ) : null}
    </div>
  );
}

function failTitle(item: RunnerItem, answer: OfflineAnswer, weighing: string | null): string {
  switch (item.type) {
    case "CHECKBOX":
      return "Not done — what happened?";
    case "PASS_FAIL":
      return item.label.trim().endsWith("?") ? "Answered no — what did you do?" : "Failed — what did you do?";
    case "TEMPERATURE":
    case "NUMBER":
      return "Out of range — what did you do?";
    case "SUB_WEIGHT":
      return weighing === "OVER" ? "Overweight — what did you do?" : "Underweight — what did you do?";
    default:
      return `${answer.selected?.[0] ?? "Below standard"} — what did you do?`;
  }
}

function Label({
  item,
  answer,
  dim,
  className,
}: {
  item: RunnerItem;
  answer: OfflineAnswer;
  dim?: boolean;
  className?: string;
}) {
  // The asterisk means "will not submit without a photo", so an optional
  // photo line does not get one.
  const photoRequired = item.requirePhoto || (item.type === "PHOTO" && item.required);
  return (
    <span className={cn("block min-w-0 pt-[3px]", className)}>
      <span className={cn("text-[15px] leading-snug", dim && "text-muted")}>
        {item.label}
        {photoRequired && !answer.naFlag ? (
          <span className="ml-1 font-semibold" style={{ color: "var(--fail)" }} title="A photo is required">
            *
          </span>
        ) : null}
      </span>
      {item.critical ? (
        <span
          className="ml-2 align-[1px] text-[10px] font-bold tracking-wider whitespace-nowrap uppercase"
          style={{ color: "var(--fail)" }}
          title="Critical — failing this fails the whole checklist"
        >
          ◆ Critical
        </span>
      ) : null}
      {item.required ? null : <span className="text-faint ml-2 text-[12px]">optional</span>}
      {item.helpText ? <span className="text-muted mt-0.5 block text-[13px]">{item.helpText}</span> : null}
    </span>
  );
}

function CheckBox({ state }: { state: "open" | "done" | "not-done" | "na" }) {
  const filled =
    state === "done"
      ? { background: "var(--pass)", borderColor: "var(--pass)", color: "var(--on-status)" }
      : state === "not-done"
        ? { background: "var(--fail)", borderColor: "var(--fail)", color: "var(--on-status)" }
        : state === "na"
          ? { background: "var(--surface-sunken)", borderColor: "var(--border-strong)", color: "var(--text-muted)" }
          : { background: "var(--field)", borderColor: "var(--border-strong)" };
  return (
    <span
      aria-hidden="true"
      className="mt-px flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors"
      style={filled}
    >
      {state === "done" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.2">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : state === "not-done" ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      ) : state === "na" ? (
        <span className="text-[13px] font-bold">–</span>
      ) : null}
    </span>
  );
}

function MoreButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      className="text-faint -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      style={open ? { background: "var(--surface-sunken)", color: "var(--text)" } : undefined}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <circle cx="5.5" cy="12" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="18.5" cy="12" r="1.7" />
      </svg>
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="h-9 rounded-full border px-3.5 text-[13px] font-medium"
      style={
        active
          ? { background: "var(--info)", borderColor: "var(--info)", color: "var(--info-ink)" }
          : { background: "var(--field)" }
      }
    >
      {children}
    </button>
  );
}

function PassFail({
  item,
  answer,
  update,
}: {
  item: RunnerItem;
  answer: OfflineAnswer;
  update: (patch: Partial<OfflineAnswer>) => void;
}) {
  // Audit checklists are written as questions — "Is the open sign on?" is
  // answered yes or no, not passed or failed. The wording follows the item so
  // the buttons read as an answer to what was actually asked.
  const asked = item.label.trim().endsWith("?");
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-52">
      <ToggleButton
        label={asked ? "Yes" : "Pass"}
        mark="✓"
        tone="pass"
        active={answer.boolValue === true}
        onClick={() => update({ boolValue: answer.boolValue === true ? null : true })}
      />
      <ToggleButton
        label={asked ? "No" : "Fail"}
        mark="✕"
        tone="fail"
        active={answer.boolValue === false}
        onClick={() => update({ boolValue: answer.boolValue === false ? null : false })}
      />
    </div>
  );
}

function AnswerInput({
  item,
  answer,
  update,
  subSpecs,
}: {
  item: RunnerItem;
  answer: OfflineAnswer;
  update: (patch: Partial<OfflineAnswer>) => void;
  subSpecs?: RunnerSubSpec[];
}) {
  switch (item.type) {
    case "SUB_WEIGHT":
      return <SubWeightInput answer={answer} specs={subSpecs ?? []} label={item.label} update={update} />;

    case "RATING":
      return (
        <div className="flex gap-2 sm:max-w-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update({ numericValue: n })}
              aria-pressed={answer.numericValue === n}
              className="tabular h-11 flex-1 rounded-lg border text-[15px] font-medium"
              style={
                answer.numericValue === n
                  ? { background: "var(--info)", borderColor: "var(--info)", color: "var(--info-ink)" }
                  : { background: "var(--field)" }
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
                aria-pressed={active}
                className="h-11 rounded-lg border px-4 text-[14px] font-medium"
                style={
                  active
                    ? {
                        background: failing ? "var(--fail)" : "var(--pass)",
                        borderColor: failing ? "var(--fail)" : "var(--pass)",
                        color: "var(--on-status)",
                      }
                    : { background: "var(--field)" }
                }
              >
                {active ? (failing ? "✕ " : "✓ ") : ""}
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
                  update({ selected: active ? selected.filter((s) => s !== option) : [...selected, option] })
                }
                aria-pressed={active}
                className="h-11 rounded-lg border px-4 text-[14px] font-medium"
                style={
                  active
                    ? { background: "var(--info)", borderColor: "var(--info)", color: "var(--info-ink)" }
                    : { background: "var(--field)" }
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
          className={cn(fieldClass, "h-11")}
        />
      );

    case "PHOTO":
      // The camera box follows immediately below.
      return null;

    case "TEXT":
    default:
      return (
        <textarea
          value={answer.value ?? ""}
          onChange={(event) => update({ value: event.target.value })}
          rows={3}
          placeholder="Your answer"
          className={cn(fieldClass, "py-2")}
        />
      );
  }
}

function ToggleButton({
  label,
  mark,
  tone,
  active,
  onClick,
}: {
  label: string;
  mark: string;
  tone: "pass" | "fail";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="h-11 rounded-lg border text-[14px] font-semibold transition-colors"
      style={
        active
          ? { background: `var(--${tone})`, borderColor: `var(--${tone})`, color: "var(--on-status)" }
          : { background: "var(--field)" }
      }
    >
      <span aria-hidden="true" className="mr-1.5">
        {mark}
      </span>
      {label}
    </button>
  );
}

export function isAnswered(answer: OfflineAnswer, type?: RunnerItem["type"]): boolean {
  if (answer.naFlag) return true;
  // A weight without the sub it belongs to is half an answer.
  if (type === "SUB_WEIGHT") return weighingComplete(answer);
  if (answer.boolValue !== null && answer.boolValue !== undefined) return true;
  if (answer.numericValue !== null && answer.numericValue !== undefined) return true;
  if (answer.value?.trim()) return true;
  if (answer.selected?.length) return true;
  if (answer.photoIds?.length) return true;
  return false;
}
