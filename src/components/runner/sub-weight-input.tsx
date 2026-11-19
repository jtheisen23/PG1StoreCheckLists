"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { OfflineAnswer } from "@/lib/offline/types";
import type { RunnerSubSpec } from "@/lib/runner-types";
import {
  MAX_SUB_OZ,
  SUB_SIZES,
  SUB_SIZE_LABELS,
  acceptableRange,
  verdictText,
  weighSub,
  type SubSize,
} from "@/lib/sub-weight";

const inputClass =
  "h-11 w-full rounded-lg border bg-[var(--field)] px-3 outline-none focus:border-[var(--color-brand-500)]";

/**
 * Pick the sub, pick the size, type the weight — and see at once whether it is
 * acceptable, under or over. Built for a lunch rush: three taps and a number.
 *
 * Everything it needs arrived with the page, so it judges a weighing with no
 * network at all. The server re-judges against its own spec when the walk
 * arrives; this is the same rule, from the same module.
 */
export function SubWeightInput({
  answer,
  specs,
  update,
}: {
  answer: OfflineAnswer;
  specs: RunnerSubSpec[];
  update: (patch: Partial<OfflineAnswer>) => void;
}) {
  const chosen = specs.find((spec) => spec.id === answer.subSpecId) ?? null;
  // The sub is held here until a size is picked; the answer only ever names a
  // whole spec, so a half-made choice is never saved as one.
  const [number, setNumber] = useState<string>(chosen?.number ?? "");

  if (!specs.length) {
    return (
      <p className="text-[13px]" style={{ color: "var(--warn)" }}>
        No sub specs are set up yet. An administrator adds them under Admin → Sub specs.
      </p>
    );
  }

  const subs = [...new Map(specs.map((spec) => [spec.number, spec.name])).entries()];
  const sizes = SUB_SIZES.filter((size) =>
    specs.some((spec) => spec.number === number && spec.size === size),
  );

  const pick = (nextNumber: string, size: SubSize | null) => {
    const spec = size
      ? specs.find((candidate) => candidate.number === nextNumber && candidate.size === size)
      : undefined;
    update({ subSpecId: spec?.id ?? null, specOz: spec?.specOz ?? null });
  };

  const chooseSub = (nextNumber: string) => {
    setNumber(nextNumber);
    const available = SUB_SIZES.filter((size) =>
      specs.some((spec) => spec.number === nextNumber && spec.size === size),
    );
    // Keep the size across a change of sub when the new one comes in it;
    // a sub made in one size only needs no second tap.
    const keep = chosen && available.includes(chosen.size) ? chosen.size : null;
    pick(nextNumber, keep ?? (available.length === 1 ? available[0] : null));
  };

  const weight = answer.numericValue;
  const weighing =
    chosen && weight !== null && weight !== undefined && !Number.isNaN(weight)
      ? weighSub(weight, chosen.specOz)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <select
        value={number}
        onChange={(event) => chooseSub(event.target.value)}
        className={inputClass}
        aria-label="Which sub"
      >
        <option value="">Choose a sub…</option>
        {subs.map(([subNumber, name]) => (
          <option key={subNumber} value={subNumber}>
            #{subNumber} {name}
          </option>
        ))}
      </select>

      {number ? (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Size">
          {SUB_SIZES.map((size) => {
            const offered = sizes.includes(size);
            const active = chosen?.number === number && chosen.size === size;
            return (
              <button
                key={size}
                type="button"
                disabled={!offered}
                aria-pressed={active}
                onClick={() => pick(number, size)}
                className={cn(
                  "h-11 rounded-lg border text-[14px] font-semibold transition-colors disabled:opacity-35",
                  active && "text-[var(--info-ink)]",
                )}
                style={
                  active
                    ? { background: "var(--info)", borderColor: "var(--info)" }
                    : { background: "var(--field)" }
                }
              >
                {SUB_SIZE_LABELS[size]}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          max={MAX_SUB_OZ}
          value={weight ?? ""}
          onChange={(event) =>
            update({
              numericValue: event.target.value === "" ? null : Number(event.target.value),
            })
          }
          placeholder="Weight"
          aria-label="Weight in ounces"
          className={inputClass}
        />
        <span className="text-muted shrink-0 text-[14px] font-medium">oz</span>
      </div>

      {chosen ? (
        <p className="text-muted text-[12px]">
          {chosen.specOz === null
            ? "No spec weight set for this sub yet."
            : `Spec ${acceptableRange(chosen.specOz)} — never under ${chosen.specOz.toFixed(1)}.`}
        </p>
      ) : null}

      {weighing ? <Verdict weighing={weighing} /> : null}
    </div>
  );
}

/** Said in words with a shape beside it, never by colour alone. */
function Verdict({ weighing }: { weighing: ReturnType<typeof weighSub> }) {
  const tone =
    weighing.verdict === "ACCEPTABLE" ? "pass" : weighing.verdict === "UNSCORED" ? null : "fail";
  const icon =
    weighing.verdict === "ACCEPTABLE"
      ? "M5 12.5l4.5 4.5L19 7.5"
      : weighing.verdict === "UNDER"
        ? "M12 5v14M6 13l6 6 6-6"
        : weighing.verdict === "OVER"
          ? "M12 19V5M6 11l6-6 6 6"
          : "M6 12h12";
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[15px] font-semibold"
      style={
        tone
          ? { color: `var(--${tone})`, background: `var(--${tone}-bg)` }
          : { color: "var(--text-muted)", background: "var(--surface-sunken)" }
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icon} />
      </svg>
      {verdictText(weighing)}
    </p>
  );
}
