"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ItemType } from "@prisma/client";

import { Button } from "@/components/buttons";
import { ITEM_TYPE_LABELS } from "@/lib/labels";
import { addItem, type FormState } from "@/server/admin-service";
import { usePreservedForm } from "@/components/preserve-form";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 outline-none focus:border-[var(--color-brand-500)]";

const NUMERIC: ItemType[] = ["NUMBER", "TEMPERATURE", "RATING"];
const CHOICE: ItemType[] = ["SELECT", "MULTISELECT"];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Adding…" : "Add item"}
    </Button>
  );
}

export function AddItemForm({ sectionId }: { sectionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<ItemType>("CHECKBOX");
  const [open, setOpen] = useState(false);

  const [state, formAction] = useActionState<FormState, FormData>(addItem, {});
  const form = usePreservedForm(state);

  // Clearing the form after a successful add keeps the section-building rhythm
  // going; a rejected one keeps what was typed.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setType("CHECKBOX");
    }
  }, [state]);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ Add item</Button>
    );
  }

  return (
    <form {...form.props} ref={form.ref} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="sectionId" value={sectionId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">What are they checking?</span>
          <input
            name="label"
            required
            placeholder="Walk-in cooler temperature"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Answer type</span>
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as ItemType)}
            className={field}
          >
            {(Object.keys(ITEM_TYPE_LABELS) as ItemType[]).map((value) => (
              <option key={value} value={value}>
                {ITEM_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Instructions (optional)</span>
        <input
          name="helpText"
          placeholder="Read the thermometer on the middle shelf"
          className={field}
        />
      </label>

      {NUMERIC.includes(type) ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">
              {type === "RATING" ? "Passing rating" : "Minimum"}
            </span>
            <input
              name="minValue"
              type="number"
              step="any"
              placeholder={type === "TEMPERATURE" ? "33" : ""}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Maximum</span>
            <input
              name="maxValue"
              type="number"
              step="any"
              placeholder={type === "TEMPERATURE" ? "40" : ""}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Unit</span>
            <input
              name="unit"
              placeholder={type === "TEMPERATURE" ? "°F" : "min"}
              className={field}
            />
          </label>
        </div>
      ) : null}

      {CHOICE.includes(type) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Options</span>
            <input
              name="options"
              placeholder="Good, Needs work, Not acceptable"
              className={field}
            />
            <span className="text-faint text-[12px]">Separate with commas.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Which options count as a fail?</span>
            <input
              name="failingOptions"
              placeholder="Not acceptable"
              className={field}
            />
            <span className="text-faint text-[12px]">
              Must match the options above exactly.
            </span>
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        <Toggle name="required" label="Required" defaultChecked />
        <Toggle name="critical" label="Critical (fails the whole walk)" />
        <Toggle name="noteOnFail" label="Note required on fail" defaultChecked />
        <Toggle name="photoOnFail" label="Photo required on fail" defaultChecked />
        <Toggle name="requirePhoto" label="Photo always required" />
        <Toggle name="actionOnFail" label="Raise a corrective action" defaultChecked />
      </div>

      <label className="flex w-40 flex-col gap-1.5">
        <span className="text-[13px] font-medium">Scoring weight</span>
        <input
          name="weight"
          type="number"
          min={1}
          max={10}
          defaultValue={1}
          className={field}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Submit />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border"
      />
      {label}
    </label>
  );
}
