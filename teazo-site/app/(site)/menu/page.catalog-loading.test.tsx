/**
 * Public Menu catalog loading and failure-handling tests.
 *
 * Covers Square catalog requests, empty catalogs, HTTP and network
 * failures, malformed data, unavailable products, and safe fallbacks.
 *
 * Also verifies Square category grouping, duplicate prevention,
 * item availability, pricing, image URLs, and navigation parameters.
 *
 * External network requests and server dependencies are mocked.
 * No production Square, database, or storage records are accessed.
 */

// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuCatalogProps } from "../components/menu-catalog";
import MenuPage from "./page";
import { getMenuDisplayState, initializeMenuDisplayItems } from "@/app/lib/queries/menu-display";

vi.mock("@/app/lib/queries/menu-display", () => ({ getMenuDisplayState: vi.fn(), initializeMenuDisplayItems: vi.fn() }));

vi.mock("next/font/google", () => ({
  Cabin_Sketch: () => ({ className: "mock-cabin" }),
  Montserrat: () => ({ className: "mock-montserrat" }),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => createElement("img", { src, alt }),
}));

vi.mock("@/app/lib/queries/catalog-revision", () => ({
  getMenuRevision: vi.fn(async () => "test-revision"),
}));

vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: vi.fn(async () => ({
    logo: "/TEAZO_logo.svg",
  })),
}));

vi.mock("@/app/components/catalog-change-notice", () => ({
  default: () => null,
}));

vi.mock("@/app/components/bubble-field", () => ({
  BubbleField: () => null,
}));

vi.mock("@/app/components/general-button", () => ({
  default: ({
    text,
    href,
  }: {
    text: string;
    href: string;
  }) => <a href={href}>{text}</a>,
}));

vi.mock("../components/sub-title", () => ({
  default: ({ text }: { text: string }) => <p>{text}</p>,
}));

// Represent the properties passed by the server page to the already
// separately tested client-side MenuCatalog component.
vi.mock("../components/menu-catalog", () => ({
  default: ({
    sections,
    initialItemId,
  }: MenuCatalogProps) => (
    <div
      data-testid="public-menu-catalog"
      data-initial-item={initialItemId ?? ""}
    >
      {sections.map((section) => (
        <section
          key={section.id}
          data-testid={`section-${section.id}`}
        >
          <h2>{section.title}</h2>

          {section.subtitle && <p>{section.subtitle}</p>}

          {section.items.map((item) => (
            <article
              key={item.catalogObjectId}
              data-testid={`card-${section.id}-${item.catalogObjectId}`}
              data-item-id={item.catalogObjectId}
              data-category-id={item.categoryId ?? ""}
              data-price-cents={item.priceCents}
              data-variation-id={item.variationId ?? ""}
              data-image-url={item.imageUrl ?? ""}
            >
              <h3>{item.name}</h3>
              {item.description && <p>{item.description}</p>}
            </article>
          ))}
        </section>
      ))}
    </div>
  ),
}));

const fetchMock = vi.fn<typeof fetch>();

const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

const available = {
  available: true,
  locationId: "location-test",
  reasons: [],
};

const unavailable = {
  available: false,
  locationId: "location-test",
  reasons: [
    {
      code: "SOLD_OUT",
      message: "Sold out",
    },
  ],
};

function catalogItem(overrides: Record<string, unknown> = {}) {
  return {
    catalogObjectId: "tea-1",
    name: "Milk Tea",
    description: "Classic milk tea",
    variationId: "variation-1",
    priceCents: 575,
    currency: "USD",
    imageUrl: null,
    categories: [
      { id: "milk-tea", name: "Milk Tea" },
    ],
    modifiers: [],
    variations: [
      {
        id: "variation-1",
        name: "Regular",
        priceCents: 575,
        availability: available,
      },
    ],
    availability: available,
    ...overrides,
  };
}

