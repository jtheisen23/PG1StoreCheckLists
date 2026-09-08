"use server";

import { recoverAdminPassword } from "@/server/recovery";

export interface RecoveryState {
  error?: string;
  ok?: boolean;
  message?: string;
}

export async function submitRecovery(
  _prev: RecoveryState,
  formData: FormData,
): Promise<RecoveryState> {
  const result = await recoverAdminPassword({
    email: String(formData.get("email") ?? ""),
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  return result.ok
    ? { ok: true, message: result.message }
    : { error: result.message };
}
