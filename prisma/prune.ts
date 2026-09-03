/**
 * Retention. Activity rows and photo bytes are the two things that grow without
 * bound, so this trims both to an age you choose.
 *
 *   npm run db:prune -- --logs 400 --photos 400
 *   npm run db:prune -- --logs 400 --dry-run
 *
 * Submissions and their responses are the operating record and are never
 * touched — only the photo bytes attached to them, and only past the cutoff.
 * The Attachment rows stay, so a submission still shows that a photo was taken.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function days(name: string): number | null {
  const raw = arg(name);
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`--${name} must be a number of days (got "${raw}")`);
  }
  return value;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const logDays = days("logs");
  const photoDays = days("photos");

  if (logDays === null && photoDays === null) {
    console.log(
      "Nothing to do. Pass --logs <days> and/or --photos <days>; add --dry-run to preview.",
    );
    return;
  }

  const cutoff = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

  if (logDays !== null) {
    const before = cutoff(logDays);
    const where = { createdAt: { lt: before } };
    const count = await prisma.activityLog.count({ where });
    if (dryRun) {
      console.log(`Would delete ${count.toLocaleString()} activity rows older than ${logDays} days.`);
    } else {
      const { count: deleted } = await prisma.activityLog.deleteMany({ where });
      console.log(`Deleted ${deleted.toLocaleString()} activity rows older than ${logDays} days.`);
    }
  }

  if (photoDays !== null) {
    const before = cutoff(photoDays);
    const where = { createdAt: { lt: before } };
    const [count, bytes] = await Promise.all([
      prisma.storedFile.count({ where }),
      prisma.storedFile.aggregate({ where, _sum: { size: true } }),
    ]);
    const mb = ((bytes._sum.size ?? 0) / (1024 * 1024)).toFixed(1);
    if (dryRun) {
      console.log(`Would delete ${count.toLocaleString()} photos (${mb} MB) older than ${photoDays} days.`);
    } else {
      const { count: deleted } = await prisma.storedFile.deleteMany({ where });
      console.log(`Deleted ${deleted.toLocaleString()} photos (${mb} MB) older than ${photoDays} days.`);
      console.log("Run VACUUM (or let autovacuum catch up) to return the space to the filesystem.");
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
