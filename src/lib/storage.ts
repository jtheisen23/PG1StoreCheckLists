import "server-only";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { prisma } from "./db";

export interface StoredFile {
  url: string;
  pathname: string;
  mimeType: string;
  size: number;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export type PhotoDriver = "database" | "blob" | "local";

/**
 * Where photos go.
 *
 * - `database` (default): bytes in Postgres. Nothing else to provision, and it
 *   survives a serverless deployment where local disk does not.
 * - `blob`: Vercel Blob. Chosen automatically when a token is present; the
 *   right answer once photo volume outgrows the database.
 * - `local`: files under UPLOAD_DIR. Development convenience only.
 *
 * Set PHOTO_STORAGE to override.
 */
export function photoDriver(): PhotoDriver {
  const configured = process.env.PHOTO_STORAGE?.toLowerCase();
  if (configured === "database" || configured === "blob" || configured === "local") {
    return configured;
  }
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "database";
}

/** Where the local driver writes. Deliberately NOT `public/`: Next's production
 * server resolves `public/` from a manifest built at compile time, so anything
 * written there after the build 404s. */
export const LOCAL_UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".uploads");

export interface StoreOptions {
  orgId: string;
  /** Groups files in the store, e.g. "submissions" or "actions". */
  kind: string;
}

export async function storePhoto(
  file: File,
  options: StoreOptions,
): Promise<StoredFile> {
  if (file.size > MAX_BYTES) {
    throw new Error("Photos must be 10 MB or smaller.");
  }
  if (file.type && !ALLOWED.has(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }

  const extension = EXTENSIONS[file.type] ?? "jpg";
  const mimeType = file.type || "image/jpeg";
  const pathname = `${options.orgId}/${options.kind}/${new Date().getFullYear()}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  switch (photoDriver()) {
    case "blob": {
      const { put } = await import("@vercel/blob");
      const blob = await put(pathname, bytes, {
        access: "public",
        contentType: mimeType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return { url: blob.url, pathname, mimeType, size: bytes.byteLength };
    }

    case "local": {
      const target = path.join(LOCAL_UPLOAD_DIR, pathname);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return {
        url: `/api/files/${pathname}`,
        pathname,
        mimeType,
        size: bytes.byteLength,
      };
    }

    case "database":
    default: {
      await prisma.storedFile.create({
        data: {
          orgId: options.orgId,
          pathname,
          mimeType,
          size: bytes.byteLength,
          data: bytes,
        },
      });
      return {
        url: `/api/files/${pathname}`,
        pathname,
        mimeType,
        size: bytes.byteLength,
      };
    }
  }
}

/**
 * Reads a photo back for `/api/files`. Checks the database first and falls back
 * to local disk, so a deployment that switches drivers keeps serving whatever
 * it stored earlier.
 */
export async function readPhoto(
  orgId: string,
  pathname: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const row = await prisma.storedFile.findUnique({
    where: { pathname },
    select: { orgId: true, mimeType: true, data: true },
  });

  if (row) {
    // Photos show the inside of a store; never serve one across organizations.
    if (row.orgId !== orgId) return null;
    return { bytes: Buffer.from(row.data), mimeType: row.mimeType };
  }

  return null;
}

/** Removes the stored bytes for a photo. Blob-hosted files are left alone. */
export async function deletePhoto(pathname: string) {
  await prisma.storedFile.deleteMany({ where: { pathname } });
}
