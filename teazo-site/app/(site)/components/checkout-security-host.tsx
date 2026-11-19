"use client";

import React, { useEffect, useId, useLayoutEffect, useRef } from "react";
import TurnstileWidget from "@/app/components/turnstile-widget";
import {
  useCheckoutSecurity,
  onTokenReceived,
  onTokenExpired,
  onSecurityFailed,
  onBeforeInteractive,
  onAfterInteractive,
  attachCheckoutSecurityOwner,
  getCheckoutSecuritySnapshot,
  cancelCheckoutVerification,
  TURNSTILE_TOKEN_TTL_MS,
} from "@/app/lib/checkout-security";

/** Mounted only by the persistent cart shell, outside the lazy checkout form. */
export default function CheckoutSecurityHost({ id, cartSlot, onCartBoundaryFocus }: {
  id?: string;
  cartSlot?: HTMLDivElement | null;
  onCartBoundaryFocus?: (edge: "first" | "last") => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const {
    hasActiveIntent, isOrderingPaused, isInteractive, status,
    tokenTimestamp, instanceId, resetKey,
    isCartOpen, isCustomizerOpen,
  } = useCheckoutSecurity();
  const shouldRenderWidget = !isOrderingPaused &&
    (status === "ready" || (status === "pending" && hasActiveIntent));
  const docked = shouldRenderWidget && isCartOpen && !isCustomizerOpen && !isInteractive && !!cartSlot?.isConnected;

  // Position the existing iframe over the footer's reserved space. Reparenting
  // an iframe (including changing a React portal target) can reload its document.
  useLayoutEffect(() => {
    if (!docked || !cartSlot || !dialogRef.current) return;
    const host = dialogRef.current;
    const position = () => {
      const rect = cartSlot.getBoundingClientRect();
      host.style.setProperty("--security-top", `${rect.top}px`);
      host.style.setProperty("--security-left", `${rect.left}px`);
      host.style.setProperty("--security-width", `${rect.width}px`);
      host.style.setProperty("--security-height", `${rect.height}px`);
    };
    let frame: number | undefined;
    let trackUntil = performance.now() + 400;
    const trackSlide = () => {
      frame = undefined;
      position();
      if (performance.now() < trackUntil) frame = requestAnimationFrame(trackSlide);
    };
    const startTracking = () => {
      trackUntil = performance.now() + 400;
      if (frame === undefined) frame = requestAnimationFrame(trackSlide);
    };
    const panel = cartSlot.closest("aside");
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(cartSlot);
    if (cartSlot.parentElement) observer?.observe(cartSlot.parentElement);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, { capture: true, passive: true });
    panel?.addEventListener("transitionrun", startTracking);
    position();
    frame = requestAnimationFrame(trackSlide);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      panel?.removeEventListener("transitionrun", startTracking);
    };
  }, [docked, cartSlot]);

  useEffect(attachCheckoutSecurityOwner, []);

  // Also enforce expiry locally: a throttled/delayed SDK callback cannot leave
  // checkout enabled. Completed widgets use manual refresh, even with the bag closed.
  useEffect(() => {
    if (status !== "ready" || tokenTimestamp === null) return;
    const timer = setTimeout(
      () => onTokenExpired(instanceId),
      Math.max(0, tokenTimestamp + TURNSTILE_TOKEN_TTL_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [status, tokenTimestamp, instanceId]);

  useEffect(() => {
    if (!isInteractive) return;
    const previous = document.activeElement;
    headingRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelCheckoutVerification();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // Loading controls can disappear while the challenge owns focus. Read
      // the current view at dismissal, including customizers opened over a bag.
      const { isCustomizerOpen, isCartOpen } = getCheckoutSecuritySnapshot();
      const activeView = isCustomizerOpen ? "customizer" : isCartOpen ? "bag" : null;
      const activeDialog = activeView
        ? document.querySelector<HTMLElement>(`[data-checkout-dialog="${activeView}"]`) : null;
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected &&
        !previous.closest('[inert], [hidden], [aria-hidden="true"]') &&
        (!activeDialog || activeDialog.contains(previous))) {
        previous.focus();
        if (document.activeElement === previous) return;
      }
      const fallback = activeDialog?.querySelector<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]',
      ) ?? activeDialog;
      fallback?.focus();
    };
  }, [isInteractive]);

  const focusChallenge = (last: boolean) => {
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>("iframe, button:not([disabled])");
    // Turnstile can place its iframe inside a closed shadow root. Focusing
    // the surrounding container lets the next Tab enter that widget normally.
    const first = dialogRef.current?.querySelector<HTMLElement>("iframe") ??
      dialogRef.current?.querySelector<HTMLElement>("[data-checkout-security-widget]");
    const target = last ? controls?.[controls.length - 1] : first;
    target?.focus();
  };

  // Keep a completed widget until its token expires, without SDK retries or
  // refreshes. Pending work is removed when both ordering views are dismissed.
  if (!shouldRenderWidget) return null;

  return (
    <div
      ref={dialogRef}
      id={id ?? `${titleId}-host`}
      data-testid="checkout-security-host"
      data-placement={isInteractive ? "challenge" : docked ? "cart" : "background"}
      role={isInteractive ? "dialog" : docked ? "region" : undefined}
      aria-label={docked ? "Checkout security verification" : undefined}
      aria-modal={isInteractive || undefined}
      aria-labelledby={isInteractive ? titleId : undefined}
      inert={!isInteractive && !docked}
      className={isInteractive
        ? "fixed inset-0 z-[10080] flex items-center justify-center bg-black/60 p-6"
        : docked ? "fixed z-[10055] flex items-center justify-center bg-white"
        : "fixed bottom-0 right-0 pointer-events-none z-[-1]"}
      style={docked ? {
        top: "var(--security-top)", left: "var(--security-left)",
        width: "var(--security-width)", height: "var(--security-height)",
      } : undefined}
    >
      <div className={isInteractive
        ? "w-full max-w-sm bg-white p-5 rounded-2xl shadow-2xl flex flex-col items-center gap-4"
        : docked ? "w-full flex justify-center" : "pointer-events-none"}>
        {(isInteractive || docked) && <span tabIndex={0} onFocus={() => docked ? onCartBoundaryFocus?.("last") : focusChallenge(true)} data-testid="security-focus-start" />}
        {isInteractive && (
          <h2 ref={headingRef} id={titleId} tabIndex={-1} className="text-sm font-semibold text-stone-700 text-center focus:outline-none">
            Please verify you are human to continue
          </h2>
        )}
        {/* This container never moves between portals or changes with challenge visibility. */}
        <div key="widget-container" data-checkout-security-widget tabIndex={-1} className="flex justify-center focus:outline-none">
          <TurnstileWidget
            key={instanceId}
            action="checkout"
            appearance="always"
            refreshExpired="manual"
            refreshTimeout="never"
            retry="never"
            resetKey={resetKey}
            onToken={(token) => onTokenReceived(token, instanceId)}
            onExpire={() => onTokenExpired(instanceId)}
            onFailedChange={(failed) => onSecurityFailed(failed, instanceId)}
            onBeforeInteractive={() => onBeforeInteractive(instanceId)}
            onAfterInteractive={() => onAfterInteractive(instanceId)}
            className="flex justify-center min-h-[65px]"
          />
        </div>
        {isInteractive && (
          <button type="button" onClick={cancelCheckoutVerification} className="text-sm underline text-stone-700">
            Continue later
          </button>
        )}
        {(isInteractive || docked) && <span tabIndex={0} onFocus={() => docked ? onCartBoundaryFocus?.("first") : focusChallenge(false)} data-testid="security-focus-end" />}
      </div>
    </div>
  );
}
