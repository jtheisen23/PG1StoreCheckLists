/**
 * Takes a compressed snapshot of the whole database.
 *
 *   npm run db:backup                 → ./backups/pg1-<timestamp>.dump
 *   npm run db:backup -- --out /tmp   → somewhere else
 *
 * This is a belt-and-braces copy you hold yourself. It complements — it does
 * not replace — the automatic backups and point-in-time recovery your database
 * host provides.
 *
 * Restore with:
 *   pg_restore --clean --if-exists --no-owner -d "<target url>" <file>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

import { loadEnv } from "./load-env.mjs";

loadEnv();

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

/**
 * Prisma connection strings carry parameters libpq does not understand
 * (`schema`, and the pooling hints), and pg_dump rejects the whole URL rather
 * than ignoring them.
 */
function toLibpqUrl(raw) {
  try {
    const parsed = new URL(raw);
    for (const key of [
      "schema",
      "pgbouncer",
      "connection_limit",
      "pool_timeout",
      "statement_cache_size",
      "socket_timeout",
    ]) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

const outIndex = process.argv.indexOf("--out");
const outDir = path.resolve(
  outIndex >= 0 ? process.argv[outIndex + 1] : path.join(process.cwd(), "backups"),
);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const target = path.join(outDir, `pg1-${stamp}.dump`);

try {
  execFileSync(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-privileges", "--file", target, toLibpqUrl(url)],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
} catch (error) {
  const missing =
    error && typeof error === "object" && "code" in error && error.code === "ENOENT";
  console.error(
    missing
      ? "\npg_dump was not found. It ships with the PostgreSQL client tools:" +
          "\n  macOS    brew install libpq" +
          "\n  Ubuntu   sudo apt install postgresql-client" +
          "\n  Windows  install PostgreSQL and add its bin folder to PATH\n"
      : "\npg_dump failed — its error is above.\n",
  );
  process.exit(1);
}

const megabytes = (statSync(target).size / (1024 * 1024)).toFixed(1);
console.log(`\nWrote ${target} (${megabytes} MB)`);
console.log(
  "Restore with:\n  pg_restore --clean --if-exists --no-owner -d \"<target url>\" " +
    path.basename(target),
);
