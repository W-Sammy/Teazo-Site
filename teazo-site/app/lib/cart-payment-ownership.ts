/**
 * Tracks ownership of a shopping bag across Square checkout.
 *
 * Each cart mutation advances a persistent revision ID.
 * A paid Square order may clear the bag only if its recorded
 * cart revision still matches the current cart revision.
 *
 * This protects new or modified carts from old payment
 * confirmations, even when the items are identical.
 *
 * Client-side only. Payment status must be verified by the server.
 */

export const CART_REVISION_STORAGE_KEY =
  "teazo_cart_revision";

export const PENDING_CHECKOUT_STORAGE_KEY =
  "teazo_pending_checkout";

interface PendingCheckout {
  orderId: string;
  timestamp: number;
  cartRevision?: string;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRevision(): string | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const value = storage.getItem(
      CART_REVISION_STORAGE_KEY,
    );

    return value && value.length > 0
      ? value
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads the current revision without creating a new one.
 */
export function getCartRevision(): string | null {
  return readRevision();
}

/**
 * Initializes a missing cart revision using a supplied unique ID.
 *
 * Checkout can use its newly generated attempt ID as the
 * first revision, so it does not need to generate a second
 * UUID. An existing revision is never overwritten.
 */
export function seedCartRevisionIfMissing(
  seed: string,
): string | null {
  if (!seed) return null;

  const existing = readRevision();
  if (existing) return existing;

  const storage = getStorage();
  if (!storage) return null;

  try {
    storage.setItem(
      CART_REVISION_STORAGE_KEY,
      seed,
    );

    return readRevision();
  } catch {
    return null;
  }
}

/**
 * Returns the current cart revision, creating one if needed.
 *
 * Returns null when persistence is unavailable.
 * Null must never authorize clearing the shopping bag.
 */
export function getOrCreateCartRevision(): string | null {
  const existing = readRevision();

  if (existing) return existing;

  const storage = getStorage();
  if (!storage) return null;

  try {
    const revision = crypto.randomUUID();

    storage.setItem(
      CART_REVISION_STORAGE_KEY,
      revision,
    );

    return readRevision();
  } catch {
    return null;
  }
}

/**
 * Advances the revision when the shopping bag changes.
 *
 * If persistence fails, invalidate the existing revision
 * where possible rather than leaving an old revision that
 * could incorrectly authorize clearing a modified bag.
 */
export function advanceCartRevision(): string | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const revision = crypto.randomUUID();

    storage.setItem(
      CART_REVISION_STORAGE_KEY,
      revision,
    );

    if (readRevision() !== revision) {
      throw new Error("Cart revision could not be verified.");
    }

    return revision;
  } catch {
    try {
      storage.removeItem(CART_REVISION_STORAGE_KEY);
    } catch {
      // Inability to read storage also prevents ownership verification.
    }

    return null;
  }
}

/**
 * Reads a pending order without trusting malformed storage data.
 */
export function getPendingCheckout(): PendingCheckout | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(
      PENDING_CHECKOUT_STORAGE_KEY,
    );

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("orderId" in parsed) ||
      typeof parsed.orderId !== "string" ||
      parsed.orderId.length === 0 ||
      !("timestamp" in parsed) ||
      typeof parsed.timestamp !== "number" ||
      !Number.isFinite(parsed.timestamp)
    ) {
      return null;
    }

    const cartRevision =
      "cartRevision" in parsed &&
      typeof parsed.cartRevision === "string"
        ? parsed.cartRevision
        : undefined;

    return {
      orderId: parsed.orderId,
      timestamp: parsed.timestamp,
      cartRevision,
    };
  } catch {
    return null;
  }
}

/**
 * Persists the cart revision captured at checkout submission.
 *
 * The revision must not be captured after Square responds,
 * because the customer may already have changed the cart.
 */
export function savePendingCheckoutOwnership(
  orderId: string,
  cartRevision: string | null,
): boolean {
  const storage = getStorage();

  if (!storage || !orderId || !cartRevision) {
    return false;
  }

  try {
    storage.setItem(
      PENDING_CHECKOUT_STORAGE_KEY,
      JSON.stringify({
        orderId,
        timestamp: Date.now(),
        cartRevision,
      } satisfies PendingCheckout),
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true only when a verified paid order owns
 * the current shopping bag.
 *
 * This does not verify payment or clear the bag.
 */
export function paidOrderOwnsCurrentCart(
  paidOrderId: string,
): boolean {
  if (!paidOrderId) return false;

  const pending = getPendingCheckout();
  const currentRevision = readRevision();

  if (
    !pending ||
    !pending.cartRevision ||
    !currentRevision
  ) {
    return false;
  }

  return (
    pending.orderId === paidOrderId &&
    pending.cartRevision === currentRevision
  );
}

/**
 * Removes the pending order only when its order ID matches.
 *
 * An old receipt must not remove a newer pending order.
 */
export function clearPendingCheckoutIfMatching(
  orderId: string,
): boolean {
  const storage = getStorage();
  const pending = getPendingCheckout();

  if (
    !storage ||
    !pending ||
    pending.orderId !== orderId
  ) {
    return false;
  }

  try {
    storage.removeItem(
      PENDING_CHECKOUT_STORAGE_KEY,
    );

    return true;
  } catch {
    return false;
  }
}
