import type { CatalogObject, CatalogItemModifierListInfo } from "square";
import type { CatalogAvailability, ItemVariation, ModifierList } from "@/app/types/menu-item";

type Reasons = CatalogAvailability["reasons"];

export function availability(locationId: string, reasons: Reasons): CatalogAvailability {
  return { available: reasons.length === 0, locationId, reasons };
}

// Square defaults an omitted present_at_all_locations to true.
export function isPresentAtLocation(object: CatalogObject, locationId: string): boolean {
  return object.presentAtAllLocations !== false
    ? !object.absentAtLocationIds?.includes(locationId)
    : !!object.presentAtLocationIds?.includes(locationId);
}

function objectReasons(object: CatalogObject, locationId: string): Reasons {
  const reasons: Reasons = [];
  if (object.isDeleted) reasons.push({ code: "DELETED", message: "Deleted in Square." });
  if (!isPresentAtLocation(object, locationId)) {
    reasons.push({ code: "NOT_AT_LOCATION", message: "Not offered at this location." });
  }
  return reasons;
}

export function variationAvailability(
  variation: CatalogObject.ItemVariation, locationId: string, now = Date.now(),
): CatalogAvailability {
  const reasons = objectReasons(variation, locationId);
  const data = variation.itemVariationData;
  const override = data?.locationOverrides?.find((entry) => entry.locationId === locationId);
  const expires = override?.soldOutValidUntil ? Date.parse(override.soldOutValidUntil) : NaN;
  // Manual sold-out flags also apply when inventory tracking is disabled.
  if (override?.soldOut && !(Number.isFinite(expires) && now > expires)) {
    reasons.push({ code: "SOLD_OUT", message: "Size sold out at this location." });
  }
  if (!data || data.sellable === false) {
    reasons.push({ code: "NOT_SELLABLE", message: "Size cannot be sold." });
  }
  return availability(locationId, reasons);
}

export function modifierAvailability(
  modifier: CatalogObject.Modifier, locationId: string, info?: CatalogItemModifierListInfo,
): CatalogAvailability {
  const reasons = objectReasons(modifier, locationId);
  const data = modifier.modifierData;
  if (data?.locationOverrides?.some((entry) => entry.locationId === locationId && entry.soldOut)) {
    reasons.push({ code: "SOLD_OUT", message: "Option sold out at this location." });
  }
  const override = info?.modifierOverrides?.find((entry) => entry.modifierId === modifier.id)?.hiddenOnlineOverride;
  const hidden = override === "YES" || (override !== "NO" && data?.hiddenOnline === true);
  if (hidden) reasons.push({ code: "HIDDEN_ONLINE", message: "Option hidden from online ordering." });
  return availability(locationId, reasons);
}

export function itemAvailability(
  item: CatalogObject.Item, variations: ItemVariation[], modifiers: ModifierList[], locationId: string,
): CatalogAvailability {
  const reasons = objectReasons(item, locationId);
  if (item.itemData?.isArchived) reasons.push({ code: "ARCHIVED", message: "Archived in Square." });
  if (!variations.some((variation) => variation.availability?.available)) {
    reasons.push({ code: "NO_AVAILABLE_VARIATIONS", message: "No orderable sizes remain at this location." });
  }
  for (const group of modifiers) {
    if (group.enabled === false) continue;
    const count = group.options.filter((option) => option.availability?.available).length;
    if (count < (group.minSelectedModifiers ?? 0)) {
      reasons.push({
        code: "REQUIRED_OPTIONS_UNAVAILABLE",
        message: `${group.name || "Required option group"} requires ${group.minSelectedModifiers} choices; only ${count} available.`,
      });
    }
  }
  // Missing linked lists must not silently remove a required customization.
  if (item.itemData?.modifierListInfo?.some((info) =>
    info.enabled !== false && !modifiers.some((group) => group.id === info.modifierListId),
  )) {
    reasons.push({ code: "MISSING_MODIFIER_LIST", message: "An option group could not be loaded from Square." });
  }
  return availability(locationId, reasons);
}
