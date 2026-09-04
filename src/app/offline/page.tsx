import "../globals.css";

export const metadata = { title: "Offline" };

/** Served by the service worker when a navigation cannot reach the network. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        {/*
          The bundled logo, not the uploaded one: this page is cached ahead of
          time by the service worker and has no request to read the database on.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand-logo.png"
          alt=""
          className="brand-logo mx-auto mb-5 h-7 w-auto max-w-[230px] object-contain"
        />
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
