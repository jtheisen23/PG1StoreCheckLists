/**
 * Which stored walk, if any, an incoming submission is — and where it goes if
 * it is a new one.
 *
 * A device names each walk with a `clientKey` so an offline outbox can replay
 * it safely. A scheduled walk's key is stable per store / schedule / business
 * day, so after a walk is voided the store's redo arrives on the same key as
 * the walk it replaces — and so does a late replay of the voided walk itself,
 * from a device that was offline when it was voided. The key alone cannot tell
 * those two apart; the instant the walk started can. A device's outbox carries
 * that instant unchanged on every replay, and the server stores it as
 * `Submission.startedAt`, so a replay matches its stored row exactly while a
 * walk started later never does.
 *
 * A voided walk keeps its key (the column is unique, and rewriting it would
 * lose the one thing a late replay can be recognised by). A new walk arriving
 * on a key a void has released is stored beside it at `<key>:after-void-<n>`.
 *
 * Pure, so it is shared by the server and tested on its own.
 */

export type StoredWalkStatus = "IN_PROGRESS" | "SUBMITTED" | "VOIDED";

export interface StoredWalk {
  clientKey: string | null;
  status: StoredWalkStatus;
  startedAt: Date;
}

export type WalkKeyDecision<T extends StoredWalk> =
  /** Not stored yet: create it under this key. */
  | { action: "create"; clientKey: string }
  /** Already accounted for by this stored walk: return it, store nothing. */
  | { action: "existing"; walk: T };

const AFTER_VOID = ":after-void-";

/** The key the `n`th walk after a void is stored under (`n` from 1). */
export function afterVoidKey(clientKey: string, n: number): string {
  return `${clientKey}${AFTER_VOID}${n}`;
}

/** Every stored key that belongs to `clientKey` starts with this. */
export function afterVoidPrefix(clientKey: string): string {
  return `${clientKey}${AFTER_VOID}`;
}

/**
 * The instant a walk started, as its device reported it — or null when the
 * payload carries no time of its own, in which case the server stamps one and
 * a replay cannot be recognised by it. The server stores exactly this as
 * `startedAt`, falling back to the submission time, so the two always agree.
 */
export function reportedStart(payload: {
  startedAt?: string | null;
  submittedAt?: string | null;
}): Date | null {
  const raw = payload.startedAt ?? payload.submittedAt;
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Decides what to do with a submission sent under `clientKey`, given every
 * stored walk on that key or one derived from it.
 *
 * - The same walk sent again — its start matches a stored walk on the key —
 *   is that walk, voided or not. A voided walk replayed from an offline
 *   device therefore never comes back as a fresh one that counts.
 * - A different walk on a key still held by a walk that counts is treated as
 *   that walk, exactly as before voiding existed: the store has already met
 *   this schedule today.
 * - A different walk on a key a void has released is new, and is stored at the
 *   first `after-void` key nothing holds.
 * - With no reported start there is nothing to tell a replay from a new walk
 *   by, so a held key is always treated as the walk that holds it. That can
 *   drop a redo; it can never resurrect a voided walk.
 */
export function resolveWalkKey<T extends StoredWalk>(
  clientKey: string,
  startedAt: Date | null,
  stored: readonly T[],
): WalkKeyDecision<T> {
  const byKey = new Map<string, T>();
  for (const walk of stored) {
    if (walk.clientKey !== null && belongsTo(clientKey, walk.clientKey)) {
      byKey.set(walk.clientKey, walk);
    }
  }

  if (startedAt) {
    const at = startedAt.getTime();
    for (const walk of byKey.values()) {
      if (walk.startedAt.getTime() === at) return { action: "existing", walk };
    }
  }

  for (let n = 0; ; n += 1) {
    const key = n === 0 ? clientKey : afterVoidKey(clientKey, n);
    const walk = byKey.get(key);
    if (!walk) return { action: "create", clientKey: key };
    if (walk.status !== "VOIDED" || !startedAt) return { action: "existing", walk };
  }
}

/** True for `clientKey` itself and for `<clientKey>:after-void-<n>`, n ≥ 1. */
function belongsTo(clientKey: string, key: string): boolean {
  if (key === clientKey) return true;
  const prefix = afterVoidPrefix(clientKey);
  if (!key.startsWith(prefix)) return false;
  return /^[1-9]\d*$/.test(key.slice(prefix.length));
}
