/**
 * Tests TEAZO shopping cart state and persistence.
 *
 * Covers modifier pricing, customization identity,
 * item merging, quantity boundaries, cart editing,
 * removal, totals, and localStorage persistence.
 *
 * Uses a real CartProvider with test-only cart items.
 * No checkout or payment requests are made.
 */

// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  CART_STORAGE_KEY,
  CartProvider,
  calculateItemTotalCents,
  getCustomizationFingerprint,
  MAX_ITEM_QUANTITY,
  useCart,
} from "./cart-context";

import type {
  CartItem,
  CartModifierChoice,
} from "@/app/types/checkout";

// Use synthetic Square IDs that cannot represent real orders.
const topping: CartModifierChoice = {
  modifierListId: "TOPPINGS",
  modifierListName: "Toppings",
  optionId: "BOBA",
  optionName: "Boba",
  priceCents: 75,
};

// Build a predictable cart item for state testing.
function makeItem(
  overrides: Partial<CartItem> = {},
): CartItem {
  return {
    cartItemId: "cart-1",
    catalogObjectId: "ITEM1",
    variationId: "VAR1",
    variationName: "Regular",
    name: "Classic Milk Tea",
    basePriceCents: 500,
    imageUrl: null,
    selectedModifiers: [],
    quantity: 1,
    itemTotalCents: 500,
    ...overrides,
  };
}

// Exercise the real CartContext through simple controls.
// The buttons intentionally do not reproduce CartDrawer UI.
function CartHarness() {
  const cart = useCart();

  return (
    <section>
      <p data-testid="count">{cart.totalCount}</p>
      <p data-testid="subtotal">{cart.subtotalCents}</p>
      <p data-testid="lines">{cart.items.length}</p>
      <p data-testid="hydrated">
        {String(cart.isHydrated)}
      </p>
      <p data-testid="open">
        {String(cart.isCartOpen)}
      </p>
      <p data-testid="items">
        {JSON.stringify(cart.items)}
      </p>

      <button
        onClick={() => cart.addItem(makeItem())}
      >
        Add regular
      </button>

      <button
        onClick={() =>
          cart.addItem(
            makeItem({
              cartItemId: "cart-2",
              quantity: 2,
              itemTotalCents: 1000,
            }),
          )
        }
      >
        Add identical
      </button>

      <button
        onClick={() =>
          cart.addItem(
            makeItem({
              cartItemId: "cart-3",
              selectedModifiers: [topping],
              itemTotalCents: 575,
            }),
          )
        }
      >
        Add customized
      </button>

      <button
        onClick={() =>
          cart.updateQuantity("cart-1", 1)
        }
      >
        Increase first
      </button>

      <button
        onClick={() =>
          cart.updateQuantity("cart-1", -1)
        }
      >
        Decrease first
      </button>

      <button
        onClick={() =>
          cart.setQuantity(
            "cart-1",
            MAX_ITEM_QUANTITY + 10,
          )
        }
      >
        Exceed quantity limit
      </button>

      <button
        onClick={() =>
          cart.updateItem(
            "cart-1",
            makeItem({
              basePriceCents: 650,
              variationId: "VAR2",
              variationName: "Large",
              selectedModifiers: [topping],
              itemTotalCents: 725,
            }),
          )
        }
      >
        Edit first
      </button>

      <button
        onClick={() => cart.removeItem("cart-1")}
      >
        Remove first
      </button>

      <button onClick={cart.clearCart}>
        Clear cart
      </button>

      <button onClick={cart.openCart}>
        Open cart
      </button>

      <button onClick={cart.closeCart}>
        Close cart
      </button>
    </section>
  );
}

// Render the actual provider and its test controls.
function renderCart() {
  return render(
    <CartProvider>
      <CartHarness />
    </CartProvider>,
  );
}

// Read the current items exposed by the test harness.
function currentItems(): CartItem[] {
  return JSON.parse(
    screen.getByTestId("items").textContent ?? "[]",
  ) as CartItem[];
}

// Click a test control by its accessible name.
function click(name: string) {
  fireEvent.click(
    screen.getByRole("button", { name }),
  );
}

