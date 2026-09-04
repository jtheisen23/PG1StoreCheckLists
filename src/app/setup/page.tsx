import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { needsFirstRun } from "@/server/first-run";
import { Brand } from "@/components/brand";
import { FirstRunForm } from "./first-run-form";

export const metadata: Metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await getCurrentUser()) redirect("/");
  // Once an administrator exists this page is closed for good.
  if (!(await needsFirstRun())) redirect("/login");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <Brand
            size={44}
            showName={false}
            className="mb-3 flex items-center justify-center"
          />
          <h1 className="text-lg font-semibold tracking-tight">
            Set up Store Checklists
          </h1>
          <p className="text-muted mt-1 text-[13px]">
            Your database is empty. Create your organization and the first
            administrator — this page closes as soon as you do.
          </p>
        </div>
        <FirstRunForm />
      </div>
    </main>
  );
}
