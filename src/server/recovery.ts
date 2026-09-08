import "server-only";

import { timingSafeEqual } from "crypto";
import { Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

/**
 * Getting back in when the last administrator has lost their password.
 *
 * Every other way of setting a password needs somebody already signed in, which
 * is no help to an organization whose only administrator is locked out — and
 * the records inside are a year of a fleet's food safety and facilities
 * evidence. This is the way back, gated on a secret only the person who
 * controls the deployment can set.
 *
 * It does not exist until `ADMIN_RECOVERY_TOKEN` is set: with no token the page
 * is not routable and this module refuses every request. That is the intended
 * resting state, and the instructions say to remove the variable once it has
 * been used.
 */

/** Short tokens are guessable; refuse to run rather than pretend to be safe. */
const MIN_TOKEN_LENGTH = 24;

export function recoveryEnabled(): boolean {
  const token = process.env.ADMIN_RECOVERY_TOKEN?.trim();
  return Boolean(token && token.length >= MIN_TOKEN_LENGTH);
}

/** True when a token is set but too short to be worth having. */
export function recoveryTokenTooShort(): boolean {
  const token = process.env.ADMIN_RECOVERY_TOKEN?.trim();
  return Boolean(token && token.length < MIN_TOKEN_LENGTH);
}

function tokenMatches(supplied: string): boolean {
  const expected = process.env.ADMIN_RECOVERY_TOKEN?.trim() ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which is itself a signal, so
  // the lengths are compared separately and the contents always compared.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface RecoveryResult {
  ok: boolean;
  message: string;
}

export async function recoverAdminPassword(input: {
  email: string;
  token: string;
  password: string;
}): Promise<RecoveryResult> {
  if (!recoveryEnabled()) {
    return { ok: false, message: "Recovery is not switched on for this deployment." };
  }
  if (input.password.length < 10) {
    return { ok: false, message: "The new password must be at least 10 characters." };
  }
  if (!tokenMatches(input.token)) {
    return { ok: false, message: "That recovery code is not correct." };
  }

  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, active: true, orgId: true },
  });

  // Only an administrator, and only one who is still active. Recovery exists to
  // restore an account that already had control, not to hand it to a new one.
  if (!user || user.role !== Role.ADMIN || !user.active) {
    return {
      ok: false,
      message:
        "No active administrator uses that address. Check the spelling — this only works for an administrator account.",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  // Recorded against the account itself: there is no signed-in person to blame,
  // and an out-of-band password change is exactly the kind of thing an audit
  // trail exists to show.
  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "user.password_recovered",
    entityType: "User",
    entityId: user.id,
    summary: `The password for ${user.name} (${user.email}) was reset using the deployment recovery code`,
  });

  return {
    ok: true,
    message: `Password set for ${user.email}. Sign in with it now, then remove ADMIN_RECOVERY_TOKEN from your deployment settings.`,
  };
}
