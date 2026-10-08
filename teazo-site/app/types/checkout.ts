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
  variationId: string; // Square Variation ID (Size)
  name: string;
  basePriceCents: number;
  imageUrl: string | null;
  selectedModifiers: CartModifierChoice[];
  quantity: number;
  notes?: string;
  itemTotalCents: number; // (basePriceCents + sum(modifierPrices)) * quantity
}

export interface CheckoutItemRequest {
  variationId: string;
  quantity: number;
  notes?: string;
  modifierOptionIds?: string[];
}

export interface CheckoutRequestBody {
  customer: CustomerContact;
  pickupTiming: PickupTiming;
  items: CheckoutItemRequest[];
}

export interface CheckoutSuccessResponse {
  checkoutUrl: string;
  orderId: string;
}

export interface CheckoutErrorResponse {
  error: string;
  details?: unknown;
}
