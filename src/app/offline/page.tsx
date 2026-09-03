import "../globals.css";

export const metadata = { title: "Offline" };

/** Served by the service worker when a navigation cannot reach the network. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight">You&rsquo;re offline</h1>
        <p className="text-muted mt-2 text-[13px]">
          This page hasn&rsquo;t been saved to the device yet. Checklists you already
          opened keep working, and anything you complete uploads automatically
          once the connection is back.
        </p>
      </div>
    </main>
  );
}
