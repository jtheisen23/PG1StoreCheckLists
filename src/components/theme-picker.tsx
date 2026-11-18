"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import {
  readThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; title: string; icon: string }[] = [
  {
    value: "system",
    label: "Auto",
    title: "Match this device's light or dark setting",
    // A half-filled circle: the common mark for "follows the system".
    icon: "M12 21a9 9 0 100-18 9 9 0 000 18z M12 3v18",
  },
  {
    value: "light",
    label: "Light",
    title: "Always light",
    icon: "M12 16a4 4 0 100-8 4 4 0 000 8z M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  },
  {
    value: "dark",
    label: "Dark",
    title: "Always dark",
    icon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
  },
];

/**
 * Light / Dark / Auto, as menu radio items. Saved on this device only — a store
 * iPad is shared by a shift, and the next person may want it differently.
 *
 * Reads localStorage while rendering, so it must only render on the client:
 * it lives inside the account menu, which is closed in the server's markup.
 */
export function ThemePicker() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);

  return (
    <div role="group" aria-label="Theme" className="px-1 pt-1.5 pb-1">
      <p className="text-faint px-1.5 pb-1.5 text-[11px] font-medium tracking-wide uppercase">
        Theme
      </p>
      <div
        className="grid grid-cols-3 gap-0.5 rounded-lg p-0.5"
        style={{ background: "var(--surface-sunken)" }}
      >
        {OPTIONS.map((option) => {
          const selected = option.value === preference;
          return (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              title={option.title}
              onClick={() => {
                saveThemePreference(option.value);
                setPreference(option.value);
              }}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[12px] font-medium transition-colors",
                selected ? "shadow-sm" : "text-muted hover:text-[var(--text)]",
              )}
              style={
                selected
                  ? { background: "var(--surface-raised)", color: "var(--text)" }
                  : undefined
              }
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={option.icon} />
              </svg>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