describe("Frontend shopping cart state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // Modifier prices are added before multiplying by quantity.
  it("calculates item totals with modifier prices", () => {
    expect(
      calculateItemTotalCents(500, [topping], 2),
    ).toBe(1150);

    expect(
      calculateItemTotalCents(500, [], 3),
    ).toBe(1500);
  });

  // Negative or invalid computed totals must not
  // produce negative shopping cart prices.
  it("does not return negative totals", () => {
    expect(
      calculateItemTotalCents(-500, [], 1),
    ).toBe(0);
  });

  // Modifier ordering and note casing should not
  // create a different customization identity.
  it("normalizes customization fingerprints", () => {
    const first = {
      catalogObjectId: "ITEM1",
      variationId: "VAR1",
      selectedModifiers: [
        { ...topping, optionId: "BOBA" },
        { ...topping, optionId: "JELLY" },
      ],
      notes: " Less Ice ",
    };

    const second = {
      ...first,
      selectedModifiers: [...first.selectedModifiers]
        .reverse(),
      notes: "less ice",
    };

    expect(
      getCustomizationFingerprint(first),
    ).toBe(
      getCustomizationFingerprint(second),
    );
  });

  // Different modifiers must remain separate cart lines.
  it("distinguishes different customizations", () => {
    expect(
      getCustomizationFingerprint(makeItem()),
    ).not.toBe(
      getCustomizationFingerprint(
        makeItem({
          selectedModifiers: [topping],
        }),
      ),
    );
  });

  // CartProvider should become hydrated in the browser
  // and begin with no items when storage is empty.
  it("starts with an empty hydrated cart", async () => {
    renderCart();

    await waitFor(() => {
      expect(
        screen.getByTestId("hydrated").textContent,
      ).toBe("true");
    });

    expect(
      screen.getByTestId("count").textContent,
    ).toBe("0");

    expect(
      screen.getByTestId("subtotal").textContent,
    ).toBe("0");
  });

  // A new item must update both the count and subtotal.
  it("adds an item and updates totals", async () => {
    renderCart();

    click("Add regular");

    await waitFor(() => {
      expect(currentItems()).toHaveLength(1);
    });

    expect(currentItems()[0].quantity).toBe(1);
    expect(currentItems()[0].itemTotalCents).toBe(500);

    expect(
      screen.getByTestId("subtotal").textContent,
    ).toBe("500");
  });

  // Identically customized items merge into one line
  // instead of creating duplicate cart entries.
  it("merges identical configurations", async () => {
    renderCart();

    click("Add regular");
    click("Add identical");

    await waitFor(() => {
      expect(currentItems()[0].quantity).toBe(3);
    });

    expect(currentItems()).toHaveLength(1);

    expect(
      screen.getByTestId("subtotal").textContent,
    ).toBe("1500");
  });

  // Different toppings must remain separate items,
  // each retaining their own unit price and quantity.
  it("keeps different customizations separate", async () => {
    renderCart();

    click("Add regular");
    click("Add customized");

    await waitFor(() => {
      expect(currentItems()).toHaveLength(2);
    });

    expect(
      screen.getByTestId("subtotal").textContent,
    ).toBe("1075");
  });

  // Increasing quantity must recalculate the line total.
  it("recalculates totals after quantity changes", async () => {
    renderCart();

    click("Add regular");
    click("Increase first");

    await waitFor(() => {
      expect(currentItems()[0].quantity).toBe(2);
    });

    expect(currentItems()[0].itemTotalCents).toBe(1000);

    click("Decrease first");

    await waitFor(() => {
      expect(currentItems()[0].quantity).toBe(1);
    });
  });

  // Clamp requests exceeding the maximum item quantity.
  it("enforces the maximum quantity", async () => {
    renderCart();

    click("Add regular");
    click("Exceed quantity limit");

    await waitFor(() => {
      expect(currentItems()[0].quantity).toBe(
        MAX_ITEM_QUANTITY,
      );
    });

    expect(
      screen.getByTestId("subtotal").textContent,
    ).toBe(String(500 * MAX_ITEM_QUANTITY));
  });

  // Editing a drink must update its variation, modifier
  // prices, and resulting subtotal.
  it("updates the configuration of an existing item", async () => {
    renderCart();

    click("Add regular");
    click("Edit first");

    await waitFor(() => {
      expect(currentItems()[0].variationId).toBe("VAR2");
    });

    expect(currentItems()[0].basePriceCents).toBe(650);
    expect(currentItems()[0].selectedModifiers).toHaveLength(1);
    expect(currentItems()[0].itemTotalCents).toBe(725);
  });

  // Removing the only item must empty the cart.
  it("removes an item and clears its subtotal", async () => {
    renderCart();

    click("Add regular");
    click("Remove first");

    await waitFor(() => {
      expect(currentItems()).toHaveLength(0);
    });

    expect(
      screen.getByTestId("subtotal").textContent,
    ).toBe("0");
  });

  // Clearing the bag must also clear persistent storage.
  it("clears saved cart contents", async () => {
    renderCart();

    click("Add regular");

    await waitFor(() => {
      expect(
        window.localStorage.getItem(CART_STORAGE_KEY),
      ).not.toBeNull();
    });

    click("Clear cart");

    await waitFor(() => {
      expect(currentItems()).toHaveLength(0);
    });

    expect(
      window.localStorage.getItem(CART_STORAGE_KEY),
    ).toBeNull();
  });

  // The same provider must retain the saved cart
  // after the React tree is unmounted and rendered again.
  it("restores persisted cart items", async () => {
    const firstRender = renderCart();

    click("Add regular");

    await waitFor(() => {
      expect(
        window.localStorage.getItem(CART_STORAGE_KEY),
      ).not.toBeNull();
    });

    firstRender.unmount();

    renderCart();

    await waitFor(() => {
      expect(currentItems()).toHaveLength(1);
    });

    expect(currentItems()[0].name).toBe(
      "Classic Milk Tea",
    );
  });

  // Opening and closing the shopping bag must be
  // reflected in the shared cart state.
  it("tracks shopping bag visibility", () => {
    renderCart();

    click("Open cart");

    expect(
      screen.getByTestId("open").textContent,
    ).toBe("true");

    click("Close cart");

    expect(
      screen.getByTestId("open").textContent,
    ).toBe("false");
  });
});
