import { describe, expect, it } from "vitest";
import { catalogFixture, locationId } from "../../test/catalog-fixtures";
import { buildMenuItemFromGetResponse } from "./square-helpers";
import { availableMenuChoices } from "./storefront-catalog";
import { checkCustomizerAvailability } from "./customizer-availability";

function choices(fixture = catalogFixture()) {
  return availableMenuChoices(buildMenuItemFromGetResponse({ object: fixture.item, relatedObjects: [fixture.list] }, locationId)!);
}

const selected = { LIST1: ["MOD1"] };

describe("background customizer availability", () => {
  it("keeps the drink and its choices visible but blocks adding until the fresh check completes", () => {
    const item = choices();
    expect(item.name).toBe("Milk tea");
    expect(item.variations).toHaveLength(2);
    expect(item.modifiers[0].options).toHaveLength(2);
    expect(checkCustomizerAvailability(item, false, "VAR1", selected)).toEqual({
      canAdd: false, message: undefined, unavailableModifiers: false,
    });
    expect(checkCustomizerAvailability(item, true, "VAR1", selected)).toMatchObject({ canAdd: true, message: undefined });
  });

  it("keeps the customer's selected size valid when Square's variation order changes", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.variations = [fixture.large, fixture.regular];
    const item = choices(fixture);
    expect(item.variationId).toBe("VAR2");
    expect(checkCustomizerAvailability(item, true, "VAR1", selected)).toMatchObject({ canAdd: true, message: undefined });
  });

  it("requires another size when the selected size sells out instead of silently switching", () => {
    const fixture = catalogFixture();
    fixture.regular.itemVariationData!.locationOverrides = [{ locationId, soldOut: true }];
    const item = choices(fixture);
    expect(item.variations?.map((variation) => variation.id)).toEqual(["VAR2"]);
    expect(checkCustomizerAvailability(item, true, "VAR1", selected)).toMatchObject({ canAdd: false, message: expect.stringContaining("choose an available size") });
    expect(checkCustomizerAvailability(item, true, "VAR2", selected)).toMatchObject({ canAdd: true });
  });

  it("flags a selected option hidden by Square and allows a replacement", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.modifierListInfo![0].modifierOverrides = [{ modifierId: "MOD1", hiddenOnlineOverride: "YES" }];
    const item = choices(fixture);
    expect(item.modifiers[0].options.map((option) => option.id)).toEqual(["MOD2"]);
    expect(checkCustomizerAvailability(item, true, "VAR1", selected)).toMatchObject({ canAdd: false, unavailableModifiers: true });
    expect(checkCustomizerAvailability(item, true, "VAR1", { LIST1: ["MOD2"] })).toMatchObject({ canAdd: true });
    // Checking the new data never mutates the customer's in-progress choices.
    expect(selected).toEqual({ LIST1: ["MOD1"] });
  });

  it("ignores availability changes to options the customer did not select", () => {
    const fixture = catalogFixture();
    fixture.otherOption.modifierData!.locationOverrides = [{ locationId, soldOut: true }];
    expect(checkCustomizerAvailability(choices(fixture), true, "VAR1", selected)).toMatchObject({ canAdd: true, message: undefined });
  });

  it("flags selections from a group Square has disabled", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.modifierListInfo![0].enabled = false;
    const item = choices(fixture);
    expect(item.modifiers).toEqual([]);
    expect(checkCustomizerAvailability(item, true, "VAR1", selected)).toMatchObject({ canAdd: false, unavailableModifiers: true });
    expect(checkCustomizerAvailability(item, true, "VAR1", { LIST1: [] })).toMatchObject({ canAdd: true });
  });

  it("keeps archived drink details visible with an inline reason and blocks adding", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.isArchived = true;
    const item = choices(fixture);
    expect(item.name).toBe("Milk tea");
    expect(checkCustomizerAvailability(item, true, "VAR1", selected)).toMatchObject({ canAdd: false, message: "Archived in Square." });
  });

  it("blocks adding when a required group becomes impossible", () => {
    const fixture = catalogFixture();
    fixture.option.modifierData!.hiddenOnline = true;
    fixture.otherOption.modifierData!.hiddenOnline = true;
    expect(checkCustomizerAvailability(choices(fixture), true, "VAR1", selected)).toMatchObject({ canAdd: false, message: expect.stringContaining("requires 1 choices; only 0 available") });
  });

  it("blocks adding on failure and throughout retry without using the previous snapshot", () => {
    const item = choices();
    expect(checkCustomizerAvailability(item, false, "VAR1", selected, "Could not confirm availability. Please try again."))
      .toMatchObject({ canAdd: false, message: "Could not confirm availability. Please try again." });
    expect(checkCustomizerAvailability(item, false, "VAR1", selected)).toMatchObject({ canAdd: false, message: undefined });
    expect(checkCustomizerAvailability(item, true, "VAR1", selected)).toMatchObject({ canAdd: true });
  });

  it("rejects a response with no availability information", () => {
    const item = choices();
    item.availability = undefined;
    expect(checkCustomizerAvailability(item, true, "VAR1", selected)).toMatchObject({ canAdd: false, message: "This drink is currently unavailable." });
  });
});
