/**
 * Client-side checkout attempt persistence.
 *
 * A checkout attempt retains its UUID across retries of the same
 * purchase. Once Square returns an order ID, that ID is attached
 * to the attempt so a confirmed payment can clear only its own
 * checkout state.
 *
 * Storage failures never throw into the checkout flow.
 */

export const CHECKOUT_ATTEMPT_STORAGE_KEY =
  "teazo_checkout_attempt_v1";

interface StoredCheckoutAttempt {
  fingerprint: string;
  attemptId: string;
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

function writeAttempt(attempt: StoredCheckoutAttempt): void {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(
      CHECKOUT_ATTEMPT_STORAGE_KEY,
      JSON.stringify(attempt),
    );
  } catch {
    // Browsers may disable session storage.
  }
}

/**
 * Reuses an attempt ID for an unchanged checkout payload.
 * A changed payload receives a fresh UUID.
 *
 * The payload must not contain the single-use Turnstile token.
 */
export function getOrCreateCheckoutAttemptId(
  payload: object,
): string {
  const fingerprint = JSON.stringify(payload);
  const existing = readAttempt();

  if (existing?.fingerprint === fingerprint) {
    return existing.attemptId;
  }

  const attemptId = crypto.randomUUID();

  writeAttempt({
    fingerprint,
    attemptId,
  });

  return attemptId;
}

/**
 * Associates a successful Square checkout-session response
 * with the attempt that initiated it.
 *
 * If another attempt has replaced the stored attempt,
 * leave that newer attempt untouched.
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
 * Clears the checkout attempt only when its stored Square
 * order ID matches the order that Square confirms as paid.
 *
 * Unpaid or canceled orders must never call this function.
 */
export function clearPaidCheckoutAttempt(
  confirmedOrderId: string,
): boolean {
  if (!confirmedOrderId) return false;

  const existing = readAttempt();

  if (!existing || existing.orderId !== confirmedOrderId) {
    return false;
  }

  try {
    sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
