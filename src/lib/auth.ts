import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Role, User } from "@prisma/client";

import { prisma } from "./db";
import { authSecret, isProduction } from "./env";

export const SESSION_COOKIE = "pg1_session";
const SESSION_DAYS = 30;

export type SessionUser = Pick<
  User,
  "id" | "orgId" | "email" | "name" | "role" | "active"
>;

export interface SessionClaims {
  sub: string; // userId
  sid: string; // Session row id
  org: string;
  role: Role;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Issues a session row + signed cookie. Returns the raw token. */
export async function createSession(
  user: SessionUser,
  meta: { userAgent?: string | null; ip?: string | null } = {},
) {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    },
  });

  const jwt = await new SignJWT({
    sid: session.id,
    org: user.orgId,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(authSecret());

  const store = await cookies();
  store.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    expires: expiresAt,
  });

  return { sessionId: session.id, expiresAt };
}

export async function readClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (!payload.sub || typeof payload.sid !== "string") return null;
    return {
      sub: payload.sub,
      sid: payload.sid,
      org: String(payload.org),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Full user lookup + revocation check. Returns null when signed out. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const claims = await readClaims();
  if (!claims) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          orgId: true,
          email: true,
          name: true,
          role: true,
          active: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;
  return session.user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession() {
  const claims = await readClaims();
  if (claims) {
    await prisma.session.deleteMany({ where: { id: claims.sid } });
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
