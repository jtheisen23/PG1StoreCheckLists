# Deploying to Vercel + Neon

About 15 minutes. Both services have a free tier that comfortably covers a
pilot. Nothing in the app changes — this is configuration only.

## 1. Create the database (Neon)

1. Sign up at <https://neon.tech> and create a project. Pick the region closest
   to your restaurants.
2. On the project dashboard, open **Connection string**. You need two of them:
   - the **pooled** string (the default, host contains `-pooler`)
   - the **direct** string (toggle *Connection pooling* off)

Keep both. The app uses the pooled one; migrations need the direct one, because
a connection pooler cannot run the statements a schema change requires.

## 2. Deploy the app (Vercel)

1. Sign up at <https://vercel.com> and choose **Add New… → Project**.
2. Import `jtheisen23/PG1StoreCheckLists`.
3. Set the branch to `claude/restaurant-ops-monitoring-app-7xzpx9` (Settings →
   Git → Production Branch), or merge it to `main` first and deploy that.
4. Leave the framework preset on **Next.js**. Do not override the build command.
5. Add these environment variables:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** connection string |
   | `DIRECT_DATABASE_URL` | Neon **direct** connection string |
   | `AUTH_SECRET` | A fresh random string — see below |

   Generate the secret with `openssl rand -base64 32`, or in PowerShell:
   `[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))`

6. Deploy. The build applies migrations automatically, so the schema is ready
   before the first request.

> If the build fails on migrations, the deployment stops rather than shipping
> code against a schema it does not match. The log names the cause; it is
> almost always a wrong `DIRECT_DATABASE_URL`.

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
