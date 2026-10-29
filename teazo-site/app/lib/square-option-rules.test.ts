import { describe, expect, it } from "vitest";
import type { CatalogItemModifierListInfo } from "square";
import { catalogFixture, locationId } from "@/test/catalog-fixtures";
import { buildMenuItemFromGetResponse } from "./square-helpers";
import { availabilityDescription, availableMenuChoices, orderableMenuItem } from "./storefront-catalog";
import { defaultModifierSelections, resolveModifierListRules, resolveModifierOptionRules, validateModifierSelections } from "./square-option-rules";

function normalize(fixture = catalogFixture()) {
  return buildMenuItemFromGetResponse({ object: fixture.item, relatedObjects: [fixture.list] }, locationId)!;
}

describe("Square effective modifier limits", () => {
  it.each([
    [undefined, undefined, 1, 2], [null, null, 1, 2], [-1, -1, 1, 2],
    [undefined, -1, 1, 2], [-1, undefined, 1, 2],
    [BigInt(-1) as unknown as number, BigInt(-1) as unknown as number, 1, 2],
    [0, 0, 0, 0], [0, 1, 0, 1], [2, 3, 2, 3],
    [0, -1, 0, 0], [-1, 1, 0, 1],
    [undefined, 1, 0, 1], [2, undefined, 2, 0],
    [-2, -1, 0, 0], [-1, -2, 0, 0],
  ])("resolves item bounds %s/%s to %s/%s", (min, max, expectedMin, expectedMax) => {
    expect(resolveModifierListRules({ minSelectedModifiers: BigInt(1), maxSelectedModifiers: BigInt(2) }, {
      modifierListId: "LIST1", minSelectedModifiers: min, maxSelectedModifiers: max,
    })).toMatchObject({ minSelectedModifiers: expectedMin, maxSelectedModifiers: expectedMax });
  });

  it.each([undefined, null, BigInt(-1), BigInt(-2), BigInt(0)])("normalizes default/invalid list bounds %s to optional/unlimited regardless of SINGLE", (value) => {
    expect(resolveModifierListRules({ selectionType: "SINGLE", minSelectedModifiers: value, maxSelectedModifiers: value }))
      .toMatchObject({ minSelectedModifiers: 0, maxSelectedModifiers: 0 });
  });

  it("permits zero or one choice for an optional single-choice group", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.modifierListInfo![0] = { modifierListId: "LIST1", minSelectedModifiers: 0, maxSelectedModifiers: 1 };
    const { modifiers } = normalize(fixture);
    expect(validateModifierSelections(modifiers, [])).toBeNull();
    expect(validateModifierSelections(modifiers, ["MOD1"])).toBeNull();
    expect(validateModifierSelections(modifiers, ["MOD1", "MOD2"])?.code).toBe("INVALID_OPTIONS");
  });

  it("treats zero maximum as unlimited distinct choices, but never permits duplicates", () => {
    const fixture = catalogFixture();
    fixture.list.modifierListData!.maxSelectedModifiers = BigInt(0);
    const { modifiers } = normalize(fixture);
    expect(validateModifierSelections(modifiers, ["MOD1", "MOD2"])).toBeNull();
    expect(validateModifierSelections(modifiers, ["MOD1", "MOD1"])?.code).toBe("INVALID_OPTIONS");
  });
});

