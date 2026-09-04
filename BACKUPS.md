# Backups, deletion and recovery

## What you actually set up

**One database.** The backup is not a second database you create, connect to or
maintain.

| Thing | Who creates it | Do you touch it? |
|---|---|---|
| Your Postgres database | You, once, at deploy | Yes — the live one the app reads and writes |
| Its automatic backups | Your database host, continuously | No, not until something goes wrong |
| `npm run db:backup` files | You, whenever you like | Optional extra copies you keep yourself |

Neon (and every comparable host) records changes to your one database
continuously and lets you rewind to any moment inside a retention window.
There is no second connection string, nothing to keep in sync, and no separate
bill for it — it is a property of the database you already have.

A recovery is the only time a second database briefly exists: you create a
branch as of a past timestamp, connect to it, take what you need, and throw it
away. See [Recovering](#recovering-something-you-lost) below.

The one thing you must actively decide is **how far back you can rewind**. On
Neon's free tier that window is short, and lengthening it needs a paid plan —
see [Retention on a free plan](#retention-on-a-free-plan) below.

## The short version

Nothing on a checklist, and nothing a store has ever recorded, can be deleted
by the app. Removing an item **archives** it: the row stays in the database, so
it is in every backup taken from now on. The database itself refuses the
destructive deletes, so a future code change cannot quietly reintroduce one.

## How a backup relates to a deletion

A backup is a photograph of the database at a moment in time. This matters
because the intuition "the delete propagated into my backup" is not how it
works — and the way it *does* work is the part worth planning around.

- A delete today **cannot** change a backup taken yesterday. That file is
  already written; the row is still in it.
- Backups taken **after** the delete will not contain the row.
- So the row survives only as long as the last backup that still holds it.
  Once your retention window rolls past that point, it is gone everywhere.

Two consequences:

1. **Retention length is the real setting.** A 7-day window means a deletion
   noticed on day 8 is unrecoverable. Nobody notices a missing checklist item
   in a week.
2. **Not deleting beats recovering.** Which is why the app archives instead.

## What the app will not let you delete

| You try to | What happens |
|---|---|
| Remove a checklist item | Archived — hidden from new walks, kept in the database, restorable |
| Delete a store | Refused by the database; close it instead (it stops being scheduled, history stays) |
| Delete a checklist that has submissions | Refused by the database; archive it instead |
| Delete a section holding answered items | Refused by the database |
| Delete a person who has submitted | Refused by the database; deactivate instead (their sessions end immediately) |

These are foreign-key constraints (`ON DELETE RESTRICT`), not application
checks, so they hold against a migration, a script, or a hand-typed `DELETE`.

The one deliberate exception: an archived item **nobody has ever answered** can
be permanently deleted from the builder. It is behind a separate button, it is
only offered when the answer count is zero, and the item's full definition is
written to the activity log first.

## Your database host

The app does not manage backups — your Postgres host does, and it is the layer
that protects you from everything the app cannot (a dropped table, a bad
migration, a mistaken restore).

### Recovering something you lost

**Neon** (what [DEPLOY.md](./DEPLOY.md) sets up)

- Point-in-time restore is on by default. The window is under *Project settings
  → Backup & restore*. On the free plan it is short and cannot be extended;
  longer windows are a paid feature. What that means in practice is in
  [Retention on a free plan](#retention-on-a-free-plan).
- To recover: create a branch from a timestamp before the mistake, connect to
  it, confirm the data is there, then either copy the rows across or promote
  the branch. Restoring to a branch first means you verify before committing.

**Anywhere else** — turn on automated daily backups and PITR, set the retention
window deliberately, and make sure someone other than you can perform a
restore.

## Retention on a free plan

A long rewind window is a paid feature on Neon, so on the free plan you get a
short one. That is worth being clear-eyed about rather than pretending
otherwise.

**What the short window does and does not cover.** It covers the sudden,
obvious disasters — a bad migration, a dropped table, a script that ran against
the wrong database. You notice those within minutes, well inside any window.

What it does not cover is the quiet mistake nobody spots for a week. Which is
exactly why the app was built so those cannot happen: removing a checklist item
archives it, and stores, checklists, sections and items that history depends on
cannot be deleted at all — the database refuses. The everyday mistakes a short
window would fail to protect you from are the ones that are now impossible.

**A reasonable plan while you are piloting**

1. Stay on the free plan.
2. Run `npm run db:backup` before anything risky — a migration, a bulk import,
   a `db:seed`. It takes seconds and the file is yours.
3. Take one on a routine you will actually keep. Weekly is plenty during a
   pilot; a dump of a fleet this size is a few MB.
4. Keep an exported CSV of each master checklist (from its builder page)
   alongside your other operating documents.

**Before real stores depend on it**, pay for the longer window. Once managers
are recording food-safety temperatures that you may need to produce months
later, a one-day rewind is not a retention policy. The cost is small next to
re-creating a quarter of records you cannot re-create.

There is also a manual-only GitHub Action in `.github/workflows/` that runs
`npm run db:backup` and keeps the file as a build artifact. Read the warning at
the top of it first: a dump contains password hashes and every photo taken in
your stores, so where those files land matters.

## Snapshots you hold yourself

Useful before a risky change, and as an off-host copy your provider cannot lose.

```bash
npm run db:backup                    # ./backups/pg1-<timestamp>.dump
npm run db:backup -- --out /somewhere
```

Needs `pg_dump` (macOS `brew install libpq`, Ubuntu
`sudo apt install postgresql-client`). The file is a compressed custom-format
dump of everything — submissions, responses, corrective actions, the activity
log, and photo bytes.

Restore it into an **empty** database:

```bash
pg_restore --no-owner --no-privileges -d "<target connection string>" pg1-….dump
```

`backups/` is gitignored. Treat a dump as sensitive: it contains password
hashes and every photo taken in your stores.

## Practise the restore

An untested backup is a hope, not a plan. Once, before go-live, and after any
change to how data is stored:

1. `npm run db:backup`
2. Create a scratch database and restore into it.
3. Count what came back and compare against production:

```sql
SELECT 'submissions' AS thing, count(*)::text FROM "Submission"
UNION ALL SELECT 'item responses', count(*)::text FROM "ItemResponse"
UNION ALL SELECT 'archived items', count(*)::text FROM "TemplateItem" WHERE "archivedAt" IS NOT NULL
UNION ALL SELECT 'photos', count(*)::text FROM "StoredFile"
UNION ALL SELECT 'activity rows', count(*)::text FROM "ActivityLog";
```

4. Point a local app at the restored copy and sign in.

## Photos are in the backup — while they live in the database

With the default `database` photo driver, evidence photos are bytes in
Postgres, so a database backup contains them and a restore brings them back.
Verified on a real round trip: 11,534 submissions, 146,711 responses, an
archived item with all 2,772 of its answers, and 733 kB of photos, all present
after restore.

**If you switch to `blob`, that stops being true.** Photos then live in object
storage, outside the database, and a Postgres backup holds only the URLs
pointing at them. You would need to back up the blob store separately, and a
database restore to an earlier point would leave rows referring to photos that
may have since been deleted. It is a fair trade once photo volume demands it —
but make it knowingly, and sort out photo backups at the same time.

## Exporting a checklist

A master checklist can be exported to CSV from its builder page — the same
format the importer reads, so it round-trips. Archived items are included and
marked. Keeping an exported copy of each master with your other operating
documents means the definition survives even the loss of the whole database.

## A reasonable routine

- Host PITR retention: **30 days**.
- `npm run db:backup` before any migration or bulk change, kept off-host.
- Export each master checklist to CSV whenever you change it meaningfully.
- Restore drill once before go-live, then once a quarter.
- Decide a retention policy for activity rows and photos
  (`npm run db:prune -- --logs 400 --photos 400`) rather than letting the
  database grow until someone panics.
