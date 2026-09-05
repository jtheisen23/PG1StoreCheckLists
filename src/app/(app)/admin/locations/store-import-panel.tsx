"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { importStores, type StoreImportState } from "@/server/admin-service";
import { label, parseStores, type Grouping } from "@/lib/store-import";

const SAMPLE = `Store #\tCity\tState\tBrand
4049\tHixson\tTN\tJersey Mikes
6113\tWytheville\tVA\tJersey Mikes`;

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || count === 0}>
      {pending
        ? "Importing…"
        : count === 0
          ? "Import stores"
          : `Import ${count} store${count === 1 ? "" : "s"}`}
    </Button>
  );
}

/**
 * Bulk store setup from a spreadsheet paste.
 *
 * Everything below the box is worked out in the browser purely so someone can
 * see what they are about to create; the server parses the same text again and
 * that result is what gets written.
 */
export function StoreImportPanel({ hasStores }: { hasStores: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [grouping, setGrouping] = useState<Grouping>("brand");

  const [state, action] = useActionState<StoreImportState, FormData>(
    importStores,
    {},
  );
  const form = usePreservedForm(state);

  useEffect(() => {
    if (state.ok) {
      setText("");
      router.refresh();
    }
  }, [state, router]);

  const preview = useMemo(
    () => (text.trim() ? parseStores(text, grouping) : null),
    [text, grouping],
  );

  if (!open) {
    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">
              {hasStores ? "Add or update stores in bulk" : "Add all your stores at once"}
            </p>
            <p className="text-muted mt-0.5 text-[12px]">
              Paste straight from your spreadsheet — store number, city, state and
              brand. Regions, districts and timezones are worked out for you.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Import stores</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Import stores"
        subtitle="A store number that already exists is updated, never duplicated."
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      />
      <form {...form.props} action={action} className="flex flex-col gap-4 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">
            Paste your stores, including the heading row
          </span>
          <textarea
            name="stores"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={SAMPLE}
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-2 font-mono text-[12px] outline-none focus:border-[var(--color-brand-500)]"
          />
          <span className="text-faint text-[12px]">
            Copy the cells out of Google Sheets or Excel and paste them here. A
            Region, District or Timezone column is used if you have one.
          </span>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[13px] font-medium">
            Group stores by
          </legend>
          {(
            [
              ["brand", "Brand, then state", "One region per brand, one district per state."],
              ["state", "State", "One region and one district per state."],
            ] as const
          ).map(([value, title, description]) => (
            <label key={value} className="flex items-start gap-2">
              <input
                type="radio"
                name="grouping"
                value={value}
                checked={grouping === value}
                onChange={() => setGrouping(value)}
                className="mt-0.5"
              />
              <span className="text-[13px]">
                {title}
                <span className="text-faint block text-[12px]">{description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {preview ? <Preview preview={preview} /> : null}

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
          <div className="flex flex-col gap-2">
            <p
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
            >
              {state.message}
            </p>
            {state.issues && state.issues.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {state.issues.map((issue, index) => (
                  <li key={index} className="text-muted text-[12px]">
                    Row {issue.row}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div>
          <Submit count={preview?.stores.length ?? 0} />
        </div>
      </form>
    </Card>
  );
}

function Preview({ preview }: { preview: ReturnType<typeof parseStores> }) {
  const zones = new Map<string, number>();
  for (const store of preview.stores) {
    zones.set(store.timezone, (zones.get(store.timezone) ?? 0) + 1);
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border px-3.5 py-3"
      style={{ background: "var(--surface)" }}
    >
      <p className="text-[13px] font-semibold">
        {preview.stores.length} store{preview.stores.length === 1 ? "" : "s"} ready
      </p>

      {preview.structure.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {preview.structure.map((entry) => (
            <li key={entry.region} className="text-[12px]">
              <span className="font-medium">{entry.region}</span>
              <span className="text-muted"> · {entry.districts.join(", ")}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {zones.size > 0 ? (
        <p className="text-muted text-[12px]">
          Timezones:{" "}
          {[...zones.entries()]
            .map(([zone, count]) => `${count} ${label(zone)}`)
            .join(" · ")}
        </p>
      ) : null}

      {preview.uncertainCount > 0 ? (
        <p
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
        >
          {preview.uncertainCount} store
          {preview.uncertainCount === 1 ? " sits" : "s sit"} in a state that spans
          two timezones. Check the notes below — a wrong timezone opens that
          store&rsquo;s checklists an hour early.
        </p>
      ) : null}

      {preview.issues.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {preview.issues.slice(0, 12).map((issue, index) => (
            <li key={index} className="text-muted text-[12px]">
              Row {issue.row}: {issue.message}
            </li>
          ))}
          {preview.issues.length > 12 ? (
            <li className="text-faint text-[12px]">
              …and {preview.issues.length - 12} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
