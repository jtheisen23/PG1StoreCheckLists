"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Daypart } from "@prisma/client";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { DAY_NAMES, DAYPART_LABELS } from "@/lib/labels";
import { createSchedule, type FormState } from "@/server/admin-service";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 outline-none focus:border-[var(--color-brand-500)]";

interface LocationRow {
  id: string;
  name: string;
  code: string;
  district: { name: string };
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className="w-full"
      disabled={pending || disabled}
    >
      {pending ? "Creating…" : "Create schedule"}
    </Button>
  );
}

export function NewScheduleForm({
  templates,
  locations,
}: {
  templates: { id: string; name: string }[];
  locations: LocationRow[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [state, formAction] = useActionState<FormState, FormData>(
    createSchedule,
    {},
  );

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

  return (
    <Card as="section" className="h-fit">
      <CardHeader title="New schedule" />

      {templates.length === 0 ? (
        <p className="text-muted px-5 py-4 text-[13px]">
          Publish a checklist first — only published checklists can be scheduled.
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-3.5 px-5 py-4">
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

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Schedule name</span>
            <input name="name" required placeholder="Opening walk" className={field} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Daypart</span>
            <select name="daypart" defaultValue="OPENING" className={field}>
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
                defaultValue="05:00"
                required
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Due by</span>
              <input
                name="dueTime"
                type="time"
                defaultValue="10:00"
                required
                className={field}
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">Days</legend>
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
                    defaultChecked
                    className="h-3.5 w-3.5"
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">
              Stores ({selected.length} selected)
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
              {allVisibleSelected ? "Clear shown" : "Select all shown"}
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
                    className="h-3.5 w-3.5"
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

          <Submit disabled={selected.length === 0} />
        </form>
      )}
    </Card>
  );
}
