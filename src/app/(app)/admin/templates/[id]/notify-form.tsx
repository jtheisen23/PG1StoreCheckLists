"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { setChecklistRecipients, type FormState } from "@/server/admin-service";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Saving…" : "Save recipients"}
    </Button>
  );
}

/**
 * Who gets a copy of this checklist when a store completes it — the thing the
 * previous platform did with "send the completed submission to these
 * addresses".
 */
export function NotifyForm({
  templateId,
  recipients,
  emailReady,
}: {
  templateId: string;
  recipients: string[];
  /** False when no mail account is connected yet, so nothing would actually go out. */
  emailReady: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    setChecklistRecipients,
    {},
  );
  const form = usePreservedForm(state);

  return (
    <Card as="section">
      <CardHeader
        title="Email this audit when it is completed"
        subtitle="A summary with the score and everything that failed, sent as soon as a store submits."
      />
      <form {...form.props} action={action} className="flex flex-col gap-3 px-5 py-4">
        <input type="hidden" name="templateId" value={templateId} />
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Email addresses</span>
          <textarea
            name="recipients"
            rows={2}
            defaultValue={recipients.join(", ")}
            placeholder="marcus@pg1restaurants.com, ops@pg1restaurants.com"
            spellCheck={false}
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-2 text-[13px] outline-none focus:border-[var(--color-brand-500)]"
          />
          <span className="text-faint text-[12px]">
            Separate addresses with commas. Leave it empty to email nobody.
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

        {!emailReady && recipients.length > 0 ? (
          <p
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
          >
            No mail account is connected yet, so these addresses are saved but
            nothing is being sent. See EMAIL.md for the two settings it needs.
          </p>
        ) : null}

        <div>
          <Save />
        </div>
      </form>
    </Card>
  );
}
