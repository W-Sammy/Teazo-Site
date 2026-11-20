/**
 * Tests cart revision and paid-order ownership.
 *
 * Ensures that an old Square payment confirmation cannot
 * clear a newer or modified shopping bag.
 *
 * All tests use local jsdom storage. No production orders,
 * Square requests, or database writes occur.
 */

// @vitest-environment jsdom

import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  CART_REVISION_STORAGE_KEY,
  PENDING_CHECKOUT_STORAGE_KEY,
  getOrCreateCartRevision,
  advanceCartRevision,
  getPendingCheckout,
  savePendingCheckoutOwnership,
  paidOrderOwnsCurrentCart,
  clearPendingCheckoutIfMatching,
} from "./cart-payment-ownership";

const REVISION_ONE =
  "11111111-1111-4111-8111-111111111111";

const REVISION_TWO =
  "22222222-2222-4222-8222-222222222222";

const ORDER_ONE = "SQUARE_ORDER_1";
const ORDER_TWO = "SQUARE_ORDER_2";

describe("Cart payment ownership", () => {
  const randomUUID = vi.fn();

  beforeEach(() => {
    localStorage.clear();

    randomUUID.mockReset();

    randomUUID
      .mockReturnValueOnce(REVISION_ONE)
      .mockReturnValueOnce(REVISION_TWO);

    vi.stubGlobal("crypto", {
      randomUUID,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a persistent revision for a cart", () => {
    expect(getOrCreateCartRevision()).toBe(
      REVISION_ONE,
    );

    expect(
      localStorage.getItem(
        CART_REVISION_STORAGE_KEY,
      ),
    ).toBe(REVISION_ONE);
  });

  it("reuses the existing cart revision", () => {
    const first = getOrCreateCartRevision();
    const second = getOrCreateCartRevision();

    expect(second).toBe(first);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("advances the revision after a cart modification", () => {
    const original = getOrCreateCartRevision();

    const updated = advanceCartRevision();

    expect(original).toBe(REVISION_ONE);
    expect(updated).toBe(REVISION_TWO);
    expect(updated).not.toBe(original);
  });

  it("records the revision captured at checkout", () => {
    const revision = getOrCreateCartRevision();

    expect(
      savePendingCheckoutOwnership(
        ORDER_ONE,
        revision,
      ),
    ).toBe(true);

    expect(getPendingCheckout()).toMatchObject({
      orderId: ORDER_ONE,
      cartRevision: REVISION_ONE,
    });
  });

  it("allows a paid order to match its unchanged cart", () => {
    const revision = getOrCreateCartRevision();

    savePendingCheckoutOwnership(
      ORDER_ONE,
      revision,
    );

    expect(
      paidOrderOwnsCurrentCart(ORDER_ONE),
    ).toBe(true);
  });

  it("refuses to clear a cart modified after checkout", () => {
    const revision = getOrCreateCartRevision();

    savePendingCheckoutOwnership(
      ORDER_ONE,
      revision,
    );

    advanceCartRevision();

    expect(
      paidOrderOwnsCurrentCart(ORDER_ONE),
    ).toBe(false);
  });

  it("refuses an old paid order with a different order ID", () => {
    const revision = getOrCreateCartRevision();

    savePendingCheckoutOwnership(
      ORDER_TWO,
      revision,
    );

    expect(
      paidOrderOwnsCurrentCart(ORDER_ONE),
    ).toBe(false);

    expect(
      paidOrderOwnsCurrentCart(ORDER_TWO),
    ).toBe(true);
  });

  it("does not authorize clearing a legacy record without a revision", () => {
    getOrCreateCartRevision();

    localStorage.setItem(
      PENDING_CHECKOUT_STORAGE_KEY,
      JSON.stringify({
        orderId: ORDER_ONE,
        timestamp: Date.now(),
      }),
    );

    expect(
      paidOrderOwnsCurrentCart(ORDER_ONE),
    ).toBe(false);
  });

  it("does not authorize clearing when revision data is missing", () => {
    savePendingCheckoutOwnership(
      ORDER_ONE,
      null,
    );

    expect(
      paidOrderOwnsCurrentCart(ORDER_ONE),
    ).toBe(false);
  });

  it("protects a new cart with identical items", () => {
    const oldRevision = getOrCreateCartRevision();

    savePendingCheckoutOwnership(
      ORDER_ONE,
      oldRevision,
    );

    // A new cart may contain exactly the same items.
    // Its revision must still differ.
    const newRevision = advanceCartRevision();

    expect(newRevision).toBe(REVISION_TWO);

    expect(
      paidOrderOwnsCurrentCart(ORDER_ONE),
    ).toBe(false);
  });

  it("clears only the matching pending order", () => {
    const revision = getOrCreateCartRevision();

    savePendingCheckoutOwnership(
      ORDER_TWO,
      revision,
    );

    expect(
      clearPendingCheckoutIfMatching(
        ORDER_ONE,
      ),
    ).toBe(false);

    expect(getPendingCheckout()?.orderId).toBe(
      ORDER_TWO,
    );

    expect(
      clearPendingCheckoutIfMatching(
        ORDER_TWO,
      ),
    ).toBe(true);

    expect(getPendingCheckout()).toBeNull();
  });

  it("rejects malformed stored checkout data", () => {
    localStorage.setItem(
      PENDING_CHECKOUT_STORAGE_KEY,
      "invalid-json",
    );

    expect(getPendingCheckout()).toBeNull();

    expect(
      paidOrderOwnsCurrentCart(ORDER_ONE),
    ).toBe(false);
  });
});
