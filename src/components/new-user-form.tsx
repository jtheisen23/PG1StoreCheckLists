"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Role, ScopeLevel } from "@prisma/client";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { ROLE_LABELS } from "@/lib/role-labels";
import { createUser, type FormState } from "@/server/admin-service";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 outline-none focus:border-[var(--color-brand-500)]";

/** Roles map to the scope level that usually fits them. */
const DEFAULT_SCOPE: Record<Role, ScopeLevel> = {
  ADMIN: "ORG",
  REGIONAL: "REGION",
  DISTRICT: "DISTRICT",
  GM: "LOCATION",
  MANAGER: "LOCATION",
  STAFF: "LOCATION",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? "Adding…" : "Add person"}
    </Button>
  );
}

export interface DirectoryOptions {
  regions: { id: string; name: string }[];
  districts: { id: string; name: string }[];
  locations: { id: string; name: string; code: string }[];
}

export function NewUserForm({
  regions,
  districts,
  locations,
  onCreated,
  chrome = "card",
}: DirectoryOptions & {
  onCreated?: () => void;
  /** "card" for the admin page; "bare" when embedded in a dialog. */
  chrome?: "card" | "bare";
}) {
  const [role, setRole] = useState<Role>("STAFF");
  const [scopeLevel, setScopeLevel] = useState<ScopeLevel>("LOCATION");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createUser(prev, formData);
      if (result.ok) {
        formRef.current?.reset();
        onCreated?.();
      }
      return result;
    },
    {},
  );

  const choices =
    scopeLevel === "REGION"
      ? regions.map((r) => ({ id: r.id, label: r.name }))
      : scopeLevel === "DISTRICT"
        ? districts.map((d) => ({ id: d.id, label: d.name }))
        : locations.map((l) => ({ id: l.id, label: `#${l.code} ${l.name}` }));

  const form = (
    <form
      ref={formRef}
      action={formAction}
      className={
        chrome === "card"
          ? "flex flex-col gap-3.5 px-5 py-4"
          : "flex flex-col gap-3.5"
      }
    >
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Name</span>
          <input name="name" required placeholder="Alex Rivera" className={field} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="alex@company.com"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Role</span>
          <select
            name="role"
            value={role}
            onChange={(event) => {
              const next = event.target.value as Role;
              setRole(next);
              setScopeLevel(DEFAULT_SCOPE[next]);
            }}
            className={field}
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Sees</span>
          <select
            name="scopeLevel"
            value={scopeLevel}
            onChange={(event) => setScopeLevel(event.target.value as ScopeLevel)}
            className={field}
          >
            <option value="ORG">Entire organization</option>
            <option value="REGION">Selected regions</option>
            <option value="DISTRICT">Selected districts</option>
            <option value="LOCATION">Selected stores</option>
          </select>
        </label>

        {scopeLevel !== "ORG" ? (
          <div className="max-h-48 overflow-y-auto rounded-lg border">
            {choices.map((choice) => (
              <label
                key={choice.id}
                className="flex cursor-pointer items-center gap-2 border-b px-2.5 py-2 text-[12px] last:border-b-0"
              >
                <input
                  type="checkbox"
                  name="scopeIds"
                  value={choice.id}
                  className="h-3.5 w-3.5"
                />
                {choice.label}
              </label>
            ))}
            {choices.length === 0 ? (
              <p className="text-muted px-2.5 py-3 text-[12px]">Nothing to choose yet.</p>
            ) : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Temporary password</span>
          <input
            name="password"
            type="text"
            required
            minLength={10}
            placeholder="At least 10 characters"
            className={field}
          />
          <span className="text-faint text-[12px]">
            Share it with them directly; they sign in with their email.
          </span>
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

      <Submit />
    </form>
  );

  if (chrome === "bare") return form;

  return (
    <Card as="section" className="h-fit">
      <CardHeader title="Add a person" />
      {form}
    </Card>
  );
}
