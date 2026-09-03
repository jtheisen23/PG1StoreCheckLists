"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import type { ImportState } from "@/server/admin-service";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 text-[13px] outline-none focus:border-[var(--color-brand-500)]";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? "Importing…" : label}
    </Button>
  );
}

/** Row-by-row problems, so a person can fix their spreadsheet and retry. */
function Issues({ state }: { state: ImportState }) {
  if (!state.error) return null;
  return (
    <div
      role="alert"
      className="rounded-lg px-3 py-2 text-[12px]"
      style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
    >
      <p className="font-medium">{state.error}</p>
      {state.issues?.length ? (
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4">
          {state.issues.slice(0, 8).map((issue, index) => (
            <li key={index}>
              {issue.row > 0 ? <strong>Row {issue.row}: </strong> : null}
              {issue.message}
            </li>
          ))}
          {state.issues.length > 8 ? (
            <li>…and {state.issues.length - 8} more.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export function ChecklistImportForm({
  action,
  templateId,
  compact = false,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
  /** Present when importing into an existing master checklist. */
  templateId?: string;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState<ImportState, FormData>(action, {});
  const form = usePreservedForm(state);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form {...form.props} action={formAction} className="flex flex-col gap-3.5">
      {templateId ? (
        <input type="hidden" name="templateId" value={templateId} />
      ) : null}

      {!compact ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Checklist name</span>
            <input name="name" required placeholder="Opening Walk" className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Category</span>
              <input name="category" placeholder="Food Safety" className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Passing score</span>
              <input
                name="passingScore"
                type="number"
                min={0}
                max={100}
                defaultValue={90}
                className={field}
              />
            </label>
          </div>
        </>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">
          Paste from your spreadsheet
        </span>
        <textarea
          name="text"
          rows={compact ? 5 : 7}
          placeholder={
            "Copy the cells in Excel or Google Sheets and paste here.\n\n" +
            "section\titem\ttype\nFood safety\tWalk-in cooler temp\ttemperature"
          }
          className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-2 font-mono text-[12px] outline-none focus:border-[var(--color-brand-500)]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">…or upload a CSV</span>
        <input
          type="file"
          name="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          className="text-[13px]"
        />
        {fileName ? (
          <span className="text-faint text-[12px]">
            {fileName} — the file is used and the box above ignored.
          </span>
        ) : null}
      </label>

      <details className="text-[12px]">
        <summary className="text-muted cursor-pointer">
          What can the file contain?
        </summary>
        <div className="text-muted mt-2 flex flex-col gap-1.5">
          <p>
            A header row plus one row per item. Only <strong>item</strong> is
            required; headings are matched loosely, so <em>Question</em>,{" "}
            <em>Task</em> or <em>Label</em> all work.
          </p>
          <p>
            Recognised columns: section, item, type, help, required, critical,
            weight, min, max, unit, options, failing options, photo, photo on
            fail, note on fail, raise action.
          </p>
          <p>
            Answer types: checkbox, pass/fail, temperature, number, text, select,
            multiselect, photo, signature, rating. Leave it blank and we infer
            one from the other columns.
          </p>
          <p>
            No header row? Paste a plain list — lines starting with{" "}
            <code>#</code> or ending with <code>:</code> become sections.
          </p>
          <a
            href="/api/checklists/sample"
            className="font-medium"
            style={{ color: "var(--info)" }}
          >
            Download a sample CSV
          </a>
        </div>
      </details>

      <Issues state={state} />
      {state.ok ? (
        <p
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
        >
          {state.message}
        </p>
      ) : null}

      <Submit label={compact ? "Add these items" : "Import checklist"} />
    </form>
  );
}
