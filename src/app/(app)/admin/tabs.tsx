"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/locations", label: "Stores" },
  { href: "/admin/templates", label: "Checklists" },
  { href: "/admin/schedules", label: "Schedules" },
  { href: "/admin/users", label: "People" },
  { href: "/admin/branding", label: "Branding" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex gap-1.5 border-b pb-3">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium"
            style={
              active
                ? { background: "var(--info-bg)", color: "var(--info)" }
                : { color: "var(--text-muted)" }
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
