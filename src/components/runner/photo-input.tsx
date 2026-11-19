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
  box,
}: {
  clientKey: string;
  itemId: string;
  photoIds: string[];
  onChange: (ids: string[]) => void;
  required?: boolean;
  /**
   * The big dashed "Take photo" box, for a line whose answer is the photo or
   * that will not submit without one. Elsewhere — a failed line, say — the
   * camera is offered as two small tiles so it does not crowd the row.
   */
  box?: boolean;
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

  const errorLine = error ? (
    <p className="mt-1 text-[12px]" style={{ color: "var(--fail)" }}>
      {error}
    </p>
  ) : null;

  const thumbnails = photoIds.map((id) => (
    <div key={id} className="relative">
      {previews[id] ? (
        // Local blob preview; next/image cannot optimise object URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previews[id]}
          alt="Attached photo"
          className={box ? "h-24 w-24 rounded-xl border object-cover" : "h-16 w-16 rounded-lg border object-cover"}
        />
      ) : (
        <div
          className={box ? "h-24 w-24 rounded-xl border" : "h-16 w-16 rounded-lg border"}
          style={{ background: "var(--surface-sunken)" }}
        />
      )}
      <button
        type="button"
        onClick={() => void remove(id)}
        aria-label="Remove photo"
        className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold"
        style={{ background: "var(--fail)", color: "var(--on-status)" }}
      >
        ×
      </button>
    </div>
  ));

  if (box && !photoIds.length) {
    // Two ways in, as below: the box itself asks for the camera, the link
    // under it for the library.
    return (
      <div className="mt-2.5">
        <div
          className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-6"
          style={{
            borderColor: required ? "var(--fail)" : "var(--border-strong)",
            background: required ? "var(--fail-bg)" : "var(--surface)",
          }}
        >
          <label
            className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-[15px] font-medium"
            style={{ color: required ? "var(--fail)" : "var(--text-muted)" }}
          >
            <CameraIcon className="h-6 w-6" />
            {busy ? "Saving…" : "Take photo"}
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
          <label className="text-faint cursor-pointer text-[12px] underline-offset-2 hover:underline">
            or choose one already taken
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {errorLine}
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {thumbnails}

        {/*
          Two ways in, because they are genuinely different jobs. `capture`
          asks a phone for the camera directly, which is what someone standing
          in front of the thing wants — and which is also why the same control
          cannot reach the photo library. The second has no `capture`, so it
          opens the library or the file picker, for a photo taken earlier or a
          picture that came from somewhere else. A desktop browser ignores
          `capture` and opens a file picker for both.
        */}
        <PickerTile
          label="Camera"
          camera
          busy={busy}
          big={box}
          highlight={required && !photoIds.length}
          onFiles={addFiles}
        />
        <PickerTile
          label="Upload"
          busy={busy}
          big={box}
          highlight={required && !photoIds.length}
          onFiles={addFiles}
        />
      </div>
      {errorLine}
    </div>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 8h4l2-3h6l2 3h4v12H3z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function PickerTile({
  label,
  camera,
  busy,
  big,
  highlight,
  onFiles,
}: {
  label: string;
  /** Ask the device for the camera rather than the photo library. */
  camera?: boolean;
  busy: boolean;
  big?: boolean;
  highlight?: boolean;
  onFiles: (files: FileList | null) => Promise<void>;
}) {
  return (
    <label
      className={
        big
          ? "flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-[12px]"
          : "flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[11px]"
      }
      style={{
        color: highlight ? "var(--fail)" : "var(--text-muted)",
        borderColor: highlight ? "var(--fail)" : undefined,
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
        {camera ? (
          <>
            <path d="M3 8h4l2-3h6l2 3h4v12H3z" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.5" />
          </>
        ) : (
          <>
            <path d="M12 16V4" strokeLinecap="round" />
            <path d="M7.5 8.5 12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
          </>
        )}
      </svg>
      {busy ? "…" : label}
      <input
        type="file"
        accept="image/*"
        {...(camera ? { capture: "environment" as const } : {})}
        multiple
        className="sr-only"
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}
