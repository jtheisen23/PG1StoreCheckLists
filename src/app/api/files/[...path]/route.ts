import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";

import { getCurrentUser } from "@/lib/auth";
import { LOCAL_UPLOAD_DIR, readPhoto } from "@/lib/storage";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

// Filenames are random UUIDs, so the bytes never change under a URL.
const CACHE = "private, max-age=31536000, immutable";

/**
 * Serves photos held by the database or local driver. Blob-hosted photos never
 * reach this route — those URLs point straight at the CDN.
 *
 * Photos show the inside of a store, so they are only served to a signed-in
 * user, and only from that user's own organization.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { path: segments } = await params;
  const pathname = segments.join("/");

  const stored = await readPhoto(user.orgId, pathname);
  if (stored) {
    return new NextResponse(new Uint8Array(stored.bytes), {
      headers: {
        "Content-Type": stored.mimeType,
        "Content-Length": String(stored.bytes.byteLength),
        "Cache-Control": CACHE,
      },
    });
  }

  // Fall back to the local-disk driver.
  const target = path.resolve(LOCAL_UPLOAD_DIR, ...segments);
  const root = path.resolve(LOCAL_UPLOAD_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // Local paths start with the owning org id; keep the same tenant boundary.
  if (segments[0] !== user.orgId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let size: number;
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    size = info.size;
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const stream = Readable.toWeb(
    createReadStream(target),
  ) as unknown as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "Content-Type":
        CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": CACHE,
    },
  });
}
