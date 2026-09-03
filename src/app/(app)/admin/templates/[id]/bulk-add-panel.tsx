"use client";

import { useState } from "react";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { ChecklistImportForm } from "@/components/checklist-import-form";
import { importIntoTemplate } from "@/server/admin-service";

/**
 * Adds a batch of items to a master checklist in one go — the quick way to
 * push a new set of checks out to every store using it.
 */
export function BulkAddPanel({
  templateId,
  storeCount,
}: {
  templateId: string;
  storeCount: number;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">Add several items at once</p>
            <p className="text-muted mt-0.5 text-[12px]">
              Paste from a spreadsheet or upload a CSV
              {storeCount > 0
                ? ` — they reach all ${storeCount} store${storeCount === 1 ? "" : "s"} on the next walk.`
                : "."}
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Import items</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Import items into this checklist"
        subtitle="Matching section names are added to; new ones are created."
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      />
      <div className="px-5 py-4">
        <ChecklistImportForm
          action={importIntoTemplate}
          templateId={templateId}
          compact
        />
      </div>
    </Card>
  );
}
