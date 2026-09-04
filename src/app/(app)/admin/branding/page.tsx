import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { getBranding, getLogoPathname } from "@/server/branding";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { BrandingForms } from "./branding-forms";

export const metadata: Metadata = { title: "Branding" };
export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  await requireUser();
  const { orgName, logoUrl, isWordmark } = await getBranding();
  // A logo ships with the app, so "no logo" and "the default logo" are not the
  // same thing — only an uploaded one can be removed.
  const uploaded = Boolean(await getLogoPathname());

  return (
    <>
      <PageHeader
        title="Branding"
        description="Your logo and name appear on every page, on the sign-in screen, and as the browser tab icon."
      />

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <BrandingForms orgName={orgName} logoUrl={logoUrl} uploaded={uploaded} />

        <Card className="h-fit">
          <CardHeader
            title="Where it appears"
            subtitle="Every one of these updates as soon as you save."
          />
          <div className="px-5 py-4">
            <div
              className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-3"
              style={{ background: "var(--surface)" }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={orgName}
                  className="brand-logo h-7 w-auto max-w-[230px] object-contain"
                />
              ) : (
                <span
                  className="bg-brand-600 flex h-7 w-7 items-center justify-center rounded-lg"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4">
                    <path
                      d="M6 12.5l4 4 8-8"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
              {isWordmark ? null : (
                <span className="text-[14px] font-semibold tracking-tight">{orgName}</span>
              )}
              <span className="text-faint ml-auto text-[12px]">app header</span>
            </div>

            <ul className="text-muted flex flex-col gap-1.5 text-[13px]">
              <li>· The header on every page, on phones and desktop</li>
              <li>· The sign-in screen your teams see</li>
              <li>· The screen shown when a store loses its connection</li>
              <li>· The name in every page title and browser tab</li>
            </ul>

            <p className="text-faint mt-4 text-[12px]">
              A wide wordmark works as well as a square mark, and stands on its
              own without the name repeated beside it. Transparent backgrounds
              are fine: on the dark theme the logo sits on a light chip, so its
              colours stay exactly as designed. A roughly square logo is also
              used as the browser tab and home-screen icon — a wide one would
              shrink to an unreadable sliver there, so the app icon is kept
              instead.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
