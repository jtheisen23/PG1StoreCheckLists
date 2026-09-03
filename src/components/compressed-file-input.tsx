"use client";

import { useRef, useState } from "react";
import { downscaleImage, formatBytes } from "@/lib/image";

/**
 * A file input that resizes each photo on the device before the form is
 * submitted, so proof photos land in storage at a sane size. The compressed
 * files are written back onto the input, which keeps this a plain form field
 * that a server action can read.
 */
export function CompressedFileInput({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      setStatus(null);
      return;
    }

    // DataTransfer is how a FileList gets rebuilt; where it is unavailable the
    // originals are submitted untouched.
    if (typeof DataTransfer === "undefined") {
      setStatus(`${files.length} photo(s) ready`);
      return;
    }

    setBusy(true);
    try {
      const transfer = new DataTransfer();
      let before = 0;
      let after = 0;

      for (const file of files.slice(0, 5)) {
        const shrunk = await downscaleImage(file);
        before += file.size;
        after += shrunk.blob.size;
        transfer.items.add(
          new File([shrunk.blob], renameTo(file.name, shrunk.mimeType), {
            type: shrunk.mimeType,
          }),
        );
      }

      if (inputRef.current) inputRef.current.files = transfer.files;
      setStatus(
        before > after
          ? `${transfer.files.length} photo(s) · ${formatBytes(before)} → ${formatBytes(after)}`
          : `${transfer.files.length} photo(s) · ${formatBytes(after)}`,
      );
    } catch {
      setStatus(`${files.length} photo(s) ready`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleChange}
        className={className}
      />
      {busy ? (
        <span className="text-faint text-[12px]">Resizing…</span>
      ) : status ? (
        <span className="text-faint text-[12px]">{status}</span>
      ) : null}
    </>
  );
}

function renameTo(original: string, mimeType: string) {
  if (mimeType !== "image/jpeg") return original;
  return original.replace(/\.[^.]+$/, "") + ".jpg";
}
