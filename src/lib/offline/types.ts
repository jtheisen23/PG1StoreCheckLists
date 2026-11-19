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
  /** A sub weighing: which sub and size. */
  subSpecId?: string | null;
  /** That spec's weight as this device knew it, to judge offline. Not sent. */
  specOz?: number | null;
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

interface OutboxBase {
  clientKey: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  queuedAt: string;
}

export interface WalkOutboxEntry extends OutboxBase {
  /** Absent on walks queued before close ratings shared the outbox. */
  kind?: "walk";
  draft: OfflineDraft;
  latitude?: number | null;
  longitude?: number | null;
}

/** An opener's morning close rating, waiting for a connection. */
export interface OfflineCloseRating {
  locationId: string;
  locationName: string;
  /** The night being rated, "YYYY-MM-DD". */
  closeDate: string;
  ratings: { areaId: string; areaName: string; acceptable: boolean; note: string | null }[];
}

export interface CloseRatingOutboxEntry extends OutboxBase {
  kind: "close-rating";
  rating: OfflineCloseRating;
}

/** Everything a device owes the server, in one queue with one sync status. */
export type OutboxEntry = WalkOutboxEntry | CloseRatingOutboxEntry;

export interface SyncState {
  online: boolean;
  pending: number;
  failed: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}
