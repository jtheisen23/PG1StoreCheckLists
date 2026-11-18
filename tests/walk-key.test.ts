import { test } from "node:test";
import assert from "node:assert/strict";

import {
  afterVoidKey,
  reportedStart,
  resolveWalkKey,
  type StoredWalk,
} from "../src/lib/walk-key";

// The shape the scheduled runner builds: store / schedule / business day.
const KEY = "loc_1:sched_1:2026-11-18";

const MORNING = new Date("2026-11-18T14:05:00.123Z");
const NOON = new Date("2026-11-18T17:40:12.456Z");
const AFTERNOON = new Date("2026-11-18T20:15:30.789Z");

function walk(
  clientKey: string,
  status: StoredWalk["status"],
  startedAt: Date,
): StoredWalk & { id: string } {
  return { id: `${clientKey}@${startedAt.toISOString()}`, clientKey, status, startedAt };
}

test("a walk nothing has stored yet is created under its own key", () => {
  assert.deepEqual(resolveWalkKey(KEY, MORNING, []), {
    action: "create",
    clientKey: KEY,
  });
});

test("an offline replay of a stored walk returns that walk", () => {
  const stored = walk(KEY, "SUBMITTED", MORNING);
  assert.deepEqual(resolveWalkKey(KEY, new Date(MORNING), [stored]), {
    action: "existing",
    walk: stored,
  });
});

test("a second walk of a schedule already met today is still the first one", () => {
  // Unchanged from before voiding existed: one walk satisfies the day.
  const stored = walk(KEY, "SUBMITTED", MORNING);
  assert.deepEqual(resolveWalkKey(KEY, NOON, [stored]), {
    action: "existing",
    walk: stored,
  });
});

test("the redo after a void is stored beside the voided walk, not dropped", () => {
  const voided = walk(KEY, "VOIDED", MORNING);
  assert.deepEqual(resolveWalkKey(KEY, NOON, [voided]), {
    action: "create",
    clientKey: afterVoidKey(KEY, 1),
  });
});

test("a late replay of the voided walk stays voided and is not stored again", () => {
  // A device that was offline when the walk was voided sends it again.
  const voided = walk(KEY, "VOIDED", MORNING);
  const redo = walk(afterVoidKey(KEY, 1), "SUBMITTED", NOON);
  for (const stored of [[voided], [voided, redo]]) {
    assert.deepEqual(resolveWalkKey(KEY, new Date(MORNING), stored), {
      action: "existing",
      walk: voided,
    });
  }
});

test("a replay of the redo is recognised as the redo", () => {
  const voided = walk(KEY, "VOIDED", MORNING);
  const redo = walk(afterVoidKey(KEY, 1), "SUBMITTED", NOON);
  assert.deepEqual(resolveWalkKey(KEY, new Date(NOON), [voided, redo]), {
    action: "existing",
    walk: redo,
  });
});

test("once the redo counts, a further walk that day is the redo", () => {
  const voided = walk(KEY, "VOIDED", MORNING);
  const redo = walk(afterVoidKey(KEY, 1), "SUBMITTED", NOON);
  assert.deepEqual(resolveWalkKey(KEY, AFTERNOON, [voided, redo]), {
    action: "existing",
    walk: redo,
  });
});

test("voiding the redo too frees the day a second time", () => {
  const stored = [
    walk(KEY, "VOIDED", MORNING),
    walk(afterVoidKey(KEY, 1), "VOIDED", NOON),
  ];
  assert.deepEqual(resolveWalkKey(KEY, AFTERNOON, stored), {
    action: "create",
    clientKey: afterVoidKey(KEY, 2),
  });
  // And each voided walk, replayed, is still itself.
  assert.equal(resolveWalkKey(KEY, new Date(MORNING), stored).action, "existing");
  assert.equal(resolveWalkKey(KEY, new Date(NOON), stored).action, "existing");
});

test("without a reported start a voided key is never reused", () => {
  // Nothing tells a replay from a new walk, so err towards not resurrecting.
  const voided = walk(KEY, "VOIDED", MORNING);
  assert.deepEqual(resolveWalkKey(KEY, null, [voided]), {
    action: "existing",
    walk: voided,
  });
});

test("keys that only look related are ignored", () => {
  // Another day's key, and stray suffixes, are not part of this walk's chain.
  const unrelated = [
    walk("loc_1:sched_1:2026-11-1", "VOIDED", MORNING),
    walk(`${KEY}:after-void-x`, "SUBMITTED", MORNING),
    walk(`${KEY}:after-void-01`, "SUBMITTED", MORNING),
    walk(`${KEY}:after-void-0`, "SUBMITTED", MORNING),
  ];
  assert.deepEqual(resolveWalkKey(KEY, MORNING, unrelated), {
    action: "create",
    clientKey: KEY,
  });
});

test("an unscheduled visit's key behaves the same way", () => {
  // A new visit is a new key, so voiding one does not touch the next...
  const visit = "loc_1:visit:3f2a9c1b0d4e";
  assert.deepEqual(resolveWalkKey("loc_1:visit:aa11bb22cc33", NOON, [walk(visit, "VOIDED", MORNING)]), {
    action: "create",
    clientKey: "loc_1:visit:aa11bb22cc33",
  });
  // ...and a replay of the voided visit is still recognised.
  const voided = walk(visit, "VOIDED", MORNING);
  assert.deepEqual(resolveWalkKey(visit, new Date(MORNING), [voided]), {
    action: "existing",
    walk: voided,
  });
});

test("the reported start is the walk's start, then its submit time", () => {
  assert.equal(
    reportedStart({ startedAt: MORNING.toISOString(), submittedAt: NOON.toISOString() })?.getTime(),
    MORNING.getTime(),
  );
  assert.equal(reportedStart({ submittedAt: NOON.toISOString() })?.getTime(), NOON.getTime());
  assert.equal(reportedStart({}), null);
  assert.equal(reportedStart({ startedAt: null, submittedAt: null }), null);
});
