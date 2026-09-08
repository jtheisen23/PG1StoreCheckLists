"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { Daypart } from "@prisma/client";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { DAY_NAMES, DAYPART_LABELS } from "@/lib/labels";
import { createSchedule, updateSchedule, type FormState } from "@/server/admin-service";
import { usePreservedForm } from "@/components/preserve-form";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 outline-none focus:border-[var(--color-brand-500)]";

export interface LocationRow {
  id: string;
  name: string;
  code: string;
  district: { name: string };
}

export interface EditableSchedule {
  id: string;
  templateName: string;
  name: string;
  daypart: Daypart;
  startTime: string;
  dueTime: string;
  daysOfWeek: number[];
  locationIds: string[];
}

/** The cadences people actually mean, rather than seven separate tick boxes. */
const CADENCES: { label: string; days: number[] }[] = [
  { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [0, 6] },
];

function Submit({ disabled, editing }: { disabled: boolean; editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending || disabled}>
      {pending
        ? editing
          ? "Saving…"
          : "Creating…"
        : editing
          ? "Save changes"
          : "Create schedule"}
    </Button>
  );
}

/**
 * One form for both making a schedule and changing one. A schedule that cannot
 * be corrected after the fact is a schedule people work around by making a
 * second one, and then nobody can tell which is authoritative.
 */
export function ScheduleForm({
  templates,
  locations,
  schedule,
}: {
  templates: { id: string; name: string }[];
  locations: LocationRow[];
  /** Present when editing; absent when creating. */
  schedule?: EditableSchedule;
}) {
  const editing = Boolean(schedule);
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>(schedule?.locationIds ?? []);
  const [days, setDays] = useState<number[]>(schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
  const [search, setSearch] = useState("");

  const [state, formAction] = useActionState<FormState, FormData>(
    editing ? updateSchedule : createSchedule,
    {},
  );
  const form = usePreservedForm(state);

  const visible = locations.filter((location) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      location.name.toLowerCase().includes(query) ||
      location.code.toLowerCase().includes(query) ||
      location.district.name.toLowerCase().includes(query)
    );
  });
  const allVisibleSelected =
    visible.length > 0 && visible.every((l) => selected.includes(l.id));

  if (!editing && templates.length === 0) {
    return (
      <Card as="section" className="h-fit">
        <CardHeader title="New schedule" />
        <p className="text-muted px-5 py-4 text-[13px]">
          Publish a checklist first — only published checklists can be scheduled.
        </p>
      </Card>
    );
  }

  return (
    <Card as="section" className="h-fit">
      <CardHeader
        title={editing ? "Edit schedule" : "New schedule"}
        subtitle={editing ? schedule!.templateName : undefined}
      />
      <form
        {...form.props}
        action={formAction}
        onSubmit={() => {
          if (editing) setTimeout(() => router.refresh(), 400);
        }}
        className="flex flex-col gap-3.5 px-5 py-4"
      >
        {editing ? (
          <input type="hidden" name="scheduleId" value={schedule!.id} />
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Checklist</span>
            <select name="templateId" required className={field}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Schedule name</span>
          <input
            name="name"
            required
            defaultValue={schedule?.name}
            placeholder="Opening walk"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Daypart</span>
          <select name="daypart" defaultValue={schedule?.daypart ?? "OPENING"} className={field}>
            {(Object.keys(DAYPART_LABELS) as Daypart[]).map((value) => (
              <option key={value} value={value}>
                {DAYPART_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Available from</span>
            <input
              name="startTime"
              type="time"
              defaultValue={schedule?.startTime ?? "05:00"}
              required
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Due by</span>
            <input
              name="dueTime"
              type="time"
              defaultValue={schedule?.dueTime ?? "10:00"}
              required
              className={field}
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Cadence</legend>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CADENCES.map((cadence) => {
              const active =
                cadence.days.length === days.length &&
                cadence.days.every((d) => days.includes(d));
              return (
                <button
                  key={cadence.label}
                  type="button"
                  onClick={() => setDays(cadence.days)}
                  className="rounded-lg border px-2.5 py-1 text-[12px] font-medium"
                  style={
                    active
                      ? { background: "var(--info-bg)", color: "var(--info)" }
                      : undefined
                  }
                >
                  {cadence.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((day, index) => (
              <label
                key={day}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]"
              >
                <input
                  type="checkbox"
                  name="daysOfWeek"
                  value={index}
                  checked={days.includes(index)}
                  onChange={(event) =>
                    setDays((prev) =>
                      event.target.checked
                        ? [...prev, index].sort()
                        : prev.filter((d) => d !== index),
                    )
                  }
                  className="h-3.5 w-3.5"
                />
                {day}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">
            Stores ({selected.length} of {locations.length})
          </legend>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by store, number or district"
            className={`${field} mb-2`}
          />
          <button
            type="button"
            onClick={() =>
              setSelected((prev) =>
                allVisibleSelected
                  ? prev.filter((id) => !visible.some((l) => l.id === id))
                  : [...new Set([...prev, ...visible.map((l) => l.id)])],
              )
            }
            className="mb-2 text-[12px] font-medium"
            style={{ color: "var(--info)" }}
          >
            {allVisibleSelected ? "Clear shown" : `Select all shown (${visible.length})`}
          </button>

          <div className="max-h-56 overflow-y-auto rounded-lg border">
            {visible.map((location) => (
              <label
                key={location.id}
                className="flex cursor-pointer items-center gap-2 border-b px-2.5 py-2 text-[12px] last:border-b-0"
              >
                <input
                  type="checkbox"
                  name="locationIds"
                  value={location.id}
                  checked={selected.includes(location.id)}
                  onChange={(event) =>
                    setSelected((prev) =>
                      event.target.checked
                        ? [...prev, location.id]
                        : prev.filter((id) => id !== location.id),
                    )
                  }
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">
                  #{location.code} {location.name}
                </span>
                <span className="text-faint shrink-0">{location.district.name}</span>
              </label>
            ))}
            {visible.length === 0 ? (
              <p className="text-muted px-2.5 py-3 text-[12px]">No stores match.</p>
            ) : null}
          </div>

          {/*
            A checkbox that is filtered out is not rendered, and a control that
            is not rendered is not submitted. Without these, typing in the
            filter and saving would quietly drop every store the filter hid —
            on a 43-store schedule, all but the few still on screen.
          */}
          {selected
            .filter((id) => !visible.some((l) => l.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="locationIds" value={id} />
            ))}
        </fieldset>

        {state.error ? (
          <p
            role="alert"
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
          >
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
          >
            {state.message}
          </p>
        ) : null}

        <Submit disabled={selected.length === 0 || days.length === 0} editing={editing} />
      </form>
    </Card>
  );
}
