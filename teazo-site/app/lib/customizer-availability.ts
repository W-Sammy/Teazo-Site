import type { CatalogAvailability, ItemVariation, ModifierList } from "@/app/types/menu-item";

interface CustomizerCatalog {
  availability?: CatalogAvailability;
  variations?: ItemVariation[];
  modifiers?: ModifierList[];
}

export function checkCustomizerAvailability(
  item: CustomizerCatalog,
  checked: boolean,
  selectedVariationId: string,
  selectedModifiers: Record<string, string[]>,
  error?: string,
) {
  if (!checked || error) return { canAdd: false, message: error, unavailableModifiers: false };
  if (!item.availability?.available) return {
    canAdd: false,
    message: item.availability?.reasons.map((reason) => reason.message).join(" ") || "This drink is currently unavailable.",
    unavailableModifiers: false,
  };

  const missingSize = !item.variations?.some((variation) =>
    variation.id === selectedVariationId && variation.availability?.available,
  );
  const unavailableModifiers = Object.entries(selectedModifiers).some(([listId, ids]) =>
    ids.some((id) => !item.modifiers?.some((group) => group.enabled !== false && group.id === listId &&
      group.options.some((option) => option.id === id && option.availability?.available))),
  );
  const messages = [];
  if (missingSize) messages.push("Your selected size is no longer available. Please choose an available size.");
  if (unavailableModifiers) messages.push("Some selected options are no longer available. Choose alternatives or remove the unavailable options.");
  return { canAdd: !missingSize && !unavailableModifiers, message: messages.join(" ") || undefined, unavailableModifiers };
}