function response(
  status: number,
  body: unknown,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function returnCatalog(
  body: unknown,
  status = 200,
) {
  fetchMock.mockResolvedValueOnce(
    response(status, body),
  );
}

async function renderPage(itemId?: string) {
  const element = await MenuPage({
    searchParams: Promise.resolve(
      itemId ? { item: itemId } : {},
    ),
  });

  return render(element);
}

function catalog() {
  return screen.getByTestId("public-menu-catalog");
}

function section(id: string) {
  return screen.getByTestId(`section-${id}`);
}

function card(sectionId: string, itemId: string) {
  return screen.getByTestId(
    `card-${sectionId}-${itemId}`,
  );
}

function expectUnavailableState() {
  expect(
    screen.getByRole("heading", {
      name: "Menu temporarily unavailable",
    }),
  ).toBeTruthy();

  expect(
    screen.getByRole("button", {
      name: "Try again",
    }),
  ).toBeTruthy();

  expect(
    screen.queryByTestId("public-menu-catalog"),
  ).toBeNull();

  expect(
    screen.queryByRole("heading", {
      name: "No menu items available",
    }),
  ).toBeNull();
}

function expectEmptyState() {
  expect(
    screen.getByRole("heading", {
      name: "No menu items available",
    }),
  ).toBeTruthy();

  expect(
    screen.queryByTestId("public-menu-catalog"),
  ).toBeNull();

  expect(
    screen.queryByRole("heading", {
      name: "Menu temporarily unavailable",
    }),
  ).toBeNull();
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(initializeMenuDisplayItems).mockReset().mockResolvedValue(undefined);
  // Mapping tests use categories the admin has already published.
  vi.mocked(getMenuDisplayState).mockReset().mockResolvedValue({
    sections: ["milk-tea", "specials", "snack", "category-a", "category-b"].map((id) => ({
      id: `category:${id}`, squareCategoryId: id, title: id, sectionType: "square",
      sortOrder: 0, isPublished: true, defaultItemVisible: true, itemIds: [],
    })),
    items: [],
  });

  vi.stubGlobal("fetch", fetchMock);

  process.env.NEXT_PUBLIC_BASE_URL =
    "https://teazo.example/base/";

  // Failure cases deliberately log their caught errors.
  // Suppress the expected log output in this test file.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  if (originalBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
  }
});

