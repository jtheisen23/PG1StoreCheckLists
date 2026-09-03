# PG1 Store Checklists

Daily operations execution for restaurants — a replacement for Zenput /
CrunchTime Operations Execution.

Store teams walk their checklists on a phone several times a day; the walks
work with no signal and upload when the connection comes back. Failed items
become tracked corrective actions, and leadership gets rollup dashboards by
region, district and store.

## What it does

**For the store**
- Today's due checklists per store, grouped into past due / due / completed
- A mobile-first runner with big touch targets: checkbox, pass/fail, numeric,
  temperature with range checking, choice, rating, photo, signature and text
- Works offline. Answers and photos are held on the device and sync
  automatically. A queued walk is safe to replay — the server deduplicates it.
- Failed items demand a note and a photo before the walk can be submitted

**For leadership**
- Rollup dashboard: completion, average score, past-due checklists, open
  actions, score trend, most-missed items, per-store comparison and a
  "stores needing attention" table
- Corrective actions with assignee, due date, priority, resolution note and
  proof photo, plus a verification step
- Location and district views, and a full activity log

**For administrators**
- Checklist builder with sections, item types, ranges, critical items,
  scoring weights and per-item rules for photos, notes and auto-raised actions
- Schedules: assign a published checklist to stores, at a daypart, on chosen
  days, with an availability window and a due time
- People and access: roles plus a scope (whole org, regions, districts or
  named stores) that decides exactly which stores someone can see and act on.
  **Add person** sits on the dashboard as well as the People screen, so an
  admin can onboard someone without leaving what they were looking at.
- A filterable activity log (by event type, store, person and date range) with
  CSV export

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Prisma + PostgreSQL · Recharts · IndexedDB for offline.

Photos and logs both live in Postgres by default, so a deployment needs one
database and nothing else.

No third-party auth service: sessions are signed cookies backed by revocable
database rows, with bcrypt password hashing.

## Running it locally

Requires Node 20+ and a PostgreSQL 14+ database.

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and AUTH_SECRET
npx prisma migrate deploy   # or: npm run db:push for a throwaway database
npm run db:seed             # optional: a demo fleet with 45 days of history
npm run dev
```

Generate `AUTH_SECRET` with `openssl rand -base64 32`.

### Demo accounts

`npm run db:seed` builds a 3-region, 8-district, ~63-store group with four
checklists, five schedules and about 11,000 historical submissions. Every seeded
account uses the password `checklists2026` (override with `SEED_PASSWORD`).

| Role | Email | Sees |
|---|---|---|
| Administrator | `admin@pg1.test` | Everything |
| Regional Director | `rd.midwest@pg1.test` | One region |
| District Manager | `dm.chicagometro@pg1.test` | One district |
| General Manager | `gm.1@pg1.test` | One store |
| Shift Manager | `mgr.1@pg1.test` | One store |

The seed wipes every table first — never point it at a live database.

## Deploying to Vercel

1. Create a Postgres database (Neon, Supabase or RDS) and set `DATABASE_URL`.
   If you connect through a pooler, run migrations against the direct
   (unpooled) URL.
2. Set `AUTH_SECRET` to a fresh 32+ character random string.
3. Photos default to the database, which works on serverless with nothing to
   provision. To move them to object storage instead, create a Vercel Blob
   store and set `BLOB_READ_WRITE_TOKEN` — see **Photo storage** below.
4. Deploy. `npm run build` runs `prisma generate` first.
5. Run `npx prisma migrate deploy` against the production database.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests for scoring and timezone logic |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:push` | Sync the schema without a migration (dev only) |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Load the demo fleet |
| `npm run db:prune` | Trim old activity rows and photo bytes |
| `npm run db:studio` | Prisma Studio |

## How the pieces fit

