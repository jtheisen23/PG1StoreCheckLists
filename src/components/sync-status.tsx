"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { onSyncChange, refreshSyncState, startSync } from "@/lib/offline/sync";
import type { SyncState } from "@/lib/offline/types";

export function SyncStatus() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    startSync();
    const unsubscribe = onSyncChange(setState);
    void refreshSyncState();

    const onNetwork = () => void refreshSyncState();
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    return () => {
      unsubscribe();
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
    };
  }, []);

  if (!state) return null;

  const queued = state.pending + state.failed;

  // Everything sent and the connection is up: nothing worth saying.
  if (state.online && queued === 0) return null;

  const { label, color, background } = describe(state, queued);

  const content = (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium"
      style={{ color, background }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );

  return queued > 0 ? (
    <Link href="/pending" title="Review submissions waiting to sync">
      {content}
    </Link>
  ) : (
    content
  );
}

function describe(state: SyncState, queued: number) {
  if (!state.online) {
    return {
      label: queued ? `Offline · ${queued} waiting` : "Offline",
      color: "var(--warn)",
      background: "var(--warn-bg)",
    };
  }
  if (state.syncing) {
    return { label: "Syncing…", color: "var(--info)", background: "var(--info-bg)" };
  }
  if (state.failed > 0) {
    return {
      label: `${state.failed} need attention`,
      color: "var(--fail)",
      background: "var(--fail-bg)",
    };
  }
  return {
    label: `${state.pending} waiting`,
    color: "var(--warn)",
    background: "var(--warn-bg)",
  };
}
