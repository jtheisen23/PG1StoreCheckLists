/**
 * Which connection string migrations run through.
 *
 * Migrations cannot run through a connection pooler, so they need the direct
 * string. That is DIRECT_DATABASE_URL when it is set. Neon's Vercel
 * integration provides it under its own name, DATABASE_URL_UNPOOLED, beside a
 * pooled DATABASE_URL — which is how every preview deployment it creates is
 * configured — so that is used too, but only when DATABASE_URL itself is
 * pooled. A deployment set up by hand with a direct DATABASE_URL keeps
 * migrating exactly the database it runs against, whatever else the
 * integration has added to the project.
 */

/** @param {string | undefined} value */
export function isPooled(value) {
  return /-pooler\.|pgbouncer=true/.test(value ?? "");
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ url: string, from: "DIRECT_DATABASE_URL" | "DATABASE_URL_UNPOOLED" } | null}
 */
export function directDatabaseUrl(env = process.env) {
  if (env.DIRECT_DATABASE_URL) {
    return { url: env.DIRECT_DATABASE_URL, from: "DIRECT_DATABASE_URL" };
  }
  if (isPooled(env.DATABASE_URL) && env.DATABASE_URL_UNPOOLED) {
    return { url: env.DATABASE_URL_UNPOOLED, from: "DATABASE_URL_UNPOOLED" };
  }
  return null;
}
