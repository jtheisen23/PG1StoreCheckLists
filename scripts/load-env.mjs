import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads .env into process.env for scripts that run outside Next (which loads
 * it on its own). Real environment variables always win, so a platform like
 * Vercel — where there is no .env file — is unaffected.
 */
export function loadEnv(file = ".env") {
  const target = path.join(process.cwd(), file);
  if (!existsSync(target)) return;

  for (const line of readFileSync(target, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
