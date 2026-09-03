"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  createSession,
  destroySession,
  getCurrentUser,
  verifyPassword,
} from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";

const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export interface LoginState {
  error?: string;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email address and password." };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `login:${ip}:${parsed.data.email}`;

  const limit = rateLimit(key);
  if (!limit.allowed) {
    return {
      error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      orgId: true,
      email: true,
      name: true,
      role: true,
      active: true,
      passwordHash: true,
    },
  });

  // Same message either way, so the form never confirms which emails exist.
  const invalid = { error: "Email or password is incorrect." };
  if (!user) return invalid;

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    await logActivity({
      orgId: user.orgId,
      action: "user.login_failed",
      entityType: "User",
      entityId: user.id,
      summary: `Failed sign-in attempt for ${user.email}`,
    });
    return invalid;
  }
  if (!user.active) {
    return { error: "This account has been deactivated. Contact your administrator." };
  }

  clearRateLimit(key);

  const { passwordHash: _discard, ...sessionUser } = user;
  await createSession(sessionUser, { userAgent: h.get("user-agent"), ip });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "user.login",
    entityType: "User",
    entityId: user.id,
    summary: `${user.name} signed in`,
  });

  redirect("/");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) {
    await logActivity({
      orgId: user.orgId,
      userId: user.id,
      action: "user.logout",
      entityType: "User",
      entityId: user.id,
      summary: `${user.name} signed out`,
    });
  }
  await destroySession();
  redirect("/login");
}
