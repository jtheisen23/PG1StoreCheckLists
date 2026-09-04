import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { needsFirstRun } from "@/server/first-run";
import { Brand } from "@/components/brand";
import { OrgName } from "@/components/org-name";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  // Nobody can sign in to an empty database; send them to create the first
  // administrator instead of showing a form that cannot work.
  if (await needsFirstRun()) redirect("/setup");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Brand
            size={44}
            showName={false}
            className="mb-3 flex items-center justify-center"
          />
          <h1 className="text-lg font-semibold tracking-tight">
            <OrgName />
          </h1>
          <p className="text-muted mt-1 text-[13px]">
            Daily operations execution for your restaurants.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
