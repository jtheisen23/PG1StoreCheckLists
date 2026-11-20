"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/locations", label: "Stores" },
  { href: "/admin/templates", label: "Checklists" },
  { href: "/admin/schedules", label: "Schedules" },
  { href: "/admin/close-rating", label: "Close rating" },
  { href: "/admin/sub-specs", label: "Sub specs" },
  { href: "/admin/users", label: "People" },
  { href: "/admin/branding", label: "Branding" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    // The tabs are wider than a phone: the row scrolls rather than pushing the
    // page sideways.
    <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto border-b px-4 pb-3 md:mx-0 md:px-0">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap"
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
