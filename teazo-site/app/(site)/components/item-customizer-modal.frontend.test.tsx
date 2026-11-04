/**
 * Tests frontend drink customization behavior.
 *
 * Covers variation selection, modifiers, price updates,
 * quantity limits, special instructions, unavailable
 * products, failed availability checks, and cart editing.
 *
 * Square catalog requests and cart actions are mocked.
 * No real cart checkout or payment is performed.
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
  vi,
} from "vitest";

import type { MenuItem } from "./menu-item-card";
import type { CartItem } from "@/app/types/checkout";
import type {
  MenuItem as ApiMenuItem,
} from "@/app/types/menu-item";

// Mock only external cart interactions.
const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  updateItem: vi.fn(),
  openCart: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/app/context/cart-context", () => ({
  useCart: () => ({
    addItem: mocks.addItem,
    updateItem: mocks.updateItem,
    openCart: mocks.openCart,
  }),
  MIN_ITEM_QUANTITY: 1,
  MAX_ITEM_QUANTITY: 50,
}));

// Avoid external font and image loading in jsdom.
vi.mock("next/font/google", () => ({
  Montserrat: () => ({
    className: "test-font",
  }),
  Cabin_Sketch: () => ({
    className: "test-font",
  }),
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

import ItemCustomizerModal from "./item-customizer-modal";

// The availability snapshot uses synthetic Square IDs.
const AVAILABLE = {
  available: true,
  locationId: "TEST-LOCATION",
  reasons: [],
};

const UNAVAILABLE = {
  available: false,
  locationId: "TEST-LOCATION",
  reasons: [
    {
      code: "SOLD_OUT",
      message: "This drink is sold out.",
    },
  ],
};

// Construct a fully available Square catalog fixture.
function makeCatalogItem(
  overrides: Partial<ApiMenuItem> = {},
): ApiMenuItem {
  return {
    catalogObjectId: "ITEM1",
    name: "Classic Milk Tea",
    description: "A test drink",
    variationId: "VAR1",
    priceCents: 500,
    currency: "USD",
    imageUrl: null,
    categories: [
      {
        id: "CAT1",
        name: "Milk Tea",
      },
    ],
    availability: AVAILABLE,
    variations: [
      {
        id: "VAR1",
        name: "Regular",
        priceCents: 500,
        availability: AVAILABLE,
      },
      {
        id: "VAR2",
        name: "Large",
        priceCents: 650,
        availability: AVAILABLE,
      },
    ],
    modifiers: [
      {
        id: "SWEETNESS",
        name: "Sweetness",
        minSelectedModifiers: 1,
        maxSelectedModifiers: 1,
        options: [
          {
            id: "NORMAL",
            name: "Normal",
            priceCents: 0,
            onByDefault: true,
            availability: AVAILABLE,
          },
          {
            id: "LESS",
            name: "Less Sweet",
            priceCents: 0,
            availability: AVAILABLE,
          },
        ],
      },
      {
        id: "TOPPINGS",
        name: "Toppings",
        minSelectedModifiers: 0,
        maxSelectedModifiers: 2,
        options: [
          {
            id: "BOBA",
            name: "Boba",
            priceCents: 75,
            availability: AVAILABLE,
          },
          {
            id: "JELLY",
            name: "Jelly",
            priceCents: 50,
            availability: AVAILABLE,
          },
          {
            id: "POPPING",
            name: "Popping Boba",
            priceCents: 100,
            availability: AVAILABLE,
          },
        ],
      },
    ],
    ...overrides,
  };
}

// Use the same shape as the public Menu card.
function makeCardItem(): MenuItem {
  const item = makeCatalogItem();

  return {
    catalogObjectId: item.catalogObjectId,
    name: item.name ?? "Classic Milk Tea",
    description: item.description,
    variationId: item.variationId ?? null,
    priceCents: item.priceCents,
    currency: item.currency,
    imageUrl: null,
    categoryId: "CAT1",
    categoryName: "Milk Tea",
    variations: item.variations,
    modifiers: item.modifiers,
    availability: item.availability,
  };
}

// Render a fresh customization dialog.
function renderCustomizer(
  initialCartItem?: CartItem,
  onClose = vi.fn(),
) {
  return render(
    <ItemCustomizerModal
      item={makeCardItem()}
      initialCartItem={initialCartItem}
      onClose={onClose}
    />,
  );
}

// Find the action button after its availability check.
async function addButton() {
  const button = await screen.findByRole("button", {
    name: /Add to Bag/,
  });

  await waitFor(() => {
    expect(
      (button as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  return button;
}

// Find a specific topping by its accessible name.
//
// The Customizer includes price information in each
// checkbox's accessible name, such as "Boba +$0.75".
//
// Match the beginning of the name to avoid confusing
// "Boba" with the separate "Popping Boba" option.
function toppingOption(
  name: "Boba" | "Jelly" | "Popping Boba",
): HTMLButtonElement {
  const patterns = {
    Boba: /^Boba\b/,
    Jelly: /^Jelly\b/,
    "Popping Boba": /^Popping Boba\b/,
  };

  return screen.getByRole("checkbox", {
    name: patterns[name],
  }) as HTMLButtonElement;
}

// Simulate an existing cart entry being edited.
function makeExistingCartItem(): CartItem {
  return {
    cartItemId: "existing-cart-line",
    catalogObjectId: "ITEM1",
    variationId: "VAR1",
    variationName: "Regular",
    name: "Classic Milk Tea",
    basePriceCents: 500,
    imageUrl: null,
    selectedModifiers: [
      {
        modifierListId: "SWEETNESS",
        modifierListName: "Sweetness",
        optionId: "NORMAL",
        optionName: "Normal",
        priceCents: 0,
      },
    ],
    quantity: 2,
    notes: "Less ice",
    itemTotalCents: 1000,
  };
}

describe("Drink customizer frontend interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Use a deterministic cart ID to avoid depending
    // on browser-specific UUID implementations.
    vi.stubGlobal("crypto", {
      randomUUID: () => "test-cart-line-id",
    });

    // All availability requests return test catalog data.
    mocks.fetch.mockImplementation(async () =>
      Response.json(makeCatalogItem()),
    );

    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // The modal must load current Square options
  // before allowing the visitor to add the item.
  it("loads and displays current customization options", async () => {
    renderCustomizer();

    await addButton();

    expect(
      screen.getByRole("dialog"),
    ).toBeDefined();

    expect(
      screen.getByText("Classic Milk Tea", {
        selector: "h2",
      }),
    ).toBeDefined();

    expect(
      screen.getByRole("radiogroup", {
        name: "Size / Option",
      }),
    ).toBeDefined();

    expect(
      screen.getByRole("group", {
        name: "Toppings",
      }),
    ).toBeDefined();
  });

  // Default customization uses the regular variation
  // and the sweetness option designated by Square.
  it("displays the default price", async () => {
    renderCustomizer();

    const button = await addButton();

    expect(button.textContent).toContain("$5.00");

    expect(
      screen.getByRole("radio", {
        name: /Normal/,
      }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  // Selecting a larger variation must update the
  // base price shown in the Add to Bag button.
  it("updates the price when changing size", async () => {
    renderCustomizer();

    const button = await addButton();

    fireEvent.click(
      screen.getByRole("radio", {
        name: /Large/,
      }),
    );

    expect(button.textContent).toContain("$6.50");
  });

  // Selecting Boba must add $0.75 to the drink's
  // displayed price without selecting Popping Boba.
  it("adds selected topping prices", async () => {
    renderCustomizer();

    const button = await addButton();

    fireEvent.click(toppingOption("Boba"));

    expect(
      toppingOption("Boba").getAttribute("aria-checked"),
    ).toBe("true");

    expect(
      toppingOption("Popping Boba").getAttribute("aria-checked"),
    ).toBe("false");

    expect(button.textContent).toContain("$5.75");
  });

  // One sweetness choice should replace the previous
  // selection rather than adding a second choice.
  it("replaces a single-select modifier", async () => {
    renderCustomizer();

    await addButton();

    fireEvent.click(
      screen.getByRole("radio", {
        name: /Less Sweet/,
      }),
    );

    expect(
      screen.getByRole("radio", {
        name: /Less Sweet/,
      }).getAttribute("aria-checked"),
    ).toBe("true");

    expect(
      screen.getByRole("radio", {
        name: /Normal/,
      }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  // Selecting two toppings should satisfy the maximum
  // and disable another unselected topping.
  it("enforces modifier selection limits", async () => {
    renderCustomizer();

    await addButton();

    fireEvent.click(toppingOption("Boba"));
    fireEvent.click(toppingOption("Jelly"));

    expect(
      toppingOption("Boba").getAttribute("aria-checked"),
    ).toBe("true");

    expect(
      toppingOption("Jelly").getAttribute("aria-checked"),
    ).toBe("true");

    // A third topping cannot be selected until an
    // existing topping is removed.
    const third = toppingOption("Popping Boba");

    expect(third.disabled).toBe(true);
    expect(third.getAttribute("aria-checked")).toBe("false");
  });

  // Quantity controls should update the total
  // without allowing a quantity lower than one.
  it("updates price based on selected quantity", async () => {
    renderCustomizer();

    const button = await addButton();

    expect(
      (
        screen.getByRole("button", {
          name: "Decrease quantity",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Increase quantity",
      }),
    );

    expect(button.textContent).toContain("$10.00");
  });

  // Adding an item must construct the expected cart data
  // without contacting any checkout service.
  it("adds a selected configuration to the cart", async () => {
    const onClose = vi.fn();

    renderCustomizer(undefined, onClose);

    const button = await addButton();

    fireEvent.click(
      screen.getByRole("radio", {
        name: /Large/,
      }),
    );

    fireEvent.change(
      screen.getByLabelText("Special Instructions"),
      {
        target: {
          value: "  Less ice  ",
        },
      },
    );

    fireEvent.click(button);

    expect(mocks.addItem).toHaveBeenCalledOnce();

    expect(mocks.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogObjectId: "ITEM1",
        variationId: "VAR2",
        basePriceCents: 650,
        notes: "Less ice",
        quantity: 1,
        itemTotalCents: 650,
      }),
    );

    expect(mocks.openCart).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Existing items must be updated in place instead
  // of being added as unrelated new cart entries.
  it("updates an existing customized drink", async () => {
    renderCustomizer(makeExistingCartItem());

    const button = await screen.findByRole(
      "button",
      {
        name: /Update Drink/,
      },
    );

    await waitFor(() => {
      expect(
        (button as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    fireEvent.click(button);

    expect(mocks.updateItem).toHaveBeenCalledWith(
      "existing-cart-line",
      expect.objectContaining({
        quantity: 2,
        notes: "Less ice",
      }),
    );

    expect(mocks.addItem).not.toHaveBeenCalled();
  });

  // An unavailable catalog item should not be added
  // even if it was previously visible in the menu.
  it("prevents ordering unavailable items", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json(
        makeCatalogItem({
          availability: UNAVAILABLE,
        }),
      ),
    );

    renderCustomizer();

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain("This drink is sold out.");
    });

    const button = screen.getByRole("button", {
      name: /Add to Bag/,
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    expect(mocks.addItem).not.toHaveBeenCalled();
  });

  // If availability cannot be refreshed, the
  // customizer must fail closed and provide a retry.
  it("offers a retry after catalog failure", async () => {
    mocks.fetch.mockRejectedValueOnce(
      new Error("Square unavailable"),
    );

    renderCustomizer();

    await screen.findByRole("button", {
      name: "Try again",
    });

    expect(
      (
        screen.getByRole("button", {
          name: /Add to Bag/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Try again",
      }),
    );

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });

    await addButton();
  });

  // Escape should dismiss the dialog, allowing
  // keyboard users to leave the customization flow.
  it("closes the modal using Escape", async () => {
    const onClose = vi.fn();

    renderCustomizer(undefined, onClose);

    await addButton();

    fireEvent.keyDown(window, {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
