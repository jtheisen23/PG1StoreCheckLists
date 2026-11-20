import { requireUser } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { SyncStatus } from "@/components/sync-status";
import { ServiceWorkerRegistrar } from "@/components/service-worker";

/**
 * A walk gets the whole screen. No side or bottom navigation competes with the
 * checklist on a store iPad or a phone: the walk's own header says where you
 * are and gets you back, and its bar along the bottom carries progress and
 * Submit. The sync status stays, because someone in a walk-in with no signal
 * needs to know their work is held on the device.
 */
export default async function WalkLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="min-h-dvh" style={{ background: "var(--surface)" }}>
      <ServiceWorkerRegistrar />
      <div className="mx-auto max-w-[52rem]" style={{ background: "var(--surface-raised)" }}>
        <div className="flex h-12 items-center gap-3 px-4 md:px-6">
          <Brand
            size={22}
            showName={false}
            className="flex min-w-0 flex-1 items-center"
            logoClassName="max-w-[180px]"
          />
          <SyncStatus />
        </div>
      </div>
      {children}
    </div>
  );
}
