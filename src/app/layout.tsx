import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { getBranding } from "@/server/branding";
import { THEME_COLORS, themeScript } from "@/lib/theme";

/**
 * Titles and the tab icon carry the organization's own name and logo.
 *
 * Declared here rather than through an app/icon file: the manifest and the
 * service worker both reference /icon.svg from public/, and having that file in
 * two places is a conflict Next rejects.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { orgName, faviconUrl } = await getBranding();

  return {
    title: {
      default: `${orgName} Checklists`,
      template: `%s · ${orgName}`,
    },
    description:
      "Daily operations execution for restaurants — checklists, corrective actions and rollup dashboards.",
    manifest: "/manifest.webmanifest",
    icons: { icon: faviconUrl, apple: faviconUrl },
    appleWebApp: { capable: true, title: orgName, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The theme script sets data-theme on <html> before React hydrates, so the
    // server's markup and the live document differ there on purpose.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* First in <body>, not <head>: it runs before anything paints, and by
            then the theme-color tags it also adjusts have been parsed. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
        {children}
      </body>
    </html>
  );
}
