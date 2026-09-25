"use client";

import { useEffect } from "react";

/** Registers /sw.js (offline fallback page) in production builds only, so dev hot reload is never cached. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
