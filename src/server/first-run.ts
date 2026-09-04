"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Role, ScopeLevel } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export interface FirstRunState {
  error?: string;
}

const schema = z
  .object({
    orgName: z.string().min(2).max(120),
    name: z.string().min(2).max(120),
    email: z.string().email().max(200),
    password: z.string().min(12).max(200),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "The two passwords do not match.",
    path: ["confirm"],
  });

/** True only while the database has no users at all. */
export async function needsFirstRun(): Promise<boolean> {
  try {
    return (await prisma.user.count()) === 0;
  } catch {
    // A database that cannot be reached is not a first run; let the normal
    // error handling deal with it rather than offering to create an admin.
    return false;
  }
}

/**
 * Creates the organization and its first administrator, once.
 *
 * The guard is the user count: an empty database has nothing to protect, and
 * the moment this succeeds there is a user, so the route stops working. It is
 * re-checked inside the same transaction that does the insert, so two people
 * hitting the form at the same moment cannot both become the first admin.
 */
export async function createFirstAdmin(
  _prev: FirstRunState,
  formData: FormData,
): Promise<FirstRunState> {
  const parsed = schema.safeParse({
    orgName: String(formData.get("orgName") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error:
        issue?.path[0] === "password"
          ? "The password must be at least 12 characters."
          : (issue?.message ?? "Check the form and try again."),
    };
  }

  if (!(await needsFirstRun())) {
    return { error: "This organization is already set up. Sign in instead." };
  }

  const input = parsed.data;
  const slug =
    input.orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org";

  let admin;
  try {
    admin = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: the count above is only advisory.
      if ((await tx.user.count()) > 0) {
        throw new Error("ALREADY_SET_UP");
      }

      const org = await tx.organization.create({
        data: { name: input.orgName, slug },
        select: { id: true, name: true },
      });

      return tx.user.create({
        data: {
          orgId: org.id,
          name: input.name,
          email: input.email,
          role: Role.ADMIN,
          passwordHash: await hashPassword(input.password),
          scopes: { create: [{ level: ScopeLevel.ORG }] },
        },
        select: {
          id: true,
          orgId: true,
          email: true,
          name: true,
          role: true,
          active: true,
          org: { select: { name: true } },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_SET_UP") {
      return { error: "This organization is already set up. Sign in instead." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { error: "That email address is already in use." };
    }
    console.error("[first-run] failed", error);
    return { error: "Could not complete setup. Please try again." };
  }

  const h = await headers();
  await createSession(admin, {
    userAgent: h.get("user-agent"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  await logActivity({
    orgId: admin.orgId,
    userId: admin.id,
    action: "org.created",
    entityType: "Organization",
    entityId: admin.orgId,
    summary: `${admin.name} created ${admin.org.name} and became its first administrator`,
  });

  redirect("/");
}
