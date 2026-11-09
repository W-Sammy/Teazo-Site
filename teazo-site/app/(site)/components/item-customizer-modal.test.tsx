/**
 * Item customizer background-availability tests.
 *
 * Covers choosing options before the fresh availability check returns,
 * finishing an early Add to Bag once the check confirms it, refusing it
 * when the check rejects the choices, and blocking on a failed check.
 * Cart, fonts, images, and network are mocked; no Square requests are made.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { CatalogAvailability, MenuItem as ApiMenuItem } from "@/app/types/menu-item";
import type { MenuItem } from "./menu-item-card";

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  openCart: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/app/context/cart-context", () => ({
  useCart: () => ({ addItem: mocks.addItem, updateItem: vi.fn(), openCart: mocks.openCart }),
  MIN_ITEM_QUANTITY: 1,
  MAX_ITEM_QUANTITY: 50,
}));
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "test-montserrat" }),
  Cabin_Sketch: () => ({ className: "test-cabin" }),
}));
vi.mock("next/image", () => ({ default: () => null }));

import ItemCustomizerModal from "./item-customizer-modal";

const available: CatalogAvailability = { available: true, locationId: "LOC", reasons: [] };
const unavailable: CatalogAvailability = { available: false, locationId: "LOC", reasons: [{ code: "SOLD_OUT", message: "Sold out." }] };

function makeApiItem(mod2 = available): ApiMenuItem {
  return {
    availability: available,
    catalogObjectId: "ITEM1",
    name: "Milk Tea",
    description: undefined,
    variationId: "VAR1",
    priceCents: 500,
    currency: "USD",
    imageUrl: null,
    categories: [],
    variations: [{ id: "VAR1", name: "Regular", priceCents: 500, availability: available }],
    modifiers: [{
      id: "LIST1",
      name: "Sugar",
      minSelectedModifiers: 0,
      maxSelectedModifiers: 1,
      options: [
        { id: "MOD1", name: "Half sweet", priceCents: 0, availability: available },
        { id: "MOD2", name: "Full sweet", priceCents: 0, availability: mod2 },
      ],
    }],
  };
}

const pageItem = makeApiItem() as unknown as MenuItem;

/** Holds the availability response until the test releases it. */
function holdAvailability() {
  let release!: (response: Response) => void;
  mocks.fetch.mockImplementation(
    () => new Promise<Response>((resolve) => { release = resolve; }),
  );
  return {
    respondWith: (item: ApiMenuItem) => act(async () => { release(Response.json(item)); }),
    fail: () => act(async () => { release(new Response("{}", { status: 503 })); }),
  };
}

function renderCustomizer() {
  const onClose = vi.fn();
  render(<ItemCustomizerModal item={pageItem} onClose={onClose} />);
  return { onClose };
}

const addButton = () => screen.getByRole("button", { name: /Add to Bag|Checking availability/ }) as HTMLButtonElement;

describe("customizer background availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lets customers choose options before the fresh check returns", async () => {
    holdAvailability();
    renderCustomizer();

    const fullSweet = await screen.findByRole("radio", { name: /Full sweet/ });
    expect((fullSweet as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(fullSweet);

    expect(fullSweet.getAttribute("aria-checked")).toBe("true");
    expect(addButton().disabled).toBe(false);
  });

  it("finishes an early Add to Bag once the check confirms it", async () => {
    const check = holdAvailability();
    const { onClose } = renderCustomizer();
    fireEvent.click(await screen.findByRole("radio", { name: /Full sweet/ }));

    fireEvent.click(addButton());

    expect(mocks.addItem).not.toHaveBeenCalled();
    expect(addButton().textContent).toContain("Checking availability");
    expect(addButton().disabled).toBe(true);

    await check.respondWith(makeApiItem());

    await waitFor(() => expect(mocks.addItem).toHaveBeenCalledTimes(1));
    expect(mocks.addItem.mock.calls[0][0]).toMatchObject({
      catalogObjectId: "ITEM1",
      variationId: "VAR1",
      selectedModifiers: [expect.objectContaining({ optionId: "MOD2" })],
    });
    expect(mocks.openCart).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not add when the check finds the chosen option sold out", async () => {
    const check = holdAvailability();
    const { onClose } = renderCustomizer();
    fireEvent.click(await screen.findByRole("radio", { name: /Full sweet/ }));
    fireEvent.click(addButton());

    await check.respondWith(makeApiItem(unavailable));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no longer available/));
    expect(mocks.addItem).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(addButton().textContent).toContain("Add to Bag");
    expect(addButton().disabled).toBe(true);
  });

  it("adds immediately when the check has already confirmed", async () => {
    const check = holdAvailability();
    renderCustomizer();
    await screen.findByRole("radio", { name: /Full sweet/ });
    await check.respondWith(makeApiItem());

    fireEvent.click(addButton());

    expect(mocks.addItem).toHaveBeenCalledTimes(1);
  });

  it("does not add later if the check rejects the early request and the customer fixes the choice", async () => {
    const check = holdAvailability();
    renderCustomizer();
    fireEvent.click(await screen.findByRole("radio", { name: /Full sweet/ }));
    fireEvent.click(addButton());
    await check.respondWith(makeApiItem(unavailable));
    await waitFor(() => screen.getByRole("alert"));

    fireEvent.click(screen.getByRole("button", { name: "Remove unavailable options" }));

    expect(mocks.addItem).not.toHaveBeenCalled();
  });

  it("blocks adding and offers a retry when the check fails", async () => {
    const check = holdAvailability();
    renderCustomizer();
    await screen.findByRole("radio", { name: /Full sweet/ });

    await check.fail();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Could not confirm availability/));
    expect(addButton().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(mocks.addItem).not.toHaveBeenCalled();
  });
});
