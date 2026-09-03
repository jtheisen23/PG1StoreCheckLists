"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Card } from "@/components/ui";
import { Button } from "@/components/buttons";
import { ACTION_GROUPS, type ActivityFilters as Filters } from "@/lib/activity-filters";

const field =
  "h-9 w-full rounded-lg border bg-[var(--surface)] px-2.5 text-[13px] outline-none focus:border-[var(--color-brand-500)]";

export function ActivityFilters({
  filters,
  locations,
  people,
  total,
}: {
  filters: Filters;
  locations: { id: string; name: string; code: string }[];
  people: { id: string; name: string }[];
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Filtering re-runs the server query; changing any control navigates.
  function apply(patch: Record<string, string>) {
    const params = new URLSearchParams();
    const next: Record<string, string | undefined> = {
      group: filters.group,
      location: filters.locationId,
      person: filters.userId,
      from: filters.from,
      to: filters.to,
      ...patch,
    };
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.push(`/activity${query ? `?${query}` : ""}`));
  }

  const active =
    filters.group || filters.locationId || filters.userId || filters.from || filters.to;

  return (
    <Card className="mb-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-faint text-[12px] font-medium">Event type</span>
          <select
            value={filters.group ?? ""}
            disabled={pending}
            onChange={(event) => apply({ group: event.target.value, page: "" })}
            className={field}
          >
            <option value="">All events</option>
            {Object.entries(ACTION_GROUPS).map(([key, group]) => (
              <option key={key} value={key}>
                {group.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-faint text-[12px] font-medium">Store</span>
          <select
            value={filters.locationId ?? ""}
            disabled={pending}
            onChange={(event) => apply({ location: event.target.value, page: "" })}
            className={field}
          >
            <option value="">All stores</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                #{location.code} {location.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-faint text-[12px] font-medium">Person</span>
          <select
            value={filters.userId ?? ""}
            disabled={pending}
            onChange={(event) => apply({ person: event.target.value, page: "" })}
            className={field}
          >
            <option value="">Anyone</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-faint text-[12px] font-medium">From</span>
          <input
            type="date"
            value={filters.from ?? ""}
            disabled={pending}
            onChange={(event) => apply({ from: event.target.value, page: "" })}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-faint text-[12px] font-medium">To</span>
          <input
            type="date"
            value={filters.to ?? ""}
            disabled={pending}
            onChange={(event) => apply({ to: event.target.value, page: "" })}
            className={field}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-muted text-[12px]">
          {pending ? "Filtering…" : `${total.toLocaleString()} matching events`}
        </p>
        {active ? (
          <Button
            size="sm"
            onClick={() => startTransition(() => router.push("/activity"))}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