```
src/
  app/
    (app)/            Authenticated shell: today, dashboard, actions,
                      submissions, locations, activity, admin
    api/              Submission intake, photo upload, photo serving
    login/            Sign-in and the session server actions
  components/
    runner/           The checklist runner and its item inputs
    charts.tsx        Dashboard visualisations
  lib/
    auth.ts           Sessions, password hashing, current user
    permissions.ts    Roles and scope → the stores a person may see
    scoring.ts        Pass/fail and weighted scoring (pure, unit-tested)
    time.ts           Per-store timezone maths (pure, unit-tested)
    offline/          IndexedDB drafts, photo blobs, outbox and sync
  server/
    submissions.ts    Submission intake, scoring, corrective-action creation
    schedules.ts      What each store owes today
    dashboard.ts      Rollup aggregation
    admin-service.ts  Template, schedule and user management
```

### Scoring

Each item carries a weight; the score is earned weight over scored weight, so a
3-weight food-safety item counts three times a 1-weight cosmetic one. Items
marked N/A leave the denominator. An item flagged **critical** fails the whole
walk when it fails, whatever the numeric score. The runner computes the same
score locally so what a manager sees during the walk matches what gets stored.

### Timezones

Every store has its own timezone. "Today", a schedule's days of the week and its
due time are all resolved against the store's local clock, and the business date
is stored as a `date` so stores in different timezones still compare on the same
operating day.

### Photo storage

`PHOTO_STORAGE` picks the driver; the default is `database`.

| Driver | Where bytes go | Use it when |
|---|---|---|
| `database` (default) | Postgres `StoredFile.data` | You want one dependency. Works on serverless. |
| `blob` | Vercel Blob (auto-selected when `BLOB_READ_WRITE_TOKEN` is set) | Photo volume has outgrown the database. |
| `local` | Files under `UPLOAD_DIR` | Development only. |

Photos are downscaled **on the device** before upload — 1600px on the long
edge, JPEG quality 0.72 — which turns a typical 3–5 MB camera photo into
roughly 200–300 KB and makes the upload survive a store's weak wifi. That
matters: without it, a 150-store fleet would push terabytes a year into
Postgres. With it, budget roughly **3–4 GB a month** at 150 stores (about
300–500 photos a day), so a year is in the tens of gigabytes.

That is comfortable for a managed Postgres instance but it does inflate your
backups. Two levers: `npm run db:prune -- --photos 400` drops photo bytes past
a cutoff while leaving the submission record intact, and switching to `blob`
moves the bytes out entirely — existing database-stored photos keep serving
either way, because `/api/files` checks the database first and falls back to
disk.

Photos are only served to a signed-in user, and only from their own
organization.

### Logs

Every meaningful event is written to `ActivityLog`: submissions, corrective
action changes, checklist and schedule edits, people changes, sign-ins,
sign-outs, failed sign-in attempts and log exports. Each row carries the actor,
the store, the entity it refers to, the IP and the user agent.

`/activity` filters by event type, store, person and date range, and exports
the filtered set as CSV (leadership and administrators only; the export honours
the same location scope as the screen).

Volume is modest — roughly 1,500 rows a day at 150 stores, so a year is under a
million rows and the indexes carry it comfortably. `ItemResponse` grows faster
(about 9,000 rows a day) and is the operating record, so it is never pruned.
When you do want a retention policy:

```bash
npm run db:prune -- --logs 400 --photos 400 --dry-run   # preview
npm run db:prune -- --logs 400 --photos 400             # apply
```

### Offline

Answers are written to IndexedDB as they are entered, so a reload resumes the
walk. Photos are held as blobs on the device. On submit, the walk moves to an
outbox; the sync manager uploads the photos, posts the submission, and retries
with backoff. Each walk carries a `clientKey` derived from store, schedule and
business date, and the server treats a replay of a stored key as the same walk
rather than a duplicate. Validation errors mark the entry for a person to look
at on `/pending` instead of retrying forever.

## Things worth knowing before going live

- **Photo growth.** The database driver is the right default, but watch the
  size: at 150 stores it adds a few GB a month to your database and to every
  backup. Decide on a retention window (`npm run db:prune`) or move to `blob`
  before that becomes a surprise.
- **Login throttling** is per process and in-memory. Behind several instances,
  move it to Redis or Upstash.
- **Passwords** are set by an administrator when adding a person; there is no
  self-service reset or emailed invite yet.
