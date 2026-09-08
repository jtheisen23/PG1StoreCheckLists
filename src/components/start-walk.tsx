"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Card } from "@/components/ui";
import { Button } from "@/components/buttons";
import { startChecklistNow } from "@/server/walks";

export interface StartableChecklist {
  id: string;
  name: string;
  category: string | null;
  items: number;
}

function Start() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "Starting…" : "Start"}
    </Button>
  );
}

/**
 * Starting a checklist because you are standing in the store, rather than
 * because the store owes it today.
 */
export function StartWalk({
  checklists,
  storeName,
}: {
  checklists: StartableChecklist[];
  storeName: string;
}) {
  const [open, setOpen] = useState(false);
  if (!checklists.length) return null;

  // Closed, this is the only way to start an unscheduled walk — and at a store
  // with nothing on its Today screen it is the only thing on the page worth
  // pressing. A quiet disclosure row sank into the background, especially on
  // the dark theme, so it is a filled button that reads as the action it is.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="mt-5 flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-opacity hover:opacity-90"
        style={{ background: "var(--color-brand-600)", color: "#ffffff" }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "rgba(255,255,255,0.18)" }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Start a checklist now</span>
          <span className="block text-[12px]" style={{ color: "rgba(255,255,255,0.85)" }}>
            A store visit or audit at {storeName}, outside its schedule.
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold">Start</span>
      </button>
    );
  }

  return (
    <Card className="mt-5">
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded
        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <span>
          <span className="block text-[13px] font-semibold">Start a checklist now</span>
          <span className="text-muted mt-0.5 block text-[12px]">
            At {storeName}, outside its schedule.
          </span>
        </span>
        <span className="text-muted ml-3 shrink-0 text-[13px] font-medium">Close</span>
      </button>

      <ul className="border-t">
        {checklists.map((checklist) => (
          <li
            key={checklist.id}
            className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{checklist.name}</p>
              <p className="text-muted text-[12px]">
                {checklist.items} items
                {checklist.category ? ` · ${checklist.category}` : ""}
              </p>
            </div>
            <form action={startChecklistNow}>
              <input type="hidden" name="templateId" value={checklist.id} />
              <Start />
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
