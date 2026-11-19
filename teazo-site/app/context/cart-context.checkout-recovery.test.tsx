/**
 * Tests recovery of Square checkout orders when the customer
 * closes the payment page before returning to confirmation.
 *
 * A verified paid order clears only its original, unchanged
 * shopping bag. Unpaid and canceled orders preserve cart items.
 * An older response cannot erase a newer or modified cart.
 *
 * Uses the real CartProvider with mocked Square responses.
 * No actual payments, network requests, or database writes occur.
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
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  CART_STORAGE_KEY,
  CartProvider,
  useCart,
} from "./cart-context";

import {
  CART_REVISION_STORAGE_KEY,
  PENDING_CHECKOUT_STORAGE_KEY,
} from "@/app/lib/cart-payment-ownership";

import {
  CHECKOUT_ATTEMPT_STORAGE_KEY,
} from "@/app/lib/checkout-attempt-storage";

import type { CartItem } from "@/app/types/checkout";

const FIRST_ORDER = "SQUARE_ORDER_1";
const SECOND_ORDER = "SQUARE_ORDER_2";

const FIRST_REVISION =
  "11111111-1111-4111-8111-111111111111";

const SECOND_REVISION =
  "22222222-2222-4222-8222-222222222222";

const ATTEMPT_ID =
  "33333333-3333-4333-8333-333333333333";

const firstItem: CartItem = {
  cartItemId: "cart-item-1",
  catalogObjectId: "ITEM1",
  variationId: "VAR1",
  variationName: "Regular",
  name: "Classic Milk Tea",
  basePriceCents: 500,
  imageUrl: null,
  selectedModifiers: [],
  quantity: 1,
  itemTotalCents: 500,
};

const secondItem: CartItem = {
  cartItemId: "cart-item-2",
  catalogObjectId: "ITEM2",
  variationId: "VAR2",
  variationName: "Large",
  name: "Green Tea",
  basePriceCents: 600,
  imageUrl: null,
  selectedModifiers: [],
  quantity: 1,
  itemTotalCents: 600,
};

function CartHarness() {
  const cart = useCart();

  return (
    <section>
      <span data-testid="cart-hydrated">
        {String(cart.isHydrated)}
      </span>

      <span data-testid="cart-count">
        {cart.totalCount}
      </span>

      <span data-testid="cart-items">
        {JSON.stringify(cart.items)}
      </span>

      <button
        type="button"
        onClick={() => cart.addItem(secondItem)}
      >
        Add another drink
      </button>
    </section>
  );
}

function renderCart() {
  return render(
    <CartProvider>
      <CartHarness />
    </CartProvider>,
  );
}

function seedPendingCheckout(
  options: {
    orderId?: string;
    cartRevision?: string;
    includeRevision?: boolean;
  } = {},
) {
  const orderId = options.orderId ?? FIRST_ORDER;
  const cartRevision =
    options.cartRevision ?? FIRST_REVISION;

  const includeRevision =
    options.includeRevision ?? true;

  localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([firstItem]),
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
      ...(includeRevision ? { cartRevision } : {}),
    }),
  );

  sessionStorage.setItem(
    CHECKOUT_ATTEMPT_STORAGE_KEY,
    JSON.stringify({
      fingerprint: "test-checkout-payload",
      attemptId: ATTEMPT_ID,
      cartRevision,
      orderId,
    }),
  );
}

function readPendingOrder(): {
  orderId: string;
  cartRevision?: string;
} | null {
  const raw = localStorage.getItem(
    PENDING_CHECKOUT_STORAGE_KEY,
  );

  return raw
    ? JSON.parse(raw) as {
        orderId: string;
        cartRevision?: string;
      }
    : null;
}

function cartItems(): CartItem[] {
  const raw = screen.getByTestId(
    "cart-items",
  ).textContent;

  return JSON.parse(raw ?? "[]") as CartItem[];
}

function mockSquareResponse(
  order: {
    isPaid?: boolean;
    state?: string;
  },
) {
  const fetchMock = vi.fn(
    async (url: string) => {
      if (url !== `/api/orders/${FIRST_ORDER}`) {
        throw new Error(
          `Unexpected request: ${url}`,
        );
      }

      return Response.json({ order });
    },
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("CartProvider checkout recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    localStorage.clear();
    sessionStorage.clear();

    window.history.replaceState(
      {},
      "",
      "/menu",
    );

    // A deterministic revision lets us verify that
    // editing the bag invalidates its previous ownership.
    vi.stubGlobal("crypto", {
      randomUUID: () => SECOND_REVISION,
    });
  });

  afterEach(() => {
    cleanup();

    localStorage.clear();
    sessionStorage.clear();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears the matching cart after recovering a paid order", async () => {
    seedPendingCheckout();

    const fetchMock = mockSquareResponse({
      isPaid: true,
      state: "OPEN",
    });

    renderCart();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();

      expect(
        localStorage.getItem(
          PENDING_CHECKOUT_STORAGE_KEY,
        ),
      ).toBeNull();

      expect(cartItems()).toHaveLength(0);
    });

    expect(
      localStorage.getItem(CART_STORAGE_KEY),
    ).toBeNull();

    expect(
      sessionStorage.getItem(
        CHECKOUT_ATTEMPT_STORAGE_KEY,
      ),
    ).toBeNull();
  });

  it("preserves the bag when Square reports an unpaid order", async () => {
    seedPendingCheckout();

    const fetchMock = mockSquareResponse({
      isPaid: false,
      state: "OPEN",
    });

    renderCart();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(cartItems()).toHaveLength(1);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(readPendingOrder()).toMatchObject({
      orderId: FIRST_ORDER,
      cartRevision: FIRST_REVISION,
    });

    expect(cartItems()[0].name).toBe(
      "Classic Milk Tea",
    );

    expect(
      sessionStorage.getItem(
        CHECKOUT_ATTEMPT_STORAGE_KEY,
      ),
    ).not.toBeNull();
  });

  it("preserves cart items but clears a canceled pending order", async () => {
    seedPendingCheckout();

    mockSquareResponse({
      isPaid: false,
      state: "CANCELED",
    });

    renderCart();

    await waitFor(() => {
      expect(readPendingOrder()).toBeNull();
      expect(cartItems()).toHaveLength(1);
    });

    expect(
      localStorage.getItem(CART_STORAGE_KEY),
    ).not.toBeNull();
  });

  it("refuses automatic clearing for legacy pending orders without ownership", async () => {
    seedPendingCheckout({
      includeRevision: false,
    });

    mockSquareResponse({
      isPaid: true,
      state: "OPEN",
    });

    renderCart();

    await waitFor(() => {
      expect(readPendingOrder()).toBeNull();
      expect(cartItems()).toHaveLength(1);
    });

    expect(
      localStorage.getItem(CART_STORAGE_KEY),
    ).not.toBeNull();
  });

  it("preserves a cart whose revision changed before recovery", async () => {
    seedPendingCheckout();

    localStorage.setItem(
      CART_REVISION_STORAGE_KEY,
      SECOND_REVISION,
    );

    mockSquareResponse({
      isPaid: true,
      state: "OPEN",
    });

    renderCart();

    await waitFor(() => {
      expect(readPendingOrder()).toBeNull();
      expect(cartItems()).toHaveLength(1);
    });

    expect(
      localStorage.getItem(
        CART_REVISION_STORAGE_KEY,
      ),
    ).toBe(SECOND_REVISION);
  });

  it("preserves items added while the Square status request is pending", async () => {
    seedPendingCheckout();

    let resolveSquare!: (response: Response) => void;

    const pendingResponse = new Promise<Response>(
      (resolve) => {
        resolveSquare = resolve;
      },
    );

    const fetchMock = vi.fn(
      () => pendingResponse,
    );

    vi.stubGlobal("fetch", fetchMock);

    renderCart();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(cartItems()).toHaveLength(1);
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add another drink",
      }),
    );

    await waitFor(() => {
      expect(cartItems()).toHaveLength(2);

      expect(
        localStorage.getItem(
          CART_REVISION_STORAGE_KEY,
        ),
      ).toBe(SECOND_REVISION);
    });

    await act(async () => {
      resolveSquare(
        Response.json({
          order: {
            isPaid: true,
            state: "OPEN",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(readPendingOrder()).toBeNull();
    });

    expect(cartItems()).toHaveLength(2);

    expect(
      cartItems().map((item) => item.name),
    ).toEqual([
      "Classic Milk Tea",
      "Green Tea",
    ]);
  });

  it("does not remove a newer pending order when an older request finishes", async () => {
    seedPendingCheckout();

    let resolveSquare!: (response: Response) => void;

    const pendingResponse = new Promise<Response>(
      (resolve) => {
        resolveSquare = resolve;
      },
    );

    const fetchMock = vi.fn(
      () => pendingResponse,
    );

    vi.stubGlobal("fetch", fetchMock);

    renderCart();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(cartItems()).toHaveLength(1);
    });

    // The customer has started a different checkout.
    // Its pending record must survive the older response.
    localStorage.setItem(
      CART_REVISION_STORAGE_KEY,
      SECOND_REVISION,
    );

    localStorage.setItem(
      PENDING_CHECKOUT_STORAGE_KEY,
      JSON.stringify({
        orderId: SECOND_ORDER,
        timestamp: Date.now(),
        cartRevision: SECOND_REVISION,
      }),
    );

    await act(async () => {
      resolveSquare(
        Response.json({
          order: {
            isPaid: true,
            state: "OPEN",
          },
        }),
      );
    });

    expect(readPendingOrder()).toMatchObject({
      orderId: SECOND_ORDER,
      cartRevision: SECOND_REVISION,
    });

    expect(cartItems()).toHaveLength(1);
  });
});
