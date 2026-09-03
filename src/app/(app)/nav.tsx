"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

const ICONS = {
  today: "M4 5h16v15H4zM4 9h16M9 3v4M15 3v4M8.5 14l2 2 4-4",
  dashboard: "M4 19V9m5 10V5m5 14v-7m5 7V8",
  submissions: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  actions: "M12 3l9 16H3zM12 9v5M12 17h.01",
  locations: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z M12 10h.01",
  activity: "M3 12h4l3 8 4-16 3 8h4",
  admin: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z",
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-0.5 border-r px-3 py-4 md:flex">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
              active
                ? "bg-[var(--info-bg)] text-[var(--info)]"
                : "text-muted hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]",
            )}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  // The checklist runner owns the bottom of the screen while a walk is in
  // progress — its Back/Next/Submit bar sits where this nav would be.
  if (pathname.startsWith("/run/")) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t md:hidden"
      style={{
        background: "var(--surface-raised)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {items.slice(0, 5).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              active ? "text-[var(--info)]" : "text-muted",
            )}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
