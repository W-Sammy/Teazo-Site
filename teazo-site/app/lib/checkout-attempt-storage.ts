/**
 * Client-side checkout attempt persistence.
 *
 * An attempt retains its ID across retries of the same
 * purchase. The cart revision is captured before submitting
 * to Square, so later cart changes do not change which
 * shopping bag belonged to that payment attempt.
 *
 * Completed payments clear only their matching attempt.
 */

import {
  getCartRevision,
  seedCartRevisionIfMissing,
} from "@/app/lib/cart-payment-ownership";

export const CHECKOUT_ATTEMPT_STORAGE_KEY =
  "teazo_checkout_attempt_v1";

interface StoredCheckoutAttempt {
  fingerprint: string;
  attemptId: string;
  cartRevision?: string;
  orderId?: string;
}

function readAttempt(): StoredCheckoutAttempt | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(
      CHECKOUT_ATTEMPT_STORAGE_KEY,
    );

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("fingerprint" in parsed) ||
      !("attemptId" in parsed) ||
      typeof parsed.fingerprint !== "string" ||
      typeof parsed.attemptId !== "string"
    ) {
      return null;
    }

    if (
      "cartRevision" in parsed &&
      parsed.cartRevision !== undefined &&
      typeof parsed.cartRevision !== "string"
    ) {
      return null;
    }

    if (
      "orderId" in parsed &&
      parsed.orderId !== undefined &&
      typeof parsed.orderId !== "string"
    ) {
      return null;
    }

    return parsed as StoredCheckoutAttempt;
  } catch {
    return null;
  }
}

function writeAttempt(attempt: StoredCheckoutAttempt): boolean {
  if (typeof window === "undefined") return false;

  try {
    sessionStorage.setItem(
      CHECKOUT_ATTEMPT_STORAGE_KEY,
      JSON.stringify(attempt),
    );

    const saved = readAttempt();

    return (
      saved?.attemptId === attempt.attemptId &&
      saved.cartRevision === attempt.cartRevision
    );
  } catch {
    return false;
  }
}

/**
 * Reuses an attempt ID only when both the checkout payload
 * and cart revision remain unchanged.
 *
 * This also prevents a modified cart that is later restored
 * to identical contents from reusing an older attempt ID.
 *
 * The Turnstile token must not be included in the payload.
 */
export function getOrCreateCheckoutAttemptId(
  payload: object,
): string {
  const fingerprint = JSON.stringify(payload);
  const existing = readAttempt();
  const currentRevision = getCartRevision();

  if (existing?.fingerprint === fingerprint) {
    if (!existing.cartRevision || !currentRevision) {
      throw new Error(
        "The previous checkout attempt cannot be safely resumed. Please reload and contact the store if payment may have completed.",
      );
    }

    if (existing.cartRevision === currentRevision) {
      return existing.attemptId;
    }
  }

  const attemptId = crypto.randomUUID();

  const cartRevision =
    currentRevision ??
    seedCartRevisionIfMissing(attemptId);

  if (!cartRevision) {
    throw new Error(
      "Checkout storage is unavailable. Please enable browser storage and try again.",
    );
  }

  if (
    !writeAttempt({
      fingerprint,
      attemptId,
      cartRevision,
    })
  ) {
    throw new Error(
      "Unable to save your checkout attempt. Please enable browser storage and try again.",
    );
  }

  return attemptId;
}

/**
 * Associates a successful Square response with its attempt.
 *
 * A response for an older attempt must not overwrite a newer
 * attempt that the customer has already started.
 */
export function rememberCheckoutAttemptOrder(
  attemptId: string,
  orderId: string,
): void {
  if (!attemptId || !orderId) return;

  const existing = readAttempt();

  if (!existing || existing.attemptId !== attemptId) {
    return;
  }

  writeAttempt({
    ...existing,
    orderId,
  });
}

/**
 * Returns the revision captured when the matching checkout
 * attempt was first submitted.
 *
 * The cart context uses this when recording a pending order,
 * rather than reading the current revision after Square responds.
 */
export function getCheckoutAttemptCartRevisionForOrder(
  orderId: string,
): string | null {
  if (!orderId) return null;

  const existing = readAttempt();

  if (
    !existing ||
    existing.orderId !== orderId ||
    !existing.cartRevision
  ) {
    return null;
  }

  return existing.cartRevision;
}

/**
 * Clears the attempt only when Square confirms payment for
 * the exact order associated with that attempt.
 */
export function clearPaidCheckoutAttempt(
  confirmedOrderId: string,
): boolean {
  if (!confirmedOrderId) return false;

  const existing = readAttempt();

  if (
    !existing ||
    existing.orderId !== confirmedOrderId
  ) {
    return false;
  }

  try {
    sessionStorage.removeItem(
      CHECKOUT_ATTEMPT_STORAGE_KEY,
    );
    return true;
  } catch {
    return false;
  }
}
