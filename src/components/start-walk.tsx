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
 * because the store owes it today. Collapsed by default so it does not compete
 * with what is actually due.
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

  return (
    <Card className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <span>
          <span className="block text-[13px] font-medium">Start a checklist now</span>
          <span className="text-muted mt-0.5 block text-[12px]">
            For a store visit or audit at {storeName}, outside its schedule.
          </span>
        </span>
        <span className="text-muted ml-3 shrink-0 text-[13px]">{open ? "Close" : "Open"}</span>
      </button>

      {open ? (
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
      ) : null}
    </Card>
  );
}
