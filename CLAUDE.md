# Working in this repository

Restaurant operations execution app: Next.js 15 App Router, TypeScript,
Tailwind v4, Prisma + PostgreSQL. See `README.md` for the product tour.

## Before you commit

```bash
npm run typecheck && npm test && npm run build
```

## Conventions

- **Server-first.** Pages are server components that query through Prisma;
  mutations are server actions in `src/server/*-service.ts` or route handlers
  under `src/app/api`. Client components exist only where interactivity
  requires them, and are marked `"use client"`.
- **Role rules are testable.** The pure role predicates live in
  `src/lib/role-access.ts` — no `server-only`, no Prisma — and
  `permissions.ts` re-exports them next to the scope checks that do need the
  database. Keep them there: `tests/role-access.test.ts` asserts that only an
  ADMIN can manage checklists, people and stores, and walks every role in the
  schema so a new one cannot slip through on a fallback. A rule nobody can
  test is a rule nobody notices loosening.
- **Scoping is not optional.** Any query touching store data must be filtered
  by `getAccessibleLocationIds(user)` (or `assertLocationAccess`). Role alone
  is never sufficient — a user's `UserScope` rows decide what they can see.
- **Server-only modules.** `src/lib/auth.ts`, `permissions.ts`, `activity.ts`,
  `storage.ts` and everything in `src/server/` import `server-only`. Anything a
  client component needs (label maps, pure helpers) lives elsewhere —
  `src/lib/labels.ts`, `role-labels.ts`, `scoring.ts`, `time.ts`.
- **Scoring lives in one place.** `src/lib/scoring.ts` is pure and shared by the
  runner and the server so the two never disagree. Change it there, not in a
  component, and keep `tests/scoring.test.ts` in step.
- **Timezones.** Never use the server's local date for store data. Use the
  helpers in `src/lib/time.ts` with the location's `timezone`. Store imports
  resolve one from state and city in `src/lib/store-import.ts`; a state that
  spans two zones falls back to its majority zone and is flagged in the
  preview, and an existing store's timezone is never overwritten by a guess —
  moving it silently shifts that store's whole day.
- **Location.** A submission stores where the device was
  (`Submission.latitude`/`longitude`), captured in the background by the runner
  and shown on the submission. It is best-effort by design: resolved while the
  walk is under way, never awaited at submit, null when the person declines or
  no fix arrives. Nothing may start depending on it being present, and the
  runner must keep saying on screen that it is being recorded.
- **Offline.** The runner must keep working with no network. Anything it needs
  has to be in the payload the server component passes it or in IndexedDB — do
  not add a fetch on the answering path.
- **A walk gets the whole screen.** `/run/*` lives in the `(walk)` route
  group, outside the app shell: its own header (title, the store's other
  checklists today, section chips) and a bottom bar with progress and Submit.
  Everything that header needs is built on the server by
  `server/runner-nav.ts` and passed in — the runner never fetches it. A
  reading is drawn against its band by `src/lib/reading.ts` (pure, tested in
  `tests/reading.test.ts`); whether it passes is still `scoring.ts`'s call.
- **Photos** go through `src/lib/storage.ts`, which picks a driver
  (`database` / `blob` / `local`) from `PHOTO_STORAGE`. Never write to
  `public/`: Next's production server resolves it from a build-time manifest,
  so files written there after the build are not served. Any new upload path
  must downscale on the client first (`src/lib/image.ts`) — full-size camera
  photos would swamp the database. The runner offers the camera on a `PHOTO`
  item (whose answer *is* the photo), on anything with `requirePhoto`, on a
  failed item, and wherever one is already attached. Miss the first of those
  and a photo item renders with nowhere to put a photo.
- **Filtered pickers must post what is hidden.** The store picker on a schedule
  filters a long list, and a checkbox that is filtered out is not rendered — so
  it is not submitted. Anything selected but currently hidden needs a hidden
  input alongside the visible checkboxes, or saving under an active filter
  silently drops every store the filter hid.
- **Forms.** Every `<form action={serverAction}>` uses `usePreservedForm(state)`
  from `src/components/preserve-form.tsx`. React resets an uncontrolled form
  once the action settles, which silently wipes what someone typed when the
  action returns a validation error. Reset on success explicitly in an effect
  keyed on `state`, never by dropping the hook.
