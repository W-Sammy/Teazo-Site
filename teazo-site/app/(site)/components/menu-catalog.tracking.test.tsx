/**
 * @vitest-environment jsdom
 */

/**
 * Public menu-item analytics tracking regression tests.
 *
 * Verifies that customer item selections submit the correct Square
 * catalog ID and item name to the analytics endpoint.
 *
 * Also verifies that navigation, browser history, and the item
 * customizer remain functional when analytics requests fail.
 *
 * Child components and network requests are mocked. No real
 * Square API calls, D1 writes, or external requests occur.
 */

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

import type { MenuItem } from "./menu-item-card";
import type { MenuSection } from "./menu-catalog";

// Replace section rendering with buttons that invoke the actual
// MenuCatalog selection callback.
vi.mock("./menu-items-section", () => ({
  default: ({
    title,
    items,
    onCustomizeItem,
  }: {
    title: string;
    items: MenuItem[];
    onCustomizeItem: (item: MenuItem) => void;
  }) => (
    <section aria-label={title}>
      <h2>{title}</h2>

      {items.map((item) => (
        <button
          key={item.catalogObjectId}
          type="button"
          onClick={() => onCustomizeItem(item)}
        >
          {item.name}
        </button>
      ))}
    </section>
  ),
}));

// Render a simple item dialog so the tests can observe whether
// analytics failures interfere with the customer experience.
vi.mock("./item-customizer-modal", () => ({
  default: ({
    item,
    onClose,
  }: {
    item: MenuItem | null;
    onClose: () => void;
  }) =>
    item ? (
      <div role="dialog" aria-label="Item Customizer">
        <h2>Customize {item.name}</h2>

        <p>
          Selected catalog ID: {item.catalogObjectId}
        </p>

        <button
          type="button"
          onClick={onClose}
        >
          Close Customizer
        </button>
      </div>
    ) : null,
}));

import MenuCatalog from "./menu-catalog";

// Synthetic catalog items deliberately use different Square item
// and variation IDs to catch incorrect tracking identifiers.
const specialItem: MenuItem = {
  catalogObjectId: "SYNTHETIC-SPECIAL-ITEM",
  name: "Signature Jasmine Tea",
  variationId: "SYNTHETIC-SPECIAL-VARIATION",
  priceCents: 650,
  currency: "USD",
  imageUrl: null,
  categoryId: "SPECIAL",
  categoryName: "TEAZO Special",
  description: "Signature synthetic drink",
  modifiers: [],
};

const milkTeaItem: MenuItem = {
  catalogObjectId: "SYNTHETIC-MILK-ITEM",
  name: "Classic Milk Tea",
  variationId: "SYNTHETIC-MILK-VARIATION",
  priceCents: 550,
  currency: "USD",
  imageUrl: null,
  categoryId: "MILK",
  categoryName: "Milk Tea",
  description: "Classic synthetic drink",
  modifiers: [],
};

const fruitTeaItem: MenuItem = {
  catalogObjectId: "SYNTHETIC-FRUIT-ITEM",
  name: "Mango Fruit Tea",
  variationId: "SYNTHETIC-FRUIT-VARIATION",
  priceCents: 575,
  currency: "USD",
  imageUrl: null,
  categoryId: "FRUIT",
  categoryName: "Fruit Tea",
  description: "Synthetic fruit tea",
  modifiers: [],
};

const specialSections: MenuSection[] = [
  {
    id: "special",
    title: "TEAZO Special",
    items: [specialItem],
  },
];

const menuSections: MenuSection[] = [
  {
    id: "milk-tea",
    title: "Milk Tea",
    items: [milkTeaItem],
  },
  {
    id: "fruit-tea",
    title: "Fruit Tea",
    items: [fruitTeaItem],
  },
];

// The fetch mock records calls without contacting a real server.
const fetchMock = vi.fn();

// Render the actual MenuCatalog component using synthetic data.
function renderCatalog(initialItemId?: string) {
  return render(
    <MenuCatalog
      specialSections={specialSections}
      menuSections={menuSections}
      initialItemId={initialItemId}
      headingClassName="synthetic-heading"
      bodyClassName="synthetic-body"
    />,
  );
}

// Simulate a customer opening an item from the public menu.
function selectItem(name: string) {
  fireEvent.click(
    screen.getByRole("button", {
      name,
    }),
  );
}

// Inspect an analytics request made by the real component.
function trackingRequest(index = 0) {
  const call = fetchMock.mock.calls[index];

  expect(call).toBeDefined();

  const [url, options] = call as [
    string,
    RequestInit,
  ];

  return {
    url,
    options,
    body: JSON.parse(
      String(options.body),
    ) as {
      itemId: string;
      itemName: string;
    },
  };
}

