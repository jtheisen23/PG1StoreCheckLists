import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/role-labels";
import { PageHeader } from "@/components/ui";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Your account"
        description={`${user.name} · ${user.email} · ${ROLE_LABELS[user.role]}`}
      />
      <PasswordForm />
    </>
  );
}
