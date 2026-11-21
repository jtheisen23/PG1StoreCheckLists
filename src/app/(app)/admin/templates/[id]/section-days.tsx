"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { usePreservedForm } from "@/components/preserve-form";
import { setSectionDays, type FormState } from "@/server/admin-service";
import { WEEK_ORDER, WEEKDAY_SHORT, describeWeekdays, normaliseDays } from "@/lib/weekdays";

/**
 * Seven toggles, Monday first. None ticked means every day — the common case —
 * so a section only needs touching when it is one day's focus.
 */
export function DayToggles({
  days,
  onChange,
}: {
  days: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days this section runs">
      {WEEK_ORDER.map((day) => {
        const on = days.includes(day);
        return (
          <label
            key={day}
            className="flex h-9 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-[13px] font-medium"
            style={on ? { background: "var(--info)", borderColor: "var(--info)", color: "var(--info-ink)" } : { background: "var(--field)" }}
          >
            <input
              type="checkbox"
              name="days"
              value={day}
              checked={on}
              onChange={() => onChange(on ? days.filter((d) => d !== day) : [...days, day])}
              className="sr-only"
            />
            {WEEKDAY_SHORT[day]}
          </label>
        );
      })}
    </div>
  );
}

function Save({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!dirty || pending}
      className="h-9 rounded-lg border px-3 text-[13px] font-medium disabled:opacity-50"
      style={{ background: "var(--surface-raised)" }}
    >
      {pending ? "Saving…" : "Save days"}
    </button>
  );
}

export function SectionDaysForm({ sectionId, days }: { sectionId: string; days: number[] }) {
  const [state, action] = useActionState<FormState, FormData>(setSectionDays, {});
  const form = usePreservedForm(state);
  const [chosen, setChosen] = useState(days);
  const dirty = normaliseDays(chosen).join() !== normaliseDays(days).join();

  return (
    <form {...form.props} action={action} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-3">
      <input type="hidden" name="sectionId" value={sectionId} />
      <span className="text-muted text-[13px]">
        Runs <span className="font-medium" style={{ color: "var(--text)" }}>{describeWeekdays(chosen).toLowerCase()}</span>
      </span>
      <DayToggles days={chosen} onChange={setChosen} />
      <Save dirty={dirty} />
      {state.error ? (
        <span className="text-[12px]" style={{ color: "var(--fail)" }}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
