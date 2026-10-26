import type { CatalogItemModifierListInfo, CatalogModifier, CatalogModifierList, CatalogModifierOverride } from "square";
import type { CatalogAvailability, ModifierList } from "@/app/types/menu-item";

// Keep the API version explicit: older versions omit nested modifier relationships.
// https://developer.squareup.com/docs/catalog-api/manage-nested-modifiers
export const SQUARE_API_VERSION = "2026-08-19";

function resolveToggle(override: string | undefined, inherited: boolean | null | undefined): boolean {
  return override === "YES" || (override !== "NO" && inherited === true);
}

function normalizeLimit(value: bigint | number | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

/** Square 2026-08-19 defaults omitted item bounds to -1; inherit only as a pair.
 * https://developer.squareup.com/reference/square/objects/CatalogItemModifierListInfo
 * selection_type and receipt visibility have no effect on requiredness/online visibility.
 */
export function resolveModifierListRules(data: CatalogModifierList, info?: CatalogItemModifierListInfo) {
  const itemMin = info?.minSelectedModifiers ?? -1;
  const itemMax = info?.maxSelectedModifiers ?? -1;
  const inherit = Number(itemMin) === -1 && Number(itemMax) === -1;
  const minSelectedModifiers = normalizeLimit(inherit ? data.minSelectedModifiers : itemMin);
  const maxSelectedModifiers = normalizeLimit(inherit ? data.maxSelectedModifiers : itemMax);
  const allowQuantities = resolveToggle(info?.allowQuantities, data.allowQuantities);
  const configurationIssues: CatalogAvailability["reasons"] = [];
  const name = data.name || "Option group";
  if (allowQuantities) configurationIssues.push({
    code: "UNSUPPORTED_MODIFIER_QUANTITIES",
    message: `${name}: repeated modifier quantities are not supported online. Disable Allow quantities in Square for this drink.`,
  });
  if (data.modifierType === "TEXT") configurationIssues.push({
    code: "UNSUPPORTED_TEXT_MODIFIERS",
    message: `${name}: text modifiers are not supported online. Disable or replace this group in Square.`,
  });
  if (data.modifiers?.some((option) => option.type === "MODIFIER" && option.modifierData?.childModifierListIds?.length)) {
    configurationIssues.push({
      code: "UNSUPPORTED_NESTED_MODIFIERS",
      message: `${name}: nested modifiers are not supported online. Remove nesting or disable this group in Square.`,
    });
  }
  if (maxSelectedModifiers > 0 && minSelectedModifiers > maxSelectedModifiers) configurationIssues.push({
    code: "INVALID_MODIFIER_LIMITS",
    message: `${name}: the minimum exceeds the maximum. Correct this group's limits in Square.`,
  });
  return { enabled: info?.enabled !== false, minSelectedModifiers, maxSelectedModifiers, allowQuantities, configurationIssues };
}

export function resolveModifierOptionRules(data: CatalogModifier, override?: CatalogModifierOverride) {
  return {
    hiddenOnline: resolveToggle(override?.hiddenOnlineOverride, data.hiddenOnline),
    onByDefault: resolveToggle(override?.onByDefaultOverride, data.onByDefault),
  };
}

/** Defaults are Square's explicit defaults, never inferred from labels, prices, or minimums. */
export function defaultModifierSelections(groups: ModifierList[]): Record<string, string[]> {
  return Object.fromEntries(groups.filter((group) => group.enabled !== false).map((group) => [
    group.id,
    group.configurationIssues?.length ? [] : group.options
      .filter((option) => option.onByDefault && option.availability?.available)
      .map((option) => option.id),
  ]));
}

/** Shared by the customizer and checkout; quantity is always one per modifier. */
export function validateModifierSelections(groups: ModifierList[], selected: string[]): {
  code: "INVALID_OPTIONS" | "ITEM_UNAVAILABLE";
  message: string;
} | null {
  const enabled = groups.filter((group) => group.enabled !== false);
  const issue = enabled.flatMap((group) => group.configurationIssues ?? [])[0];
  if (issue) return { code: "INVALID_OPTIONS", message: issue.message };
  if (new Set(selected).size !== selected.length) return {
    code: "INVALID_OPTIONS", message: "Each option can only be selected once.",
  };
  const options = new Map(enabled.flatMap((group) => group.options.map((option) => [option.id, option] as const)));
  if (selected.some((id) => !options.has(id) || options.get(id)?.hiddenOnline)) return {
    code: "INVALID_OPTIONS", message: "Some selected options are no longer offered for this drink.",
  };
  for (const group of enabled) {
    const count = selected.filter((id) => group.options.some((option) => option.id === id)).length;
    const min = group.minSelectedModifiers ?? 0;
    const max = group.maxSelectedModifiers ?? 0;
    if (count < min) return {
      code: "INVALID_OPTIONS", message: `Please select at least ${min} option${min === 1 ? "" : "s"} for "${group.name || "Customization"}".`,
    };
    if (max > 0 && count > max) return {
      code: "INVALID_OPTIONS", message: `Please select no more than ${max} option${max === 1 ? "" : "s"} for "${group.name || "Customization"}".`,
    };
  }
  if (selected.some((id) => !options.get(id)?.availability?.available)) return {
    code: "ITEM_UNAVAILABLE", message: "Some selected options are no longer available. Choose alternatives or remove them.",
  };
  return null;
}
