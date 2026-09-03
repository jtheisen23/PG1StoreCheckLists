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
  helpers in `src/lib/time.ts` with the location's `timezone`.
- **Offline.** The runner must keep working with no network. Anything it needs
  has to be in the payload the server component passes it or in IndexedDB — do
  not add a fetch on the answering path.
- **Photos** go through `src/lib/storage.ts`, which picks a driver
  (`database` / `blob` / `local`) from `PHOTO_STORAGE`. Never write to
  `public/`: Next's production server resolves it from a build-time manifest,
  so files written there after the build are not served. Any new upload path
  must downscale on the client first (`src/lib/image.ts`) — full-size camera
  photos would swamp the database.
- **Forms.** Every `<form action={serverAction}>` uses `usePreservedForm(state)`
  from `src/components/preserve-form.tsx`. React resets an uncontrolled form
  once the action settles, which silently wipes what someone typed when the
  action returns a validation error. Reset on success explicitly in an effect
  keyed on `state`, never by dropping the hook.
- **The master checklist is shared.** A `ChecklistTemplate` is one definition
  used by every store its schedules point at — there are no per-store copies,
  so an edit reaches all of them on the next walk. Never delete a
  `TemplateItem` that has responses: set `archivedAt` (the FK is `Restrict`, so
  the database will stop you anyway) and filter `archivedAt: null` anywhere
  that builds or counts a walk.
- **Import parsing** lives in `src/lib/checklist-import.ts` — pure, forgiving,
  and unit-tested. Add new column aliases and answer-type synonyms there, with
  a case in `tests/checklist-import.test.ts`; never parse in a component.
- **Logging.** Anything a person does that another person might have to answer
  for goes through `logActivity` with a `<noun>.<verb>` action name. Reuse an
  existing prefix so it lands in one of the filter groups in
  `src/lib/activity-filters.ts`.

## Schema changes

Edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>`.
`npm run db:push` is for throwaway databases only. `npm run db:seed` deletes
every row before seeding.

## Charts

`src/components/charts.tsx` uses a palette validated for colour-blind
separation and contrast on both the light and dark surfaces
(`--chart-series-1`, `--chart-critical` in `globals.css`). Keep bar charts
zero-based; when values cluster in a narrow band, use `ScoreDotPlot`, which
encodes with position and states its scale, rather than truncating a bar axis.
