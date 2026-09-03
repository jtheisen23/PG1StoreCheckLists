"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ActionPriority, ActionStatus, Role } from "@prisma/client";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { ACTION_PRIORITY_LABELS, ACTION_STATUS_LABELS } from "@/lib/labels";
import { ROLE_SHORT } from "@/lib/role-short";
import { updateAction, type ActionFormState } from "@/server/actions-service";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 outline-none focus:border-[var(--color-brand-500)]";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Save update"}
    </Button>
  );
}

export function ActionForm({
  actionId,
  status,
  priority,
  assigneeId,
  dueAt,
  assignable,
  canAssign,
  canVerify,
}: {
  actionId: string;
  status: ActionStatus;
  priority: ActionPriority;
  assigneeId: string | null;
  dueAt: string;
  assignable: { id: string; name: string; role: Role }[];
  canAssign: boolean;
  canVerify: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionFormState, FormData>(
    updateAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const statuses = (
    ["OPEN", "IN_PROGRESS", "RESOLVED", "VERIFIED", "CANCELLED"] as ActionStatus[]
  ).filter((s) => (s === "VERIFIED" ? canVerify : true));

  return (
    <Card as="section" className="h-fit">
      <CardHeader title="Update" />
      <form action={formAction} className="flex flex-col gap-3.5 px-5 py-4">
        <input type="hidden" name="actionId" value={actionId} />

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Status</span>
          <select name="status" defaultValue={status} className={field}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {ACTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Priority</span>
          <select
            name="priority"
            defaultValue={priority}
            disabled={!canAssign}
            className={field}
          >
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as ActionPriority[]).map((p) => (
              <option key={p} value={p}>
                {ACTION_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>

        {canAssign ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Assigned to</span>
              <select
                name="assigneeId"
                defaultValue={assigneeId ?? ""}
                className={field}
              >
                <option value="">Unassigned</option>
                {assignable.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {ROLE_SHORT[person.role]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Due</span>
              <input
                type="datetime-local"
                name="dueAt"
                defaultValue={dueAt}
                className={field}
              />
            </label>
          </>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">What was done</span>
          <textarea
            name="resolutionNote"
            rows={3}
            placeholder="Required when resolving"
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-2 outline-none focus:border-[var(--color-brand-500)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Proof photo</span>
          <input
            type="file"
            name="photos"
            accept="image/*"
            capture="environment"
            multiple
            className="text-[13px]"
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
            Saved.
          </p>
        ) : null}

        <Save />
      </form>
    </Card>
  );
}
