"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import {
  importSubSpecs,
  updateSubSpec,
  type SpecImportState,
} from "@/server/sub-spec-actions";
import type { FormState } from "@/server/admin-service";

function Submit({ idle, busy, size = "md" }: { idle: string; busy: string; size?: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={size === "sm" ? "secondary" : "primary"} size={size} disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

const EXAMPLE = "Sub #,Name,Size,Spec oz\n13,The Original Italian,Regular,8\n13,The Original Italian,Giant,16\n1,BLT,Mini,";

/** Paste the spec sheet; rows are matched on sub number and size. */
export function SpecImportForm() {
  const [state, formAction] = useActionState<SpecImportState, FormData>(importSubSpecs, {});
  const form = usePreservedForm(state);

  useEffect(() => {
    if (state.ok) form.ref.current?.reset();
  }, [state, form.ref]);

  return (
    <form {...form.props} action={formAction} className="flex flex-col gap-3">
      <textarea
        name="sheet"
        rows={8}
        required
        placeholder={EXAMPLE}
        className="w-full rounded-lg border bg-[var(--field)] px-3 py-2 font-mono text-[12px] outline-none focus:border-[var(--color-brand-500)]"
      />
      <p className="text-faint text-[12px]">
        Copy the cells from your spec sheet and paste them here, headings included: the sub
        number and name, the size (Mini, Regular, Giant) and the spec weight in ounces. Leave a
        weight blank for a sub with no target yet. Pasting again updates what changed.
      </p>
      {state.error ? (
        <p className="text-[13px] font-medium" style={{ color: "var(--fail)" }} role="alert">
          {state.error}
        </p>
      ) : state.message ? (
        <p className="text-[13px] font-medium" style={{ color: "var(--pass)" }}>
          {state.message}
        </p>
      ) : null}
      {state.issues?.length ? (
        <ul className="text-[12px]" style={{ color: "var(--warn)" }}>
          {state.issues.slice(0, 12).map((issue) => (
            <li key={`${issue.row}-${issue.message}`}>
              Row {issue.row}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Submit idle="Load spec sheet" busy="Loading…" />
      </div>
    </form>
  );
}

/** One sub at one size: its spec weight, editable where it is read. */
export function SpecWeightForm({ specId, specOz }: { specId: string; specOz: number | null }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateSubSpec, {});
  const form = usePreservedForm(state);

  return (
    <form {...form.props} action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="specId" value={specId} />
      <input
        name="specOz"
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        defaultValue={specOz ?? ""}
        placeholder="No spec"
        aria-label="Spec weight in ounces"
        className="h-8 w-20 rounded-md border bg-[var(--field)] px-2 text-[13px] outline-none focus:border-[var(--color-brand-500)]"
      />
      <span className="text-faint text-[12px]">oz</span>
      <Submit idle="Save" busy="…" size="sm" />
      {state.error ? (
        <span className="text-[12px]" style={{ color: "var(--fail)" }} role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
