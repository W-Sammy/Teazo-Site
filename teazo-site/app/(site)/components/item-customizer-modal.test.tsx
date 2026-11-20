/**
 * Item customizer availability, selection, and render regression tests.
 *
 * Covers choosing options before the fresh availability check returns,
 * finishing an early Add to Bag once the check confirms it, refusing it
 * when the check rejects the choices, and blocking on a failed check.
 * Cart, fonts, images, and network are mocked; no Square requests are made.
 */

// @vitest-environment jsdom

import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { CatalogAvailability, MenuItem as ApiMenuItem } from "@/app/types/menu-item";
import type { MenuItem } from "./menu-item-card";

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  openCart: vi.fn(),
  fetch: vi.fn(),
  preloadCartInteriorModule: vi.fn(),
}));

vi.mock("./cart-drawer", () => ({ preloadCartInteriorModule: mocks.preloadCartInteriorModule }));

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

import ItemCustomizerModal, {
  ModifierOptionButton,
  ModifierGroupSection,
  type ModifierOptionButtonProps,
  type ModifierGroupSectionProps,
} from "./item-customizer-modal";

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

function makeMultiModItem(): ApiMenuItem {
  return {
    ...makeApiItem(),
    modifiers: [
      {
        id: "SWEET",
        name: "Sweetness",
        minSelectedModifiers: 1,
        maxSelectedModifiers: 1,
        options: [
          { id: "SW1", name: "100% Sweet", priceCents: 0, availability: available, onByDefault: true },
          { id: "SW2", name: "50% Sweet", priceCents: 0, availability: available },
        ],
      },
      {
        id: "ICE",
        name: "Ice Level",
        minSelectedModifiers: 1,
        maxSelectedModifiers: 1,
        options: [
          { id: "ICE1", name: "Regular Ice", priceCents: 0, availability: available, onByDefault: true },
          { id: "ICE2", name: "Less Ice", priceCents: 0, availability: available },
        ],
      },
      {
        id: "TOP",
        name: "Toppings",
        minSelectedModifiers: 0,
        maxSelectedModifiers: 3,
        options: [
          { id: "TOP1", name: "Honey Boba", priceCents: 75, availability: available },
          { id: "TOP2", name: "Pudding", priceCents: 75, availability: available },
        ],
      },
    ],
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
    vi.restoreAllMocks();
  });

  it("lets customers choose options before the fresh check returns", async () => {
    holdAvailability();
    renderCustomizer();
    expect(mocks.preloadCartInteriorModule).toHaveBeenCalledTimes(1);

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

  it.each(["expired", "different product", "future timestamp"])("does not confirm availability from a snapshot with %s", async (kind) => {
    const check = holdAvailability();
    const snapshotItem = makeApiItem();
    if (kind === "different product") snapshotItem.catalogObjectId = "OTHER";
    const fetchedAt = Date.now() + (kind === "future timestamp" ? 60_000 : kind === "expired" ? -10_001 : 0);
    render(<ItemCustomizerModal
      item={pageItem}
      initialAvailability={{ item: snapshotItem, fetchedAt }}
      onClose={vi.fn()}
    />);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole("radio", { name: "Full sweet" }));
    fireEvent.click(addButton());
    expect(mocks.addItem).not.toHaveBeenCalled();
    await check.respondWith(makeApiItem(unavailable));
    expect(addButton().disabled).toBe(true);
    expect(mocks.addItem).not.toHaveBeenCalled();
  });

  describe("Modifier memoization and performance", () => {
    it("updates option callbacks, labels, prices, selection, disabled state, and role", () => {
      const originalSelect = vi.fn();
      const onSelect = vi.fn();
      const props: ModifierOptionButtonProps = {
        option: { id: "OPT1", name: "Honey Boba", priceCents: 75, availability: available },
        isSingle: false,
        isSelected: false,
        isDisabled: false,
        onSelect: originalSelect,
      };
      const { rerender } = render(<ModifierOptionButton {...props} />);
      rerender(<ModifierOptionButton {...props} onSelect={onSelect} />);
      fireEvent.click(screen.getByRole("checkbox"));
      expect(onSelect).toHaveBeenCalledOnce();
      expect(originalSelect).not.toHaveBeenCalled();

      const renamed = { ...props, onSelect, option: { ...props.option, name: "Brown Sugar Boba" } };
      rerender(<ModifierOptionButton {...renamed} />);
      expect(screen.getByRole("checkbox").textContent).toContain("Brown Sugar Boba");
      const updated = { ...renamed, option: { ...renamed.option, priceCents: 100 } };
      rerender(<ModifierOptionButton {...updated} />);
      expect(screen.getByRole("checkbox").textContent).toContain("+$1.00");

      rerender(<ModifierOptionButton {...updated} isSelected />);
      expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
      rerender(<ModifierOptionButton {...updated} isSelected isDisabled />);
      expect((screen.getByRole("checkbox") as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole("checkbox"));
      expect(onSelect).toHaveBeenCalledOnce();
      rerender(<ModifierOptionButton {...updated} isSingle />);
      expect(screen.getByRole("radio").getAttribute("aria-checked")).toBe("false");
    });

    it("uses fresh group callbacks and catalog data when selections stay the same", () => {
      const originalToggle = vi.fn();
      const onOptionToggle = vi.fn();
      const modifierList = makeApiItem().modifiers![0];
      const props = { modifierList, selectedOptionIds: [], onOptionToggle: originalToggle };
      const { rerender } = render(<ModifierGroupSection {...props} />);
      rerender(<ModifierGroupSection {...props} onOptionToggle={onOptionToggle} />);
      fireEvent.click(screen.getByRole("radio", { name: "Full sweet" }));
      expect(onOptionToggle).toHaveBeenCalledWith(modifierList, "MOD2");
      expect(originalToggle).not.toHaveBeenCalled();

      const updatedList = {
        ...modifierList,
        name: "Sweetness",
        options: modifierList.options.map(option => option.id === "MOD2"
          ? { ...option, name: "100% Sweet", priceCents: 50 }
          : { ...option, availability: unavailable }),
      };
      rerender(<ModifierGroupSection {...props} modifierList={updatedList} onOptionToggle={onOptionToggle} />);
      expect(screen.queryByRole("radio", { name: "Half sweet" })).toBeNull();
      const option = screen.getByRole("radio", { name: /100% Sweet/ });
      expect(option.textContent).toContain("+$0.50");
      fireEvent.click(option);
      expect(onOptionToggle).toHaveBeenLastCalledWith(updatedList, "MOD2");
    });

    it("allows toggling toppings like Honey Boba without affecting Sweetness or Ice Level", async () => {
      const groupRender = vi.spyOn(ModifierGroupSection as unknown as {
        type: (props: ModifierGroupSectionProps) => unknown;
      }, "type");
      const optionRender = vi.spyOn(ModifierOptionButton as unknown as {
        type: (props: ModifierOptionButtonProps) => unknown;
      }, "type");
      const multiModItem = makeMultiModItem();

      const check = holdAvailability();
      const onClose = vi.fn();
      render(<ItemCustomizerModal item={multiModItem as unknown as MenuItem} onClose={onClose} />);
      const honeyBoba = await screen.findByRole("checkbox", { name: /Honey Boba/ });
      await check.respondWith(multiModItem);
      groupRender.mockClear();
      optionRender.mockClear();

      // Initial price is $5.00
      expect(addButton().textContent).toContain("$5.00");

      // Toggle Honey Boba
      expect(honeyBoba.getAttribute("aria-checked")).toBe("false");

      fireEvent.click(honeyBoba);
      expect(honeyBoba.getAttribute("aria-checked")).toBe("true");

      // Price should now reflect +$0.75 ($5.75)
      expect(addButton().textContent).toContain("$5.75");

      // Toggle Pudding
      const pudding = screen.getByRole("checkbox", { name: /Pudding/ });
      fireEvent.click(pudding);
      expect(pudding.getAttribute("aria-checked")).toBe("true");
      expect(addButton().textContent).toContain("$6.50");

      // Untoggle Honey Boba
      fireEvent.click(honeyBoba);
      expect(honeyBoba.getAttribute("aria-checked")).toBe("false");
      expect(addButton().textContent).toContain("$5.75");

      expect(groupRender.mock.calls.map(([props]) => props.modifierList.id)).toEqual(["TOP", "TOP", "TOP"]);
      expect(optionRender.mock.calls.map(([props]) => props.option.id)).toEqual(["TOP1", "TOP2", "TOP1"]);
      expect(screen.getByRole("radio", { name: "100% Sweet" }).getAttribute("aria-checked")).toBe("true");
      expect(screen.getByRole("radio", { name: "Regular Ice" }).getAttribute("aria-checked")).toBe("true");

      // Add to bag
      fireEvent.click(addButton());
      expect(mocks.addItem).toHaveBeenCalledTimes(1);
      expect(mocks.addItem.mock.calls[0][0].selectedModifiers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ optionId: "TOP2", optionName: "Pudding" }),
        ])
      );
    });

    it("allows clearing an optional single-select choice", async () => {
      const check = holdAvailability();
      renderCustomizer();
      await check.respondWith(makeApiItem());
      const option = screen.getByRole("radio", { name: "Full sweet" });
      fireEvent.click(option);
      expect(option.getAttribute("aria-checked")).toBe("true");
      fireEvent.click(option);
      expect(option.getAttribute("aria-checked")).toBe("false");
      fireEvent.click(addButton());
      expect(mocks.addItem.mock.calls[0][0].selectedModifiers).toEqual([]);
    });

    it("replaces required single-select choices without clearing them", async () => {
      const item = makeMultiModItem();
      const check = holdAvailability();
      render(<ItemCustomizerModal item={item as unknown as MenuItem} onClose={vi.fn()} />);
      await check.respondWith(item);
      const full = screen.getByRole("radio", { name: "100% Sweet" });
      const half = screen.getByRole("radio", { name: "50% Sweet" });
      fireEvent.click(full);
      expect(full.getAttribute("aria-checked")).toBe("true");
      fireEvent.click(half);
      expect(full.getAttribute("aria-checked")).toBe("false");
      expect(half.getAttribute("aria-checked")).toBe("true");
      fireEvent.click(half);
      expect(half.getAttribute("aria-checked")).toBe("true");
    });

    it("retains explicit choices and refreshes untouched defaults with the catalog", async () => {
      const item = makeMultiModItem();
      const check = holdAvailability();
      render(<ItemCustomizerModal item={item as unknown as MenuItem} onClose={vi.fn()} />);
      // Clicking the current default must record an explicit choice, too.
      fireEvent.click(screen.getByRole("radio", { name: "100% Sweet" }));
      const fresh = makeMultiModItem();
      for (const group of fresh.modifiers!.slice(0, 2)) {
        group.options[0].onByDefault = false;
        group.options[1].onByDefault = true;
      }
      await check.respondWith(fresh);
      expect(screen.getByRole("radio", { name: "100% Sweet" }).getAttribute("aria-checked")).toBe("true");
      expect(screen.getByRole("radio", { name: "Less Ice" }).getAttribute("aria-checked")).toBe("true");
    });

    it("enforces limits and reports batched over-limit clicks using the latest selections", async () => {
      const item = makeMultiModItem();
      const toppings = item.modifiers![2];
      toppings.maxSelectedModifiers = 2;
      toppings.options[0].onByDefault = true;
      toppings.options.push({ id: "TOP3", name: "Grass Jelly", priceCents: 50, availability: available });
      const check = holdAvailability();
      render(<StrictMode><ItemCustomizerModal item={item as unknown as MenuItem} onClose={vi.fn()} /></StrictMode>);
      await check.respondWith(item);
      const boba = screen.getByRole("checkbox", { name: /Honey Boba/ });
      const pudding = screen.getByRole("checkbox", { name: /Pudding/ });
      const jelly = screen.getByRole("checkbox", { name: /Grass Jelly/ });
      act(() => {
        fireEvent.click(pudding);
        fireEvent.click(jelly);
      });
      expect(boba.getAttribute("aria-checked")).toBe("true");
      expect(pudding.getAttribute("aria-checked")).toBe("true");
      expect(jelly.getAttribute("aria-checked")).toBe("false");
      expect((jelly as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByRole("alert").textContent).toContain("You can select up to 2 options");
      expect(addButton().textContent).toContain("$6.50");

      fireEvent.click(boba);
      expect(screen.queryByRole("alert")).toBeNull();
      expect((jelly as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(jelly);
      expect(jelly.getAttribute("aria-checked")).toBe("true");
      expect(addButton().textContent).toContain("$6.25");
    });
  });
});
