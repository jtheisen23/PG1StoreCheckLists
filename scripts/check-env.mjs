/**
 * Preflight for a deployment. Runs before the build so a misconfigured
 * environment fails loudly here, instead of shipping a site that 500s on the
 * first request with the reason buried in a log.
 *
 * Every message says what to fix and where to find the value.
 */
import { loadEnv } from "./load-env.mjs";

loadEnv();

const problems = [];
const warnings = [];

// --- DATABASE_URL ---------------------------------------------------------

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  problems.push(
    "DATABASE_URL is not set.\n" +
      "    Neon → your project → Connection string (keep 'Connection pooling' ON).",
  );
} else {
  let parsed;
  try {
    parsed = new URL(dbUrl);
  } catch {
    problems.push("DATABASE_URL is not a valid connection string.");
  }

  if (parsed && !/^postgres(ql)?:$/.test(parsed.protocol)) {
    problems.push(
      `DATABASE_URL should start with postgresql:// (found "${parsed.protocol}//").`,
    );
  }

  if (parsed && isRemote(parsed.hostname) && !parsed.searchParams.has("sslmode")) {
    warnings.push(
      "DATABASE_URL has no sslmode. Hosted databases normally need " +
        "?sslmode=require on the end.",
    );
  }
}

// --- DIRECT_DATABASE_URL --------------------------------------------------

const directUrl = process.env.DIRECT_DATABASE_URL;
const pooled = (value) => /-pooler\.|pgbouncer=true/.test(value ?? "");

if (directUrl) {
  if (pooled(directUrl)) {
    problems.push(
      "DIRECT_DATABASE_URL points at the POOLED endpoint (it contains '-pooler').\n" +
        "    Migrations cannot run through a connection pooler. In Neon, switch\n" +
        "    'Connection pooling' OFF and copy that string instead.",
    );
  }
  if (directUrl === dbUrl) {
    warnings.push(
      "DIRECT_DATABASE_URL is identical to DATABASE_URL, so it is doing nothing. " +
        "That is fine for a database with no pooler in front of it.",
    );
  }
} else if (pooled(dbUrl)) {
  problems.push(
    "DATABASE_URL is a pooled endpoint but DIRECT_DATABASE_URL is not set.\n" +
      "    Migrations cannot run through a connection pooler. Add the unpooled\n" +
      "    string as DIRECT_DATABASE_URL (Neon: 'Connection pooling' OFF).",
  );
}

// --- AUTH_SECRET ----------------------------------------------------------

const secret = process.env.AUTH_SECRET;
if (!secret) {
  problems.push(
    "AUTH_SECRET is not set. Generate one with:  openssl rand -base64 32",
  );
} else if (secret.length < 32) {
  problems.push(
    `AUTH_SECRET is ${secret.length} characters; it must be at least 32.\n` +
      "    Generate one with:  openssl rand -base64 32",
  );
} else if (/^(dev|test|change|secret|password)/i.test(secret)) {
  warnings.push(
    "AUTH_SECRET looks like a placeholder. Signing keys must be random — " +
      "anyone who guesses it can forge a session.",
  );
}

// --- photo storage --------------------------------------------------------

const driver = process.env.PHOTO_STORAGE?.toLowerCase();
if (driver && !["database", "blob", "local"].includes(driver)) {
  problems.push(
    `PHOTO_STORAGE is "${driver}"; it must be database, blob or local.`,
  );
}
if (driver === "blob" && !process.env.BLOB_READ_WRITE_TOKEN) {
  problems.push("PHOTO_STORAGE is 'blob' but BLOB_READ_WRITE_TOKEN is not set.");
}
if (driver === "local" && process.env.VERCEL) {
  warnings.push(
    "PHOTO_STORAGE is 'local' on Vercel. Local disk does not survive a " +
      "deployment — photos will disappear. Use 'database' or 'blob'.",
  );
}

function isRemote(hostname) {
  return !["localhost", "127.0.0.1", "::1", "db", "postgres"].includes(hostname);
}

// --- report ---------------------------------------------------------------

for (const warning of warnings) console.warn(`[env] warning: ${warning}`);

if (problems.length) {
  console.error(
    `\n[env] ${problems.length} problem(s) stopped the build:\n\n` +
      problems.map((p) => `  ✗ ${p}`).join("\n\n") +
      "\n\nOn Vercel these live in Settings → Environment Variables." +
      "\nLocally they live in .env — see .env.example.\n",
  );
  process.exit(1);
}

console.log(
  `[env] Configuration looks good${warnings.length ? ` (${warnings.length} warning(s) above)` : ""}.`,
);