describe("Public Menu catalog loading", () => {
  it("keeps unconfigured new Square categories off the public menu", async () => {
    vi.mocked(getMenuDisplayState).mockResolvedValue({ sections: [], items: [] });
    returnCatalog([catalogItem()]);
    await renderPage();
    expectEmptyState();
  });

  it("keeps a hidden category off the public menu even if an item is explicitly visible", async () => {
    vi.mocked(getMenuDisplayState).mockResolvedValue({
      sections: [], items: [{ squareCatalogObjectId: "tea-1", visible: true }],
    });
    returnCatalog([catalogItem()]);
    await renderPage();
    expectEmptyState();
  });
  it("shows an unavailable menu when display settings fail, including uncategorized items", async () => {
    vi.mocked(getMenuDisplayState).mockRejectedValue(new Error("Settings unavailable"));
    returnCatalog([catalogItem({ categories: [] })]);
    await renderPage();
    expectUnavailableState();
    expect(screen.queryByText("Milk Tea")).toBeNull();
  });

  it("initializes newly seen items before rendering and uses their persisted visibility", async () => {
    const state = await vi.mocked(getMenuDisplayState)();
    vi.mocked(getMenuDisplayState)
      .mockResolvedValueOnce(state)
      .mockResolvedValue({ ...state, items: [{ squareCatalogObjectId: "tea-1", visible: false }] });
    returnCatalog([catalogItem()]);
    await renderPage();
    expect(initializeMenuDisplayItems).toHaveBeenCalledWith(
      [catalogItem()], state.sections,
    );
    expectEmptyState();
  });

  it("does not reinitialize existing explicit item settings", async () => {
    const state = await vi.mocked(getMenuDisplayState)();
    vi.mocked(getMenuDisplayState).mockResolvedValue({
      ...state, items: [{ squareCatalogObjectId: "tea-1", visible: true }],
    });
    returnCatalog([catalogItem()]);
    await renderPage();
    expect(initializeMenuDisplayItems).not.toHaveBeenCalled();
    expect(card("category:milk-tea", "tea-1")).toBeTruthy();
  });

  it("does not publish items if their initial display settings cannot be saved", async () => {
    vi.mocked(initializeMenuDisplayItems).mockRejectedValue(new Error("Write failed"));
    returnCatalog([catalogItem()]);
    await renderPage();
    expectUnavailableState();
  });

  it.each([
    { visible: true, published: true, availableItem: true, expected: true },
    { visible: false, published: true, availableItem: true, expected: false },
    { visible: true, published: false, availableItem: true, expected: false },
    { visible: true, published: true, availableItem: false, expected: false },
  ])("respects custom category/item visibility and availability: %j", async ({ visible, published, availableItem, expected }) => {
    vi.mocked(getMenuDisplayState).mockResolvedValue({
      sections: [{
        id: "custom", squareCategoryId: null, title: "Favorites", sectionType: "custom",
        sortOrder: 0, isPublished: published, defaultItemVisible: true, itemIds: ["deleted-id", "tea-1"],
      }],
      items: [{ squareCatalogObjectId: "tea-1", visible }],
    });
    returnCatalog([catalogItem(availableItem ? {} : {
      availability: unavailable,
      variations: [{ id: "variation-1", name: "Regular", priceCents: 575, availability: unavailable }],
    })]);
    await renderPage();
    if (expected) {
      expect(card("custom:custom", "tea-1")).toBeTruthy();
      expect(screen.queryByTestId("section-category:milk-tea")).toBeNull();
      expect(within(section("custom:custom")).getAllByRole("article")).toHaveLength(1);
    } else {
      expectEmptyState();
    }
  });

  it.each([false, true])("honors saved Uncategorized category visibility %s", async (published) => {
    vi.mocked(getMenuDisplayState).mockResolvedValue({
      sections: [{
        id: "category:sandbox:uncategorized", squareCategoryId: null, title: "Uncategorized", sectionType: "uncategorized",
        sortOrder: 0, isPublished: published, defaultItemVisible: true, itemIds: [],
      }], items: [{ squareCatalogObjectId: "tea-1", visible: true }],
    });
    returnCatalog([catalogItem({ categories: [] })]);
    await renderPage();
    if (published) expect(card("uncategorized", "tea-1")).toBeTruthy();
    else expectEmptyState();
  });

  describe("Catalog request configuration", () => {
    it("fetches the configured Square products endpoint without caching", async () => {
      returnCatalog([catalogItem()]);

      await renderPage();

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];

      expect(String(url)).toBe(
        "https://teazo.example/api/square/products",
      );

      expect(options).toEqual(
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          headers: {
            Accept: "application/json",
          },
        }),
      );

      expect(options?.signal).toBeDefined();
      expect(catalog()).toBeTruthy();
    });

    it("passes the selected item query parameter to the catalog", async () => {
      returnCatalog([catalogItem()]);

      await renderPage("tea-1");

      expect(
        catalog().getAttribute("data-initial-item"),
      ).toBe("tea-1");
    });

    it("does not invent a selected item without a query parameter", async () => {
      returnCatalog([catalogItem()]);

      await renderPage();

      expect(
        catalog().getAttribute("data-initial-item"),
      ).toBe("");
    });
  });

  describe("Empty and unavailable catalogs", () => {
    it("shows the empty catalog message for a valid empty response", async () => {
      returnCatalog([]);

      await renderPage();

      expectEmptyState();

      expect(
        screen.getByRole("link", {
          name: "DOWNLOAD",
        }).getAttribute("href"),
      ).toBe("/static-menu");
    });

    it("excludes unavailable catalog items", async () => {
      returnCatalog([
        catalogItem({
          availability: unavailable,
        }),
      ]);

      await renderPage();

      expectEmptyState();
    });

    it("excludes items without available variations", async () => {
      returnCatalog([
        catalogItem({
          variations: [],
        }),
      ]);

      await renderPage();

      expectEmptyState();
    });

    it("does not treat a missing availability snapshot as available", async () => {
      returnCatalog([
        catalogItem({
          availability: undefined,
        }),
      ]);

      await renderPage();

      expectEmptyState();
    });

    it("keeps available items visible while excluding unavailable ones", async () => {
      returnCatalog([
        catalogItem(),
        catalogItem({
          catalogObjectId: "sold-out",
          name: "Sold Out Drink",
          availability: unavailable,
        }),
      ]);

      await renderPage();

      expect(
        card("category:milk-tea", "tea-1"),
      ).toBeTruthy();

      expect(
        screen.queryByText("Sold Out Drink"),
      ).toBeNull();
    });
  });

  describe("API and configuration failures", () => {
    it.each([401, 429, 500, 503])(
      "shows the unavailable state for HTTP %i",
      async (status) => {
        returnCatalog(
          { error: "Square unavailable" },
          status,
        );

        await renderPage();

        expectUnavailableState();
      },
    );

    it("handles a rejected Square request", async () => {
      fetchMock.mockRejectedValueOnce(
        new TypeError("Network failure"),
      );

      await renderPage();

      expectUnavailableState();
    });

    it("handles a malformed JSON response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected JSON");
        },
      } as unknown as Response);

      await renderPage();

      expectUnavailableState();
    });

    it.each([
      null,
      {},
      { items: [] },
      [catalogItem({ priceCents: "five dollars" })],
    ])(
      "rejects an invalid catalog response %#",
      async (body) => {
        returnCatalog(body);

        await renderPage();

        expectUnavailableState();
      },
    );

    it("fails safely when the configured base URL is missing", async () => {
      delete process.env.NEXT_PUBLIC_BASE_URL;

      await renderPage();

      expectUnavailableState();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      "ftp://teazo.example/",
      "https://user:password@teazo.example/",
      "not-a-valid-url",
    ])(
      "rejects an unsafe or invalid configured base URL %s",
      async (baseUrl) => {
        process.env.NEXT_PUBLIC_BASE_URL = baseUrl;

        await renderPage();

        expectUnavailableState();
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it("does not display an earlier catalog after a subsequent request fails", async () => {
      returnCatalog([catalogItem()]);

      await renderPage();

      expect(catalog()).toBeTruthy();

      cleanup();

      returnCatalog(
        { error: "Square unavailable" },
        503,
      );

      await renderPage();

      expectUnavailableState();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("Square category and item mapping", () => {
    it.each([
      ["milk-tea", "specials", "uncategorized", "custom-picks"],
      ["custom-picks", "uncategorized", "milk-tea", "specials"],
      ["specials", "milk-tea", "custom-picks", "uncategorized"],
    ])("uses saved category order %j / %j / %j / %j", async (...order) => {
      const titles: Record<string, string> = {
        "milk-tea": "Milk Tea",
        specials: "TEAZO Special",
        uncategorized: "Other Menu Items",
        "custom-picks": "Custom Picks",
      };
      vi.mocked(getMenuDisplayState).mockResolvedValue({
        // Saved Square IDs differ from both the raw Square category IDs and
        // the rendered section IDs, just as they do in the database.
        sections: ["milk-tea", "specials", "uncategorized", "custom-picks"].map((id) => ({
          id: id === "custom-picks" ? id : `category:sandbox:${id}`,
          squareCategoryId: id === "milk-tea" || id === "specials" ? id : null,
          title: titles[id],
          sectionType: id === "custom-picks" ? "custom" : id === "uncategorized" ? "uncategorized" : "square",
          sortOrder: order.indexOf(id),
          isPublished: true,
          defaultItemVisible: true,
          itemIds: id === "custom-picks" ? ["tea-1"] : [],
        })),
        items: [],
      });
      returnCatalog([
        catalogItem(),
        catalogItem({
          catalogObjectId: "special",
          categories: [{ id: "specials", name: "TEAZO Special" }],
        }),
        catalogItem({ catalogObjectId: "uncategorized-item", categories: [] }),
      ]);

      await renderPage();

      expect(within(catalog()).getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent))
        .toEqual(order.map((id) => titles[id]));
    });

    it("keeps TEAZO specials and regular categories distinct", async () => {
      returnCatalog([
        catalogItem({
          catalogObjectId: "regular",
        }),
        catalogItem({
          catalogObjectId: "special",
          name: "Featured Drink",
          categories: [
            { id: "specials", name: "TEAZO Special" },
          ],
        }),
      ]);

      await renderPage();

      const sections = within(catalog()).getAllByRole(
        "heading",
        { level: 2 },
      );

      expect(sections.map((heading) => heading.textContent))
        .toEqual(["Milk Tea", "TEAZO Special"]);

      expect(
        card("category:specials", "special"),
      ).toBeTruthy();

      expect(
        card("category:milk-tea", "regular"),
      ).toBeTruthy();
    });

    it("displays an item in each actual category without duplicating repeated membership", async () => {
      returnCatalog([
        catalogItem({
          categories: [
            { id: "milk-tea", name: "Milk Tea" },
            { id: "milk-tea", name: "Milk Tea" },
            { id: "snack", name: "Snack" },
          ],
        }),
        catalogItem({
          name: "Duplicate Catalog Record",
        }),
      ]);

      await renderPage();

      expect(
        within(section("category:milk-tea"))
          .getAllByRole("article"),
      ).toHaveLength(1);

      expect(
        within(section("category:snack"))
          .getAllByRole("article"),
      ).toHaveLength(1);

      expect(
        screen.queryByText("Duplicate Catalog Record"),
      ).toBeNull();
    });

    it("displays uncategorized items without inventing category membership", async () => {
      returnCatalog([
        catalogItem({
          categories: [],
        }),
      ]);

      await renderPage();

      const item = card("uncategorized", "tea-1");

      expect(
        section("uncategorized").textContent,
      ).toContain("Other Menu Items");

      expect(
        item.getAttribute("data-category-id"),
      ).toBe("");
    });

    it("resolves a category label supplied by another catalog item", async () => {
      returnCatalog([
        catalogItem({
          catalogObjectId: "tea-a",
          categories: [
            { id: "milk-tea", name: null },
          ],
        }),
        catalogItem({
          catalogObjectId: "tea-b",
          categories: [
            { id: "milk-tea", name: "Milk Tea" },
          ],
        }),
      ]);

      await renderPage();

      expect(
        within(section("category:milk-tea"))
          .getByRole("heading", {
            name: "Milk Tea",
            level: 2,
          }),
      ).toBeTruthy();

      expect(
        card("category:milk-tea", "tea-a"),
      ).toBeTruthy();

      expect(
        card("category:milk-tea", "tea-b"),
      ).toBeTruthy();
    });

    it("preserves separate Square category IDs even when their names match", async () => {
      returnCatalog([
        catalogItem({
          catalogObjectId: "tea-a",
          categories: [
            { id: "category-a", name: "Milk Tea" },
          ],
        }),
        catalogItem({
          catalogObjectId: "tea-b",
          categories: [
            { id: "category-b", name: "Milk Tea" },
          ],
        }),
      ]);

      await renderPage();

      expect(section("category:category-a")).toBeTruthy();
      expect(section("category:category-b")).toBeTruthy();

      expect(
        card("category:category-a", "tea-a"),
      ).toBeTruthy();

      expect(
        card("category:category-b", "tea-b"),
      ).toBeTruthy();
    });

    it("maps only available variations and uses their current price", async () => {
      returnCatalog([
        catalogItem({
          variations: [
            {
              id: "sold-out-variation",
              name: "Regular",
              priceCents: 575,
              availability: unavailable,
            },
            {
              id: "available-variation",
              name: "Large",
              priceCents: 650,
              availability: available,
            },
          ],
        }),
      ]);

      await renderPage();

      const item = card("category:milk-tea", "tea-1");

      expect(
        item.getAttribute("data-variation-id"),
      ).toBe("available-variation");

      expect(
        item.getAttribute("data-price-cents"),
      ).toBe("650");
    });

    it("rejects unsafe image URLs while preserving allowed Square image URLs", async () => {
      const squareImage =
        "https://items-images-production.s3.us-west-2.amazonaws.com/tea.png";

      returnCatalog([
        catalogItem({
          catalogObjectId: "unsafe-image",
          imageUrl: "http://untrusted.example/tea.png",
        }),
        catalogItem({
          catalogObjectId: "safe-image",
          name: "Safe Image Tea",
          imageUrl: squareImage,
        }),
      ]);

      await renderPage();

      expect(
        card(
          "category:milk-tea",
          "unsafe-image",
        ).getAttribute("data-image-url"),
      ).toBe("");

      expect(
        card(
          "category:milk-tea",
          "safe-image",
        ).getAttribute("data-image-url"),
      ).toBe(squareImage);
    });
  });
});
