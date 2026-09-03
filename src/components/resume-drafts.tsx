"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { deleteDraft, listDrafts } from "@/lib/offline/db";
import { relativeTime } from "@/lib/time";
import type { OfflineDraft } from "@/lib/offline/types";
import { Card } from "@/components/ui";

/** Surfaces half-finished walks saved on this device. */
export function ResumeDrafts({ locationId }: { locationId: string }) {
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);

  useEffect(() => {
    let cancelled = false;
    listDrafts()
      .then((all) => {
        if (!cancelled) {
          setDrafts(
            all
              .filter((d) => d.locationId === locationId)
              .filter((d) => Object.keys(d.answers ?? {}).length > 0)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  if (!drafts.length) return null;

  return (
    <Card className="mb-5 p-4">
      <p className="text-[13px] font-semibold">Unfinished on this device</p>
      <ul className="mt-2 flex flex-col gap-2">
        {drafts.map((draft) => (
          <li key={draft.clientKey} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{draft.templateName}</p>
              <p className="text-muted text-[12px]">
                {Object.keys(draft.answers).length} answered ·{" "}
                {relativeTime(draft.updatedAt)}
              </p>
            </div>
            {draft.scheduleId ? (
              <Link
                href={`/run/${draft.scheduleId}`}
                className="text-[13px] font-medium"
                style={{ color: "var(--info)" }}
              >
                Resume
              </Link>
            ) : null}
            <button
              type="button"
              className="text-muted text-[13px]"
              onClick={() => {
                void deleteDraft(draft.clientKey);
                setDrafts((prev) =>
                  prev.filter((d) => d.clientKey !== draft.clientKey),
                );
              }}
            >
              Discard
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
