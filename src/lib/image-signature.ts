/**
 * Identifies a raster image from its leading bytes.
 *
 * A browser's declared `File.type` comes from the operating system's guess at
 * the file extension, and both are wrong often enough to matter: the PG1
 * wordmark arrived named `.jpg` while actually being AVIF. Sniffing the real
 * container is also the safer check, since the declared type is supplied by
 * whoever is uploading and this image is later served from our own origin.
 *
 * Only formats a browser renders as an inert bitmap are listed. SVG is
 * deliberately absent: it is a document that can carry script.
 */
export type ImageFormat = "image/png" | "image/jpeg" | "image/webp" | "image/avif" | "image/gif";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** The image's true format, or null if these bytes are not a supported image. */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  // ISO base media: a `ftyp` box whose major brand or compatible brands name
  // AVIF. HEIC uses the same container but browsers outside Safari cannot
  // decode it, so only the AVIF brands are accepted.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brands = ascii(bytes, 8, 24);
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  }
  return null;
}

/** How many leading bytes `sniffImageFormat` needs to decide. */
export const SIGNATURE_BYTES = 32;

/**
 * Width and height from a PNG's IHDR chunk, which is always the first chunk
 * and sits at a fixed offset. Reading it here means the stored dimensions come
 * from the file itself rather than from whatever the uploader claimed.
 */
export function readPngSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (sniffImageFormat(bytes) !== "image/png" || bytes.length < 24) return null;
  if (ascii(bytes, 12, 4) !== "IHDR") return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 1 || height < 1) return null;
  return { width, height };
}
