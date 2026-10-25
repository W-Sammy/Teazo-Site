import type { CatalogObject } from "square";

export const locationId = "LOCATION_1";

export function catalogFixture() {
  const regular: CatalogObject.ItemVariation = {
    type: "ITEM_VARIATION", id: "VAR1",
    itemVariationData: { itemId: "ITEM1", name: "Regular", priceMoney: { amount: BigInt(500), currency: "USD" }, trackInventory: false },
  };
  const large: CatalogObject.ItemVariation = {
    type: "ITEM_VARIATION", id: "VAR2",
    itemVariationData: { itemId: "ITEM1", name: "Large", priceMoney: { amount: BigInt(600), currency: "USD" } },
  };
  const option: CatalogObject.Modifier = {
    type: "MODIFIER", id: "MOD1", modifierData: { name: "Regular sugar" },
  };
  const otherOption: CatalogObject.Modifier = {
    type: "MODIFIER", id: "MOD2", modifierData: { name: "Less sugar" },
  };
  const list: CatalogObject.ModifierList = {
    type: "MODIFIER_LIST", id: "LIST1",
    modifierListData: { name: "Sugar", minSelectedModifiers: BigInt(1), maxSelectedModifiers: BigInt(1), modifiers: [option, otherOption] },
  };
  const item: CatalogObject.Item = {
    type: "ITEM", id: "ITEM1",
    itemData: { name: "Milk tea", variations: [regular, large], modifierListInfo: [{ modifierListId: list.id }] },
  };
  return { item, regular, large, option, otherOption, list };
}
