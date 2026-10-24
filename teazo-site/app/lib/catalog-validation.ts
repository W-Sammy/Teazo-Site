import "server-only";
import type { CheckoutItemRequest } from "@/app/types/checkout";
import { readCatalogItems, readCatalogModifierLists } from "@/app/lib/square-catalog";
import { buildMenuItemFromGetResponse } from "@/app/lib/square-helpers";
import { validateModifierSelections } from "@/app/lib/square-option-rules";

type CatalogValidation = { valid: true } | {
  valid: false;
  code: "ITEM_UNAVAILABLE" | "INVALID_OPTIONS";
  error: string;
  variationIds: string[];
};

/** Always reads Square independently of any menu/customizer snapshot. */
export async function validateCartAgainstCatalog(
  lines: CheckoutItemRequest[], locationId: string,
): Promise<CatalogValidation> {
  const [items, lists] = await Promise.all([readCatalogItems(), readCatalogModifierLists()]);
  const now = Date.now();
  const catalog = items
    .map((object) => buildMenuItemFromGetResponse({ object, relatedObjects: lists }, locationId, now))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const itemsById = new Map(catalog.map((item) => [item.catalogObjectId, item]));
  const variationParents = new Map(items.flatMap((item) =>
    (item.itemData?.variations ?? []).flatMap((variation) => variation.type === "ITEM_VARIATION"
      ? [[variation.id, variation.itemVariationData?.itemId ?? item.id] as const] : []),
  ));
  const unavailable = new Set<string>();
  const invalid = new Set<string>();
  for (const line of lines) {
    // Check the claimed parent before trusting either the variation or its groups.
    const parentId = variationParents.get(line.variationId);
    if (parentId && parentId !== line.catalogObjectId) {
      invalid.add(line.variationId);
      continue;
    }
    const item = itemsById.get(line.catalogObjectId);
    const variation = item?.variations?.find((entry) => entry.id === line.variationId);
    if (!item || !variation) {
      unavailable.add(line.variationId);
      continue;
    }
    const optionError = validateModifierSelections(item.modifiers, line.modifierOptionIds ?? []);
    if (optionError) {
      (optionError.code === "INVALID_OPTIONS" ? invalid : unavailable).add(line.variationId);
      continue;
    }
    if (!item.availability?.available || !variation.availability?.available) {
      unavailable.add(line.variationId);
    }
  }
  if (invalid.size) return {
    valid: false, code: "INVALID_OPTIONS",
    error: "The selected options no longer match this drink's Square rules. Update the affected drinks.",
    variationIds: [...new Set([...invalid, ...unavailable])],
  };
  if (unavailable.size) return {
    valid: false, code: "ITEM_UNAVAILABLE",
    error: "A drink, size, or selected option is no longer available. Remove or update the affected drinks.",
    variationIds: [...unavailable],
  };
  return { valid: true };
}
