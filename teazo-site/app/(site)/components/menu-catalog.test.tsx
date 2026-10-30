/**
 * Public Menu catalog interaction tests.
 *
 * Covers featured and regular sections, item selection,
 * URL synchronization, direct item navigation, modal
 * dismissal, and browser history navigation.
 *
 * Child components are mocked to isolate MenuCatalog.
 * No Square requests or production data are used.
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
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import type { MenuItem } from "./menu-item-card";
import type { MenuSection } from "./menu-catalog";

vi.mock("./menu-items-section", () => ({
  default: ({
    title,
    subtitle,
    items,
    onCustomizeItem,
  }: {
    title: string;
    subtitle?: string;
    items: MenuItem[];
    onCustomizeItem: (item: MenuItem) => void;
  }) => (
    <section aria-label={title}>
      <h2>{title}</h2>

      {subtitle && <p>{subtitle}</p>}

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
        <p>Selected item: {item.catalogObjectId}</p>

        <button type="button" onClick={onClose}>
          Close Customizer
        </button>
      </div>
    ) : null,
}));

import MenuCatalog from "./menu-catalog";

const specialItem: MenuItem = {
  catalogObjectId: "SPECIAL-1",
  name: "Signature Tea",
  variationId: "SPECIAL-V1",
  priceCents: 650,
  currency: "USD",
  imageUrl: null,
  categoryId: "SPECIAL",
  categoryName: "TEAZO Special",
  description: "Signature drink",
  modifiers: [],
};

const milkTeaItem: MenuItem = {
  catalogObjectId: "MILK-1",
  name: "Classic Milk Tea",
  variationId: "MILK-V1",
  priceCents: 550,
  currency: "USD",
  imageUrl: null,
  categoryId: "MILK",
  categoryName: "Milk Tea",
  description: "Classic drink",
  modifiers: [],
};

const fruitTeaItem: MenuItem = {
  catalogObjectId: "FRUIT-1",
  name: "Mango Fruit Tea",
  variationId: "FRUIT-V1",
  priceCents: 575,
  currency: "USD",
  imageUrl: null,
  categoryId: "FRUIT",
  categoryName: "Fresh Fruit Tea",
  description: "Fruit drink",
  modifiers: [],
};

const specialSections: MenuSection[] = [
  {
    id: "special",
    title: "TEAZO Special",
    subtitle: "Featured drinks",
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
    title: "Fresh Fruit Tea",
    items: [fruitTeaItem],
  },
];

function renderCatalog(initialItemId?: string) {
  return render(
    <MenuCatalog
      specialSections={specialSections}
      menuSections={menuSections}
      initialItemId={initialItemId}
      headingClassName="test-heading"
      bodyClassName="test-body"
    />,
  );
}

function selectedItemId() {
  return new URLSearchParams(
    window.location.search,
  ).get("item");
}

describe("Public Menu catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    window.history.replaceState(
      {},
      "",
      "/menu",
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("Menu section rendering", () => {
    it("renders featured and regular Menu sections", () => {
      renderCatalog();

      expect(
        screen.getByRole("heading", {
          name: "TEAZO Special",
        }),
      ).toBeTruthy();

      expect(
        screen.getByRole("heading", {
          name: "Milk Tea",
        }),
      ).toBeTruthy();

      expect(
        screen.getByRole("heading", {
          name: "Fresh Fruit Tea",
        }),
      ).toBeTruthy();
    });

    it("preserves each section's catalog items", () => {
      renderCatalog();

      expect(
        screen.getByRole("button", {
          name: "Signature Tea",
        }),
      ).toBeTruthy();

      expect(
        screen.getByRole("button", {
          name: "Classic Milk Tea",
        }),
      ).toBeTruthy();

      expect(
        screen.getByRole("button", {
          name: "Mango Fruit Tea",
        }),
      ).toBeTruthy();
    });

    it("renders featured section subtitles", () => {
      renderCatalog();

      expect(
        screen.getByText("Featured drinks"),
      ).toBeTruthy();
    });

    it("renders an empty catalog without an item dialog", () => {
      render(
        <MenuCatalog
          specialSections={[]}
          menuSections={[]}
          headingClassName="test-heading"
          bodyClassName="test-body"
        />,
      );

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();

      expect(
        screen.queryByRole("button", {
          name: "Classic Milk Tea",
        }),
      ).toBeNull();
    });
  });

  describe("Item selection and customization", () => {
    it("opens the selected item's customizer", () => {
      renderCatalog();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Classic Milk Tea",
        }),
      );

      expect(
        screen.getByRole("dialog", {
          name: "Item Customizer",
        }),
      ).toBeTruthy();

      expect(
        screen.getByText("Selected item: MILK-1"),
      ).toBeTruthy();
    });

    it("updates the URL with the selected catalog ID", () => {
      renderCatalog();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Mango Fruit Tea",
        }),
      );

      expect(selectedItemId()).toBe("FRUIT-1");
    });

    it("allows direct navigation to a valid item", () => {
      window.history.replaceState(
        {},
        "",
        "/menu?item=SPECIAL-1",
      );

      renderCatalog("SPECIAL-1");

      expect(
        screen.getByText(
          "Selected item: SPECIAL-1",
        ),
      ).toBeTruthy();
    });

    it("does not open an unknown item", () => {
      renderCatalog("UNKNOWN-ITEM");

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();
    });

    it("does not open a customizer without an item ID", () => {
      renderCatalog();

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();
    });

    it("closes the customizer and removes the item query parameter", () => {
      renderCatalog();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Classic Milk Tea",
        }),
      );

      expect(selectedItemId()).toBe("MILK-1");

      fireEvent.click(
        screen.getByRole("button", {
          name: "Close Customizer",
        }),
      );

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();

      expect(selectedItemId()).toBeNull();
    });
  });

  describe("Browser URL preservation", () => {
    it("preserves unrelated query parameters when selecting an item", () => {
      window.history.replaceState(
        {},
        "",
        "/menu?source=homepage",
      );

      renderCatalog();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Signature Tea",
        }),
      );

      const params = new URLSearchParams(
        window.location.search,
      );

      expect(params.get("source")).toBe(
        "homepage",
      );

      expect(params.get("item")).toBe(
        "SPECIAL-1",
      );
    });

    it("preserves unrelated parameters when closing the customizer", () => {
      window.history.replaceState(
        {},
        "",
        "/menu?source=homepage",
      );

      renderCatalog();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Signature Tea",
        }),
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Close Customizer",
        }),
      );

      const params = new URLSearchParams(
        window.location.search,
      );

      expect(params.get("source")).toBe(
        "homepage",
      );

      expect(params.has("item")).toBe(false);
    });

    it("updates the selected item on browser history navigation", () => {
      renderCatalog();

      window.history.replaceState(
        {},
        "",
        "/menu?item=MILK-1",
      );

      fireEvent.popState(window);

      expect(
        screen.getByText("Selected item: MILK-1"),
      ).toBeTruthy();

      window.history.replaceState(
        {},
        "",
        "/menu?item=FRUIT-1",
      );

      fireEvent.popState(window);

      expect(
        screen.getByText("Selected item: FRUIT-1"),
      ).toBeTruthy();
    });

    it("closes the customizer when browser navigation removes the item", () => {
      renderCatalog();

      window.history.replaceState(
        {},
        "",
        "/menu?item=MILK-1",
      );

      fireEvent.popState(window);

      expect(
        screen.getByRole("dialog"),
      ).toBeTruthy();

      window.history.replaceState(
        {},
        "",
        "/menu",
      );

      fireEvent.popState(window);

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();
    });

    it("closes the customizer for an unknown history item", () => {
      renderCatalog();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Classic Milk Tea",
        }),
      );

      window.history.replaceState(
        {},
        "",
        "/menu?item=NOT-FOUND",
      );

      fireEvent.popState(window);

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();
    });
  });
});
