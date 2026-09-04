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

export interface PreparedLogo {
  blob: Blob;
  width: number;
  height: number;
}

/** Alpha below this counts as empty space when trimming a logo's margins. */
const EMPTY_ALPHA = 8;

/**
 * Normalises a logo before it is uploaded.
 *
 * Three things happen here, all of which the person uploading should not have
 * to think about:
 *
 * - **Re-encoded as PNG.** The browser decodes whatever it can display, so a
 *   file exported as AVIF, HEIC or WebP arrives as one predictable format that
 *   every browser renders and that keeps transparency.
 * - **Transparent margins trimmed.** Brand kits routinely ship a wordmark
 *   floating in a large empty canvas. Left alone, the header sizes the whole
 *   canvas and the logo itself comes out half the height it should be.
 * - **Bounded.** A print-resolution logo is many megabytes for something drawn
 *   28 pixels tall.
 *
 * Returns null when the browser cannot decode the file; the original is then
 * uploaded untouched and the server identifies it from its bytes.
 */
export async function prepareLogo(
  file: File,
  maxEdge = 1024,
): Promise<PreparedLogo | null> {
  if (typeof document === "undefined") return null;

  try {
    const bitmap = await createBitmap(file);
    // Read the dimensions before closing: a closed ImageBitmap reports 0x0.
    const naturalWidth = bitmap.width;
    const naturalHeight = bitmap.height;
    if (naturalWidth < 1 || naturalHeight < 1) return null;

    const source = document.createElement("canvas");
    source.width = naturalWidth;
    source.height = naturalHeight;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) return null;
    sourceContext.drawImage(bitmap, 0, 0);
    if ("close" in bitmap) bitmap.close();

    const box = opaqueBounds(sourceContext, naturalWidth, naturalHeight);
    if (box.width < 1 || box.height < 1) return null;

    const scale = Math.min(1, maxEdge / Math.max(box.width, box.height));
    const width = Math.max(1, Math.round(box.width * scale));
    const height = Math.max(1, Math.round(box.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(
      source,
      box.left,
      box.top,
      box.width,
      box.height,
      0,
      0,
      width,
      height,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return null;
    return { blob, width, height };
  } catch {
    return null;
  }
}

/** The smallest rectangle holding every pixel that is not fully transparent. */
function opaqueBounds(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const whole = { left: 0, top: 0, width, height };
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return whole; // Tainted canvas; nothing to trim against.
  }

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= EMPTY_ALPHA) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  // Fully transparent, or fully opaque with nothing to trim.
  if (right < left || bottom < top) return whole;
  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}
