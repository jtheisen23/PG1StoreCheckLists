import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getBranding } from "@/server/branding";

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
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1017" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