describe("Square option defaults and online visibility", () => {
  it.each([
    [true, "NO", false], [false, "YES", true],
    [true, "NOT_SET", true], [false, "NOT_SET", false],
    [true, undefined, true], [undefined, undefined, false],
  ] as const)("resolves base %s with override %s to %s", (base, override, expected) => {
    expect(resolveModifierOptionRules({ onByDefault: base, hiddenOnline: base }, {
      modifierId: "MOD1", onByDefaultOverride: override, hiddenOnlineOverride: override,
      // Deprecated values never override the modern tri-state inheritance.
      onByDefault: !expected,
    })).toEqual({ onByDefault: expected, hiddenOnline: expected });
  });

  it("does not invent required defaults based on option name or price", () => {
    expect(defaultModifierSelections(normalize().modifiers)).toEqual({ LIST1: [] });
  });

  it("uses optional defaults and per-drink overrides without affecting other drinks", () => {
    const fixture = catalogFixture();
    fixture.option.modifierData!.onByDefault = true;
    fixture.item.itemData!.modifierListInfo![0] = {
      modifierListId: "LIST1", minSelectedModifiers: 0, maxSelectedModifiers: 1,
      modifierOverrides: [
        { modifierId: "MOD1", onByDefaultOverride: "NO" },
        { modifierId: "MOD2", onByDefaultOverride: "YES" },
      ],
    };
    expect(defaultModifierSelections(normalize(fixture).modifiers)).toEqual({ LIST1: ["MOD2"] });
    fixture.item.itemData!.modifierListInfo![0].modifierOverrides = [];
    expect(defaultModifierSelections(normalize(fixture).modifiers)).toEqual({ LIST1: ["MOD1"] });
  });

  it.each(["sold out", "hidden", "absent", "deleted", "disabled"])("never preselects a %s default", (state) => {
    const fixture = catalogFixture();
    fixture.option.modifierData!.onByDefault = true;
    if (state === "sold out") fixture.option.modifierData!.locationOverrides = [{ locationId, soldOut: true }];
    if (state === "hidden") fixture.option.modifierData!.hiddenOnline = true;
    if (state === "absent") fixture.option.absentAtLocationIds = [locationId];
    if (state === "deleted") fixture.option.isDeleted = true;
    if (state === "disabled") fixture.item.itemData!.modifierListInfo![0].enabled = false;
    expect(Object.values(defaultModifierSelections(normalize(fixture).modifiers)).flat()).toEqual([]);
  });

  it("blocks contradictory defaults until the customer fixes the selection", () => {
    const fixture = catalogFixture();
    fixture.option.modifierData!.onByDefault = true;
    fixture.otherOption.modifierData!.onByDefault = true;
    const { modifiers } = normalize(fixture);
    const defaults = defaultModifierSelections(modifiers);
    expect(defaults).toEqual({ LIST1: ["MOD1", "MOD2"] });
    expect(validateModifierSelections(modifiers, Object.values(defaults).flat())?.code).toBe("INVALID_OPTIONS");
  });
});

describe("unsupported catalog configurations", () => {
  it.each([
    [true, undefined, true], [true, "NOT_SET", true], [true, "NO", false],
    [false, "YES", true], [false, "NOT_SET", false], [undefined, undefined, false],
  ] as const)("resolves allow_quantities %s/%s to %s", (base, override, effective) => {
    const info: CatalogItemModifierListInfo = { modifierListId: "LIST1", allowQuantities: override };
    const rules = resolveModifierListRules({ allowQuantities: base }, info);
    expect(rules.allowQuantities).toBe(effective);
    expect(rules.configurationIssues.some((issue) => issue.code === "UNSUPPORTED_MODIFIER_QUANTITIES")).toBe(effective);
  });

  it.each(["quantities", "text", "nested", "limits", "deleted", "missing"])("blocks %s and exposes an actionable admin reason, unless disabled", (type) => {
    const fixture = catalogFixture();
    if (type === "quantities") fixture.list.modifierListData!.allowQuantities = true;
    if (type === "text") fixture.list.modifierListData!.modifierType = "TEXT";
    if (type === "nested") fixture.option.modifierData!.childModifierListIds = ["CHILD_LIST"];
    if (type === "limits") fixture.list.modifierListData!.minSelectedModifiers = BigInt(2);
    if (type === "deleted") fixture.list.isDeleted = true;
    if (type === "missing") fixture.item.itemData!.modifierListInfo![0].modifierListId = "NON_EXISTENT_LIST";
    const item = normalize(fixture);
    expect(item.availability?.available).toBe(false);
    expect(orderableMenuItem(item)).toBeNull();
    expect(availabilityDescription(item)).toContain("Square");
    expect(validateModifierSelections(item.modifiers, ["MOD1"])?.code).toBe("INVALID_OPTIONS");
    fixture.item.itemData!.modifierListInfo![0].enabled = false;
    const disabled = normalize(fixture);
    expect(disabled.availability?.available).toBe(true);
    expect(availableMenuChoices(disabled).modifiers).toEqual([]);
    expect(validateModifierSelections(disabled.modifiers, [])).toBeNull();
    expect(validateModifierSelections(disabled.modifiers, ["MOD1"])?.code).toBe("INVALID_OPTIONS");
  });
});
