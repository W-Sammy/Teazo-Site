/**
 * Tests checkout-attempt and shopping-bag ownership during
 * order confirmation.
 *
 * A paid Square order may clear only its own checkout attempt
 * and the unchanged cart associated with that purchase.
 *
 * Unpaid and canceled orders preserve checkout state.
 * Old receipts must not erase newer purchases.
 *
 * All external services and cart operations are mocked.
 */

// @vitest-environment jsdom

import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  CHECKOUT_ATTEMPT_STORAGE_KEY,
} from "@/app/lib/checkout-attempt-storage";
import {
  CART_REVISION_STORAGE_KEY,
  PENDING_CHECKOUT_STORAGE_KEY,
} from "@/app/lib/cart-payment-ownership";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  clearCart: vi.fn(),
  openCart: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "test-montserrat" }),
  Cabin_Sketch: () => ({ className: "test-cabin" }),
}));

vi.mock("@/app/fonts", () => ({
  montserrat: {
    className: "test-montserrat",
  },
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(window.location.search),
}));

vi.mock("@/app/context/cart-context", () => ({
  useCart: () => ({
    clearCart: mocks.clearCart,
    openCart: mocks.openCart,
  }),
}));

vi.mock("@/app/components/bubble-field", () => ({
  BubbleField: () => null,
}));

import OrderConfirmationPage from "./page";

const ORDER_ID = "SQUARE_ORDER_1";
const OTHER_ORDER_ID = "SQUARE_ORDER_2";

const FIRST_ATTEMPT =
  "11111111-1111-4111-8111-111111111111";
const SECOND_ATTEMPT =
  "22222222-2222-4222-8222-222222222222";

const FIRST_REVISION =
  "33333333-3333-4333-8333-333333333333";
const SECOND_REVISION =
  "44444444-4444-4444-8444-444444444444";

interface StoredAttempt {
  fingerprint: string;
  attemptId: string;
  cartRevision: string;
  orderId: string;
}

interface MockOrder {
  id: string;
  state: string;
  isPaid: boolean;
  lineItems: [];
  fulfillments: [];
  totalMoney: {
    amount: number;
    currency: string;
  };
}

function makeOrder(
  overrides: Partial<MockOrder> = {},
): MockOrder {
  return {
    id: ORDER_ID,
    state: "OPEN",
    isPaid: true,
    lineItems: [],
    fulfillments: [],
    totalMoney: {
      amount: 500,
      currency: "USD",
    },
    ...overrides,
  };
}

/**
 * Creates both the checkout-attempt session record and
 * the matching pending-order/cart-revision records.
 */
function saveCheckoutState(
  attemptId: string,
  orderId: string,
  cartRevision: string,
): StoredAttempt {
  const attempt: StoredAttempt = {
    fingerprint: JSON.stringify({
      customer: "Test Customer",
      items: ["ITEM1"],
    }),
    attemptId,
    cartRevision,
    orderId,
  };

  sessionStorage.setItem(
    CHECKOUT_ATTEMPT_STORAGE_KEY,
    JSON.stringify(attempt),
  );

  localStorage.setItem(
    CART_REVISION_STORAGE_KEY,
    cartRevision,
  );

  localStorage.setItem(
    PENDING_CHECKOUT_STORAGE_KEY,
    JSON.stringify({
      orderId,
      timestamp: Date.now(),
      cartRevision,
    }),
  );

  return attempt;
}

function readAttempt(): StoredAttempt | null {
  const raw = sessionStorage.getItem(
    CHECKOUT_ATTEMPT_STORAGE_KEY,
  );

  return raw
    ? (JSON.parse(raw) as StoredAttempt)
    : null;
}

function readPendingOrder():
  | { orderId: string; cartRevision: string }
  | null {
  const raw = localStorage.getItem(
    PENDING_CHECKOUT_STORAGE_KEY,
  );

  return raw
    ? (JSON.parse(raw) as {
        orderId: string;
        cartRevision: string;
      })
    : null;
}

function mockSquareOrders(orders: MockOrder[]) {
  let index = 0;

  mocks.fetch.mockImplementation(
    async (input: string) => {
      if (input === "/api/website-content") {
        return {
          ok: true,
          json: async () => ({}),
        };
      }

      if (input === `/api/orders/${ORDER_ID}`) {
        const order =
          orders[Math.min(index, orders.length - 1)];

        index += 1;

        return {
          ok: true,
          json: async () => ({ order }),
        };
      }

      throw new Error(
        `Unexpected request: ${input}`,
      );
    },
  );
}

function openConfirmationPage() {
  window.history.replaceState(
    {},
    "",
    `/order/confirmation?orderId=${ORDER_ID}`,
  );

  return render(<OrderConfirmationPage />);
}

