"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Card } from "@/components/ui";
import { Button } from "@/components/buttons";
import { addSection, type FormState } from "@/server/admin-service";
import { usePreservedForm } from "@/components/preserve-form";
import { DayToggles } from "./section-days";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add section"}
    </Button>
  );
}

export function AddSectionForm({ templateId }: { templateId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(addSection, {});
  const form = usePreservedForm(state);
  const [days, setDays] = useState<number[]>([]);
  useEffect(() => {
    if (state.ok) setDays([]);
  }, [state]);

  return (
    <Card className="p-4">
      <form {...form.props} action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="templateId" value={templateId} />
        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-medium">New section</span>
          <input
            name="title"
            required
            placeholder="Walk-in cooler"
            className="h-10 w-full rounded-lg border bg-[var(--field)] px-2.5 outline-none focus:border-[var(--color-brand-500)]"
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-medium">Instructions (optional)</span>
          <input
            name="helpText"
            placeholder="Check every shelf front to back"
            className="h-10 w-full rounded-lg border bg-[var(--field)] px-2.5 outline-none focus:border-[var(--color-brand-500)]"
          />
        </label>
        <div className="flex w-full flex-col gap-1.5">
          <span className="text-[13px] font-medium">
            Days <span className="text-faint font-normal">(none ticked: every day)</span>
          </span>
          <DayToggles days={days} onChange={setDays} />
        </div>
        <Submit />
      </form>
      {state.error ? (
        <p className="mt-2 text-[12px]" style={{ color: "var(--fail)" }}>
          {state.error}
        </p>
      ) : null}
    </Card>
  );
}
