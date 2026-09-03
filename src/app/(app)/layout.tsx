import { requireUser } from "@/lib/auth";
import { ROLE_LABELS, canManageTemplates, isLeader } from "@/lib/permissions";
import {
  getAccessibleLocations,
  getCurrentLocation,
} from "@/lib/current-location";

import { BottomNav, SideNav, type NavItem } from "./nav";
import { LocationSwitcher } from "./location-switcher";
import { UserMenu } from "./user-menu";
import { SyncStatus } from "@/components/sync-status";
import { ServiceWorkerRegistrar } from "@/components/service-worker";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const locations = await getAccessibleLocations(user);
  const current = await getCurrentLocation(user, locations);

  const items: NavItem[] = [
    { href: "/", label: "Today", icon: "today" },
    { href: "/actions", label: "Actions", icon: "actions" },
    { href: "/submissions", label: "History", icon: "submissions" },
  ];
  if (isLeader(user) || user.role === "GM") {
    items.splice(1, 0, { href: "/dashboard", label: "Dashboard", icon: "dashboard" });
  }
  if (isLeader(user)) {
    items.push({ href: "/locations", label: "Locations", icon: "locations" });
    items.push({ href: "/activity", label: "Activity", icon: "activity" });
  }
  if (canManageTemplates(user)) {
    items.push({ href: "/admin", label: "Admin", icon: "admin" });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ServiceWorkerRegistrar />

      <header
        className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4"
        style={{ background: "var(--surface-raised)" }}
      >
        <div className="flex items-center gap-2">
          <div className="bg-brand-600 flex h-7 w-7 items-center justify-center rounded-lg">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                d="M6 12.5l4 4 8-8"
                fill="none"
                stroke="white"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="hidden text-[14px] font-semibold tracking-tight sm:block">
            Store Checklists
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <SyncStatus />
          {current ? (
            <LocationSwitcher locations={locations} currentId={current.id} />
          ) : null}
          <UserMenu name={user.name} roleLabel={ROLE_LABELS[user.role]} />
        </div>
      </header>

      <div className="flex flex-1">
        <SideNav items={items} />
        <main className="min-w-0 flex-1 px-4 py-5 pb-24 md:px-6 md:pb-8">
          {children}
        </main>
      </div>

      <BottomNav items={items} />
    </div>
  );
}
