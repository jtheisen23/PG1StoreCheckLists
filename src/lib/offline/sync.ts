"use client";

import {
  deletePhotosFor,
  deleteDraft,
  dequeue,
  enqueue,
  getPhotosFor,
  getQueued,
  listOutbox,
} from "./db";
import { closeRatingKey } from "@/lib/close-rating";
import type {
  CloseRatingOutboxEntry,
  OfflineCloseRating,
  OfflineDraft,
  OutboxEntry,
  SyncState,
  WalkOutboxEntry,
} from "./types";

const SYNC_EVENT = "pg1:sync";
const MAX_ATTEMPTS = 6;

let syncing = false;
/** Something was queued while a pass was running: run another straight after. */
let rerun = false;
let lastSyncedAt: string | null = null;
let lastError: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function onSyncChange(handler: (state: SyncState) => void) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<SyncState>).detail);
  window.addEventListener(SYNC_EVENT, listener);
  return () => window.removeEventListener(SYNC_EVENT, listener);
}

async function broadcast() {
  const entries = await listOutbox();
  const state: SyncState = {
    online: navigator.onLine,
    pending: entries.filter((e) => e.status !== "failed").length,
    failed: entries.filter((e) => e.status === "failed").length,
    syncing,
    lastSyncedAt,
    lastError,
  };
  window.dispatchEvent(new CustomEvent<SyncState>(SYNC_EVENT, { detail: state }));
  return state;
}

export async function refreshSyncState() {
  return broadcast();
}

/** Moves a finished walk into the outbox and immediately tries to send it. */
export async function queueSubmission(
  draft: OfflineDraft,
  coords?: { latitude: number; longitude: number } | null,
) {
  const entry: WalkOutboxEntry = {
    kind: "walk",
    clientKey: draft.clientKey,
    draft,
    status: "pending",
    attempts: 0,
    queuedAt: new Date().toISOString(),
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  };
  await enqueue(entry);
  await deleteDraft(draft.clientKey);
  await broadcast();
  return flushOutbox();
}

/**
 * Queues an opener's close rating and tries to send it at once. Keyed by store
 * and night: areas are rated one at a time, so a rating for one area joins
 * any still waiting for the others, and a second tap on the same area
 * replaces the first.
 */
export async function queueCloseRating(rating: OfflineCloseRating) {
  const clientKey = closeRatingKey(rating.locationId, rating.closeDate);
  const waiting = await getQueued(clientKey);
  const earlier = waiting?.kind === "close-rating" ? waiting.rating.ratings : [];
  const merged = [
    ...earlier.filter((old) => !rating.ratings.some((next) => next.areaId === old.areaId)),
    ...rating.ratings,
  ];
  const entry: CloseRatingOutboxEntry = {
    kind: "close-rating",
    clientKey,
    rating: { ...rating, ratings: merged },
    status: "pending",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  };
  await enqueue(entry);
  await broadcast();
  return flushOutbox();
}

async function uploadPhotos(clientKey: string) {
  const photos = await getPhotosFor(clientKey);
  const byPhotoId = new Map<
    string,
    { url: string; pathname: string; mimeType: string; size: number }
  >();

  for (const photo of photos) {
    const form = new FormData();
    form.append(
      "file",
      new File([photo.blob], `${photo.id}.jpg`, { type: photo.mimeType }),
    );
    const response = await fetch("/api/uploads", { method: "POST", body: form });
    if (!response.ok) {
      throw new Error(`Photo upload failed (${response.status})`);
    }
    byPhotoId.set(photo.id, await response.json());
  }

  return byPhotoId;
}

