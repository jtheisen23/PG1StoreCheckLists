import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { recoveryEnabled, recoveryTokenTooShort } from "@/server/recovery";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = { title: "Recover access" };
export const dynamic = "force-dynamic";

/**
 * The way back in for an administrator who has lost their password.
 *
 * Unroutable unless ADMIN_RECOVERY_TOKEN is set in the deployment, so the usual
 * state of this page is that it does not exist.
 */
export default function RecoverPage() {
  if (!recoveryEnabled()) {
    if (recoveryTokenTooShort()) {
      // Worth saying out loud: a token this short is not protection, and
      // silently ignoring it would leave someone believing it works.
      console.warn(
        "[recover] ADMIN_RECOVERY_TOKEN is set but shorter than 24 characters, so recovery stays switched off.",
      );
    }
    notFound();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Brand size={44} showName={false} className="mb-3 flex items-center justify-center" />
          <h1 className="text-lg font-semibold tracking-tight">Recover access</h1>
          <p className="text-muted mt-1 text-[13px]">
            For an administrator who has lost their password. Everyone else
            should ask an administrator to set them a new one.
          </p>
        </div>

        <div className="surface rounded-xl p-5">
          <RecoveryForm />
        </div>

        <p className="text-faint mt-4 text-center text-[12px]">
          Remove ADMIN_RECOVERY_TOKEN from your deployment once you are back in.
        </p>
      </div>
    </main>
  );
}
