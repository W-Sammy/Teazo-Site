import type { CatalogAvailability, ItemVariation, ModifierList } from "@/app/types/menu-item";
import { validateModifierSelections } from "./square-option-rules";

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
  const configurationProblem = item.availability?.reasons.some((reason) =>
    reason.code.startsWith("UNSUPPORTED_") || reason.code === "INVALID_MODIFIER_LIMITS" || reason.code === "MISSING_MODIFIER_LIST",
  );
  if (!item.availability?.available) return {
    canAdd: false,
    message: configurationProblem
      ? "This drink is currently unavailable for online ordering."
      : item.availability?.reasons.map((reason) => reason.message).join(" ") || "This drink is currently unavailable.",
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
  const optionError = validateModifierSelections(item.modifiers ?? [], Object.values(selectedModifiers).flat());
  if (optionError && !unavailableModifiers) messages.push(optionError.message);
  return { canAdd: !missingSize && !unavailableModifiers && !optionError, message: messages.join(" ") || undefined, unavailableModifiers };
}
