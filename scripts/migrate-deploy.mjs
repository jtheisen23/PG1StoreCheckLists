/**
 * Applies migrations as part of the build.
 *
 * Poolers (Neon's pooled endpoint, Supabase's pgbouncer, PgBouncer generally)
 * cannot run the statements a migration needs, so migrations go through
 * DIRECT_DATABASE_URL when one is set and fall back to DATABASE_URL otherwise.
 */
import { execFileSync } from "node:child_process";

import { loadEnv } from "./load-env.mjs";

loadEnv();

const target = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!target) {
  // A build with no database configured (a bare `next build`, a preview with
  // no env) should still succeed; the app fails loudly at request time instead.
  console.warn("[migrate] No DATABASE_URL set — skipping migrations.");
  process.exit(0);
}

const usingDirect = Boolean(
  process.env.DIRECT_DATABASE_URL &&
    process.env.DIRECT_DATABASE_URL !== process.env.DATABASE_URL,
);
console.log(
  `[migrate] Applying migrations via ${usingDirect ? "DIRECT_DATABASE_URL" : "DATABASE_URL"}…`,
);

try {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: target },
  });
} catch {
  console.error(
    "\n[migrate] Migrations failed. The deployment was stopped rather than\n" +
      "shipping code against a schema it does not match.\n" +
      "Check DATABASE_URL (and DIRECT_DATABASE_URL, if your database is behind\n" +
      "a connection pooler).",
  );
  process.exit(1);
}
