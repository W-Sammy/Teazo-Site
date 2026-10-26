import type { MenuItem } from "@/app/types/menu-item";

/** Keep the drink's details available while ordering choices refresh. */
export function availableMenuChoices(item: MenuItem): MenuItem {
  const variations = (item.variations ?? []).filter((variation) => variation.availability?.available);
  return {
    ...item,
    variationId: variations[0]?.id,
    priceCents: variations[0]?.priceCents ?? item.priceCents,
    variations,
    modifiers: item.modifiers.filter((group) => group.enabled !== false).map((group) => ({
      ...group,
      options: group.options.filter((option) => option.availability?.available),
    })),
  };
}

/** Public ordering views fail closed if an availability snapshot is missing. */
export function orderableMenuItem(item: MenuItem): MenuItem | null {
  if (!item.availability?.available) return null;
  const available = availableMenuChoices(item);
  return available.variations?.length ? available : null;
}

export function availabilityDescription(item: Pick<MenuItem, "availability">): string {
  return item.availability?.available
    ? "Available"
    : item.availability?.reasons.map((reason) => reason.message).join(" ") || "Availability unknown";
}
