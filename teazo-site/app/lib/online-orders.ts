/**
 * Square order metadata that marks an order as placed through this website's
 * checkout. The public order lookup answers only for orders carrying it, so it
 * can't be used to read in-store orders. Staff never see metadata.
 */
export const ONLINE_ORDER_METADATA_KEY = "teazo_source";
export const ONLINE_ORDER_METADATA_VALUE = "website_checkout";

export const ONLINE_ORDER_METADATA: Record<string, string> = {
  [ONLINE_ORDER_METADATA_KEY]: ONLINE_ORDER_METADATA_VALUE,
};

export function isOnlineCheckoutOrder(order: {
  metadata?: Record<string, string | null | undefined> | null;
}): boolean {
  return order.metadata?.[ONLINE_ORDER_METADATA_KEY] === ONLINE_ORDER_METADATA_VALUE;
}

/** Square order IDs are short runs of letters, digits, - and _. Anything else is not worth a lookup. */
export function isPlausibleOrderId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(id);
}
