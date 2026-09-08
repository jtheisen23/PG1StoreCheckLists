"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { submitRecovery, type RecoveryState } from "./actions";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 text-[14px] outline-none focus:border-[var(--color-brand-500)]";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? "Setting…" : "Set new password"}
    </Button>
  );
}

export function RecoveryForm() {
  const [state, action] = useActionState<RecoveryState, FormData>(submitRecovery, {});
  const form = usePreservedForm(state);

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p
          className="rounded-lg px-3 py-2.5 text-[13px]"
          style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
        >
          {state.message}
        </p>
        <Link href="/login">
          <Button variant="primary" className="w-full">
            Go to sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form {...form.props} action={action} className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Administrator email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="you@company.com"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Recovery code</span>
        <input name="token" required autoComplete="off" className={field} />
        <span className="text-faint text-[12px]">
          The value of ADMIN_RECOVERY_TOKEN in your deployment settings.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">New password</span>
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={field}
        />
        <span className="text-faint text-[12px]">At least 10 characters.</span>
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
