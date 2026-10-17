"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile, the bot check (see app/lib/turnstile.ts). With no key
 * set, local development uses Cloudflare's always-pass test key.
 */
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
  (process.env.NODE_ENV === "development" ? "1x00000000000000000000AA" : "");

type Turnstile = {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
    /** Called by Turnstile's script once it has loaded (the onload= in its URL). */
    onTeazoTurnstileLoad?: () => void;
  }
}

const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTeazoTurnstileLoad";

/**
 * Widgets that mounted while the script was still downloading, waiting to
 * render. One list for the whole page: the contact form and the cart can both
 * be on screen, and the script calls a single onload function.
 */
const waitingForTurnstile = new Set<() => void>();
if (typeof window !== "undefined") {
  window.onTeazoTurnstileLoad = () => waitingForTurnstile.forEach((render) => render());
}

/**
 * Renders the bot check. Inside a <form>, it adds a hidden
 * cf-turnstile-response field with the token. A token works only once, so
 * change `resetKey` after every submission to get a fresh one.
 */
export default function TurnstileWidget({
  action,
  resetKey,
  onToken,
  onExpire,
  onFailedChange,
  className,
}: {
  /** Shown in the Turnstile dashboard, e.g. "contact" or "checkout". */
  action: string;
  resetKey?: unknown;
  onToken?: (token: string) => void;
  onExpire?: () => void;
  /** true when the check can't load or run, false once it passes. */
  onFailedChange?: (failed: boolean) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const callbacks = useRef({ onToken, onExpire, onFailedChange });
  useEffect(() => {
    callbacks.current = { onToken, onExpire, onFailedChange };
  });

  const renderWidget = useCallback(() => {
    if (!TURNSTILE_SITE_KEY || !window.turnstile || !container.current || widgetId.current) {
      return;
    }
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: TURNSTILE_SITE_KEY,
      action,
      theme: "light",
      callback: (token: string) => {
        callbacks.current.onFailedChange?.(false);
        callbacks.current.onToken?.(token);
      },
      "expired-callback": () => callbacks.current.onExpire?.(),
      // Without an error callback Turnstile throws. It keeps retrying on its own.
      "error-callback": () => callbacks.current.onFailedChange?.(true),
    });
  }, [action]);

  useEffect(() => {
    // The script may still be downloading, for example on a quick return to this page.
    if (window.turnstile) renderWidget();
    else waitingForTurnstile.add(renderWidget);

    return () => {
      waitingForTurnstile.delete(renderWidget);
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [renderWidget]);

  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (Object.is(lastResetKey.current, resetKey)) return;
    lastResetKey.current = resetKey;
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  return (
    <>
      <Script
        src={TURNSTILE_SCRIPT}
        strategy="afterInteractive"
        onError={() => callbacks.current.onFailedChange?.(true)}
      />
      <div ref={container} className={className} />
    </>
  );
}
