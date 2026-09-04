"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { LocationOption } from "@/lib/current-location";

export function LocationSwitcher({
  locations,
  currentId,
}: {
  locations: LocationOption[];
  currentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (locations.length <= 1) {
    const only = locations[0];
    return only ? (
      <div className="text-[13px]">
        <span className="font-medium">#{only.code}</span>{" "}
        <span className="text-muted">{only.name}</span>
      </div>
    ) : null;
  }

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Current store</span>
      <select
        value={currentId}
        disabled={pending}
        onChange={(event) => {
          const id = event.target.value;
          document.cookie = `pg1_location=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
          startTransition(() => router.refresh());
        }}
        className="h-9 min-w-0 max-w-[8.5rem] rounded-lg border bg-[var(--surface-raised)] px-2.5 text-[13px] outline-none focus:border-[var(--color-brand-500)] sm:max-w-[15rem]"
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            #{l.code} — {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
