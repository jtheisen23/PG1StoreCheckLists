"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { addCloseArea, updateCloseArea } from "@/server/close-area-actions";
import type { FormState } from "@/server/admin-service";

const field =
  "h-10 w-full rounded-lg border bg-[var(--field)] px-2.5 outline-none focus:border-[var(--color-brand-500)]";

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Saving…" : editing ? "Save" : "Add area"}
    </Button>
  );
}

/** Adding an area and changing one are the same two questions. */
export function CloseAreaForm({
  templates,
  area,
}: {
  templates: { id: string; name: string; status: string }[];
  area?: { id: string; name: string; templateId: string | null };
}) {
  const editing = Boolean(area);
  const [state, formAction] = useActionState<FormState, FormData>(
    editing ? updateCloseArea : addCloseArea,
    {},
  );
  const form = usePreservedForm(state);

  // A new area clears the form for the next one; an edit keeps what was saved.
  useEffect(() => {
    if (state.ok && !editing) form.ref.current?.reset();
  }, [state, editing, form.ref]);

  return (
    <form {...form.props} action={formAction} className="flex flex-col gap-3">
      {area ? <input type="hidden" name="areaId" value={area.id} /> : null}
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium">Area</span>
        <input
          name="name"
          required
          maxLength={40}
          defaultValue={area?.name}
          placeholder="e.g. Grill"
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium">Closing checklist</span>
        <select name="templateId" defaultValue={area?.templateId ?? ""} className={field}>
          <option value="">None — don&rsquo;t show who closed</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
              {template.status !== "PUBLISHED" ? ` (${template.status.toLowerCase()})` : ""}
            </option>
          ))}
        </select>
        <span className="text-faint text-[12px]">
          The opener sees who submitted it last night and when they finished.
        </span>
      </label>

      {state.error ? (
        <p className="text-[13px] font-medium" style={{ color: "var(--fail)" }} role="alert">
          {state.error}
        </p>
      ) : state.message ? (
        <p className="text-[13px] font-medium" style={{ color: "var(--pass)" }}>
          {state.message}
        </p>
      ) : null}

      <div>
        <Submit editing={editing} />
      </div>
    </form>
  );
}
