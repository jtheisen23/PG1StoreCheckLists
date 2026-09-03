"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/buttons";
import { NewUserForm, type DirectoryOptions } from "@/components/new-user-form";

/**
 * Lets an administrator add someone without leaving the page they are on.
 * The form is the same one the People screen uses, so the two never drift.
 */
export function AddUserDialog({ directory }: { directory: DirectoryOptions }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + Add person
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Clicking the backdrop closes; clicking the panel does not.
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border p-0 backdrop:bg-black/40"
        style={{ background: "var(--surface-raised)", color: "var(--text)" }}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Add a person</h2>
            <p className="text-muted mt-0.5 text-[13px]">
              Their role and scope decide which stores they can see.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-muted -mt-1 px-1 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <NewUserForm
            {...directory}
            chrome="bare"
            onCreated={() => router.refresh()}
          />
        </div>
      </dialog>
    </>
  );
}
