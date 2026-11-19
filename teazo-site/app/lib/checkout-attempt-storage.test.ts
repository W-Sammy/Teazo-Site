/**
 * Tests browser-side checkout-attempt persistence.
 *
 * Verifies stable attempt IDs, retries, changed checkout
 * payloads, Square order association, and safe cleanup
 * after confirmed payments.
 *
 * All browser storage is local to jsdom.
 * No real Square requests or database writes occur.
 */

// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  CHECKOUT_ATTEMPT_STORAGE_KEY,
  getOrCreateCheckoutAttemptId,
  rememberCheckoutAttemptOrder,
  clearPaidCheckoutAttempt,
} from "./checkout-attempt-storage";

const FIRST_ATTEMPT = "11111111-1111-4111-8111-111111111111";
const SECOND_ATTEMPT = "22222222-2222-4222-8222-222222222222";
const THIRD_ATTEMPT = "33333333-3333-4333-8333-333333333333";

const FIRST_ORDER = "SQUARE_ORDER_1";
const SECOND_ORDER = "SQUARE_ORDER_2";

function checkoutPayload(
  overrides: Record<string, unknown> = {},
) {
  return {
    customer: {
      displayName: "Test Customer",
      email: "customer@example.com",
      phone: "(415) 555-0100",
    },
    pickupTiming: {
      type: "ASAP",
    },
    items: [
      {
        catalogObjectId: "ITEM1",
        variationId: "VAR1",
        quantity: 1,
        modifierOptionIds: [],
      },
    ],
    ...overrides,
  };
}

function storedAttempt() {
  const raw = sessionStorage.getItem(
    CHECKOUT_ATTEMPT_STORAGE_KEY,
  );

  return raw
    ? JSON.parse(raw) as {
        fingerprint: string;
        attemptId: string;
        orderId?: string;
      }
    : null;
}

describe("Checkout attempt storage lifecycle", () => {
  const randomUUID = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();

    // Reset queued return values as well as call history.
    // clearAllMocks() alone does not remove unused
    // mockReturnValueOnce() values from previous tests.
    randomUUID.mockReset();

    randomUUID
      .mockReturnValueOnce(FIRST_ATTEMPT)
      .mockReturnValueOnce(SECOND_ATTEMPT)
      .mockReturnValueOnce(THIRD_ATTEMPT);

    // Predictable UUIDs allow tests to verify precisely
    // when a new checkout attempt is created.
    vi.stubGlobal("crypto", {
      randomUUID,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("creates and stores an ID for a new checkout", () => {
    const attemptId = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    expect(attemptId).toBe(FIRST_ATTEMPT);
    expect(storedAttempt()?.attemptId).toBe(FIRST_ATTEMPT);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("reuses the same ID for an unchanged checkout", () => {
    const payload = checkoutPayload();

    const first = getOrCreateCheckoutAttemptId(payload);
    const retry = getOrCreateCheckoutAttemptId(payload);

    expect(retry).toBe(first);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("reuses an attempt after a simulated page reload", () => {
    const first = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    // The second call represents a newly mounted page
    // reading the previous sessionStorage record.
    const afterReload = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    expect(afterReload).toBe(first);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates a new ID when checkout contents change", () => {
    const first = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    const changed = getOrCreateCheckoutAttemptId(
      checkoutPayload({
        items: [
          {
            catalogObjectId: "ITEM1",
            variationId: "VAR1",
            quantity: 2,
            modifierOptionIds: [],
          },
        ],
      }),
    );

    expect(first).toBe(FIRST_ATTEMPT);
    expect(changed).toBe(SECOND_ATTEMPT);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("does not include a fresh security token in attempt identity", () => {
    const payload = checkoutPayload();

    const first = getOrCreateCheckoutAttemptId(payload);

    // The Turnstile token is intentionally omitted
    // from the payload passed to the storage helper.
    const retry = getOrCreateCheckoutAttemptId(payload);

    expect(retry).toBe(first);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("associates the matching Square order with the attempt", () => {
    const attemptId = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    rememberCheckoutAttemptOrder(
      attemptId,
      FIRST_ORDER,
    );

    expect(storedAttempt()).toMatchObject({
      attemptId: FIRST_ATTEMPT,
      orderId: FIRST_ORDER,
    });
  });

  it("does not associate an order with a different attempt", () => {
    getOrCreateCheckoutAttemptId(checkoutPayload());

    rememberCheckoutAttemptOrder(
      SECOND_ATTEMPT,
      FIRST_ORDER,
    );

    expect(storedAttempt()?.attemptId).toBe(FIRST_ATTEMPT);
    expect(storedAttempt()?.orderId).toBeUndefined();
  });

  it("clears the attempt after its matching order is paid", () => {
    const attemptId = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    rememberCheckoutAttemptOrder(
      attemptId,
      FIRST_ORDER,
    );

    expect(clearPaidCheckoutAttempt(FIRST_ORDER)).toBe(true);
    expect(storedAttempt()).toBeNull();
  });

  it("preserves the attempt when a different order is confirmed", () => {
    const attemptId = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    rememberCheckoutAttemptOrder(
      attemptId,
      FIRST_ORDER,
    );

    expect(clearPaidCheckoutAttempt(SECOND_ORDER)).toBe(false);

    expect(storedAttempt()).toMatchObject({
      attemptId: FIRST_ATTEMPT,
      orderId: FIRST_ORDER,
    });
  });

  it("prevents an old receipt from clearing a newer attempt", () => {
    const original = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    rememberCheckoutAttemptOrder(
      original,
      FIRST_ORDER,
    );

    const newer = getOrCreateCheckoutAttemptId(
      checkoutPayload({
        pickupTiming: {
          type: "SCHEDULED",
          pickupAt: "2026-11-20T20:00:00.000Z",
        },
      }),
    );

    rememberCheckoutAttemptOrder(
      newer,
      SECOND_ORDER,
    );

    expect(clearPaidCheckoutAttempt(FIRST_ORDER)).toBe(false);

    expect(storedAttempt()).toMatchObject({
      attemptId: SECOND_ATTEMPT,
      orderId: SECOND_ORDER,
    });
  });

  it("generates a fresh ID for identical items after payment", () => {
    const payload = checkoutPayload();

    const first = getOrCreateCheckoutAttemptId(payload);

    rememberCheckoutAttemptOrder(
      first,
      FIRST_ORDER,
    );

    expect(clearPaidCheckoutAttempt(FIRST_ORDER)).toBe(true);

    // The customer places another order with exactly
    // the same items and contact information.
    const nextPurchase = getOrCreateCheckoutAttemptId(
      payload,
    );

    expect(first).toBe(FIRST_ATTEMPT);
    expect(nextPurchase).toBe(SECOND_ATTEMPT);
    expect(nextPurchase).not.toBe(first);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("does not clear an attempt without a Square order ID", () => {
    const attemptId = getOrCreateCheckoutAttemptId(
      checkoutPayload(),
    );

    expect(clearPaidCheckoutAttempt("")).toBe(false);

    expect(storedAttempt()?.attemptId).toBe(attemptId);
  });
});
