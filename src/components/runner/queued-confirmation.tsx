"use client";

import { useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui";
import { LinkButton } from "@/components/buttons";
import { getQueued } from "@/lib/offline/db";
import { onSyncChange } from "@/lib/offline/sync";
import type { OutboxStatus } from "@/lib/offline/types";

export interface QueuedWalk {
  status: OutboxStatus | "sent";
  lastError?: string;
}

/**
 * Shown in place of the runner when a submitted walk is still on this device —
 * almost always because there is no connection. `/submitted` is a server page,
 * so offline the service worker answers it with the "You're offline" shell,
 * which reads as if the walk was lost. This says what actually happened, and
 * follows the outbox entry so the screen catches up if it uploads while open.
 */
export function QueuedConfirmation({
  clientKey,
  score,
  passed,
  initial,
}: {
  clientKey: string;
  score: number | null;
  passed: boolean;
  initial: QueuedWalk;
}) {
  const [walk, setWalk] = useState<QueuedWalk>(initial);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The submit button this replaced was at the foot of a long walk, so start
  // at the top with focus on the outcome rather than on nothing.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onSyncChange((sync) => {
      setOnline(sync.online);
      getQueued(clientKey)
        .then((entry) => {
          if (cancelled) return;
          // Gone from the outbox means the server accepted it.
          setWalk(
            entry ? { status: entry.status, lastError: entry.lastError } : { status: "sent" },
          );
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [clientKey]);

  const scored = score !== null ? `Scored ${score}%.` : null;
  const view =
    walk.status === "sent"
      ? {
          tone: passed ? "pass" : "warn",
          mark: passed ? "check" : "alert",
          title: "Checklist submitted",
          lines: [
            [
              scored ?? "Uploaded.",
              passed ? "Nice work." : "Failed items have been turned into corrective actions.",
            ].join(" "),
          ],
        }
      : walk.status === "failed"
        ? {
            tone: "fail",
            mark: "alert",
            title: "The server didn’t accept this walk",
            lines: [
              walk.lastError ?? "It was turned down when it was sent.",
              "It is still on this device. Open Pending to try again or discard it.",
            ],
          }
        : {
            tone: "info",
            mark: "check",
            title: "Saved on this device",
            lines: [
              online
                ? "It hasn’t reached the server yet and will keep trying on its own."
                : "It will upload when you’re back online.",
              [
                scored,
                passed ? null : "Failed items become corrective actions once it uploads.",
              ]
                .filter(Boolean)
                .join(" "),
            ].filter(Boolean),
          };

  return (
    <div className="mx-auto max-w-md pt-4">
      <Card className="p-7 text-center">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: `var(--${view.tone}-bg)` }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke={`var(--${view.tone})`}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {view.mark === "check" ? <path d="M5 13l4 4 10-10" /> : <path d="M12 8v5M12 17h.01" />}
          </svg>
        </div>

        <div aria-live="polite">
          {/* h2: the run page's h1 is the checklist name, still shown above. */}
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight outline-none"
          >
            {view.title}
          </h2>
          {view.lines.map((line) => (
            <p key={line} className="text-muted mt-1.5 text-[13px]">
              {line}
            </p>
          ))}
        </div>

        {walk.status === "pending" || walk.status === "sending" ? (
          <p className="text-faint mt-3 text-[12px]">
            You can close the app. It uploads the next time it&rsquo;s opened with a
            connection.
          </p>
        ) : null}

        <div className="mt-5 flex justify-center gap-2">
          {walk.status === "failed" ? (
            <>
              <LinkButton href="/pending" variant="primary">
                Review pending
              </LinkButton>
              <LinkButton href="/">Back to Today</LinkButton>
            </>
          ) : (
            <>
              <LinkButton href="/" variant="primary">
                Back to Today
              </LinkButton>
              {walk.status === "sent" ? (
                <LinkButton href="/actions">View actions</LinkButton>
              ) : null}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
