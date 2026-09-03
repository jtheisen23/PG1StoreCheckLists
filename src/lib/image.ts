"use client";

/**
 * Client-side photo downscaling.
 *
 * A modern phone camera produces 3–5 MB images. At fleet scale that is the
 * difference between a database that holds a year of evidence photos and one
 * that does not, so every photo is resized and re-encoded before it leaves the
 * device. It also makes uploads over a store's weak wifi far quicker.
 *
 * A checklist photo exists to show whether something is clean, stocked or
 * broken; 1600px on the long edge is more than enough to judge that.
 */
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.72;

export interface Downscaled {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
}

export async function downscaleImage(
  file: File,
  maxEdge = MAX_EDGE,
  quality = JPEG_QUALITY,
): Promise<Downscaled> {
  const fallback: Downscaled = {
    blob: file,
    mimeType: file.type || "image/jpeg",
    width: 0,
    height: 0,
    originalSize: file.size,
  };

  // Anything the browser cannot decode (HEIC on some devices) is uploaded
  // untouched rather than dropped — the server still bounds the size.
  if (typeof document === "undefined" || !file.type.startsWith("image/")) {
    return fallback;
  }

  try {
    const bitmap = await createBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return fallback;
    context.drawImage(bitmap, 0, 0, width, height);
    if ("close" in bitmap) bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return fallback;

    // Re-encoding a small screenshot can make it bigger; keep the smaller one.
    if (blob.size >= file.size && scale === 1) return fallback;

    return {
      blob,
      mimeType: "image/jpeg",
      width,
      height,
      originalSize: file.size,
    };
  } catch {
    return fallback;
  }
}

async function createBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Safari fallback.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode the image."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "2.4 MB" / "312 KB", for upload hints. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
