import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="bg-brand-600 mb-3 flex h-11 w-11 items-center justify-center rounded-xl">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path
                d="M6 12.5l4 4 8-8"
                fill="none"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Store Checklists</h1>
          <p className="text-muted mt-1 text-[13px]">
            Daily operations execution for your restaurants.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
