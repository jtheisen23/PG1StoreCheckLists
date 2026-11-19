"use client";

import type { RunnerItem } from "@/lib/runner-types";
import type { OfflineAnswer } from "@/lib/offline/types";
import { describeReading, positionOn, rangeLabel, readingScale, tickLabel } from "@/lib/reading";

/**
 * A temperature, or any number with limits, as the PG1 temp log draws it: the
 * name and its band on the left, the reading in a big box on the right tinted
 * by the result, and under it a bar with the band shaded and the reading
 * marked — so "48" reads as "well out" before anyone does the sum.
 */
export function ReadingInput({
  item,
  answer,
  update,
  more,
}: {
  item: RunnerItem;
  answer: OfflineAnswer;
  update: (patch: Partial<OfflineAnswer>) => void;
  /** The row's "⋯" button, kept in the same place on every kind of line. */
  more: React.ReactNode;
}) {
  const value = answer.naFlag ? null : answer.numericValue;
  const verdict = describeReading(value, item.minValue, item.maxValue, item.unit);
  const scale = readingScale(item.minValue, item.maxValue);
  const range = rangeLabel(item.minValue, item.maxValue, item.unit);
  const tone = verdict ? (verdict.inRange ? "pass" : "fail") : null;
  const hasValue = value !== null && value !== undefined && !Number.isNaN(value);

  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-[16px] leading-snug font-medium">
            {item.label}
            {item.critical ? (
              <span
                className="ml-2 align-[1px] text-[10px] font-bold tracking-wider whitespace-nowrap uppercase"
                style={{ color: "var(--fail)" }}
                title="Critical — failing this fails the whole checklist"
              >
                ◆ Critical
              </span>
            ) : null}
            {item.required ? null : <span className="text-faint ml-2 text-[12px] font-normal">optional</span>}
          </p>
          {range ? <p className="text-muted tabular mt-0.5 text-[13px]">{range}</p> : null}
          {item.helpText ? <p className="text-muted mt-0.5 text-[13px]">{item.helpText}</p> : null}
        </div>

        {answer.naFlag ? null : (
          <label className="flex shrink-0 items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={value ?? ""}
              onChange={(event) =>
                update({ numericValue: event.target.value === "" ? null : Number(event.target.value) })
              }
              placeholder="––"
              aria-label={`${item.label}${item.unit ? ` in ${item.unit}` : ""}`}
              className="tabular h-[60px] w-[5.5rem] rounded-xl border-2 text-center text-[24px] font-bold outline-none sm:w-[6.5rem] sm:text-[26px]"
              style={
                tone
                  ? { background: `var(--${tone}-bg)`, borderColor: `var(--${tone})`, color: `var(--${tone})` }
                  : { background: "var(--field)", borderColor: "var(--border)" }
              }
            />
            {item.unit ? <span className="text-muted w-6 text-[13px]">{item.unit}</span> : null}
          </label>
        )}
        {more}
      </div>

      {hasValue && scale ? (
        <div className="mt-3" aria-hidden="true">
          <div className="relative h-2 rounded-full" style={{ background: "var(--surface-sunken)" }}>
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${positionOn(scale, item.minValue!)}%`,
                right: `${100 - positionOn(scale, item.maxValue!)}%`,
                background: "var(--pass-bg)",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--pass) 35%, transparent)",
              }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{
                left: `${positionOn(scale, value!)}%`,
                background: `var(--${tone})`,
                borderColor: "var(--surface-raised)",
              }}
            />
          </div>
          <div className="text-faint tabular mt-1 flex justify-between text-[12px]">
            <span>{tickLabel(scale.lo, item.unit)}</span>
            <span>{tickLabel(scale.hi, item.unit)}</span>
          </div>
        </div>
      ) : null}

      {verdict ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: `var(--${tone})` }}>
          <span aria-hidden="true">{verdict.inRange ? "✓" : "●"}</span>
          {verdict.text}
          {!verdict.inRange && item.actionOnFail ? <span className="font-normal"> — raises an action</span> : null}
        </p>
      ) : null}
    </div>
  );
}
