import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getLogoPathname } from "@/server/branding";

export const runtime = "nodejs";

/**
 * Serves the organization's logo.
 *
 * Public on purpose: it appears on the sign-in page and as the browser tab
 * icon, both of which are seen before anyone signs in. Only the one image the
 * organization has nominated is reachable — the pathname comes from the
 * database, never from the request.
 */
export async function GET() {
  const pathname = await getLogoPathname();
  if (!pathname) {
    return NextResponse.json({ error: "No logo set." }, { status: 404 });
  }

  const file = await prisma.storedFile.findUnique({
    where: { pathname },
    select: { mimeType: true, data: true },
  });
  if (!file) {
    return NextResponse.json({ error: "No logo set." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.byteLength),
      // The URL carries a version stamp, so a change busts the cache.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
