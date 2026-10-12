"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const pageKeys: Record<string, string> = {
  "/": "home",
  "/menu": "menu",
  "/gallery": "gallery",
  "/contact": "contact",
  "/delivery": "delivery",
  "/static-menu": "static-menu",
};

const TRACKING_WINDOW_MS = 30 * 60 * 1000;

export default function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const pageKey = pageKeys[pathname];
    if (!pageKey) return;

    const storageKey = `teazo-page-view:${pageKey}`;
    const lastTracked = Number(sessionStorage.getItem(storageKey) ?? 0);
    if (Number.isFinite(lastTracked) && Date.now() - lastTracked < TRACKING_WINDOW_MS) return;

    void fetch("/api/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageKey }),
      keepalive: true,
    }).then((response) => {
      if (response.ok) sessionStorage.setItem(storageKey, String(Date.now()));
    }).catch(() => {
      // Analytics must never interfere with the public page; a later visit can retry.
    });
  }, [pathname]);

  return null;
}
