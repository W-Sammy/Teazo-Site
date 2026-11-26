"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePageLoaded } from "@/app/lib/use-page-loaded";

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
const waitingForTurnstile = new Map<() => void, () => void>();
if (typeof window !== "undefined") {
  window.onTeazoTurnstileLoad = () => [...waitingForTurnstile.keys()].forEach((render) => render());
}

/** Share one download. Remove failures so a user retry really downloads again;
 * next/script caches rejected downloads by URL, even after its component remounts. */
function loadTurnstileScript(): void {
  if (window.turnstile || document.querySelector("script[data-teazo-turnstile]")) return;
  const script = document.createElement("script");
  script.dataset.teazoTurnstile = "true";
  script.src = TURNSTILE_SCRIPT;
  script.async = true;
  script.addEventListener("load", () => {
    if (script.isConnected) window.onTeazoTurnstileLoad?.();
  });
  script.addEventListener("error", () => {
    if (!script.isConnected) return;
    script.remove();
    [...waitingForTurnstile.values()].forEach((failed) => failed());
  });
  document.head.append(script);
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
  afterPageLoad = false,
  appearance,
  onBeforeInteractive,
  onAfterInteractive,
  refreshExpired = "auto",
  retry = "auto",
  refreshTimeout = "auto",
}: {
  /** Shown in the Turnstile dashboard, e.g. "contact" or "checkout". */
  action: string;
  resetKey?: unknown;
  onToken?: (token: string) => void;
  onExpire?: () => void;
  /** true when the check can't load or run, false once it passes. */
  onFailedChange?: (failed: boolean) => void;
  className?: string;
  /**
   * Start the script once the page has loaded instead of with it, so it doesn't
   * hold back the page on phones. For forms below the fold: the check
   * still finishes long before anyone can fill the form in.
   */
  afterPageLoad?: boolean;
  appearance?: "always" | "execute" | "interaction-only";
  onBeforeInteractive?: () => void;
  onAfterInteractive?: () => void;
  refreshExpired?: "auto" | "manual" | "never";
  retry?: "auto" | "never";
  refreshTimeout?: "auto" | "manual" | "never";
}) {
  const pageLoaded = usePageLoaded();
  const loadScript = !afterPageLoad || pageLoaded;

  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const mounted = useRef(false);
  const callbacks = useRef({
    onToken,
    onExpire,
    onFailedChange,
    onBeforeInteractive,
    onAfterInteractive,
  });
  useEffect(() => {
    callbacks.current = {
      onToken,
      onExpire,
      onFailedChange,
      onBeforeInteractive,
      onAfterInteractive,
    };
  });

  const renderWidget = useCallback(() => {
    if (!mounted.current || !TURNSTILE_SITE_KEY || !window.turnstile || !container.current || widgetId.current) {
      return;
    }
    const renderedGeneration = ++generation.current;
    const isCurrent = () => mounted.current && generation.current === renderedGeneration;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: TURNSTILE_SITE_KEY,
      action,
      theme: "light",
      appearance: appearance ?? "always",
      "refresh-expired": refreshExpired,
      "refresh-timeout": refreshTimeout,
      retry,
      callback: (token: string) => {
        if (!isCurrent()) return;
        callbacks.current.onFailedChange?.(false);
        callbacks.current.onToken?.(token);
      },
      "expired-callback": () => { if (isCurrent()) callbacks.current.onExpire?.(); },
      "error-callback": () => { if (isCurrent()) callbacks.current.onFailedChange?.(true); },
      "timeout-callback": refreshTimeout === "never"
        ? () => { if (isCurrent()) callbacks.current.onFailedChange?.(true); }
        : undefined,
      "before-interactive-callback": () => { if (isCurrent()) callbacks.current.onBeforeInteractive?.(); },
      "after-interactive-callback": () => { if (isCurrent()) callbacks.current.onAfterInteractive?.(); },
    });
  }, [action, appearance, refreshExpired, refreshTimeout, retry]);

  const removeWidget = useCallback(() => {
    mounted.current = false;
    generation.current++;
    if (widgetId.current) window.turnstile?.remove(widgetId.current);
    widgetId.current = undefined;
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!TURNSTILE_SITE_KEY) {
      callbacks.current.onFailedChange?.(true);
    } else if (window.turnstile) renderWidget();
    else waitingForTurnstile.set(renderWidget, () => callbacks.current.onFailedChange?.(true));

    return () => {
      waitingForTurnstile.delete(renderWidget);
      removeWidget();
    };
    // A fresh render binds a new callback generation. reset() would retain the
    // old callbacks and could accept a response queued before the reset.
  }, [renderWidget, resetKey, removeWidget]);

  useEffect(() => {
    if (loadScript && TURNSTILE_SITE_KEY) loadTurnstileScript();
  }, [loadScript, resetKey]);

  return <div ref={container} className={className} />;
}
