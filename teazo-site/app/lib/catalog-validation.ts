import "server-only";
import type { CheckoutItemRequest } from "@/app/types/checkout";
import { readCatalogItems, readCatalogModifierLists } from "@/app/lib/square-catalog";
import { buildMenuItemFromGetResponse } from "@/app/lib/square-helpers";

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
  const catalog = items.map((object) => buildMenuItemFromGetResponse(
    { object, relatedObjects: lists }, locationId, now,
  )!);
  const variations = new Map(catalog.flatMap((item) =>
    (item.variations ?? []).map((variation) => [variation.id, { item, variation }] as const),
  ));
  const knownOptions = new Set(lists.flatMap((list) =>
    (list.modifierListData?.modifiers ?? []).map((option) => option.id),
  ));
  const unavailable = new Set<string>();
  const invalid = new Set<string>();
  for (const line of lines) {
    const match = variations.get(line.variationId);
    if (!match?.item.availability?.available || !match.variation.availability?.available) {
      unavailable.add(line.variationId);
      continue;
    }
    const groups = match.item.modifiers.filter((group) => group.enabled !== false);
    const options = new Map(groups.flatMap((group) => group.options.map((option) => [option.id, option] as const)));
    const selected = line.modifierOptionIds ?? [];
    if (selected.some((id) => !knownOptions.has(id) || (options.has(id) && !options.get(id)?.availability?.available))) {
      unavailable.add(line.variationId);
      continue;
    }
    if (new Set(selected).size !== selected.length || selected.some((id) => !options.has(id))) {
      invalid.add(line.variationId);
      continue;
    }
    for (const group of groups) {
      const count = selected.filter((id) => group.options.some((option) => option.id === id)).length;
      const max = group.maxSelectedModifiers ?? 0;
      if (count < (group.minSelectedModifiers ?? 0) || (max > 0 && count > max)) {
        invalid.add(line.variationId);
      }
    }
  }
  if (unavailable.size) return {
    valid: false, code: "ITEM_UNAVAILABLE",
    error: "A drink, size, or selected option is no longer available. Remove or update the affected drinks.",
    variationIds: [...unavailable],
  };
  if (invalid.size) return {
    valid: false, code: "INVALID_OPTIONS",
    error: "The selected options no longer match this drink's Square rules. Update the affected drinks.",
    variationIds: [...invalid],
  };
  return { valid: true };
}