- **History is not deletable.** Stores, checklists, sections and items that
  anything references are `ON DELETE RESTRICT`; removal is a soft archive
  (`archivedAt`). Never relax one of those constraints or add a hard delete
  path — an operations record has to survive a checklist edit. See
  `BACKUPS.md`.
- **A walk run by mistake is voided, not deleted.** `voidSubmission` in
  `admin-service.ts` sets `status: VOIDED` and records who, when and why;
  everything that counts a walk filters on `SUBMITTED`, so voiding drops it out
  of scores and makes its schedule read as owed again in one move. Keep that
  filter: a query that forgets it silently counts walks somebody disowned. The
  corrective actions it raised are cancelled with it — an action from a walk
  that should not have happened must not sit open on someone's list. Voided
  walks stay readable under History → Voided, with the reason attached, because
  a scoring record that quietly changed is worth less than one that says who
  changed it. A voided walk keeps its `clientKey`; `resolveWalkKey` in
  `src/lib/walk-key.ts` tells a late offline replay of it (same key, same
  reported `startedAt`: it stays voided) from the store's redo (stored beside
  it at `<key>:after-void-<n>`). Don't rewrite the key on void — that
  resurrects the replay.
- **Two ways a walk starts.** A schedule says what a store owes today
  (`/run/[scheduleId]`); a person standing in the store starts one on demand
  (`/run/checklist/[templateId]/[visitId]`, from `src/server/walks.ts`). The
  second exists because a visit audit scheduled daily at every store would sit
  overdue on every manager's Today screen. Its submission carries
  `scheduleId: null` and is otherwise identical, so scoring, corrective actions
  and email must never branch on whether a schedule was involved. Its
  `clientKey` is keyed on the visit, not the day — the same audit may be run
  twice at one store, and a re-check is not a replay.
- **The close rating is a gate, not a score.** The morning close rating lives
  in `CloseArea` / `CloseRating` (`src/server/close-ratings.ts`, rules in
  `src/lib/close-rating.ts`), deliberately outside checklists: never model it
  as a schedule or a submission, and never fold it into completion or a score
  — that was got wrong once already in the system this replaces. It blocks
  nothing on Today. The device sends no time with a rating; the server stamps
  it and decides from its own clock which nights can still be rated. Each area
  is saved the moment it is rated (the outbox merges them per store and
  night). One verdict per store, area and night: the first person's stands,
  and they may correct their own (`close_rating.corrected`) — nobody else can
  overwrite it. Areas are archived, never deleted.
- **The weight rule is asymmetric, and lives in one place.** Spec weight is the
  floor, spec + 0.5 oz the ceiling; under and over are different violations
  and are always counted apart — never net them into one "out of spec"
  figure. A spec with no target is logged, not judged. The rule is
  `src/lib/sub-weight.ts`, shared by the runner and the server like scoring;
  keep `tests/sub-weight.test.ts` in step. A weighing is a `SUB_WEIGHT` item
  on an ordinary checklist on purpose: the system this replaces kept weight
  logs in a separate store its completion count never read, so they could
  never complete. The server re-judges against its own spec and snapshots it
  on `SubWeighing`.
- **Execution is derived, never stored.** The leadership dashboard's
  completion is what a store owed — every active, published schedule on that
  weekday, weight logs included — against what it submitted for those
  schedules (`src/lib/execution.ts`, pure, with `tests/execution.test.ts`).
  Today counts only what is due by now unless it is already done, and a
  schedule owes nothing before it existed (or before its first walk, for
  backfilled history). On-demand walks have no schedule and owe nothing. The
  close rating stays out of it. Periods are PG1's fiscal calendar in
  `src/lib/periods.ts`: always 28 days, always starting on a Monday, thirteen
  to a year, counted from one anchor date — never special-case a long period
  or a 53rd week.
- **The master checklist is shared.** A `ChecklistTemplate` is one definition
  used by every store its schedules point at — there are no per-store copies,
  so an edit reaches all of them on the next walk. Never delete a
  `TemplateItem` that has responses: set `archivedAt` (the FK is `Restrict`, so
  the database will stop you anyway) and filter `archivedAt: null` anywhere
  that builds or counts a walk.
- **A section can run on chosen days.** `TemplateSection.daysOfWeek` (empty
  is every day) is how the Daily Sheet carries a different cleaning focus each
  weekday as one checklist, not seven copies of it — edit the opener
  evaluation once and every day has it. The rule is `src/lib/weekdays.ts`
  (pure, `tests/weekdays.test.ts`): a walk asks only the sections that run on
  the store's own day, the server holds a submitted walk to the day it started
  on the store's clock, and the Today counts, the editor and the CSV `days`
  column all use the same rule. Never model a day's variation as separate
  checklists.
