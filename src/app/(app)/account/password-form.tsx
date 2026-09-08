"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { changeOwnPassword, type FormState } from "@/server/admin-service";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 text-[14px] outline-none focus:border-[var(--color-brand-500)]";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Changing…" : "Change password"}
    </Button>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changeOwnPassword, {});
  const form = usePreservedForm(state);

  return (
    <Card as="section" className="max-w-md">
      <CardHeader
        title="Change your password"
        subtitle="Any other device you are signed in on will be signed out."
      />
      <form {...form.props} action={action} className="flex flex-col gap-3.5 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Current password</span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">New password</span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={field}
          />
          <span className="text-faint text-[12px]">At least 10 characters.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">New password again</span>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
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
        {state.ok ? (
          <p
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
          >
            {state.message}
          </p>
        ) : null}

        <div>
          <Save />
        </div>
      </form>
    </Card>
  );
}
