"use client";

import { useEffect, useState } from "react";
import { deletePhoto, getPhoto, savePhoto } from "@/lib/offline/db";
import { downscaleImage } from "@/lib/image";

/**
 * Camera capture. Photos are held as blobs in IndexedDB so a walk taken in a
 * walk-in cooler survives until the device is back on wifi.
 */
export function PhotoInput({
  clientKey,
  itemId,
  photoIds,
  onChange,
  required,
}: {
  clientKey: string;
  itemId: string;
  photoIds: string[];
  onChange: (ids: string[]) => void;
  required?: boolean;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    (async () => {
      const next: Record<string, string> = {};
      for (const id of photoIds) {
        const photo = await getPhoto(id);
        if (!photo) continue;
        const url = URL.createObjectURL(photo.blob);
        urls.push(url);
        next[id] = url;
      }
      if (!cancelled) setPreviews(next);
    })();

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoIds]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const added: string[] = [];

    try {
      for (const file of Array.from(files).slice(0, 5)) {
        // Resize on the device: it keeps the stored photo small and makes the
        // upload survive a weak connection.
        const shrunk = await downscaleImage(file);
        if (shrunk.blob.size > 10 * 1024 * 1024) {
          setError("That photo is too large, even after resizing.");
          continue;
        }
        const id = crypto.randomUUID();
        await savePhoto({
          id,
          clientKey,
          itemId,
          blob: shrunk.blob,
          mimeType: shrunk.mimeType,
          createdAt: new Date().toISOString(),
        });
        added.push(id);
      }
    } catch {
      setError("That photo could not be saved on this device.");
    } finally {
      setBusy(false);
    }

    if (added.length) onChange([...photoIds, ...added]);
  }

  async function remove(id: string) {
    await deletePhoto(id);
    onChange(photoIds.filter((p) => p !== id));
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {photoIds.map((id) => (
          <div key={id} className="relative">
            {previews[id] ? (
              // Local blob preview; next/image cannot optimise object URLs.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previews[id]}
                alt="Attached photo"
                className="h-16 w-16 rounded-lg border object-cover"
              />
            ) : (
              <div className="h-16 w-16 rounded-lg border bg-[var(--surface-sunken)]" />
            )}
            <button
              type="button"
              onClick={() => void remove(id)}
              aria-label="Remove photo"
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: "var(--fail)" }}
            >
              ×
            </button>
          </div>
        ))}

        <label
          className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[11px]"
          style={{
            color: required && !photoIds.length ? "var(--fail)" : "var(--text-muted)",
            borderColor: required && !photoIds.length ? "var(--fail)" : undefined,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M3 8h4l2-3h6l2 3h4v12H3z" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {busy ? "…" : "Photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {error ? (
        <p className="mt-1 text-[12px]" style={{ color: "var(--fail)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
