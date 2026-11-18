import { test } from "node:test";
import assert from "node:assert/strict";

import { directDatabaseUrl, isPooled } from "../scripts/direct-url.mjs";

const POOLED = "postgresql://u:p@ep-calm-1-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const DIRECT = "postgresql://u:p@ep-calm-1.us-east-2.aws.neon.tech/neondb?sslmode=require";
const OTHER = "postgresql://u:p@ep-other-9.us-east-2.aws.neon.tech/neondb?sslmode=require";

test("a pooled endpoint is recognised by its host or the pgbouncer flag", () => {
  assert.ok(isPooled(POOLED));
  assert.ok(isPooled(`${DIRECT}&pgbouncer=true`));
  assert.ok(!isPooled(DIRECT));
  assert.ok(!isPooled(undefined));
});

test("DIRECT_DATABASE_URL wins whenever it is set", () => {
  assert.deepEqual(
    directDatabaseUrl({ DATABASE_URL: POOLED, DIRECT_DATABASE_URL: DIRECT, DATABASE_URL_UNPOOLED: OTHER }),
    { url: DIRECT, from: "DIRECT_DATABASE_URL" },
  );
});

test("Neon's integration names the direct string DATABASE_URL_UNPOOLED", () => {
  assert.deepEqual(directDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT }), {
    url: DIRECT,
    from: "DATABASE_URL_UNPOOLED",
  });
});

test("a direct DATABASE_URL keeps migrating the database it runs against", () => {
  // Production is configured by hand with a direct string; the integration
  // adding its own variable to the project must not redirect its migrations.
  assert.equal(directDatabaseUrl({ DATABASE_URL: DIRECT, DATABASE_URL_UNPOOLED: OTHER }), null);
});

test("with nothing direct available there is nothing to use", () => {
  assert.equal(directDatabaseUrl({ DATABASE_URL: POOLED }), null);
  assert.equal(directDatabaseUrl({}), null);
});
