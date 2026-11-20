export type PickupScheduleType = "ASAP" | "SCHEDULED";

export interface PickupTiming {
  type: PickupScheduleType;
  pickupAt?: string; // ISO-8601 string, required when type === "SCHEDULED"
}

export interface CustomerContact {
  displayName: string;
  email: string;
  phone: string;
}

export interface CustomerPickupDetails extends CustomerContact {
  pickupTiming: PickupTiming;
}

export interface CartModifierChoice {
  modifierListId: string;
  modifierListName: string;
  optionId: string;
  optionName: string;
  priceCents: number;
}

export interface CartItem {
  cartItemId: string; // Unique UUID per customization configuration
  catalogObjectId: string; // Square Item ID
  variationId: string;
  variationName?: string;
  name: string;
  basePriceCents: number;
  imageUrl: string | null;
  selectedModifiers: CartModifierChoice[];
  quantity: number;
  notes?: string;
  itemTotalCents: number;
}

export interface CheckoutItemRequest {
  catalogObjectId: string;
  variationId: string;
  quantity: number;
  notes?: string;
  modifierOptionIds?: string[];
}

export interface CheckoutRequestBody {
  /**
   * Stable UUID identifying one checkout attempt.
   * Reuse it when retrying the same purchase.
   * Generate a new UUID for a genuinely new purchase.
   */
  checkoutAttemptId: string;
  customer: CustomerContact;
  pickupTiming: PickupTiming;
  items: CheckoutItemRequest[];
  /** Token from the cart's Turnstile widget. Checked by the server before Square is contacted. */
  turnstileToken?: string;
}

export interface CheckoutSuccessResponse {
  checkoutUrl: string;
  orderId: string;
}

export interface CheckoutErrorResponse {
  error: string;
  /** e.g. "ORDERING_PAUSED", "RATE_LIMITED", "BOT_CHECK_FAILED", "ITEM_UNAVAILABLE", "INVALID_OPTIONS" */
  code?: string;
  /** With ITEM_UNAVAILABLE or INVALID_OPTIONS: the Square variation IDs of the cart lines at fault. */
  variationIds?: string[];
  details?: unknown;
}
