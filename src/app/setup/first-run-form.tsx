"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { createFirstAdmin, type FirstRunState } from "@/server/first-run";

const field =
  "h-11 w-full rounded-lg border bg-[var(--surface)] px-3 outline-none focus:border-[var(--color-brand-500)]";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create my organization"}
    </Button>
  );
}

export function FirstRunForm() {
  const [state, formAction] = useActionState<FirstRunState, FormData>(
    createFirstAdmin,
    {},
  );
  const form = usePreservedForm(state);

  return (
    <form
      {...form.props}
      action={formAction}
      className="surface flex flex-col gap-3.5 rounded-xl p-5"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Organization name</span>
        <input
          name="orgName"
          required
          placeholder="PG1 Restaurant Group"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Your name</span>
        <input name="name" required placeholder="Jordan Theisen" className={field} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Your email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@company.com"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className={field}
        />
        <span className="text-faint text-[12px]">At least 12 characters.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Confirm password</span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg px-3 py-2 text-[13px]"
          style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
        >
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
