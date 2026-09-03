"use client";

import { useState } from "react";

import { Card, CardHeader } from "@/components/ui";
import { ChecklistImportForm } from "@/components/checklist-import-form";
import { importTemplate } from "@/server/admin-service";
import { NewTemplateFields } from "./new-template-form";

/**
 * Two ways to start a master checklist: bring one you already have, or build
 * it here. Importing is first because most operators arrive with a spreadsheet.
 */
export function NewChecklistPanel() {
  const [mode, setMode] = useState<"import" | "blank">("import");

  return (
    <Card as="section" className="h-fit">
      <CardHeader title="New master checklist" />
      <div className="flex gap-1.5 border-b px-5 py-3">
        {(
          [
            ["import", "Upload or paste"],
            ["blank", "Start blank"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
            style={
              mode === value
                ? { background: "var(--info-bg)", color: "var(--info)" }
                : { color: "var(--text-muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-5 py-4">
        {mode === "import" ? (
          <ChecklistImportForm action={importTemplate} />
        ) : (
          <NewTemplateFields />
        )}
      </div>
    </Card>
  );
}
