"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Keeps what someone typed when a server action rejects the form.
 *
 * React resets an uncontrolled `<form action={…}>` once the action settles,
 * which is right after a success and wrong after a validation error — the
 * person loses a store's whole address because the store number was taken.
 * This snapshots the fields on submit and puts them back when the result
 * carries an error.
 *
 * Password inputs are deliberately not restored: the browser's own password
 * manager owns that field, and re-filling it after a failed sign-in would be
 * surprising.
 *
 *   const form = usePreservedForm(state);
 *   <form {...form.props} action={formAction}>
 */
export function usePreservedForm(state: { error?: string } | undefined) {
  const formRef = useRef<HTMLFormElement>(null);
  const snapshot = useRef<Map<string, string | boolean>>(new Map());

  const capture = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const taken = new Map<string, string | boolean>();
    for (const element of Array.from(form.elements)) {
      const field = element as HTMLInputElement;
      if (!field.name || field.type === "password" || field.type === "file") continue;
      taken.set(
        keyFor(field),
        field.type === "checkbox" || field.type === "radio"
          ? field.checked
          : field.value,
      );
    }
    snapshot.current = taken;
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!state?.error || !form || snapshot.current.size === 0) return;

    for (const element of Array.from(form.elements)) {
      const field = element as HTMLInputElement;
      if (!field.name || field.type === "password" || field.type === "file") continue;
      const kept = snapshot.current.get(keyFor(field));
      if (kept === undefined) continue;
      if (field.type === "checkbox" || field.type === "radio") {
        field.checked = Boolean(kept);
      } else if (typeof kept === "string") {
        field.value = kept;
      }
    }
  }, [state]);

  return {
    ref: formRef,
    props: { ref: formRef, onSubmitCapture: capture },
  };
}

/** Several controls can share a name (checkbox groups); include the value. */
function keyFor(field: HTMLInputElement) {
  return field.type === "checkbox" || field.type === "radio"
    ? `${field.name}::${field.value}`
    : field.name;
}
