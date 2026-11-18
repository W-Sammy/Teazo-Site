"use client";

import { useSyncExternalStore } from "react";

export const TURNSTILE_TOKEN_TTL_MS = 300_000;
export const MAX_ACTIVE_REFRESHES = 2;

export interface CheckoutSecuritySnapshot {
  status: "idle" | "pending" | "ready" | "error" | "expired";
  token: string | null;
  tokenTimestamp: number | null;
  failed: boolean;
  isInteractive: boolean;
  hasActiveIntent: boolean;
  isCustomizerOpen: boolean;
  isCartOpen: boolean;
  isOrderingPaused: boolean;
  resetKey: number;
  instanceId: number;
}

function emptySession(instanceId: number): CheckoutSecuritySnapshot {
  return {
    status: "idle", token: null, tokenTimestamp: null, failed: false,
    isInteractive: false, hasActiveIntent: false, isCustomizerOpen: false,
    isCartOpen: false, isOrderingPaused: false, resetKey: 0, instanceId,
  };
}

let state = emptySession(1);
let refreshCount = 0;
let ownerRevision = 0;
const listeners = new Set<() => void>();

function publish(next: CheckoutSecuritySnapshot): void {
  state = next;
  for (const listener of listeners) listener();
}

export function isTokenValid(token: string | null, timestamp: number | null): boolean {
  if (!token || timestamp === null) return false;
  const age = Date.now() - timestamp;
  return age >= 0 && age < TURNSTILE_TOKEN_TTL_MS;
}

export function getCheckoutSecuritySnapshot(): CheckoutSecuritySnapshot {
  return state;
}

export function subscribeCheckoutSecurity(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function freshVerification(): CheckoutSecuritySnapshot {
  return {
    ...state,
    status: state.hasActiveIntent && !state.isOrderingPaused ? "pending" : "idle",
    token: null, tokenTimestamp: null, failed: false, isInteractive: false,
    resetKey: state.resetKey + 1, instanceId: state.instanceId + 1,
  };
}

export function startCheckoutVerification(intent: "customizer" | "bag"): void {
  // Record the actual view even while paused, so updated settings can resume it.
  state = {
    ...state, hasActiveIntent: true,
    isCustomizerOpen: intent === "customizer" || state.isCustomizerOpen,
    isCartOpen: intent === "bag" || state.isCartOpen,
  };
  if (state.isOrderingPaused) {
    publish(state);
    return;
  }
  if (isTokenValid(state.token, state.tokenTimestamp) && !state.failed) {
    publish({ ...state, status: "ready" });
  } else if (state.status === "pending") {
    // A handoff between views must keep the same in-flight widget generation.
    publish(state);
  } else {
    refreshCount = 0;
    publish({ ...freshVerification(), resetKey: state.resetKey });
  }
}

export function setCustomizerState(isOpen: boolean): void {
  if (isOpen) {
    startCheckoutVerification("customizer");
  } else if (state.isCustomizerOpen) {
    publish({
      ...state, isCustomizerOpen: false, hasActiveIntent: state.isCartOpen,
      isInteractive: state.isCartOpen && state.isInteractive,
    });
  }
}

export function setCartState(isOpen: boolean, totalCount = 0): void {
  if (isOpen && totalCount > 0) {
    startCheckoutVerification("bag");
  } else if (state.isCartOpen) {
    publish({
      ...state, isCartOpen: false, hasActiveIntent: state.isCustomizerOpen,
      isInteractive: state.isCustomizerOpen && state.isInteractive,
    });
  }
}

export function setOrderingPaused(paused: boolean): void {
  if (state.isOrderingPaused === paused) return;
  state = { ...state, isOrderingPaused: paused };
  refreshCount = 0;
  publish(freshVerification());
}

export function onTokenReceived(token: string, instanceId: number): void {
  if (instanceId !== state.instanceId || state.isOrderingPaused || !state.hasActiveIntent) return;
  publish({
    ...state, token, tokenTimestamp: Date.now(), status: "ready",
    failed: false, isInteractive: false,
  });
}

export function onTokenExpired(instanceId: number): void {
  if (instanceId !== state.instanceId || state.status !== "ready") return;
  if (state.hasActiveIntent && !state.isOrderingPaused && refreshCount < MAX_ACTIVE_REFRESHES) {
    refreshCount++;
    publish(freshVerification());
  } else {
    publish({
      ...state, token: null, tokenTimestamp: null, status: "expired",
      isInteractive: false, instanceId: state.instanceId + 1,
    });
  }
}

export function onSecurityFailed(failed: boolean, instanceId: number): void {
  if (!failed || instanceId !== state.instanceId) return;
  publish({
    ...state, token: null, tokenTimestamp: null, failed: true, status: "error",
    isInteractive: false, instanceId: state.instanceId + 1,
  });
}

export function onBeforeInteractive(instanceId: number): void {
  if (instanceId !== state.instanceId || !state.hasActiveIntent || state.isOrderingPaused) return;
  publish({ ...state, isInteractive: true });
}

export function onAfterInteractive(instanceId: number): void {
  if (instanceId !== state.instanceId) return;
  publish({ ...state, isInteractive: false });
}

export function cancelCheckoutVerification(): void {
  onSecurityFailed(true, state.instanceId);
}

export function resetCheckoutSecurity(): void {
  refreshCount = 0;
  publish(freshVerification());
}

export function consumeCheckoutToken(): void {
  publish({
    ...state, token: null, tokenTimestamp: null, status: "idle",
    isInteractive: false, instanceId: state.instanceId + 1,
  });
}

function clearSession(): void {
  refreshCount = 0;
  // Never recycle an ID: a callback from a previous navigation stays obsolete.
  publish(emptySession(state.instanceId + 1));
}

/** One owner in the site layout; defer disposal through Strict Mode's effect replay. */
export function attachCheckoutSecurityOwner(): () => void {
  const revision = ++ownerRevision;
  return () => {
    queueMicrotask(() => {
      if (revision === ownerRevision) clearSession();
    });
  };
}

export function resetCheckoutSecuritySessionForTesting(): void {
  clearSession();
}

const getChallengeOpen = () => state.isInteractive;
const getServerChallengeOpen = () => false;
export function useCheckoutChallengeOpen(): boolean {
  return useSyncExternalStore(subscribeCheckoutSecurity, getChallengeOpen, getServerChallengeOpen);
}

export function useCheckoutSecurity() {
  const current = useSyncExternalStore(
    subscribeCheckoutSecurity, getCheckoutSecuritySnapshot, getCheckoutSecuritySnapshot,
  );
  const valid = isTokenValid(current.token, current.tokenTimestamp);
  return {
    ...current,
    token: valid ? current.token : null,
    isPending: current.status === "pending",
    isReady: current.status === "ready" && valid,
    reset: resetCheckoutSecurity,
    consume: consumeCheckoutToken,
  };
}
