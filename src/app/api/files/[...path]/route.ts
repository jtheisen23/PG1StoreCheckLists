import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";

import { getCurrentUser } from "@/lib/auth";
import { LOCAL_UPLOAD_DIR } from "@/lib/storage";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

/**
 * Serves photos held by the local storage driver. Blob-backed deployments never
 * hit this route — those URLs point straight at the CDN.
 *
 * Photos show the inside of a store, so they are only served to a signed-in
 * user, and the resolved path is checked to stay inside the upload directory.
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
  const target = path.resolve(LOCAL_UPLOAD_DIR, ...segments);
  const root = path.resolve(LOCAL_UPLOAD_DIR);

  if (target !== root && !target.startsWith(root + path.sep)) {
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

  const contentType =
    CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";

  const stream = Readable.toWeb(
    createReadStream(target),
  ) as unknown as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      // Filenames are random UUIDs, so the bytes never change under a URL.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