- **Bundled checklists.** `checklists/*.csv` ship with the app and install in
  one click from Admin → Checklists (`src/server/bundled-checklists.ts`). They
  are read from disk at runtime, so `outputFileTracingIncludes` in
  `next.config.ts` has to keep carrying that folder into the deployment; a
  build whose `.nft.json` files stop naming them installs nothing.
- **Email.** Delivery lives in `src/lib/email.ts` and what an email says in
  `src/lib/email-content.ts`, which is pure and tested. Nothing in the sending
  path may throw: mail goes out through `after()` once the submission is
  already saved, because a mail server having a bad day must never cost
  somebody the audit they just completed. See `EMAIL.md`.
- **Roster import.** Admin → People → Import roster takes the roster
  workbook (read by `src/lib/xlsx.ts`, no dependency) or a paste.
  `src/lib/roster-import.ts` turns one row per store into stores (address
  split into city and ZIP, timezone from them), the hierarchy (a region per
  vice president and a district per director of operations, unless the sheet
  names its own), people, roles and the stores each person holds. It is built
  on `store-import.ts` and `hierarchy-import.ts` so it never disagrees with
  either, and `importRoster` in `hierarchy-service.ts` applies it in one
  transaction. Permission is the list of stores a person holds, so the roster
  is the statement of who covers what: scopes are replaced from it, and
  re-running it is the intended way to move a store between directors.
  Somebody no longer on it stops holding stores (whole-company access is not
  a store, so a president or regional lead it does not name keeps it);
  deactivating them, or closing stores no longer on it, are explicit choices
  on the form, never side effects. It never demotes or touches an ADMIN, never deletes anybody, keeps
  a leader's existing name when the sheet only gives an address, and leaves an
  existing store's timezone alone unless the roster settles it.
  `findSuspectDomains` flags an address whose domain is within two edits of a
  trusted one: a transposed letter otherwise becomes a second person who cannot
  be reached and holds half of someone's stores. Trust comes from the domains
  the organization already signs in with (`server/email-domains.ts`), so a
  two-row paste is checkable, falling back to the sheet's own dominant domain
  for the first import. A domain used by exactly one person is trusted only if
  it is the most common one, so an account created from an earlier typo does
  not become the standard.
- **Import parsing** lives in `src/lib/checklist-import.ts` (and
  `store-import.ts` for the store list) — pure, forgiving,
  and unit-tested. Add new column aliases and answer-type synonyms there, with
  a case in `tests/checklist-import.test.ts`; never parse in a component.
- **Passwords.** Three paths, all in `admin-service.ts` except the last:
  an administrator resets someone else's, a person changes their own (current
  password required), and `src/server/recovery.ts` is the break-glass for a
  locked-out sole administrator, gated on `ADMIN_RECOVERY_TOKEN` and inert
  without it. Every path drops the affected sessions — a password is reset
  because the old one is no longer trusted. See `ACCESS.md`.
- **Logging.** Anything a person does that another person might have to answer
  for goes through `logActivity` with a `<noun>.<verb>` action name. Reuse an
  existing prefix so it lands in one of the filter groups in
  `src/lib/activity-filters.ts`.

## Schema changes

Edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>`.
`npm run db:push` is for throwaway databases only. `npm run db:seed` deletes
every row before seeding.

## Design

The PG1 design system: one typeface (Inter, self-hosted so it works
offline), warm cream surfaces, and every status carrying a word and a shape as
well as a colour — a store iPad in bad light is the use case. Colours are
tokens in `globals.css`, light and dark, never literals in components:
`--accent` (amber) is the one action colour and is too light for text, so it
only ever fills, carrying `--accent-ink`; something selected fills with
`--info` and its text is `--info-ink`; a filled pass or fail button's text is
`--on-status`. Those pairs flip with the theme — white text on a fill is
invisible in one of them. Inputs sit on `--field`. Section labels use the
`.eyebrow` utility.

## Charts

`src/components/charts.tsx` uses a palette validated for colour-blind
separation and contrast on both the light and dark surfaces
(`--chart-series-1`, `--chart-critical` in `globals.css`). Keep bar charts
zero-based; when values cluster in a narrow band, use `ScoreDotPlot`, which
encodes with position and states its scale, rather than truncating a bar axis.
