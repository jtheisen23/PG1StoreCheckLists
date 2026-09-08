"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { installBundledChecklist, type FormState } from "@/server/admin-service";

export interface BundledRow {
  key: string;
  name: string;
  description: string;
  origin: string;
  sections: number | null;
  items: number | null;
  installed: boolean;
}

function Install({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? "Adding…" : `Add ${name}`}
    </Button>
  );
}

/**
 * The checklists that ship with the app, ready to add in one click.
 *
 * They were rebuilt from this operation's own reports, so the alternative is
 * downloading a file in order to upload the same file.
 */
export function BundledPanel({ rows }: { rows: BundledRow[] }) {
  const router = useRouter();
  const [state, action] = useActionState<FormState, FormData>(
    installBundledChecklist,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const available = rows.filter((row) => !row.installed && row.items !== null);
  if (!available.length) return null;

  return (
    <Card as="section" className="mb-4">
      <CardHeader
        title="Checklists ready to add"
        subtitle="Rebuilt from your own reports. Adding one publishes it, ready to schedule."
      />
      <div className="flex flex-col">
        {available.map((row) => (
          <div
            key={row.key}
            className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">{row.name}</p>
              <p className="text-muted mt-0.5 text-[12px]">{row.description}</p>
              <p className="text-faint mt-1 text-[12px]">
                {row.items} items across {row.sections} sections · rebuilt from your{" "}
                {row.origin}
              </p>
            </div>
            <form action={action}>
              <input type="hidden" name="key" value={row.key} />
              <Install name={row.name} />
            </form>
          </div>
        ))}
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mx-5 mb-4 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
        >
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p
          className="mx-5 mb-4 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
        >
          {state.message}
        </p>
      ) : null}
    </Card>
  );
}
