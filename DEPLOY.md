# Deploying to Vercel + Neon

About 15 minutes. Both services have a free tier that comfortably covers a
pilot. Nothing in the app changes — this is configuration only.

## 1. Create the database (Neon)

You are creating **one** database. Its backups come with it — there is no
second database to set up. About five minutes.

### 1a. Sign up

Go to <https://neon.tech> and sign up. Signing in with GitHub is easiest, since
you will connect GitHub to Vercel in step 2 anyway. The free tier is enough to
run a pilot; you do not need a card.

### 1b. Create the project

Neon offers to create a project immediately. Fill in:

- **Name** — anything, e.g. `pg1-checklists`.
- **Postgres version** — 16 or newer.
- **Region** — the one closest to your restaurants. This is the one choice you
  cannot change later without recreating the project, and it decides how far
  every page load travels. US stores → a US region.

Neon also offers a list of **Services**. You need only **Postgres database**,
which is on by default. Leave the rest off:

| Service | Why not |
|---|---|
| Object storage | Photos live in Postgres by default, so there is nothing to put in a bucket. Revisit only if photo volume outgrows the database — it is an alternative to Vercel Blob. |
| Functions | All server code runs on the app host. |
| AI gateway | The app has no AI features. |
| Neon Auth | This app has its own authentication — signed session cookies over revocable database rows. Enabling Neon Auth would leave a second, unused login system for whoever reads the project next to puzzle over. |

Create the project.

### 1c. Copy two connection strings

Neon shows a **Connection string** panel (also under *Dashboard → Connect*).
There is a **Connection pooling** toggle on it. You need the string in both
positions:

| Toggle | What you get | Save it as |
|---|---|---|
| **ON** (the default) | host contains `-pooler` | `DATABASE_URL` |
| **OFF** | same host without `-pooler` | `DIRECT_DATABASE_URL` |

Both look like:

```
postgresql://USER:PASSWORD@ep-something-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

Paste both into a scratch file for a minute — you will need them in step 2.

**Why two.** Everyday queries go through the pooler, which lets many short-lived
serverless functions share a small number of real connections. But a pooler
cannot run the statements a schema change needs, so migrations use the direct
one. Getting these the wrong way round is the single most common mistake here,
and the build refuses to continue if you do — it will tell you which one is
wrong.

The password is *in* the string. Treat both as secrets; do not commit them.

### 1d. Set the retention window now

*Project settings → Backup & restore* (Neon has also called this **History
retention**). Note what the window is.

On the free plan it is short and cannot be extended — longer windows are a paid
feature. That is fine for a pilot, because the app refuses to delete anything
that history depends on, so the slow mistakes a long window would protect you
from cannot happen. Take a `npm run db:backup` before anything risky and you
are covered.

Pay for the longer window before real stores depend on it.
[BACKUPS.md](./BACKUPS.md) explains the trade in full.

### 1e. Check it works before going further

Worth two minutes now rather than debugging it through a deploy log later. On
your machine, in the project folder, put both strings in `.env`:

```
DATABASE_URL="<Neon pooled string>"
DIRECT_DATABASE_URL="<Neon direct string>"
AUTH_SECRET="<openssl rand -base64 32>"
```

Then:

```bash
npm install
npm run setup
```

That connects, applies the migrations and offers to load demo data. If it
cannot reach the database or the strings are the wrong way round, it says so
in plain terms instead of failing obscurely. Once it prints `Ready`, Neon is
done and the rest is Vercel.

## 2. Deploy the app (Vercel)

1. Sign up at <https://vercel.com> and choose **Add New… → Project**.
2. Import `jtheisen23/PG1StoreCheckLists`.
3. **Set the production branch, or nothing will ever deploy to production.**
   Settings → Git → **Production Branch** must name the branch you are
   deploying. Vercel fills this with `main` when it imports a project, and if
   no such branch exists, every push builds as a *preview* and the project
   shows "No Production Deployment" with the domain serving nothing.

   Either point it at `claude/restaurant-ops-monitoring-app-7xzpx9`, or create
   a `main` branch from it and use that — the second is tidier if this project
   is going to live for a while.
4. Leave the framework preset on **Next.js**. Do not override the build command.
5. Add these environment variables:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** connection string |
   | `DIRECT_DATABASE_URL` | Neon **direct** connection string |
   | `AUTH_SECRET` | A fresh random string — see below |

   **Tick every environment** (Production, Preview, Development) unless you
   have a reason not to. A variable scoped to Production only is invisible to
   a preview build, so a branch that is not the production branch fails the
   env check with the variable apparently "not set" even though you just added
   it.

   The reason to eventually narrow this: preview deployments would share the
   production database, so a preview writes to real data. When that starts to
   matter, create a Neon branch and give Preview its own `DATABASE_URL` — do
   not simply remove the variable from Preview, or those builds break.

   Paste values **without surrounding quotes**. Vercel stores the field
   literally, so `"postgresql://…"` keeps the quotes and the check rejects it.

   Add `&pgbouncer=true` to the end of `DATABASE_URL` (not to
   `DIRECT_DATABASE_URL`). Neon's pooled endpoint is a transaction-mode pooler,
   where Prisma's prepared statements collide — the build passes and then
   queries fail intermittently once people are actually using the app. The
   build warns if it is missing.

   Generate the secret with `openssl rand -base64 32`, or in PowerShell:
   `[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))`

6. Deploy. The build applies migrations automatically, so the schema is ready
   before the first request.

   Vercel does not rebuild when you change an environment variable, so after
   editing one, redeploy from Deployments → ⋯ → Redeploy.

> If the build fails on migrations, the deployment stops rather than shipping
> code against a schema it does not match. The log names the cause; it is
> almost always a wrong `DIRECT_DATABASE_URL`.

### Debugging a build from the terminal

Faster than the dashboard, because you can see and test the values instead of
guessing at them across two-minute build cycles.

Run these **inside the project folder**, not your home directory — `vercel
link` writes a `.vercel` directory wherever you are, and `env pull` drops your
database password beside it.

```bash
npm i -g vercel
vercel login
vercel link                     # pick the existing project, do not create one

