"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import {
  createDistrict,
  createLocation,
  createRegion,
  type FormState,
} from "@/server/admin-service";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 text-[13px] outline-none focus:border-[var(--color-brand-500)]";

/** A short list covers most US operators; any IANA name is accepted. */
const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

type Step = "region" | "district" | "store";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Result({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-lg px-3 py-2 text-[12px]"
        style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
      >
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p
        className="rounded-lg px-3 py-2 text-[12px]"
        style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
      >
        {state.message ?? "Saved."}
      </p>
    );
  }
  return null;
}

export function OrgBuilder({
  regions,
  districts,
}: {
  regions: { id: string; name: string; code: string }[];
  districts: {
    id: string;
    name: string;
    code: string;
    region: { name: string };
  }[];
}) {
  // Start people on the step they can actually complete.
  const [step, setStep] = useState<Step>(
    regions.length === 0 ? "region" : districts.length === 0 ? "district" : "store",
  );

  return (
    <Card as="section" className="h-fit">
      <CardHeader title="Add" />
      <div className="flex gap-1.5 border-b px-5 py-3">
        {(["region", "district", "store"] as Step[]).map((value) => {
          const disabled =
            (value === "district" && regions.length === 0) ||
            (value === "store" && districts.length === 0);
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => setStep(value)}
              title={
                disabled
                  ? value === "district"
                    ? "Add a region first"
                    : "Add a district first"
                  : undefined
              }
              className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium capitalize disabled:opacity-40"
              style={
                step === value
                  ? { background: "var(--info-bg)", color: "var(--info)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {value}
            </button>
          );
        })}
      </div>

      {step === "region" ? <RegionForm /> : null}
      {step === "district" ? <DistrictForm regions={regions} /> : null}
      {step === "store" ? <StoreForm districts={districts} /> : null}
    </Card>
  );
}

function RegionForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createRegion, {});
  const form = usePreservedForm(state);

  return (
    <form {...form.props} action={formAction} className="flex flex-col gap-3.5 px-5 py-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Region name</span>
        <input name="name" required placeholder="Midwest" className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Short code</span>
        <input name="code" required placeholder="MW" className={field} />
      </label>
      <Result state={state} />
      <Submit label="Add region" />
    </form>
  );
}

function DistrictForm({ regions }: { regions: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(createDistrict, {});
  const form = usePreservedForm(state);

  return (
    <form {...form.props} action={formAction} className="flex flex-col gap-3.5 px-5 py-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Region</span>
        <select name="regionId" required className={field}>
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">District name</span>
        <input name="name" required placeholder="Chicago Metro" className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Short code</span>
        <input name="code" required placeholder="MW-CHI" className={field} />
      </label>
      <Result state={state} />
      <Submit label="Add district" />
    </form>
  );
}

function StoreForm({
  districts,
}: {
  districts: { id: string; name: string; region: { name: string } }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(createLocation, {});
  const form = usePreservedForm(state);

  return (
    <form {...form.props} action={formAction} className="flex flex-col gap-3.5 px-5 py-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">District</span>
        <select name="districtId" required className={field}>
          {districts.map((district) => (
            <option key={district.id} value={district.id}>
              {district.region.name} — {district.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Store name</span>
          <input name="name" required placeholder="Chicago Lakeview" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Number</span>
          <input name="code" required placeholder="1001" className={field} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Timezone</span>
        <input
          name="timezone"
          required
          defaultValue="America/Chicago"
          list="timezones"
          className={field}
        />
        <datalist id="timezones">
          {COMMON_TIMEZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <span className="text-faint text-[12px]">
          Decides this store&rsquo;s &ldquo;today&rdquo; and when its checklists are due.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Address</span>
        <input name="address" placeholder="123 Main St" className={field} />
      </label>

      <div className="grid grid-cols-[1fr_5rem_6rem] gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">City</span>
          <input name="city" placeholder="Chicago" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">State</span>
          <input name="state" placeholder="IL" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">ZIP</span>
          <input name="postalCode" placeholder="60657" className={field} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Phone</span>
        <input name="phone" placeholder="(312) 555-0100" className={field} />
      </label>

      <Result state={state} />
      <Submit label="Add store" />
    </form>
  );
}
