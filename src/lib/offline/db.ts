"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OfflineDraft, OfflinePhoto, OutboxEntry } from "./types";

interface ChecklistDB extends DBSchema {
  drafts: { key: string; value: OfflineDraft };
  outbox: { key: string; value: OutboxEntry };
  photos: {
    key: string;
    value: OfflinePhoto;
    indexes: { "by-clientKey": string };
  };
  cache: { key: string; value: { key: string; data: unknown; storedAt: string } };
}

let dbPromise: Promise<IDBPDatabase<ChecklistDB>> | null = null;

function db() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable in this environment.");
  }
  dbPromise ??= openDB<ChecklistDB>("pg1-checklists", 1, {
    upgrade(database) {
      database.createObjectStore("drafts", { keyPath: "clientKey" });
      database.createObjectStore("outbox", { keyPath: "clientKey" });
      const photos = database.createObjectStore("photos", { keyPath: "id" });
      photos.createIndex("by-clientKey", "clientKey");
      database.createObjectStore("cache", { keyPath: "key" });
    },
  });
  return dbPromise;
}

export const hasOfflineStorage = () => typeof indexedDB !== "undefined";

// --- drafts ---------------------------------------------------------------

export async function saveDraft(draft: OfflineDraft) {
  return (await db()).put("drafts", draft);
}

export async function getDraft(clientKey: string) {
  return (await db()).get("drafts", clientKey);
}

export async function listDrafts(): Promise<OfflineDraft[]> {
  return (await db()).getAll("drafts");
}

export async function deleteDraft(clientKey: string) {
  return (await db()).delete("drafts", clientKey);
}

/** Finds an in-progress draft for a schedule so a reload resumes the walk. */
export async function findDraftForSchedule(
  locationId: string,
  templateId: string,
  scheduleId: string | null,
) {
  const drafts = await listDrafts();
  return drafts.find(
    (d) =>
      d.locationId === locationId &&
      d.templateId === templateId &&
      d.scheduleId === scheduleId,
  );
}

// --- photos ---------------------------------------------------------------

export async function savePhoto(photo: OfflinePhoto) {
  return (await db()).put("photos", photo);
}

export async function getPhoto(id: string) {
  return (await db()).get("photos", id);
}

export async function getPhotosFor(clientKey: string): Promise<OfflinePhoto[]> {
  return (await db()).getAllFromIndex("photos", "by-clientKey", clientKey);
}

export async function deletePhoto(id: string) {
  return (await db()).delete("photos", id);
}

export async function deletePhotosFor(clientKey: string) {
  const photos = await getPhotosFor(clientKey);
  const database = await db();
  const tx = database.transaction("photos", "readwrite");
  await Promise.all(photos.map((p) => tx.store.delete(p.id)));
  await tx.done;
}

// --- outbox ---------------------------------------------------------------

export async function enqueue(entry: OutboxEntry) {
  return (await db()).put("outbox", entry);
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  return (await db()).getAll("outbox");
}

export async function dequeue(clientKey: string) {
  return (await db()).delete("outbox", clientKey);
}

// --- generic cache (templates, due lists) ---------------------------------

export async function putCache(key: string, data: unknown) {
  return (await db()).put("cache", { key, data, storedAt: new Date().toISOString() });
}

export async function getCache<T>(key: string): Promise<T | null> {
  const row = await (await db()).get("cache", key);
  return (row?.data as T) ?? null;
}
