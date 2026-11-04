/**
 * Tests the public order confirmation page.
 *
 * Covers paid, unpaid, canceled, and unavailable orders;
 * payment verification retries; URL and stored order
 * references; malformed responses; receipt details;
 * and cart handling.
 *
 * Square, website content, and cart operations are mocked.
 * No real orders, payments, or database changes occur.
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
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  clearCart: vi.fn(),
  openCart: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "test-montserrat" }),
  Cabin_Sketch: () => ({ className: "test-cabin" }),
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

const ORDER_ID = "CVuxowTLMQkI9Yq9SFJ84oG6phYZY";

type OrderFixture = {
  id: string;
  state: string;
  isPaid: boolean;
  lineItems: {
    uid: string;
    name: string;
    variationName: string;
    quantity: string;
    totalMoney: { amount: number };
    modifiers: { name: string }[];
    note: string;
  }[];
  fulfillments: {
    type: string;
    state: string;
    pickupDetails: {
      scheduleType: string;
      pickupAt?: string;
      recipient: {
        displayName: string;
        phoneNumber: string;
        emailAddress: string;
      };
    };
  }[];
  totalMoney: { amount: number; currency: string };
  totalTaxMoney: { amount: number };
  totalTipMoney: { amount: number };
  totalDiscountMoney: { amount: number };
};

function makeOrder(
  overrides: Partial<OrderFixture> = {},
): OrderFixture {
  return {
    id: ORDER_ID,
    state: "OPEN",
    isPaid: true,
    lineItems: [
      {
        uid: "line-1",
        name: "Classic Milk Tea",
        variationName: "Large",
        quantity: "2",
        totalMoney: { amount: 1300 },
        modifiers: [{ name: "Boba" }],
        note: "Less ice",
      },
    ],
    fulfillments: [
      {
        type: "PICKUP",
        state: "PROPOSED",
        pickupDetails: {
          scheduleType: "ASAP",
          recipient: {
            displayName: "Test Customer",
            phoneNumber: "***-***-0100",
            emailAddress: "t***@example.com",
          },
        },
      },
    ],
    totalMoney: {
      amount: 1500,
      currency: "USD",
    },
    totalTaxMoney: { amount: 100 },
    totalTipMoney: { amount: 200 },
    totalDiscountMoney: { amount: 100 },
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function mockOrderResponses(
  orders: OrderFixture[],
) {
  let index = 0;

  mocks.fetch.mockImplementation(
    async (input: string) => {
      if (input === "/api/website-content") {
        return jsonResponse({});
      }

      if (input === `/api/orders/${ORDER_ID}`) {
        const order =
          orders[Math.min(index, orders.length - 1)];

        index += 1;

        return jsonResponse({ order });
      }

      throw new Error(`Unexpected request: ${input}`);
    },
  );
}

function setOrderUrl(
  parameter = "orderId",
  id = ORDER_ID,
) {
  window.history.replaceState(
    {},
    "",
    `/order/confirmation?${parameter}=${id}`,
  );
}

function orderRequestCount() {
  return mocks.fetch.mock.calls.filter(
    ([url]) => url === `/api/orders/${ORDER_ID}`,
  ).length;
}

describe("Public order confirmation page", () => {
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

    mockOrderResponses([makeOrder()]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a missing-order message when no order reference exists", async () => {
    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Not Found",
      }),
    ).toBeTruthy();

    expect(orderRequestCount()).toBe(0);
    expect(mocks.clearCart).not.toHaveBeenCalled();
  });

  it("confirms a paid order and clears the cart", async () => {
    setOrderUrl();

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    await waitFor(() => {
      expect(mocks.clearCart).toHaveBeenCalledOnce();
    });

    expect(orderRequestCount()).toBe(1);

    expect(
      sessionStorage.getItem(
        "teazo_confirmed_order_id",
      ),
    ).toBe(ORDER_ID);
  });

  it("displays canceled orders without clearing the cart", async () => {
    setOrderUrl();

    mockOrderResponses([
      makeOrder({
        state: "CANCELED",
        isPaid: false,
      }),
    ]);

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Cancelled",
      }),
    ).toBeTruthy();

    expect(orderRequestCount()).toBe(1);
    expect(mocks.clearCart).not.toHaveBeenCalled();

    expect(
      screen.queryByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeNull();
  });

  it(
    "stops payment verification after four unpaid checks",
    async () => {
      setOrderUrl();

      mockOrderResponses([
        makeOrder({ isPaid: false }),
      ]);

      render(<OrderConfirmationPage />);

      expect(
        await screen.findByRole(
          "heading",
          { name: "Payment Not Completed" },
          { timeout: 9000 },
        ),
      ).toBeTruthy();

      expect(orderRequestCount()).toBe(4);
      expect(mocks.clearCart).not.toHaveBeenCalled();

      expect(
        screen.queryByRole("heading", {
          name: "Order Confirmed!",
        }),
      ).toBeNull();

      fireEvent.click(
        screen.getByRole("button", {
          name: "BACK TO YOUR BAG",
        }),
      );

      expect(mocks.openCart).toHaveBeenCalledOnce();
    },
    10000,
  );

  it(
    "retries a pending payment and confirms it when Square reports paid",
    async () => {
      setOrderUrl();

      mockOrderResponses([
        makeOrder({ isPaid: false }),
        makeOrder({ isPaid: true }),
      ]);

      render(<OrderConfirmationPage />);

      expect(
        await screen.findByRole(
          "heading",
          { name: "Order Confirmed!" },
          { timeout: 6000 },
        ),
      ).toBeTruthy();

      expect(orderRequestCount()).toBe(2);

      await waitFor(() => {
        expect(mocks.clearCart).toHaveBeenCalledOnce();
      });
    },
    8000,
  );

  it("handles an unavailable order response without clearing the cart", async () => {
    setOrderUrl();

    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.fetch.mockImplementation(
      async (input: string) => {
        if (input === "/api/website-content") {
          return jsonResponse({});
        }

        if (input === `/api/orders/${ORDER_ID}`) {
          return jsonResponse(
            { error: "Order not found." },
            404,
          );
        }

        throw new Error(`Unexpected request: ${input}`);
      },
    );

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Not Found",
      }),
    ).toBeTruthy();

    expect(
      screen.getByText(
        "Unable to load order receipt from Square.",
      ),
    ).toBeTruthy();

    expect(mocks.clearCart).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it.each(["order_id", "id"])(
    "accepts the %s query parameter for an order reference",
    async (parameter) => {
      setOrderUrl(parameter);

      render(<OrderConfirmationPage />);

      expect(
        await screen.findByRole("heading", {
          name: "Order Confirmed!",
        }),
      ).toBeTruthy();

      expect(orderRequestCount()).toBe(1);
    },
  );

  it("restores a confirmed order reference from session storage", async () => {
    sessionStorage.setItem(
      "teazo_confirmed_order_id",
      ORDER_ID,
    );

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(orderRequestCount()).toBe(1);
  });

  it("displays scheduled pickup information in Pacific time", async () => {
    setOrderUrl();

    mockOrderResponses([
      makeOrder({
        fulfillments: [
          {
            type: "PICKUP",
            state: "PROPOSED",
            pickupDetails: {
              scheduleType: "SCHEDULED",
              pickupAt: "2026-10-30T20:30:00Z",
              recipient: {
                displayName: "Test Customer",
                phoneNumber: "***-***-0100",
                emailAddress: "t***@example.com",
              },
            },
          },
        ],
      }),
    ]);

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(
      screen.getByText(/Scheduled:.*1:30 PM PT/),
    ).toBeTruthy();

    expect(
      screen.getByText(/Test Customer/),
    ).toBeTruthy();
  });

  it("displays line items, modifiers, and receipt totals", async () => {
    setOrderUrl();

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(
      screen.getByText(/2× Classic Milk Tea/),
    ).toBeTruthy();

    expect(
      screen.getByText("(Large)"),
    ).toBeTruthy();

    expect(screen.getByText("Boba")).toBeTruthy();
    expect(screen.getByText(/Less ice/)).toBeTruthy();

    expect(
      screen.getByText("Sales Tax"),
    ).toBeTruthy();

    expect(screen.getByText("$1.00")).toBeTruthy();
    expect(screen.getByText("$2.00")).toBeTruthy();

    expect(
      screen.getByText("Total Paid"),
    ).toBeTruthy();

    expect(screen.getByText("$15.00")).toBeTruthy();
  });

  it("restores the last checkout order from session storage", async () => {
    sessionStorage.setItem(
      "teazo_last_order_id",
      ORDER_ID,
    );

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(orderRequestCount()).toBe(1);
    expect(mocks.clearCart).toHaveBeenCalledOnce();
  });

  it("restores a pending checkout order from local storage", async () => {
    localStorage.setItem(
      "teazo_pending_checkout",
      JSON.stringify({
        orderId: ORDER_ID,
      }),
    );

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(orderRequestCount()).toBe(1);
  });

  it("restores a recent order reference from local storage", async () => {
    localStorage.setItem(
      "teazo_recent_order_id",
      ORDER_ID,
    );

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(orderRequestCount()).toBe(1);
  });

  it("prioritizes the URL order reference over a stored reference", async () => {
    setOrderUrl();

    sessionStorage.setItem(
      "teazo_confirmed_order_id",
      "DIFFERENT-STORED-ORDER",
    );

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeTruthy();

    expect(orderRequestCount()).toBe(1);

    expect(mocks.fetch).not.toHaveBeenCalledWith(
      "/api/orders/DIFFERENT-STORED-ORDER",
      expect.anything(),
    );
  });

  it("handles a malformed Square order response without clearing the cart", async () => {
    setOrderUrl();

    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.fetch.mockImplementation(
      async (input: string) => {
        if (input === "/api/website-content") {
          return jsonResponse({});
        }

        if (input === `/api/orders/${ORDER_ID}`) {
          return jsonResponse({
            order: null,
          });
        }

        throw new Error(`Unexpected request: ${input}`);
      },
    );

    render(<OrderConfirmationPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Order Not Found",
      }),
    ).toBeTruthy();

    expect(mocks.clearCart).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();

    expect(
      screen.queryByRole("heading", {
        name: "Order Confirmed!",
      }),
    ).toBeNull();
  });
});
