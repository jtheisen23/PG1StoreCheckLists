import "server-only";

import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db";

export interface Branding {
  orgName: string;
  /** Public URL for the logo, or null when none is set. */
  logoUrl: string | null;
  /** Width divided by height, or 0 when the dimensions are unknown. */
  logoAspect: number;
  /**
   * True when the logo is wide enough to be a wordmark — one that spells the
   * company out, so repeating the name beside it is just noise.
   */
  isWordmark: boolean;
  /** A square-ish image for the browser tab. */
  faviconUrl: string;
}

export const BRANDING_TAG = "branding";

/**
 * The logo shipped with this deployment, used until someone uploads another.
 * Committed rather than seeded so a brand new database still looks like the
 * company it belongs to.
 */
const BUNDLED_LOGO = { url: "/brand-logo.png", aspect: 1133 / 105 };

const FALLBACK_ICON = "/icon.svg";

/** Past this, a logo reads as a wordmark rather than a mark. */
const WORDMARK_ASPECT = 2.2;

function shape(logoUrl: string | null, aspect: number) {
  const isWordmark = aspect >= WORDMARK_ASPECT;
  return {
    logoUrl,
    logoAspect: aspect,
    isWordmark,
    // A wide wordmark shrinks to an unreadable sliver in a 16px tab, so only a
    // roughly square logo is worth using as the icon.
    faviconUrl: logoUrl && aspect > 0.6 && aspect < 1.7 ? logoUrl : FALLBACK_ICON,
  };
}

/**
 * Name and logo for the current organization.
 *
 * Read on nearly every page, including ones nobody has signed in to yet, so it
 * is cached and invalidated when the logo changes rather than queried each
 * time. Single-tenant today: the first organization is the organization. Adding
 * tenants later means resolving it from the host or the session instead.
 */
export const getBranding = unstable_cache(
  async (): Promise<Branding> => {
    try {
      const org = await prisma.organization.findFirst({
        orderBy: { createdAt: "asc" },
        select: { name: true, logoUrl: true, updatedAt: true },
      });
      if (!org) {
        return { orgName: "Store Checklists", ...shape(BUNDLED_LOGO.url, BUNDLED_LOGO.aspect) };
      }
      if (!org.logoUrl) {
        return { orgName: org.name, ...shape(BUNDLED_LOGO.url, BUNDLED_LOGO.aspect) };
      }

      // Dimensions decide how the logo is laid out and whether it can double as
      // the tab icon; they were measured when it was uploaded.
      const stored = await prisma.storedFile.findUnique({
        where: { pathname: org.logoUrl },
        select: { width: true, height: true },
      });
      const aspect =
        stored?.width && stored?.height ? stored.width / stored.height : 0;

      return {
        orgName: org.name,
        // Cache-busted so a replaced logo is picked up immediately.
        ...shape(`/api/branding/logo?v=${org.updatedAt.getTime()}`, aspect),
      };
    } catch {
      // Before the first deploy finishes, or if the database is unreachable,
      // the app should still render rather than fail on branding.
      return { orgName: "Store Checklists", ...shape(BUNDLED_LOGO.url, BUNDLED_LOGO.aspect) };
    }
  },
  ["branding"],
  { tags: [BRANDING_TAG], revalidate: 300 },
);

/** The stored pathname behind the public logo route. */
export async function getLogoPathname(): Promise<string | null> {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { logoUrl: true },
  });
  return org?.logoUrl ?? null;
}
