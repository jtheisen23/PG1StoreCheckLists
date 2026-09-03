"use client";

import { useEffect } from "react";

/** Registers the offline shell cache. No-ops where service workers are absent. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[sw] registration failed", error);
    });
  }, []);

  return null;
}
