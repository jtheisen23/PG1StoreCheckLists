/**
 * One-command local setup.
 *
 *   npm run setup
 *
 * Writes a .env if there isn't one, waits for the database to accept
 * connections, applies migrations, and seeds demo data when the database is
 * empty. Safe to re-run: it never re-seeds over existing data unless you ask.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadEnv } from "./load-env.mjs";

const root = process.cwd();
const envPath = path.join(root, ".env");
const force = process.argv.includes("--force-seed");
const skipSeed = process.argv.includes("--no-seed");

const DEFAULT_URL =
  "postgresql://postgres:postgres@localhost:5432/pg1_checklists?schema=public";

function say(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: options.quiet ? "pipe" : "inherit",
    env: { ...process.env },
    cwd: root,
  });
}

// --- 1. environment -------------------------------------------------------

if (!existsSync(envPath)) {
  const secret = randomBytes(32).toString("base64");
  writeFileSync(
    envPath,
    [
      "# Written by `npm run setup`. Safe to edit.",
      `DATABASE_URL="${DEFAULT_URL}"`,
      `AUTH_SECRET="${secret}"`,
      "",
      "# Only needed when DATABASE_URL goes through a connection pooler",
      "# (Neon, Supabase). Migrations cannot run through one.",
      'DIRECT_DATABASE_URL=""',
      "",
      '# Photos: "database" (default), "blob" or "local". See README.',
      'PHOTO_STORAGE=""',
      'BLOB_READ_WRITE_TOKEN=""',
      "",
    ].join("\n"),
  );
  say("Created .env with a generated AUTH_SECRET.");
} else {
  say("Using the existing .env.");
}

// Load the file the same way Next and Prisma will.
loadEnv();

if (!process.env.DATABASE_URL) {
  say("\nDATABASE_URL is not set in .env. Add it and run this again.");
  process.exit(1);
}

// --- 2. wait for the database --------------------------------------------

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const deadline = Date.now() + 60_000;
let connected = false;
say("\nWaiting for the database…");

while (Date.now() < deadline) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    connected = true;
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

if (!connected) {
  say(
    [
      "\nCould not reach the database at DATABASE_URL.",
      "",
      "  • Using Docker?  docker compose up -d   (then run this again)",
      "  • Using a hosted database? Check DATABASE_URL in .env.",
    ].join("\n"),
  );
  await prisma.$disconnect();
  process.exit(1);
}
say("Database is up.");

// --- 3. schema ------------------------------------------------------------

say("\nApplying migrations…");
// Reuse the deploy script so migrations go through DIRECT_DATABASE_URL when
// there is one. Pointing setup at a pooled connection string would otherwise
// fail here, which is exactly what happens the first time someone runs this
// against a hosted database.
run("node", ["scripts/migrate-deploy.mjs"]);

// --- 4. demo data ---------------------------------------------------------

let organizations = 0;
try {
  organizations = await prisma.organization.count();
} catch {
  organizations = 0;
}
await prisma.$disconnect();

if (skipSeed) {
  say("\nSkipping demo data (--no-seed).");
} else if (organizations > 0 && !force) {
  say(
    "\nThe database already has data, so demo data was not loaded." +
      "\nRe-run with --force-seed to WIPE it and reload the demo fleet.",
  );
} else {
  say("\nLoading demo data (this takes a minute)…");
  run("npx", ["tsx", "prisma/seed.ts"]);
}

say(
  [
    "",
    "Ready. Start the app with:",
    "",
    "    npm run dev",
    "",
    "Then open http://localhost:3000 and sign in as:",
    "",
    "    admin@pg1.test / checklists2026",
    "",
  ].join("\n"),
);