# --environment matters: without it you get the development values, which is
# an almost-empty file when the variables are scoped to Production.
vercel env pull .env.local --environment=production
npm run check:env               # validate in a second, with no build
```

`vercel env pull` is the important one: it writes what is really stored, so a
value carrying quotes, a `psql` prefix or a whole `DATABASE_URL=` line is
visible rather than inferred. `.env.local` is gitignored.

To correct one:

```bash
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production   # paste at the prompt, no quotes
```

Then deploy the current commit — and note this deploys your working tree, not
what is on GitHub:

```bash
vercel --prod
```

The dashboard's **Redeploy** button rebuilds the commit that deployment used,
which is a good way to keep re-running an old build without noticing.

## 3. Create your first sign-in

The database is empty at this point, so pick one:

**A. Load the demo fleet** — 63 stores, four checklists, 45 days of history.
Good for showing people what it does. Run from your laptop, against the
**direct** connection string:

```bash
DATABASE_URL="<neon direct string>" npm run db:seed
```

Sign in as `admin@pg1.test` / `checklists2026`.

> `db:seed` deletes every row first. Only ever point it at a database you are
> happy to wipe.

**B. Start clean with your real organization** — creates one administrator and
deletes nothing:

```bash
ORG_NAME="PG1 Restaurant Group" \
ADMIN_NAME="Your Name" \
ADMIN_EMAIL="you@company.com" \
ADMIN_PASSWORD="a long password" \
DATABASE_URL="<neon direct string>" \
npm run bootstrap
```

Then sign in. The app opens on a three-step setup guide: add your stores under
**Admin → Stores** (a region, a district, then stores — each with its own
timezone), build a checklist, and schedule it. Add your teams under
**Admin → People**.

You can do A now to look around, then wipe and do B when you are ready for real
data.

## 4. Before real stores use it

- **Backups.** You do not create a second database for these — Neon backs up
  the one you already made. Open *Project settings → Backup & restore* and set
  the point-in-time window to at least 14 days — the default on the free tier is
  far shorter than the time it takes anyone to notice a mistake. Then do one
  restore drill. [BACKUPS.md](./BACKUPS.md) walks through both, and explains
  why photos being in the database means they are in that backup too.
- **Photos** default to Postgres, which works on Vercel. At 150 stores that is
  roughly 3–4 GB a month added to your database and every backup. Set a
  retention window (`npm run db:prune -- --photos 400`) or move photos to
  object storage by setting `BLOB_READ_WRITE_TOKEN` from a Vercel Blob store.
- **Login throttling** is per-instance and in memory. It is fine for a pilot;
  behind several instances it needs Redis or Upstash.
- **Passwords** are set by an administrator. There is no self-service reset or
  emailed invite yet, so plan how you hand out first-time passwords.
- **Custom domain**: Vercel → Settings → Domains. Sessions are cookie-based and
  follow the domain, so add it before people bookmark the URL.

## Moving to Google Cloud later

Nothing here is Vercel-specific. The same repository runs on Firebase App
Hosting with Cloud SQL for Postgres, or on any host that can run
`npm run build && npm start`. The only change is where the environment
variables live.
