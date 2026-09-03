import "server-only";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export interface StoredFile {
  url: string;
  pathname: string;
  mimeType: string;
  size: number;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

/**
 * Where the local driver writes. Deliberately NOT `public/`: Next's production
 * server resolves `public/` from a manifest built at compile time, so anything
 * written there after the build 404s.
 */
export const LOCAL_UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".uploads");

/**
 * Photo storage. Vercel Blob when a token is configured (the production path),
 * otherwise the local disk so the app runs with no external services during
 * development. Local files are served back through `/api/files/…`.
 */
export async function storePhoto(
  file: File,
  prefix: string,
): Promise<StoredFile> {
  if (file.size > MAX_BYTES) {
    throw new Error("Photos must be 10 MB or smaller.");
  }
  if (file.type && !ALLOWED.has(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }

  const extension =
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" }[
      file.type
    ] ?? "jpg";
  const pathname = `${prefix}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, bytes, {
      access: "public",
      contentType: file.type || "image/jpeg",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return {
      url: blob.url,
      pathname,
      mimeType: file.type || "image/jpeg",
      size: bytes.byteLength,
    };
  }

  const target = path.join(LOCAL_UPLOAD_DIR, pathname);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);

  return {
    url: `/api/files/${pathname}`,
    pathname,
    mimeType: file.type || "image/jpeg",
    size: bytes.byteLength,
  };
}
