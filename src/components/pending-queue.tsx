"use client";

import { useEffect, useState } from "react";

import { listOutbox } from "@/lib/offline/db";
import {
  discardQueued,
  flushOutbox,
  onSyncChange,
  retryQueued,
} from "@/lib/offline/sync";
import type { OutboxEntry } from "@/lib/offline/types";
import { relativeTime } from "@/lib/time";
import { Badge, Card, EmptyState } from "@/components/ui";
import { Button } from "@/components/buttons";

export function PendingQueue() {
  const [entries, setEntries] = useState<OutboxEntry[] | null>(null);

  const reload = () => {
    listOutbox()
      .then((rows) =>
        setEntries(rows.sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))),
      )
      .catch(() => setEntries([]));
  };

  useEffect(() => {
    reload();
    return onSyncChange(reload);
  }, []);

  if (entries === null) {
    return <p className="text-muted text-[13px]">Checking this device…</p>;
  }

  if (!entries.length) {
    return (
      <Card>
        <EmptyState
          title="Everything is synced"
          description="No checklists are waiting on this device."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => void flushOutbox()}>Try sync now</Button>
      </div>

      {entries.map((entry) => (
        <Card key={entry.clientKey} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{entry.draft.templateName}</p>
              <p className="text-muted mt-0.5 text-[12px]">
                {entry.draft.locationName} · completed{" "}
                {relativeTime(entry.queuedAt)}
                {entry.attempts > 0 ? ` · ${entry.attempts} attempt(s)` : ""}
              </p>
            </div>
            <Badge tone={entry.status === "failed" ? "fail" : "warn"}>
              {entry.status === "failed" ? "Needs attention" : "Waiting"}
            </Badge>
          </div>

          {entry.lastError ? (
            <p
              className="mt-2.5 rounded-lg px-3 py-2 text-[12px]"
              style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
            >
              {entry.lastError}
            </p>
          ) : null}

          {entry.status === "failed" ? (
            <div className="mt-3 flex gap-2">
              <Button onClick={() => void retryQueued(entry.clientKey)}>
                Retry
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (
                    confirm(
                      "Discard this checklist? The answers and photos on this device will be deleted.",
                    )
                  ) {
                    void discardQueued(entry.clientKey);
                  }
                }}
              >
                Discard
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
