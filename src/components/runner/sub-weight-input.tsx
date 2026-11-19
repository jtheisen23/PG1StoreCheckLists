"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { OfflineAnswer } from "@/lib/offline/types";
import type { RunnerSubSpec } from "@/lib/runner-types";
import {
  MAX_SUB_OZ,
  OVER_TOLERANCE_OZ,
  SUB_SIZES,
  SUB_SIZE_LABELS,
  acceptableRange,
  ceilingOz,
  verdictLine,
  verdictTone,
  weighSub,
  type Weighing,
} from "@/lib/sub-weight";

/**
 * Pick the sub, put it on the scale, type the number — and see at once
 * whether it is in range, with the acceptable band drawn around it. After
 * the PG1 weight log.
 *
 * Everything it needs arrived with the page, so it judges a weighing with no
 * network at all. The server re-judges against its own spec when the walk
 * arrives; this is the same rule, from the same module.
 */
export function SubWeightInput({
  answer,
  specs,
  label,
  update,
}: {
  answer: OfflineAnswer;
  specs: RunnerSubSpec[];
  /** The item's own label, e.g. "First sub", used as the picker's title. */
  label: string;
  update: (patch: Partial<OfflineAnswer>) => void;
}) {
  const [picking, setPicking] = useState(false);
  const weightRef = useRef<HTMLInputElement>(null);
  const chosen = specs.find((spec) => spec.id === answer.subSpecId) ?? null;

  if (!specs.length) {
    return (
      <p className="text-[13px]" style={{ color: "var(--warn)" }}>
        No sub specs are set up yet. An administrator adds them under Admin → Sub specs.
      </p>
    );
  }

  const weight = answer.numericValue;
  const weighing =
    chosen && weight !== null && weight !== undefined && !Number.isNaN(weight)
      ? weighSub(weight, chosen.specOz)
      : null;
  const tone = weighing ? verdictTone(weighing.verdict) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-2.5">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left"
          style={{ background: "var(--field)", borderColor: "var(--border-strong)" }}
        >
          <span className="min-w-0 flex-1">
            {chosen ? (
              <>
                <span className="block text-[15px] leading-snug font-semibold">{chosen.name}</span>
                <span className="text-muted block text-[12px]">
                  #{chosen.number} · {SUB_SIZE_LABELS[chosen.size]} ·{" "}
                  {chosen.specOz === null ? "no spec weight" : acceptableRange(chosen.specOz)}
                </span>
              </>
            ) : (
              <>
                <span className="text-faint block text-[15px] font-medium">Pick a sub</span>
                <span className="text-faint block text-[12px]">tap to choose</span>
              </>
            )}
          </span>
          <Chevron />
        </button>

        <label className="flex shrink-0 items-center gap-1.5">
          <input
            ref={weightRef}
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
            placeholder="oz"
            aria-label="Weight in ounces"
            className="tabular h-[60px] w-[5.5rem] rounded-xl border-2 text-center text-[24px] font-bold outline-none sm:w-[6.5rem] sm:text-[26px]"
            style={
              tone && tone !== "neutral"
                ? { background: `var(--${tone}-bg)`, borderColor: `var(--${tone})`, color: `var(--${tone})` }
                : { background: "var(--surface-sunken)", borderColor: "transparent" }
            }
          />
          <span className="text-muted text-[13px]">oz</span>
        </label>
      </div>

      {chosen && chosen.specOz !== null ? (
        <RangeBar specOz={chosen.specOz} weighing={weighing} weight={weight ?? null} />
      ) : null}

      {weighing ? <Verdict weighing={weighing} /> : null}

      {picking ? (
        <SubPicker
          title={label}
          specs={specs}
          chosenId={chosen?.id ?? null}
          onPick={(spec) => {
            update({ subSpecId: spec.id, specOz: spec.specOz });
            setPicking(false);
            // Straight to the number: the sub is on the scale already.
            setTimeout(() => weightRef.current?.focus(), 50);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Spec − 0.5 oz to spec + 1 oz, with the acceptable band shaded, a tick at
 * the floor, and the weighing as a dot. The picture of the rule: the band
 * starts at the spec, not around it.
 */
function RangeBar({
  specOz,
  weighing,
  weight,
}: {
  specOz: number;
  weighing: Weighing | null;
  weight: number | null;
}) {
  const low = specOz - OVER_TOLERANCE_OZ;
  const high = specOz + 2 * OVER_TOLERANCE_OZ;
  const at = (oz: number) => `${Math.max(0, Math.min(100, ((oz - low) / (high - low)) * 100))}%`;
  const tone = weighing ? verdictTone(weighing.verdict) : null;

  return (
    <div aria-hidden="true">
      <div className="relative h-2.5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: "var(--surface-sunken)" }} />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{
            left: at(specOz),
            width: `calc(${at(ceilingOz(specOz))} - ${at(specOz)})`,
            background: "color-mix(in srgb, var(--pass) 38%, transparent)",
          }}
        />
        <div className="absolute top-0 h-full w-px" style={{ left: at(specOz), background: "var(--text-faint)" }} />
        {weight !== null && tone ? (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{
              left: at(weight),
              background: `var(--${tone === "neutral" ? "text-faint" : tone})`,
              borderColor: "var(--surface-raised)",
            }}
          />
        ) : null}
      </div>
      <div className="tabular text-muted mt-1 flex justify-between text-[11px]">
        <span>{low.toFixed(2)}</span>
        <span>{acceptableRange(specOz, false)} ok</span>
        <span>{high.toFixed(2)}</span>
      </div>
    </div>
  );
}

/** The verdict with a shape beside it — dot, down, up — never colour alone. */
function Verdict({ weighing }: { weighing: Weighing }) {
  const tone = verdictTone(weighing.verdict);
  const shape =
    weighing.verdict === "ACCEPTABLE" ? "●" : weighing.verdict === "UNDER" ? "▼" : weighing.verdict === "OVER" ? "▲" : "–";
  return (
    <p
      role="status"
      className="flex items-center gap-2 text-[14px] font-semibold"
      style={{ color: tone === "neutral" ? "var(--text-muted)" : `var(--${tone})` }}
    >
      <span aria-hidden="true" className="text-[12px]">
        {shape}
      </span>
      {verdictLine(weighing)}
    </p>
  );
}

/** Every sub and size, each size showing its band. Search by name or number. */
function SubPicker({
  title,
  specs,
  chosenId,
  onPick,
  onClose,
}: {
  title: string;
  specs: RunnerSubSpec[];
  chosenId: string | null;
  onPick: (spec: RunnerSubSpec) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // A keyboard over the list on a phone hides what is being searched, so
    // only a pointer-driven device starts in the search box.
    if (window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const subs = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    const groups = new Map<string, { number: string; name: string; sizes: RunnerSubSpec[] }>();
    for (const spec of specs) {
      if (q && !spec.number.toLowerCase().startsWith(q) && !spec.name.toLowerCase().includes(q)) continue;
      const group = groups.get(spec.number) ?? { number: spec.number, name: spec.name, sizes: [] };
      group.sizes.push(spec);
      groups.set(spec.number, group);
    }
    return [...groups.values()];
  }, [specs, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      style={{ background: "rgba(27, 26, 22, 0.45)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title}: pick the sub`}
    >
      <div
        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl md:max-w-xl md:rounded-2xl"
        style={{ background: "var(--surface-raised)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 pt-2.5 pb-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: "var(--border-strong)" }} />
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[16px] font-bold tracking-tight">{title}</p>
            <button type="button" onClick={onClose} className="text-muted text-[13px] font-medium">
              Close
            </button>
          </div>
          <input
            ref={searchRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or number"
            className="h-11 w-full rounded-xl border-2 bg-[var(--field)] px-3.5 outline-none"
            style={{ borderColor: "var(--accent)" }}
          />
        </div>
        <ul className="flex-1 overflow-y-auto border-t pb-[env(safe-area-inset-bottom)]">
          {subs.length === 0 ? (
            <li className="text-muted px-4 py-6 text-center text-[13px]">No sub matches “{query}”.</li>
          ) : null}
          {subs.map((sub) => (
            <li key={sub.number} className="border-b px-4 py-3 last:border-b-0">
              <p className="mb-2 flex items-center gap-2">
                <span
                  className="tabular rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: "var(--surface-sunken)", color: "var(--text-muted)" }}
                >
                  #{sub.number}
                </span>
                <span className="text-[15px] font-semibold">{sub.name}</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SUB_SIZES.map((size) => {
                  const spec = sub.sizes.find((s) => s.size === size);
                  if (!spec) return <span key={size} />;
                  const active = spec.id === chosenId;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onPick(spec)}
                      aria-pressed={active}
                      className="rounded-xl border px-3 py-2 text-left"
                      style={
                        active
                          ? { background: "var(--info)", borderColor: "var(--info)", color: "var(--info-ink)" }
                          : { background: "var(--field)", borderColor: "var(--border-strong)" }
                      }
                    >
                      <span className="block text-[13px] font-semibold">{SUB_SIZE_LABELS[size]}</span>
                      <span
                        className="tabular block text-[12px]"
                        style={active ? undefined : { color: spec.specOz === null ? "var(--warn)" : "var(--text-muted)" }}
                      >
                        {spec.specOz === null ? "no spec" : acceptableRange(spec.specOz, false)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="text-faint h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