// Retrieve the selected item from the browser's URL.
function selectedItemId() {
  return new URLSearchParams(
    window.location.search,
  ).get("item");
}

describe("Public menu-item analytics tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the browser location for each independent test.
    window.history.replaceState(
      {},
      "",
      "/menu",
    );

    fetchMock.mockReset();

    // A successful synthetic analytics response is the default.
    fetchMock.mockResolvedValue(
      Response.json({ ok: true }),
    );

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("Tracking selected Square menu items", () => {
    it("sends the selected regular item's Square ID and name", () => {
      renderCatalog();

      selectItem("Classic Milk Tea");

      expect(fetchMock).toHaveBeenCalledOnce();

      const request = trackingRequest();

      expect(request.url).toBe(
        "/api/analytics/menu-item-view",
      );

      expect(request.body).toEqual({
        itemId: milkTeaItem.catalogObjectId,
        itemName: milkTeaItem.name,
      });

      expect(selectedItemId()).toBe(
        milkTeaItem.catalogObjectId,
      );
    });

    it("sends the correct ID and name for featured items", () => {
      renderCatalog();

      selectItem("Signature Jasmine Tea");

      expect(fetchMock).toHaveBeenCalledOnce();

      expect(trackingRequest().body).toEqual({
        itemId: specialItem.catalogObjectId,
        itemName: specialItem.name,
      });

      expect(
        screen.getByRole("dialog", {
          name: "Item Customizer",
        }),
      ).toBeTruthy();
    });

    it("tracks the Square catalog item ID rather than the variation ID", () => {
      renderCatalog();

      selectItem("Classic Milk Tea");

      const request = trackingRequest();

      expect(request.body.itemId).toBe(
        milkTeaItem.catalogObjectId,
      );

      expect(request.body.itemId).not.toBe(
        milkTeaItem.variationId,
      );
    });

    it("sends a JSON POST request with keepalive enabled", () => {
      renderCatalog();

      selectItem("Classic Milk Tea");

      const request = trackingRequest();

      expect(request.options).toMatchObject({
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(
        JSON.parse(
          String(request.options.body),
        ),
      ).toEqual({
        itemId: milkTeaItem.catalogObjectId,
        itemName: milkTeaItem.name,
      });
    });

    it("tracks different items with their original IDs and names", () => {
      renderCatalog();

      selectItem("Classic Milk Tea");
      selectItem("Mango Fruit Tea");

      expect(fetchMock).toHaveBeenCalledTimes(2);

      expect(trackingRequest(0).body).toEqual({
        itemId: milkTeaItem.catalogObjectId,
        itemName: milkTeaItem.name,
      });

      expect(trackingRequest(1).body).toEqual({
        itemId: fruitTeaItem.catalogObjectId,
        itemName: fruitTeaItem.name,
      });

      expect(selectedItemId()).toBe(
        fruitTeaItem.catalogObjectId,
      );
    });

    it("does not record another view merely because the component rerenders", () => {
      const view = renderCatalog();

      selectItem("Classic Milk Tea");

      expect(fetchMock).toHaveBeenCalledOnce();

      // A normal React rerender is not a new customer selection.
      view.rerender(
        <MenuCatalog
          specialSections={specialSections}
          menuSections={menuSections}
          headingClassName="synthetic-heading"
          bodyClassName="synthetic-body"
        />,
      );

      expect(fetchMock).toHaveBeenCalledOnce();

      expect(
        screen.getByRole("dialog"),
      ).toBeTruthy();
    });

    it("does not call Square endpoints when recording a menu-item view", () => {
      renderCatalog();

      selectItem("Classic Milk Tea");

      expect(fetchMock).toHaveBeenCalledOnce();

      const urls = fetchMock.mock.calls.map(
        (call) => String(call[0]),
      );

      // Analytics tracking should never change the catalog.
      expect(urls).toEqual([
        "/api/analytics/menu-item-view",
      ]);

      expect(
        urls.some((url) =>
          url.includes("/api/square/"),
        ),
      ).toBe(false);

      expect(milkTeaItem.name).toBe(
        "Classic Milk Tea",
      );

      expect(milkTeaItem.priceCents).toBe(550);
    });
  });

  describe("Navigation and analytics side effects", () => {
    it("does not send a new tracking request for an initially selected item", () => {
      window.history.replaceState(
        {},
        "",
        `/menu?item=${milkTeaItem.catalogObjectId}`,
      );

      renderCatalog(
        milkTeaItem.catalogObjectId,
      );

      expect(
        screen.getByRole("dialog", {
          name: "Item Customizer",
        }),
      ).toBeTruthy();

      // Initial rendering is different from a user clicking
      // an item in the catalog.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not track an unknown initial item", () => {
      renderCatalog("UNKNOWN-SQUARE-ITEM");

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not create a new tracking event for browser history navigation", () => {
      renderCatalog();

      window.history.replaceState(
        {},
        "",
        `/menu?item=${milkTeaItem.catalogObjectId}`,
      );

      fireEvent.popState(window);

      expect(
        screen.getByText(
          `Selected catalog ID: ${milkTeaItem.catalogObjectId}`,
        ),
      ).toBeTruthy();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not record another view when the customizer closes", () => {
      renderCatalog();

      selectItem("Classic Milk Tea");

      expect(fetchMock).toHaveBeenCalledOnce();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Close Customizer",
        }),
      );

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();

      expect(selectedItemId()).toBeNull();

      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("records another view when the customer explicitly reopens an item", () => {
      renderCatalog();

      selectItem("Classic Milk Tea");

      fireEvent.click(
        screen.getByRole("button", {
          name: "Close Customizer",
        }),
      );

      selectItem("Classic Milk Tea");

      // Each explicit selection generates a separate view.
      expect(fetchMock).toHaveBeenCalledTimes(2);

      expect(trackingRequest(0).body).toEqual(
        trackingRequest(1).body,
      );

      expect(
        screen.getByRole("dialog"),
      ).toBeTruthy();
    });

    it("preserves unrelated URL parameters while tracking an item", () => {
      window.history.replaceState(
        {},
        "",
        "/menu?source=homepage",
      );

      renderCatalog();

      selectItem("Mango Fruit Tea");

      const params = new URLSearchParams(
        window.location.search,
      );

      expect(params.get("source")).toBe(
        "homepage",
      );

      expect(params.get("item")).toBe(
        fruitTeaItem.catalogObjectId,
      );

      expect(trackingRequest().body).toEqual({
        itemId: fruitTeaItem.catalogObjectId,
        itemName: fruitTeaItem.name,
      });
    });
  });

  describe("Analytics failure resilience", () => {
    it("keeps the customizer open when the analytics request rejects", async () => {
      fetchMock.mockRejectedValueOnce(
        new Error("Synthetic analytics network failure."),
      );

      renderCatalog();

      selectItem("Classic Milk Tea");

      // A rejected analytics Promise must not prevent the
      // selected item from appearing in the customizer.
      await waitFor(() => {
        expect(
          screen.getByRole("dialog", {
            name: "Item Customizer",
          }),
        ).toBeTruthy();
      });

      expect(
        screen.getByText(
          `Selected catalog ID: ${milkTeaItem.catalogObjectId}`,
        ),
      ).toBeTruthy();

      expect(selectedItemId()).toBe(
        milkTeaItem.catalogObjectId,
      );

      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it.each([429, 503])(
      "keeps menu interactions functional when analytics returns HTTP %s",
      async (status) => {
        fetchMock.mockResolvedValueOnce(
          Response.json(
            {
              error: "Synthetic analytics failure.",
            },
            { status },
          ),
        );

        renderCatalog();

        selectItem("Signature Jasmine Tea");

        await waitFor(() => {
          expect(
            screen.getByRole("dialog"),
          ).toBeTruthy();
        });

        expect(
          screen.getByText(
            `Selected catalog ID: ${specialItem.catalogObjectId}`,
          ),
        ).toBeTruthy();

        expect(selectedItemId()).toBe(
          specialItem.catalogObjectId,
        );

        expect(fetchMock).toHaveBeenCalledOnce();
      },
    );

    it("allows selecting another item after an analytics request fails", async () => {
      fetchMock.mockRejectedValueOnce(
        new Error("Synthetic rejected tracking request."),
      );

      renderCatalog();

      selectItem("Classic Milk Tea");

      // Allow the rejected Promise's catch handler to run.
      await Promise.resolve();

      selectItem("Mango Fruit Tea");

      expect(fetchMock).toHaveBeenCalledTimes(2);

      expect(trackingRequest(0).body).toEqual({
        itemId: milkTeaItem.catalogObjectId,
        itemName: milkTeaItem.name,
      });

      expect(trackingRequest(1).body).toEqual({
        itemId: fruitTeaItem.catalogObjectId,
        itemName: fruitTeaItem.name,
      });

      expect(
        screen.getByText(
          `Selected catalog ID: ${fruitTeaItem.catalogObjectId}`,
        ),
      ).toBeTruthy();

      expect(selectedItemId()).toBe(
        fruitTeaItem.catalogObjectId,
      );
    });
  });
});