describe("Order confirmation checkout-attempt ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    sessionStorage.clear();
    localStorage.clear();

    window.history.replaceState(
      {},
      "",
      "/order/confirmation",
    );

    vi.stubGlobal("fetch", mocks.fetch);
    mockSquareOrders([makeOrder()]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    sessionStorage.clear();
    localStorage.clear();
  });

  it("clears the matching checkout attempt and cart after confirmed payment", async () => {
    saveCheckoutState(
      FIRST_ATTEMPT,
      ORDER_ID,
      FIRST_REVISION,
    );

    openConfirmationPage();

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    await waitFor(() => {
      expect(mocks.clearCart).toHaveBeenCalledOnce();
    });

    expect(readAttempt()).toBeNull();
    expect(readPendingOrder()).toBeNull();

    expect(
      sessionStorage.getItem(
        "teazo_confirmed_order_id",
      ),
    ).toBe(ORDER_ID);
  });

  it(
    "preserves checkout state when payment remains incomplete",
    async () => {
      const saved = saveCheckoutState(
        FIRST_ATTEMPT,
        ORDER_ID,
        FIRST_REVISION,
      );

      mockSquareOrders([
        makeOrder({ isPaid: false }),
      ]);

      openConfirmationPage();

      expect(
        await screen.findByRole(
          "heading",
          { name: "Payment Not Completed" },
          { timeout: 9000 },
        ),
      ).toBeTruthy();

      expect(readAttempt()).toEqual(saved);
      expect(readPendingOrder()).toMatchObject({
        orderId: ORDER_ID,
        cartRevision: FIRST_REVISION,
      });

      expect(mocks.clearCart).not.toHaveBeenCalled();
    },
    10000,
  );

  it("preserves checkout state for a canceled order", async () => {
    const saved = saveCheckoutState(
      FIRST_ATTEMPT,
      ORDER_ID,
      FIRST_REVISION,
    );

    mockSquareOrders([
      makeOrder({
        state: "CANCELED",
        isPaid: false,
      }),
    ]);

    openConfirmationPage();

    expect(
      await screen.findByRole("heading", {
        name: "Order Cancelled",
      }),
    ).toBeTruthy();

    expect(readAttempt()).toEqual(saved);
    expect(readPendingOrder()?.orderId).toBe(ORDER_ID);
    expect(mocks.clearCart).not.toHaveBeenCalled();
  });

  it("preserves a newer attempt and cart when an older receipt is opened", async () => {
    const newerAttempt = saveCheckoutState(
      SECOND_ATTEMPT,
      OTHER_ORDER_ID,
      SECOND_REVISION,
    );

    openConfirmationPage();

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    await waitFor(() => {
      expect(
        sessionStorage.getItem(
          "teazo_confirmed_order_id",
        ),
      ).toBe(ORDER_ID);
    });

    expect(readAttempt()).toEqual(newerAttempt);

    expect(readPendingOrder()).toMatchObject({
      orderId: OTHER_ORDER_ID,
      cartRevision: SECOND_REVISION,
    });

    expect(
      localStorage.getItem(
        CART_REVISION_STORAGE_KEY,
      ),
    ).toBe(SECOND_REVISION);

    expect(mocks.clearCart).not.toHaveBeenCalled();
  });

  it("preserves a modified cart after the original order is paid", async () => {
    saveCheckoutState(
      FIRST_ATTEMPT,
      ORDER_ID,
      FIRST_REVISION,
    );

    // The customer edited the shopping bag after checkout.
    localStorage.setItem(
      CART_REVISION_STORAGE_KEY,
      SECOND_REVISION,
    );

    openConfirmationPage();

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(mocks.clearCart).not.toHaveBeenCalled();

    expect(
      localStorage.getItem(
        CART_REVISION_STORAGE_KEY,
      ),
    ).toBe(SECOND_REVISION);

    // The completed attempt is removed, but the modified
    // shopping bag must remain untouched.
    expect(readAttempt()).toBeNull();
    expect(readPendingOrder()).toBeNull();
  });

  it(
    "clears the matching cart when payment becomes paid after verification retries",
    async () => {
      saveCheckoutState(
        FIRST_ATTEMPT,
        ORDER_ID,
        FIRST_REVISION,
      );

      mockSquareOrders([
        makeOrder({ isPaid: false }),
        makeOrder({ isPaid: true }),
      ]);

      openConfirmationPage();

      expect(
        await screen.findByRole(
          "heading",
          { name: "Order Confirmed!" },
          { timeout: 6000 },
        ),
      ).toBeTruthy();

      await waitFor(() => {
        expect(mocks.clearCart).toHaveBeenCalledOnce();
      });

      expect(readAttempt()).toBeNull();
      expect(readPendingOrder()).toBeNull();

      const orderCalls = mocks.fetch.mock.calls.filter(
        ([url]) =>
          url === `/api/orders/${ORDER_ID}`,
      );

      expect(orderCalls).toHaveLength(2);
    },
    8000,
  );

  it("does not clear a cart from a legacy pending record without ownership", async () => {
    saveCheckoutState(
      FIRST_ATTEMPT,
      ORDER_ID,
      FIRST_REVISION,
    );

    localStorage.setItem(
      PENDING_CHECKOUT_STORAGE_KEY,
      JSON.stringify({
        orderId: ORDER_ID,
        timestamp: Date.now(),
      }),
    );

    openConfirmationPage();

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(mocks.clearCart).not.toHaveBeenCalled();
    expect(readPendingOrder()).toBeNull();
  });
});
