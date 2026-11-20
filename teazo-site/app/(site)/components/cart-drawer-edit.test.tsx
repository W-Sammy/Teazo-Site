// @vitest-environment jsdom

// Render the real bag, lazy customizer, availability handoff, and cart provider.
// Only browser integrations and the network are stubbed; no Square calls are made.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CART_STORAGE_KEY, CartProvider, useCart } from "@/app/context/cart-context";
import type { CartItem } from "@/app/types/checkout";
import type { MenuItem, CatalogAvailability } from "@/app/types/menu-item";
import CartDrawer from "./cart-drawer";

vi.mock("next/font/google", () => ({ Cabin_Sketch: () => ({ className: "" }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("./payment-badges", () => ({ default: () => null }));
vi.mock("@/app/components/turnstile-widget", () => ({ TURNSTILE_SITE_KEY: "test", default: () => null }));

const available: CatalogAvailability = { available: true, locationId: "LOC", reasons: [] };
const soldOut: CatalogAvailability = {
  available: false, locationId: "LOC", reasons: [{ code: "SOLD_OUT", message: "Sold out." }],
};

function product(id = "ITEM1", priceCents = 500): MenuItem {
  return {
    catalogObjectId: id, name: id, description: undefined, variationId: "VAR1", priceCents,
    currency: "USD", imageUrl: null, categories: [], availability: available,
    variations: [{ id: "VAR1", name: "Regular", priceCents, availability: available }],
    modifiers: [{ id: "LIST1", name: "Sugar", minSelectedModifiers: 0, maxSelectedModifiers: 1, options: [
      { id: "MOD1", name: "Half sweet", priceCents: 0, availability: available },
      { id: "MOD2", name: "Full sweet", priceCents: 0, availability: available },
    ] }],
  };
}

function line(cartItemId = "LINE1", catalogObjectId = "ITEM1", optionId = "MOD1"): CartItem {
  return {
    cartItemId, catalogObjectId, variationId: "VAR1", name: catalogObjectId,
    basePriceCents: 500, imageUrl: null, quantity: 2, notes: cartItemId, itemTotalCents: 1000,
    selectedModifiers: [{ modifierListId: "LIST1", modifierListName: "Sugar", optionId, optionName: optionId, priceCents: 0 }],
  };
}

function Controls() {
  const { openCart } = useCart();
  return <><button onClick={openCart}>Open bag</button><CartDrawer /></>;
}

type ProductRequest = {
  url: string;
  signal: AbortSignal;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};
let requests: ProductRequest[];
let now: number;

function savedItems(): CartItem[] {
  return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? "[]");
}

function mount(lines = [line()]) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  render(<CartProvider initialOpen><Controls /></CartProvider>);
}

async function edit(index = 0) {
  fireEvent.click((await screen.findAllByRole("button", { name: /^(Edit|Loading\.\.\.)$/ }))[index]);
}

async function respond(index: number, item = product()) {
  const response = Response.json(item);
  const json = vi.spyOn(response, "json");
  await act(async () => { requests[index].resolve(response); });
  await act(async () => { await vi.dynamicImportSettled(); });
  return json;
}

const updateButton = () => screen.getByRole("button", { name: /Update Drink|Checking availability/ }) as HTMLButtonElement;
const closeCustomizer = () => fireEvent.click(screen.getByRole("button", { name: "Close customizer" }));

describe("bag Edit availability handoff", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    requests = [];
    now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/square/products/")) {
        expect(options?.method ?? "GET").toBe("GET");
        expect(options?.cache).toBe("no-store");
        // Deliberately allow aborted requests to resolve to exercise obsolete completions.
        return new Promise<Response>((resolve, reject) => requests.push({
          url, signal: options!.signal as AbortSignal, resolve, reject,
        }));
      }
      if (url === "/api/website-content") return Promise.resolve(Response.json({
        address: {}, hours: [], holidays: [], onlineOrderingEnabled: true,
      }));
      if (url === "/api/square/catalog-revision") return Promise.resolve(Response.json({ revision: "1" }));
      throw new Error(`Unexpected request: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses one product GET and one body parse for first Edit, retaining choices and fresh prices", async () => {
    mount();
    await edit();
    expect(requests).toHaveLength(1);
    const item = product("ITEM1", 650);
    item.modifiers[0].options[0].priceCents = 75;
    const json = await respond(0, item);
    expect(screen.getByRole("radio", { name: /Half sweet/ }).getAttribute("aria-checked")).toBe("true");
    expect(updateButton().textContent).toContain("$14.50");
    fireEvent.click(updateButton());
    expect(savedItems()[0]).toMatchObject({
      cartItemId: "LINE1", variationId: "VAR1", quantity: 2, notes: "LINE1", basePriceCents: 650,
      itemTotalCents: 1450, selectedModifiers: [expect.objectContaining({ optionId: "MOD1", priceCents: 75 })],
    });
    expect(requests).toHaveLength(1);
    expect(json).toHaveBeenCalledTimes(1);
  });

  it.each(["item", "option", "group", "variation"])("uses the handed-off response to block an unavailable %s", async (change) => {
    mount();
    await edit();
    const item = product();
    if (change === "item") item.availability = soldOut;
    if (change === "option") item.modifiers[0].options[0].availability = soldOut;
    if (change === "group") item.modifiers[0].enabled = false;
    if (change === "variation") item.variations![0].availability = soldOut;
    await respond(0, item);
    expect(updateButton().disabled).toBe(true);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(requests).toHaveLength(1);
    if (change === "option" || change === "group") {
      fireEvent.click(screen.getByRole("button", { name: "Remove unavailable options" }));
      expect(updateButton().disabled).toBe(false);
    }
  });

  it("does not silently replace an edited variation removed from the catalog", async () => {
    mount();
    await edit();
    const item = product();
    item.variationId = "VAR2";
    item.variations = [{ id: "VAR2", name: "Large", priceCents: 700, availability: available }];
    await respond(0, item);
    expect(updateButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("selected size is no longer available");
    fireEvent.click(screen.getByRole("radio", { name: /Large/ }));
    expect(updateButton().disabled).toBe(false);
    fireEvent.click(updateButton());
    expect(savedItems()[0].variationId).toBe("VAR2");
  });

  it("reuses a fresh result when editing a second line with different choices", async () => {
    mount([line(), { ...line("LINE2", "ITEM1", "MOD2"), quantity: 3 }]);
    await edit();
    await respond(0);
    closeCustomizer();
    await edit(1);
    expect(await screen.findByRole("button", { name: /Update Drink/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Full sweet" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(updateButton());
    expect(savedItems()[1]).toMatchObject({ cartItemId: "LINE2", quantity: 3, notes: "LINE2" });
    expect(savedItems()[1].selectedModifiers[0].optionId).toBe("MOD2");
    expect(savedItems()[0].selectedModifiers[0].optionId).toBe("MOD1");
    expect(requests).toHaveLength(1);
  });

  it("opens immediately after expiry and waits for a new availability check before Update", async () => {
    mount(); await edit(); await respond(0); closeCustomizer();
    now += 10_001;
    await edit();
    await screen.findByRole("button", { name: /Update Drink/ });
    expect(requests).toHaveLength(2);
    fireEvent.click(updateButton());
    expect(updateButton().textContent).toContain("Checking availability");
    expect(savedItems()[0].basePriceCents).toBe(500);
    await respond(1, product("ITEM1", 700));
    await waitFor(() => expect(savedItems()[0].basePriceCents).toBe(700));
    // A confirmed refresh replaces the old cache and gets its own bounded window.
    await edit(); await screen.findByRole("button", { name: /Update Drink/ });
    expect(updateButton().textContent).toContain("$14.00");
    expect(requests).toHaveLength(2);
  });

  it("does not open a dismissed Edit, even when the bag reopens before its response", async () => {
    mount(); await edit();
    fireEvent.click(screen.getByRole("button", { name: "Close cart" }));
    expect(requests[0].signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Open bag" }));
    await respond(0);
    expect(screen.queryByRole("button", { name: /Update Drink/ })).toBeNull();
    await edit();
    expect(requests).toHaveLength(2);
    await respond(1);
    expect(updateButton()).toBeTruthy();
  });

  it("does not open the customizer after the bag is closed", async () => {
    mount(); await edit();
    fireEvent.click(screen.getByRole("button", { name: "Close cart" }));
    await respond(0);
    expect(screen.queryByRole("button", { name: /Update Drink/ })).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it.each(["ITEM1", "ITEM2"])("ignores an older response after selecting a newer line for %s", async (id) => {
    mount([line(), line("LINE2", id, "MOD2")]);
    await edit(); await edit(1);
    expect(requests[0].signal.aborted).toBe(true);
    await respond(1, product(id, 700));
    await respond(0, product("ITEM1", 400));
    expect(screen.getByRole("radio", { name: "Full sweet" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(updateButton());
    expect(savedItems()[1]).toMatchObject({ cartItemId: "LINE2", basePriceCents: 700 });
    await edit(1); await screen.findByRole("button", { name: /Update Drink/ });
    expect(updateButton().textContent).toContain("$14.00");
    expect(requests).toHaveLength(2);
  });

  it("allows retrying an initial failed Edit without caching the failure", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    mount(); await edit();
    await act(async () => requests[0].reject(new Error("offline")));
    await edit();
    expect(requests).toHaveLength(2);
    await respond(1);
    expect(updateButton().disabled).toBe(false);
    expect(errors).toHaveBeenCalled();
  });

  it("retries failed availability with a new GET and ignores the dismissed pending refresh", async () => {
    mount(); await edit(); await respond(0); closeCustomizer(); now += 10_001;
    await edit(); await screen.findByRole("button", { name: /Update Drink/ });
    await act(async () => requests[1].reject(new Error("offline")));
    expect(updateButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(requests).toHaveLength(3);
    closeCustomizer();
    expect(requests[2].signal.aborted).toBe(true);
    await edit(); await screen.findByRole("button", { name: /Update Drink/ });
    expect(requests).toHaveLength(4);
    await respond(3, product("ITEM1", 700));
    await respond(2, product("ITEM1", 400));
    expect(updateButton().textContent).toContain("$14.00");
    fireEvent.click(updateButton());
    expect(savedItems()[0].basePriceCents).toBe(700);
  });

  it("rejects a mismatched product response without caching it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount(); await edit(); await respond(0, product("WRONG"));
    expect(screen.queryByRole("button", { name: /Update Drink/ })).toBeNull();
    await edit(); await respond(1);
    expect(updateButton().disabled).toBe(false);
  });
});
