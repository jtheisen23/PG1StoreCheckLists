"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/buttons";
import { createTemplate, type FormState } from "@/server/admin-service";
import { usePreservedForm } from "@/components/preserve-form";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 outline-none focus:border-[var(--color-brand-500)]";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create checklist"}
    </Button>
  );
}

export function NewTemplateFields() {
  const [state, formAction] = useActionState<FormState, FormData>(
    createTemplate,
    {},
  );
  const form = usePreservedForm(state);

  return (
    <form {...form.props} action={formAction} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Name</span>
          <input
            name="name"
            required
            placeholder="Opening line check"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Category</span>
          <input
            name="category"
            placeholder="Food Safety"
            list="template-categories"
            className={field}
          />
          <datalist id="template-categories">
            <option value="Food Safety" />
            <option value="Cleanliness" />
            <option value="Opening" />
            <option value="Closing" />
            <option value="Guest Experience" />
            <option value="Equipment" />
            <option value="Brand Standards" />
          </datalist>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Passing score</span>
          <input
            name="passingScore"
            type="number"
            min={0}
            max={100}
            defaultValue={90}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Description</span>
          <textarea
            name="description"
            rows={3}
            placeholder="What this walk covers and when to run it"
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-2 outline-none focus:border-[var(--color-brand-500)]"
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

      <Submit />
    </form>
  );
}
