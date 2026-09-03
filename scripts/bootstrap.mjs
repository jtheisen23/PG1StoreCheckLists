/**
 * Creates the first organization and administrator on an empty database.
 *
 *   ORG_NAME="PG1 Restaurant Group" \
 *   ADMIN_NAME="Jordan Theisen" \
 *   ADMIN_EMAIL="jordan@example.com" \
 *   ADMIN_PASSWORD="..." \
 *   npm run bootstrap
 *
 * Unlike `db:seed`, this deletes nothing — it is the safe way to stand up a
 * real deployment. Re-running it adds an administrator to the existing
 * organization rather than creating a second one.
 */
import { PrismaClient, Role, ScopeLevel } from "@prisma/client";
import bcrypt from "bcryptjs";

import { loadEnv } from "./load-env.mjs";

loadEnv();

const prisma = new PrismaClient();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the comment at the top of scripts/bootstrap.mjs.`);
    process.exit(1);
  }
  return value;
}

const orgName = process.env.ORG_NAME ?? "My Restaurant Group";
const name = required("ADMIN_NAME");
const email = required("ADMIN_EMAIL").trim().toLowerCase();
const password = required("ADMIN_PASSWORD");

if (password.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const slug = orgName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 40) || "org";

try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`${email} already exists — nothing to do.`);
    process.exit(0);
  }

  const org =
    (await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await prisma.organization.create({ data: { name: orgName, slug } }));

  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      name,
      email,
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(password, 12),
      scopes: { create: [{ level: ScopeLevel.ORG }] },
    },
    select: { id: true, email: true },
  });

  await prisma.activityLog.create({
    data: {
      orgId: org.id,
      userId: admin.id,
      action: "org.bootstrapped",
      summary: `${name} was created as the first administrator of ${org.name}`,
    },
  });

  console.log(
    [
      `Organization: ${org.name}`,
      `Administrator: ${admin.email}`,
      "",
      "Sign in, then add regions, districts, stores and people from Admin.",
    ].join("\n"),
  );
} finally {
  await prisma.$disconnect();
}
