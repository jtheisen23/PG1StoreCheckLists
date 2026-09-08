"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { ROLE_LABELS } from "@/lib/role-labels";
import { parseHierarchy, type KnownDomain } from "@/lib/hierarchy-import";
import {
  importHierarchy,
  type HierarchyImportState,
} from "@/server/hierarchy-service";

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || count === 0}>
      {pending
        ? "Importing…"
        : count === 0
          ? "Import hierarchy"
          : `Import ${count} ${count === 1 ? "person" : "people"}`}
    </Button>
  );
}

/**
 * Builds the org chart from the operations spreadsheet: one row per store
 * naming its operator and who it rolls up to.
 */
export function HierarchyPanel({
  knownDomains,
}: {
  /** Domains people here already use, so a small paste is still checkable. */
  knownDomains: KnownDomain[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fixDomains, setFixDomains] = useState(true);

  const [state, action] = useActionState<HierarchyImportState, FormData>(
    importHierarchy,
    {},
  );
  const form = usePreservedForm(state);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const preview = useMemo(
    () =>
      text.trim()
        ? parseHierarchy(text, { fixSuspectDomains: fixDomains, knownDomains })
        : null,
    [text, fixDomains, knownDomains],
  );
  const suspects = useMemo(
    () => (text.trim() ? parseHierarchy(text, { knownDomains }).suspectEmails : []),
    [text, knownDomains],
  );

  if (!open) {
    return (
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">Import your hierarchy</p>
            <p className="text-muted mt-0.5 text-[12px]">
              One row per store naming its operator, president, vice president and
              director of operations. Creates the people and assigns their stores.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Import hierarchy</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader
        title="Import your hierarchy"
        subtitle="Anyone already here keeps their account and password; only their role and stores are updated."
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      />
      <form {...form.props} action={action} className="flex flex-col gap-4 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">
            Paste the sheet, including the heading row
          </span>
          <textarea
            name="sheet"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={
              "Store Number\tOperator Name\tOperator email\tOperator Phone\tPresident\tVice President\tDirector of Operations"
            }
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-2 font-mono text-[12px] outline-none focus:border-[var(--color-brand-500)]"
          />
          <span className="text-faint text-[12px]">
            Copy the cells out of Excel or Google Sheets and paste them here.
          </span>
        </label>

        {suspects.length > 0 ? (
          <div
            className="rounded-lg px-3 py-2.5"
            style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
          >
            <p className="text-[12px] font-semibold">
              {suspects.length === 1
                ? "1 address looks misspelled"
                : `${suspects.length} addresses look misspelled`}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {suspects.map((s) => (
                <li key={s.email} className="text-[12px]">
                  {s.email} → {s.suggestion}{" "}
                  <span className="opacity-70">
                    ({s.rows.length} row{s.rows.length === 1 ? "" : "s"})
                  </span>
                </li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 text-[12px] font-medium">
              <input
                type="checkbox"
                name="fixDomains"
                checked={fixDomains}
                onChange={(event) => setFixDomains(event.target.checked)}
                className="h-3.5 w-3.5"
              />
              Correct these before importing
            </label>
            <p className="mt-1 text-[12px] opacity-80">
              Left uncorrected, each becomes a separate person who cannot be
              reached and holds only part of someone&rsquo;s stores.
            </p>
          </div>
        ) : null}

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

        {state.ok ? <Result state={state} /> : null}

        <div>
          <Submit count={preview?.people.length ?? 0} />
        </div>
      </form>
    </Card>
  );
}

function Preview({ preview }: { preview: ReturnType<typeof parseHierarchy> }) {
  const byRole = new Map<string, number>();
  for (const person of preview.people) {
    byRole.set(person.role, (byRole.get(person.role) ?? 0) + 1);
  }
  const leaders = preview.people.filter((p) => p.role !== "OPERATOR");

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border px-3.5 py-3"
      style={{ background: "var(--surface)" }}
    >
      <p className="text-[13px] font-semibold">
        {preview.people.length} people across {preview.storeCodes.length} stores
      </p>
      <p className="text-muted text-[12px]">
        {[...byRole.entries()]
          .map(([role, count]) => `${count} ${ROLE_LABELS[role as never] ?? role}`)
          .join(" · ")}
      </p>

      {leaders.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {leaders.map((person) => (
            <li key={person.email} className="text-[12px]">
              <span className="font-medium">{person.name}</span>{" "}
              <span className="text-muted">
                {ROLE_LABELS[person.role as never] ?? person.role} ·{" "}
                {person.wholeOrg
                  ? "every store"
                  : `${person.storeCodes.length} store${person.storeCodes.length === 1 ? "" : "s"}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {preview.issues.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {preview.issues.slice(0, 8).map((issue, index) => (
            <li key={index} className="text-muted text-[12px]">
              {issue.row ? `Row ${issue.row}: ` : ""}
              {issue.message}
            </li>
          ))}
          {preview.issues.length > 8 ? (
            <li className="text-faint text-[12px]">
              …and {preview.issues.length - 8} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function Result({ state }: { state: HierarchyImportState }) {
  return (
    <div className="flex flex-col gap-3">
      <p
        className="rounded-lg px-3 py-2 text-[12px]"
        style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
      >
        {state.message}
      </p>

      {state.unknownStores && state.unknownStores.length > 0 ? (
        <p
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
        >
          Not in the app yet, so nobody was assigned to them:{" "}
          {state.unknownStores.join(", ")}. Add them under Stores and paste this
          again.
        </p>
      ) : null}

      {state.created && state.created.length > 0 ? (
        <div className="rounded-lg border">
          <div className="border-b px-3 py-2">
            <p className="text-[12px] font-semibold">
              {state.created.length} new account
              {state.created.length === 1 ? "" : "s"} — give these out
            </p>
            <p className="text-faint mt-0.5 text-[12px]">
              Shown once, here, and not emailed. Each person can change theirs
              under Your account once they are in.
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {state.created.map((person) => (
              <div
                key={person.email}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-1.5 last:border-b-0"
              >
                <span className="text-[12px]">
                  {person.name}{" "}
                  <span className="text-muted">{person.email}</span>
                </span>
                <code className="text-[12px] font-semibold">{person.password}</code>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {state.issues && state.issues.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {state.issues.slice(0, 10).map((issue, index) => (
            <li key={index} className="text-muted text-[12px]">
              {issue.row ? `Row ${issue.row}: ` : ""}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
