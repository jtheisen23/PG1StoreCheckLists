export interface OfflineAnswer {
  itemId: string;
  boolValue?: boolean | null;
  numericValue?: number | null;
  value?: string | null;
  selected?: string[];
  naFlag?: boolean;
  note?: string | null;
  /** Local photo ids; resolved to uploaded URLs at sync time. */
  photoIds?: string[];
}

export interface OfflineDraft {
  clientKey: string;
  locationId: string;
  locationName: string;
  templateId: string;
  templateName: string;
  scheduleId: string | null;
  daypart: string;
  startedAt: string;
  updatedAt: string;
  answers: Record<string, OfflineAnswer>;
  notes?: string;
}

export interface OfflinePhoto {
  id: string;
  clientKey: string;
  itemId: string;
  blob: Blob;
  mimeType: string;
  createdAt: string;
}

export type OutboxStatus = "pending" | "sending" | "failed";

export interface OutboxEntry {
  clientKey: string;
  draft: OfflineDraft;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  queuedAt: string;
  /** Set once the server has accepted it; the row is then removed. */
  latitude?: number | null;
  longitude?: number | null;
}

export interface SyncState {
  online: boolean;
  pending: number;
  failed: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}