async function sendWalk(entry: WalkOutboxEntry): Promise<Response> {
  const uploaded = await uploadPhotos(entry.clientKey);

  const payload = {
    clientKey: entry.clientKey,
    locationId: entry.draft.locationId,
    templateId: entry.draft.templateId,
    scheduleId: entry.draft.scheduleId,
    daypart: entry.draft.daypart,
    startedAt: entry.draft.startedAt,
    submittedAt: entry.queuedAt,
    notes: entry.draft.notes ?? null,
    latitude: entry.latitude ?? null,
    longitude: entry.longitude ?? null,
    answers: Object.values(entry.draft.answers).map((answer) => ({
      itemId: answer.itemId,
      boolValue: answer.boolValue ?? null,
      numericValue: answer.numericValue ?? null,
      value: answer.value ?? null,
      selected: answer.selected ?? [],
      naFlag: answer.naFlag ?? false,
      note: answer.note ?? null,
      // The spec weight stays behind: the server judges against its own.
      subSpecId: answer.subSpecId ?? null,
      photos: (answer.photoIds ?? [])
        .map((id) => uploaded.get(id))
        .filter(Boolean),
    })),
  };

  return fetch("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** No time travels with a rating: the server stamps it when it arrives. */
async function sendCloseRating(entry: CloseRatingOutboxEntry): Promise<Response> {
  const { locationId, closeDate, ratings } = entry.rating;
  return fetch("/api/close-ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locationId,
      closeDate,
      ratings: ratings.map(({ areaId, acceptable, note }) => ({ areaId, acceptable, note })),
    }),
  });
}

function isPermanent(status: number) {
  // 4xx other than 408/429 will never succeed on retry.
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Drains the outbox: uploads each queued walk's photos and posts the walk,
 * and posts each queued close rating. Network errors leave the entry queued
 * with backoff; validation errors mark it failed so a person can look at it.
 */
export async function flushOutbox(): Promise<SyncState> {
  if (syncing) {
    rerun = true;
    return broadcast();
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return broadcast();

  syncing = true;
  await broadcast();

  try {
    const entries = await listOutbox();
    for (const entry of entries.filter((e) => e.status !== "failed")) {
      try {
        await enqueue({ ...entry, status: "sending" });
        const response =
          entry.kind === "close-rating"
            ? await sendCloseRating(entry)
            : await sendWalk(entry);

        if (response.ok) {
          // Something newer may have joined this entry while it was in
          // flight (another area rated). Then it stays queued for the next
          // pass instead of going out with the copy that was just sent.
          const now = await getQueued(entry.clientKey);
          if (now && now.queuedAt !== entry.queuedAt) {
            await enqueue({ ...now, status: "pending" });
            continue;
          }
          await dequeue(entry.clientKey);
          await deletePhotosFor(entry.clientKey);
          lastSyncedAt = new Date().toISOString();
          lastError = null;
          continue;
        }

        const body = await response.json().catch(() => ({}));
        const message = body?.error ?? `Server responded ${response.status}`;

        if (isPermanent(response.status)) {
          await enqueue({
            ...entry,
            status: "failed",
            attempts: entry.attempts + 1,
            lastError: message,
          });
          lastError = message;
        } else {
          throw new Error(message);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to reach the server";
        const attempts = entry.attempts + 1;
        await enqueue({
          ...entry,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          lastError: message,
        });
        lastError = message;
        // Stop the pass; the retry timer will pick it back up.
        break;
      }
    }
  } finally {
    syncing = false;
  }

  if (rerun) {
    rerun = false;
    return flushOutbox();
  }

  const state = await broadcast();
  if (state.pending > 0) scheduleRetry();
  return state;
}

function scheduleRetry(delayMs = 20_000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushOutbox();
  }, delayMs);
}

let started = false;

/** Wires online/visibility listeners once per page load. */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("online", () => void flushOutbox());
  window.addEventListener("offline", () => void broadcast());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });

  void flushOutbox();
}

/** Clears an entry a person has given up on. */
export async function discardQueued(clientKey: string) {
  await dequeue(clientKey);
  await deletePhotosFor(clientKey);
  await broadcast();
}

/** Puts a failed entry back in line for another attempt. */
export async function retryQueued(clientKey: string) {
  const entries = await listOutbox();
  const entry = entries.find((e) => e.clientKey === clientKey);
  if (!entry) return;
  await enqueue({ ...entry, status: "pending", attempts: 0, lastError: undefined });
  await flushOutbox();
}
