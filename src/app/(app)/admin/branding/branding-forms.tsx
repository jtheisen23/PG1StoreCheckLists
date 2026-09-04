"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/buttons";
import { usePreservedForm } from "@/components/preserve-form";
import { formatBytes, prepareLogo } from "@/lib/image";
import {
  removeLogo,
  renameOrganization,
  uploadLogo,
  type BrandingState,
} from "@/server/branding-actions";

const field =
  "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 text-[13px] outline-none focus:border-[var(--color-brand-500)]";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Result({ state }: { state: BrandingState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-lg px-3 py-2 text-[12px]"
        style={{ background: "var(--fail-bg)", color: "var(--fail)" }}
      >
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p
        className="rounded-lg px-3 py-2 text-[12px]"
        style={{ background: "var(--pass-bg)", color: "var(--pass)" }}
      >
        {state.message}
      </p>
    );
  }
  return null;
}

export function BrandingForms({
  orgName,
  logoUrl,
  uploaded,
}: {
  orgName: string;
  logoUrl: string | null;
  /** False while the logo shown is the one bundled with the app. */
  uploaded: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{ width: number; height: number; size: number } | null>(
    null,
  );
  const [working, setWorking] = useState(false);

  /**
   * Normalises the picked file in place, so the form posts one predictable PNG
   * whatever the person chose. If the browser cannot decode it, the original
   * goes up untouched and the server identifies it from its bytes.
   */
  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setChosen(file?.name ?? null);
    setPrepared(null);
    setPreview(null);
    if (!file) return;

    setWorking(true);
    try {
      const logo = await prepareLogo(file);
      if (!logo || typeof DataTransfer === "undefined") {
        setPreview(URL.createObjectURL(file));
        return;
      }
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([logo.blob], file.name.replace(/\.[^.]+$/, "") + ".png", {
          type: "image/png",
        }),
      );
      if (fileInput.current) fileInput.current.files = transfer.files;
      setPreview(URL.createObjectURL(logo.blob));
      setPrepared({ width: logo.width, height: logo.height, size: logo.blob.size });
    } finally {
      setWorking(false);
    }
  }

  const [logoState, logoAction] = useActionState<BrandingState, FormData>(
    uploadLogo,
    {},
  );
  const [nameState, nameAction] = useActionState<BrandingState, FormData>(
    renameOrganization,
    {},
  );
  const logoForm = usePreservedForm(logoState);
  const nameForm = usePreservedForm(nameState);

  // The header and tab icon change too, so pull fresh server state after a save.
  useEffect(() => {
    if (logoState.ok || nameState.ok) router.refresh();
  }, [logoState, nameState, router]);

  useEffect(() => {
    if (logoState.ok) {
      setPreview(null);
      setChosen(null);
      setPrepared(null);
    }
  }, [logoState]);

  return (
    <div className="flex flex-col gap-4">
      <Card as="section">
        <CardHeader title="Logo" />
        <form {...logoForm.props} action={logoAction} className="flex flex-col gap-3.5 px-5 py-4">
          <div
            className="flex h-24 items-center justify-center rounded-lg border"
            style={{ background: "var(--surface)" }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="New logo preview" className="max-h-16 max-w-[80%] object-contain" />
            ) : logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Current logo" className="max-h-16 max-w-[80%] object-contain" />
            ) : (
              <span className="text-faint text-[13px]">No logo yet</span>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Choose an image</span>
            <input
              ref={fileInput}
              type="file"
              name="logo"
              accept="image/*"
              className="text-[13px]"
              onChange={(event) => void onPick(event)}
            />
            <input type="hidden" name="width" value={prepared?.width ?? ""} />
            <input type="hidden" name="height" value={prepared?.height ?? ""} />
            <span className="text-faint text-[12px]">
              {working
                ? "Preparing…"
                : prepared
                  ? `Ready: ${prepared.width}×${prepared.height}, ${formatBytes(prepared.size)}.`
                  : "PNG, JPG, WebP or AVIF, up to 2 MB. A transparent PNG looks best — empty margins are trimmed automatically."}
            </span>
          </label>

          <Result state={logoState} />

          <div className="flex gap-2">
            <Submit label={chosen ? "Save logo" : "Upload logo"} />
            {uploaded ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (confirm("Remove this logo and go back to the default one?")) {
                    void removeLogo().then(() => router.refresh());
                  }
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card as="section">
        <CardHeader title="Organization name" />
        <form {...nameForm.props} action={nameAction} className="flex flex-col gap-3.5 px-5 py-4">
          <input
            name="orgName"
            defaultValue={orgName}
            required
            className={field}
            aria-label="Organization name"
          />
          <Result state={nameState} />
          <div>
            <Submit label="Save name" />
          </div>
        </form>
      </Card>
    </div>
  );
}
