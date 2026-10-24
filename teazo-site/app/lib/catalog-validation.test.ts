import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogFixture, locationId } from "../../test/catalog-fixtures";

const mocks = vi.hoisted(() => ({ items: vi.fn(), lists: vi.fn() }));
vi.mock("./square-catalog", () => ({ readCatalogItems: mocks.items, readCatalogModifierLists: mocks.lists }));
const { validateCartAgainstCatalog } = await import("./catalog-validation");
let fixture = catalogFixture();
const line = { variationId: "VAR1", quantity: 1, modifierOptionIds: ["MOD1"] };

beforeEach(() => {
  fixture = catalogFixture();
  mocks.items.mockReset().mockImplementation(async () => [fixture.item]);
  mocks.lists.mockReset().mockImplementation(async () => [fixture.list]);
});

describe("validateCartAgainstCatalog", () => {
  it("accepts available items and fetches new Square data on every call", async () => {
    expect(await validateCartAgainstCatalog([line], locationId)).toEqual({ valid: true });
    fixture.regular.itemVariationData!.locationOverrides = [{ locationId, soldOut: true }];
    expect(await validateCartAgainstCatalog([line], locationId)).toMatchObject({ valid: false, code: "ITEM_UNAVAILABLE", variationIds: ["VAR1"] });
    expect(mocks.items).toHaveBeenCalledTimes(2);
    expect(mocks.lists).toHaveBeenCalledTimes(2);
  });

  it.each(["archived", "item absent", "size absent", "size sold out", "option sold out", "option hidden", "required group impossible", "item deleted"])("rejects %s with the affected line's variation ID", async (state) => {
    if (state === "archived") fixture.item.itemData!.isArchived = true;
    if (state === "item absent") fixture.item.absentAtLocationIds = [locationId];
    if (state === "size absent") fixture.regular.absentAtLocationIds = [locationId];
    if (state === "size sold out") fixture.regular.itemVariationData!.locationOverrides = [{ locationId, soldOut: true }];
    if (state === "option sold out") fixture.option.modifierData!.locationOverrides = [{ locationId, soldOut: true }];
    if (state === "option hidden") fixture.item.itemData!.modifierListInfo![0].modifierOverrides = [{ modifierId: "MOD1", hiddenOnlineOverride: "YES" }];
    if (state === "required group impossible") {
      fixture.list.modifierListData!.minSelectedModifiers = BigInt(2);
      fixture.otherOption.modifierData!.hiddenOnline = true;
    }
    if (state === "item deleted") mocks.items.mockResolvedValue([]);
    expect(await validateCartAgainstCatalog([line], locationId)).toMatchObject({ valid: false, code: "ITEM_UNAVAILABLE", variationIds: ["VAR1"] });
  });

  it("reports all affected variation IDs without flagging an available sibling", async () => {
    fixture.regular.itemVariationData!.locationOverrides = [{ locationId, soldOut: true }];
    expect(await validateCartAgainstCatalog([line, { ...line, variationId: "MISSING" }, { ...line, variationId: "VAR2" }], locationId))
      .toMatchObject({ code: "ITEM_UNAVAILABLE", variationIds: ["VAR1", "MISSING"] });
  });

  it("accepts expired sold-out sizes", async () => {
    fixture.regular.itemVariationData!.locationOverrides = [{ locationId, soldOut: true, soldOutValidUntil: "2020-01-01T00:00:00Z" }];
    expect(await validateCartAgainstCatalog([line], locationId)).toEqual({ valid: true });
  });

  it("rejects a selected option removed from Square as unavailable", async () => {
    fixture.list.modifierListData!.modifiers = [fixture.otherOption];
    expect(await validateCartAgainstCatalog([line], locationId)).toMatchObject({ code: "ITEM_UNAVAILABLE", variationIds: ["VAR1"] });
  });

  it.each([{ selected: [] }, { selected: ["MOD1", "MOD1"] }, { selected: ["MOD1", "MOD2"] }])("rejects selections $selected that fail effective group rules", async ({ selected }) => {
    expect(await validateCartAgainstCatalog([{ ...line, modifierOptionIds: selected }], locationId))
      .toMatchObject({ code: "INVALID_OPTIONS", variationIds: ["VAR1"] });
  });

  it("does not order on failure to read Square", async () => {
    mocks.items.mockRejectedValue(new Error("Square is offline"));
    await expect(validateCartAgainstCatalog([line], locationId)).rejects.toThrow("Square is offline");
  });
});
