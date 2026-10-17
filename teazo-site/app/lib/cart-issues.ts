import type { CartItem, CheckoutErrorResponse } from "@/app/types/checkout";

/**
 * Checkout errors that name specific cart lines. They come from checking the
 * cart against the live Square catalog (validateCartAgainstCatalog in
 * app/lib/catalog-validation.ts): a drink or option sold out or hidden after
 * it went into the bag, or options that don't fit the drink's rules.
 */
export type CartIssueCode = "ITEM_UNAVAILABLE" | "INVALID_OPTIONS";

export interface CartIssue {
  code: CartIssueCode;
  variationIds: string[];
}

/** The cart lines a checkout error points at, or null for any other kind of error. */
export function readCartIssue(error: Partial<CheckoutErrorResponse> | null | undefined): CartIssue | null {
  if (!error || (error.code !== "ITEM_UNAVAILABLE" && error.code !== "INVALID_OPTIONS")) return null;
  const variationIds = Array.isArray(error.variationIds)
    ? error.variationIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return variationIds.length > 0 ? { code: error.code, variationIds } : null;
}

/** The items in the cart that an issue names. Empty once they've all been removed. */
export function cartItemsWithIssue(items: CartItem[], issue: CartIssue | null): CartItem[] {
  if (!issue) return [];
  const named = new Set(issue.variationIds);
  return items.filter((item) => named.has(item.variationId));
}

/** What the cart says under an item with this issue. */
export function cartIssueMessage(code: CartIssueCode): string {
  return code === "ITEM_UNAVAILABLE"
    ? "No longer available. Remove it to continue."
    : "These choices aren't available for this drink anymore. Edit or remove it.";
}
