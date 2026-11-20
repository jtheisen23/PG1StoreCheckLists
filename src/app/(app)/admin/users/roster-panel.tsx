"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { ROLE_LABELS } from "@/lib/role-labels";
import type { KnownDomain } from "@/lib/hierarchy-import";
import { parseRoster, pickRosterSheet } from "@/lib/roster-import";
import { label as zoneLabel } from "@/lib/store-import";
import { readWorkbook, rowsToTsv, type Sheet } from "@/lib/xlsx";
import { importRoster, type RosterImportState } from "@/server/hierarchy-service";

export interface ExistingPerson {
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface ExistingStore {
  code: string;
  name: string;
  active: boolean;
}

const ROLE_ORDER: Role[] = ["PRESIDENT", "VICE_PRESIDENT", "DIRECTOR_OF_OPS", "REGIONAL", "DISTRICT", "OPERATOR", "GM", "MANAGER", "STAFF", "ADMIN"];

function Submit({ stores, people }: { stores: number; people: number }) {
  const { pending } = useFormStatus();
  const nothing = stores === 0;
  return (
    <Button type="submit" variant="primary" disabled={pending || nothing}>
      {pending
        ? "Importing…"
        : nothing
          ? "Import roster"
          : `Import ${stores} ${stores === 1 ? "store" : "stores"} and ${people} ${people === 1 ? "person" : "people"}`}
    </Button>
  );
}

/**
 * The organization from its roster, in one import: stores, the hierarchy over
 * them, people, roles and the stores each person holds. Choose the workbook
 * (or paste the sheet), see exactly what will change, then import.
 */
export function RosterPanel({
  knownDomains,
  people,
  stores,
  actorEmail,
}: {
  /** Domains people here already use, so a small paste is still checkable. */
  knownDomains: KnownDomain[];
  people: ExistingPerson[];
  stores: ExistingStore[];
  actorEmail: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fixDomains, setFixDomains] = useState(true);
  const [file, setFile] = useState<{ name: string; sheets: Sheet[]; index: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [missingPeople, setMissingPeople] = useState<"keep" | "deactivate">("keep");
  const [missingStores, setMissingStores] = useState<"keep" | "close">("keep");

  const [state, action] = useActionState<RosterImportState, FormData>(importRoster, {});
  const form = usePreservedForm(state);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const knownNames = useMemo(
    () => Object.fromEntries(people.map((p) => [p.email.toLowerCase(), p.name])),
    [people],
  );
  const preview = useMemo(
    () => (text.trim() ? parseRoster(text, { fixSuspectDomains: fixDomains, knownDomains, knownNames }) : null),
    [text, fixDomains, knownDomains, knownNames],
  );
  const suspects = useMemo(
    () => (text.trim() ? parseRoster(text, { knownDomains }).suspectEmails : []),
    [text, knownDomains],
  );

  async function chooseFile(chosen: File | undefined) {
    setFileError(null);
    if (!chosen) return;
    try {
      if (/\.xlsx$/i.test(chosen.name)) {
        const sheets = await readWorkbook(await chosen.arrayBuffer());
        if (!sheets.length) throw new Error("That workbook has no sheets.");
        const index = pickRosterSheet(sheets);
        setFile({ name: chosen.name, sheets, index });
        setText(rowsToTsv(sheets[index].rows));
      } else if (/\.xls$/i.test(chosen.name)) {
        throw new Error("That is the old .xls format. Save it as .xlsx (File → Save As) and choose it again.");
      } else {
        setFile({ name: chosen.name, sheets: [], index: 0 });
        setText(await chosen.text());
      }
    } catch (error) {
      setFile(null);
      setFileError(error instanceof Error ? error.message : "That file could not be read.");
    }
  }

  if (!open) {
    return (
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">Import your roster</p>
            <p className="text-muted mt-0.5 text-[13px]">
              One row per store: its number, name, state and address, and its operator, director of
              operations, vice president and president. Sets up the stores, the hierarchy, everyone&rsquo;s
              role and the stores each person holds.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Import roster</Button>
        </div>
      </Card>
    );
  }

  const known = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  const rosterEmails = new Set(preview?.people.map((p) => p.email) ?? []);
  const rosterCodes = new Set(preview?.stores.map((s) => s.code) ?? []);
  const notOnRoster = people.filter(
    (p) => p.role !== "ADMIN" && p.email.toLowerCase() !== actorEmail.toLowerCase() && !rosterEmails.has(p.email.toLowerCase()),
  );
  const storesNotOnRoster = stores.filter((s) => s.active && !rosterCodes.has(s.code));

  return (
    <Card className="mb-4">
      <CardHeader
        title="Import your roster"
        subtitle="Anyone already here keeps their account and password; their role and stores follow the roster. Administrators are never changed."
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      />
      <form {...form.props} action={action} className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Your roster</span>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className="inline-flex h-10 cursor-pointer items-center rounded-lg border px-3.5 text-[13px] font-medium"
              style={{ background: "var(--field)" }}
            >
              Choose file…
              <input
                type="file"
                accept=".xlsx,.csv,.tsv,.txt"
                className="sr-only"
                onChange={(event) => {
                  void chooseFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <span className="text-muted text-[13px]">
              {file ? file.name : "An Excel workbook (.xlsx) or a CSV"}
            </span>
          </div>
          {file && file.sheets.length > 1 ? (
            <label className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-muted">Sheet</span>
              <select
                value={file.index}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setFile({ ...file, index });
                  setText(rowsToTsv(file.sheets[index].rows));
                }}
                className="h-9 rounded-lg border bg-[var(--field)] px-2 text-[13px]"
              >
                {file.sheets.map((sheet, i) => (
                  <option key={sheet.name + i} value={i}>
                    {sheet.name} ({Math.max(0, sheet.rows.length - 1)} rows)
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {fileError ? (
            <p className="text-[12px]" style={{ color: "var(--fail)" }}>
              {fileError}
            </p>
          ) : null}
          <details className="mt-1" open={!file && Boolean(text)}>
            <summary className="text-muted cursor-pointer text-[12px]">Or paste the sheet, heading row first</summary>
            <textarea
              name="sheet"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setFile(null);
              }}
              rows={6}
              spellCheck={false}
              placeholder={"Store #\tSite Name\tState\tDirector of Operations\tOperator Name\tOperator email\tOperator Phone #\tPresident\tVice President\tStore Address"}
              className="mt-1.5 w-full rounded-lg border bg-[var(--field)] px-2.5 py-2 font-mono text-[12px] outline-none focus:border-[var(--border-strong)]"
            />
          </details>
        </div>

        {suspects.length > 0 ? (
          <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
            <p className="text-[12px] font-semibold">
              {suspects.length === 1 ? "1 address looks misspelled" : `${suspects.length} addresses look misspelled`}
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
          </div>
        ) : null}

        {preview && preview.stores.length ? (
          <Preview preview={preview} known={known} storeCodes={new Set(stores.map((s) => s.code))} />
        ) : null}

        {preview && preview.stores.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice
              title={`People not on this roster (${notOnRoster.length})`}
              name="missingPeople"
              value={missingPeople}
              onChange={(value) => setMissingPeople(value as "keep" | "deactivate")}
              options={[
                { value: "keep", label: "Keep their accounts", detail: "They hold no stores until someone gives them some." },
                { value: "deactivate", label: "Deactivate them", detail: "They can no longer sign in. Their history stays." },
              ]}
              list={notOnRoster.map((p) => `${p.name} · ${ROLE_LABELS[p.role]}${p.active ? "" : " (already deactivated)"}`)}
            />
            <Choice
              title={`Open stores not on this roster (${storesNotOnRoster.length})`}
              name="missingStores"
              value={missingStores}
              onChange={(value) => setMissingStores(value as "keep" | "close")}
              options={[
                { value: "keep", label: "Leave them open", detail: "Only the administrators will see them." },
                { value: "close", label: "Close them", detail: "Off Today and the dashboard. Their history stays." },
              ]}
              list={storesNotOnRoster.map((s) => `#${s.code} ${s.name}`)}
            />
          </div>
        ) : null}

        {state.error ? (
          <p role="alert" className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--fail-bg)", color: "var(--fail)" }}>
            {state.error}
          </p>
        ) : null}

        {state.ok ? <Result state={state} /> : null}

        <div>
          <Submit stores={preview?.stores.length ?? 0} people={preview?.people.length ?? 0} />
        </div>
      </form>
    </Card>
  );
}

/** "Director of Operations" -> "Directors of Operations"; "Operator" -> "Operators". */
function plural(label: string): string {
  return / of /.test(label) ? label.replace(/^(\S+)/, "$1s") : `${label}s`;
}

function Choice({
  title,
  name,
  value,
  onChange,
  options,
  list,
}: {
  title: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; detail: string }[];
  list: string[];
}) {
  return (
    <fieldset className="rounded-lg border px-3.5 py-3" style={{ background: "var(--surface)" }}>
      <legend className="px-1 text-[13px] font-semibold">{title}</legend>
      {list.length ? (
        <>
          <div className="mt-1 flex flex-col gap-2">
            {options.map((option) => (
              <label key={option.value} className="flex items-start gap-2 text-[13px]">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="text-muted block text-[12px]">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
          <details className="mt-2">
            <summary className="text-muted cursor-pointer text-[12px]">Who these are</summary>
            <ul className="mt-1 max-h-40 overflow-y-auto">
              {list.map((line) => (
                <li key={line} className="text-muted text-[12px]">
                  {line}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="text-muted mt-1 text-[12px]">None — everything here is on the roster.</p>
      )}
    </fieldset>
  );
}

function Preview({
  preview,
  known,
  storeCodes,
}: {
  preview: ReturnType<typeof parseRoster>;
  known: Map<string, ExistingPerson>;
  storeCodes: Set<string>;
}) {
  const newStores = preview.stores.filter((s) => !storeCodes.has(s.code)).length;
  const zones = new Map<string, number>();
  for (const store of preview.stores) zones.set(zoneLabel(store.timezone), (zones.get(zoneLabel(store.timezone)) ?? 0) + 1);
  const districtSize = new Map<string, number>();
  for (const store of preview.stores) {
    const key = `${store.regionName}::${store.districtName}`;
    districtSize.set(key, (districtSize.get(key) ?? 0) + 1);
  }
  const byRole = new Map<Role, number>();
  for (const person of preview.people) byRole.set(person.role, (byRole.get(person.role) ?? 0) + 1);
  const newPeople = preview.people.filter((p) => !known.has(p.email)).length;
  const changes = preview.people.flatMap((p) => {
    const was = known.get(p.email);
    if (!was || was.role === "ADMIN") return [];
    const lines: string[] = [];
    if (was.role !== p.role) lines.push(`${was.name}: ${ROLE_LABELS[was.role]} → ${ROLE_LABELS[p.role]}`);
    if (!was.active) lines.push(`${was.name}: deactivated → active again`);
    return lines;
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border px-3.5 py-3" style={{ background: "var(--surface)" }}>
      <div>
        <p className="text-[13px] font-semibold">
          {preview.stores.length} stores · {newStores} new, {preview.stores.length - newStores} already here
        </p>
        <p className="text-muted text-[12px]">
          {[...zones.entries()].map(([zone, count]) => `${count} on ${zone} time`).join(" · ")}
        </p>
      </div>

      <div>
        <p className="text-[13px] font-semibold">
          Hierarchy · {preview.groupedBy === "leaders" ? "a region per vice president, a district per director of operations" : "as the sheet names it"}
        </p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {preview.structure.map((region) => (
            <li key={region.region} className="text-[12px]">
              <span className="font-medium">{region.region}</span>
              <span className="text-muted">
                {" — "}
                {region.districts
                  .map((district) => `${district} (${districtSize.get(`${region.region}::${district}`) ?? 0})`)
                  .join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[13px] font-semibold">
          {preview.people.length} people · {newPeople} new, {preview.people.length - newPeople} already here
        </p>
        <p className="text-muted text-[12px]">
          {ROLE_ORDER.filter((role) => byRole.has(role))
            .map((role) => `${byRole.get(role)} ${byRole.get(role) === 1 ? ROLE_LABELS[role] : plural(ROLE_LABELS[role])}`)
            .join(" · ")}
        </p>
        {changes.length ? (
          <ul className="mt-1 flex flex-col gap-0.5">
            {changes.map((line) => (
              <li key={line} className="text-[12px]" style={{ color: "var(--warn)" }}>
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {preview.issues.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {preview.issues.slice(0, 8).map((issue, index) => (
            <li key={index} className="text-muted text-[12px]">
              {issue.row ? `Row ${issue.row}: ` : ""}
              {issue.message}
            </li>
          ))}
          {preview.issues.length > 8 ? <li className="text-faint text-[12px]">…and {preview.issues.length - 8} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function Result({ state }: { state: RosterImportState }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--pass-bg)", color: "var(--pass)" }}>
        ✓ {state.message}
      </p>

      {state.created && state.created.length > 0 ? (
        <div className="rounded-lg border">
          <div className="border-b px-3 py-2">
            <p className="text-[12px] font-semibold">
              {state.created.length} new account{state.created.length === 1 ? "" : "s"} — give these out
            </p>
            <p className="text-faint mt-0.5 text-[12px]">
              Shown once, here, and not emailed. Each person can change theirs under Your account once they are in.
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {state.created.map((person) => (
              <div key={person.email} className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-1.5 last:border-b-0">
                <span className="text-[12px]">
                  {person.name} <span className="text-muted">{person.email}</span>
                </span>
                <code className="text-[12px] font-semibold">{person.password}</code>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {state.issues && state.issues.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {state.issues.slice(0, 12).map((issue, index) => (
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
