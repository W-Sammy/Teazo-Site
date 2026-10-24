import { describe, expect, it } from "vitest";
import { catalogFixture, locationId } from "../../test/catalog-fixtures";
import { buildMenuItemFromGetResponse } from "./square-helpers";
import { isPresentAtLocation, variationAvailability } from "./catalog-availability";
import { orderableMenuItem, availabilityDescription } from "./storefront-catalog";

function normalize(fixture = catalogFixture(), now?: number) {
  return buildMenuItemFromGetResponse({ object: fixture.item, relatedObjects: [fixture.list] }, locationId, now)!;
}

describe("Square location availability", () => {
  it("defaults to all locations and respects explicit presence/absence", () => {
    const { item } = catalogFixture();
    expect(isPresentAtLocation(item, locationId)).toBe(true);
    item.absentAtLocationIds = [locationId];
    expect(isPresentAtLocation(item, locationId)).toBe(false);
    item.presentAtAllLocations = false;
    item.presentAtLocationIds = [locationId];
    expect(isPresentAtLocation(item, locationId)).toBe(true);
    expect(isPresentAtLocation(item, "OTHER")).toBe(false);
  });

  it.each(["archived", "absent", "all sizes sold out"])("retains %s items for admin but hides them publicly", (state) => {
    const fixture = catalogFixture();
    if (state === "archived") fixture.item.itemData!.isArchived = true;
    if (state === "absent") fixture.item.absentAtLocationIds = [locationId];
    if (state === "all sizes sold out") for (const size of [fixture.regular, fixture.large]) {
      size.itemVariationData!.locationOverrides = [{ locationId, soldOut: true }];
    }
    const item = normalize(fixture);
    expect(item.catalogObjectId).toBe("ITEM1");
    expect(item.availability).toMatchObject({ available: false, locationId });
    expect(availabilityDescription(item)).not.toBe("Available");
    expect(orderableMenuItem(item)).toBeNull();
  });

  it("keeps a drink with one remaining size and uses that size's price and ID", () => {
    const fixture = catalogFixture();
    fixture.regular.itemVariationData!.locationOverrides = [{ locationId, soldOut: true }];
    const item = normalize(fixture);
    expect(item.variations).toHaveLength(2);
    expect(orderableMenuItem(item)).toMatchObject({ variationId: "VAR2", priceCents: 600, variations: [{ id: "VAR2" }] });
  });

  it("excludes sizes absent from this location and ignores other locations' sold-out flags", () => {
    const fixture = catalogFixture();
    fixture.regular.presentAtAllLocations = false;
    fixture.regular.presentAtLocationIds = ["OTHER"];
    fixture.large.itemVariationData!.locationOverrides = [{ locationId: "OTHER", soldOut: true }];
    expect(orderableMenuItem(normalize(fixture))?.variations?.map((v) => v.id)).toEqual(["VAR2"]);
  });

  it("checks sold-out flags without inventory tracking and honors only a valid expired reset", () => {
    const { regular } = catalogFixture();
    const now = Date.parse("2026-10-23T20:00:00Z");
    regular.itemVariationData!.locationOverrides = [{ locationId, trackInventory: false, soldOut: true }];
    const override = regular.itemVariationData!.locationOverrides[0];
    expect(variationAvailability(regular, locationId, now).available).toBe(false);
    override.soldOutValidUntil = "2026-10-23T19:59:59Z";
    expect(variationAvailability(regular, locationId, now).available).toBe(true);
    override.soldOutValidUntil = "2026-10-23T20:00:01Z";
    expect(variationAvailability(regular, locationId, now).available).toBe(false);
    override.soldOutValidUntil = "bad-date";
    expect(variationAvailability(regular, locationId, now).available).toBe(false);
  });

  it.each([
    [false, "YES", false], [true, "NO", true], [true, "NOT_SET", false], [false, "NOT_SET", true],
  ] as const)("applies hidden_online=%s with per-drink override %s", (hiddenOnline, hiddenOnlineOverride, available) => {
    const fixture = catalogFixture();
    fixture.option.modifierData!.hiddenOnline = hiddenOnline;
    fixture.item.itemData!.modifierListInfo![0].modifierOverrides = [{ modifierId: "MOD1", hiddenOnlineOverride }];
    const item = normalize(fixture);
    expect(item.modifiers[0].options[0].availability?.available).toBe(available);
    expect(orderableMenuItem(item)?.modifiers[0].options.some((o) => o.id === "MOD1")).toBe(available);
  });

  it("does not let a visibility override undo a location's sold-out flag", () => {
    const fixture = catalogFixture();
    fixture.option.modifierData!.hiddenOnline = true;
    fixture.option.modifierData!.locationOverrides = [{ locationId, soldOut: true }];
    fixture.item.itemData!.modifierListInfo![0].modifierOverrides = [{ modifierId: "MOD1", hiddenOnlineOverride: "NO" }];
    const item = normalize(fixture);
    expect(item.modifiers[0].options[0].availability?.reasons.map((r) => r.code)).toEqual(["SOLD_OUT"]);
    expect(orderableMenuItem(item)?.modifiers[0].options.map((o) => o.id)).toEqual(["MOD2"]);
  });

  it("does not leak a shared option's per-drink visibility override to other drinks", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.modifierListInfo![0].modifierOverrides = [{ modifierId: "MOD1", hiddenOnlineOverride: "YES" }];
    expect(normalize(fixture).modifiers[0].options[0].availability?.available).toBe(false);
    fixture.item.itemData!.modifierListInfo![0].modifierOverrides = [];
    expect(normalize(fixture).modifiers[0].options[0].availability?.available).toBe(true);
    expect(fixture.option.modifierData!.hiddenOnline).toBeUndefined();
  });

  it("uses the group defaults only when both per-drink bounds are unset", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.modifierListInfo![0].minSelectedModifiers = -1;
    fixture.item.itemData!.modifierListInfo![0].maxSelectedModifiers = -1;
    expect(normalize(fixture).modifiers[0]).toMatchObject({ minSelectedModifiers: 1, maxSelectedModifiers: 1 });
    fixture.item.itemData!.modifierListInfo![0].minSelectedModifiers = 0;
    expect(normalize(fixture).modifiers[0]).toMatchObject({ minSelectedModifiers: 0, maxSelectedModifiers: 0 });
  });

  it("blocks impossible effective required groups and gives admin a reason", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.modifierListInfo![0].minSelectedModifiers = 2;
    fixture.item.itemData!.modifierListInfo![0].maxSelectedModifiers = 2;
    fixture.option.modifierData!.locationOverrides = [{ locationId, soldOut: true }];
    const item = normalize(fixture);
    expect(item.availability?.reasons).toContainEqual({ code: "REQUIRED_OPTIONS_UNAVAILABLE", message: "Sugar requires 2 choices; only 1 available." });
    expect(availabilityDescription(item)).toContain("Sugar requires 2 choices");
    expect(orderableMenuItem(item)).toBeNull();
  });

  it("does not block disabled groups or guess requiredness from SINGLE", () => {
    const fixture = catalogFixture();
    fixture.item.itemData!.modifierListInfo![0].enabled = false;
    fixture.list.modifierListData!.modifiers = [];
    expect(orderableMenuItem(normalize(fixture))?.modifiers).toEqual([]);
    fixture.item.itemData!.modifierListInfo![0].enabled = true;
    fixture.list.modifierListData!.minSelectedModifiers = undefined;
    fixture.list.modifierListData!.selectionType = "SINGLE";
    expect(normalize(fixture).modifiers[0].minSelectedModifiers).toBe(0);
    expect(normalize(fixture).availability?.available).toBe(true);
  });

  it("ignores legacy item online publication flags", () => {
    const fixture = catalogFixture();
    Object.assign(fixture.item.itemData!, { availableOnline: false, ecomVisibility: "HIDDEN" });
    expect(normalize(fixture).availability?.available).toBe(true);
  });

  it("fails closed when a linked group or availability snapshot is missing", () => {
    const fixture = catalogFixture();
    const item = buildMenuItemFromGetResponse({ object: fixture.item }, locationId)!;
    expect(item.availability?.reasons.some((r) => r.code === "MISSING_MODIFIER_LIST")).toBe(true);
    item.availability = undefined;
    expect(orderableMenuItem(item)).toBeNull();
  });
});
