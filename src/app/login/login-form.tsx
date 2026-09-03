"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/buttons";
import { login, type LoginState } from "./actions";
import { usePreservedForm } from "@/components/preserve-form";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});
  const form = usePreservedForm(state);

  return (
    <form {...form.props} action={formAction} className="surface flex flex-col gap-3.5 rounded-xl p-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@company.com"
          className="h-11 rounded-lg border bg-[var(--surface)] px-3 outline-none focus:border-[var(--color-brand-500)]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-lg border bg-[var(--surface)] px-3 outline-none focus:border-[var(--color-brand-500)]"
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

      <SubmitButton />
    </form>
  );
}
