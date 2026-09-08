"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { resetUserPassword, type FormState } from "@/server/admin-service";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="primary" disabled={pending}>
      {pending ? "Setting…" : "Set password"}
    </Button>
  );
}

/** Gives one person a new password, for when they have forgotten theirs. */
export function ResetPassword({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(resetUserPassword, {});
  const form = usePreservedForm(state);

  useEffect(() => {
    if (state.ok) {
      const timer = setTimeout(() => setOpen(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted text-[12px] font-medium"
      >
        Reset password
      </button>
    );
  }

  return (
    <form
      {...form.props}
      action={action}
      className="flex w-full flex-col gap-2 rounded-lg border p-2.5"
      style={{ background: "var(--surface)" }}
    >
      <input type="hidden" name="userId" value={userId} />
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium">New password for {name}</span>
        <input
          name="password"
          type="text"
          required
          minLength={10}
          autoComplete="off"
          placeholder="At least 10 characters"
          className="h-9 w-full rounded-lg border bg-[var(--surface-raised)] px-2.5 text-[13px] outline-none focus:border-[var(--color-brand-500)]"
        />
      </label>
      <p className="text-faint text-[12px]">
        Shown as you type so you can pass it on. It is not emailed — tell them
        directly, and they can change it once they are in.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="rounded px-2 py-1.5 text-[12px]"
          style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
        >
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p
          className="rounded px-2 py-1.5 text-[12px]"
          style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Save />
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
