"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { voidSubmission, type FormState } from "@/server/admin-service";

/**
 * Voiding is deliberate and one-way, so it opens behind a click and asks for a
 * reason rather than sitting next to the ordinary controls as a bare button.
 */
export function VoidControls({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<FormState, FormData>(
    voidSubmission,
    {},
  );
  const form = usePreservedForm(state);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-faint text-[12px] underline underline-offset-2"
      >
        Void this walk
      </button>
    );
  }

  return (
    <form {...form.props} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="submissionId" value={submissionId} />
      <label className="text-[12px] font-medium" htmlFor="void-reason">
        Why is this being voided?
      </label>
      <p className="text-faint text-[12px]">
        The walk stays on the record and stops counting towards the store&rsquo;s
        score. Its schedule reads as unmet again, and any corrective action it
        raised is cancelled. This cannot be undone from here.
      </p>
      <input
        id="void-reason"
        name="reason"
        maxLength={300}
        required
        placeholder="Run against a live store by mistake"
        className="h-9 rounded-lg border px-3 text-[13px]"
        style={{ background: "var(--surface-raised)" }}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="danger">
          Void it
        </Button>
        <Button type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {state.error ? (
        <p className="text-[12px]" style={{ color: "var(--fail)" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
