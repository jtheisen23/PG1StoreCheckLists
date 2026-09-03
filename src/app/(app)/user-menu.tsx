"use client";

import { useState, useRef, useEffect } from "react";
import { logout } from "@/app/login/actions";

export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="bg-brand-600 flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold text-white"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="surface absolute right-0 z-40 mt-2 w-56 rounded-xl p-1.5 shadow-lg"
        >
          <div className="border-b px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-[13px] font-medium">{name}</p>
            <p className="text-muted text-[12px]">{roleLabel}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[var(--surface-sunken)]"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
