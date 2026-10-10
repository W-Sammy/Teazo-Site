import type {
  CheckoutRequestBody,
  CheckoutItemRequest,
  CustomerContact,
  PickupTiming,
} from "@/app/types/checkout";
import { isValidEmail, isValidPhone } from "@/app/lib/website-content-validators";

export type ValidationResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

const MAX_ITEMS = 50;
const MAX_ITEM_QUANTITY = 50;
const MAX_NOTES_LENGTH = 150;
const MAX_NAME_LENGTH = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  );
}

/**
 * Validates customer contact details.
 */
export function validateCustomerContact(
  value: unknown,
): ValidationResult<CustomerContact> {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Customer details are required.",
    };
  }

  const displayName =
    typeof value.displayName === "string" ? value.displayName.trim() : "";
  if (!displayName || displayName.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Customer name is required and must be between 1 and ${MAX_NAME_LENGTH} characters.`,
    };
  }

  if (!isValidEmail(value.email)) {
    return {
      ok: false,
      error: "A valid customer email address is required.",
    };
  }

  if (!isValidPhone(value.phone)) {
    return {
      ok: false,
      error: "A valid customer phone number (at least 10 digits) is required.",
    };
  }

  return {
    ok: true,
    data: {
      displayName,
      email: (value.email as string).trim(),
      phone: (value.phone as string).trim(),
    },
  };
}

/**
 * Validates pickup timing format (type and presence/format of pickupAt).
 * Note: Business hours, cutoff, and lead time are verified via `validatePickupTiming` in store-hours.ts.
 */
export function validatePickupTimingRequest(
  value: unknown,
): ValidationResult<PickupTiming> {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Pickup timing details are required.",
    };
  }

  const type = value.type;
  if (type !== "ASAP" && type !== "SCHEDULED") {
    return {
      ok: false,
      error: "Pickup timing type must be either 'ASAP' or 'SCHEDULED'.",
    };
  }

  if (type === "SCHEDULED") {
    const pickupAt =
      typeof value.pickupAt === "string" ? value.pickupAt.trim() : "";
    if (!pickupAt) {
      return {
        ok: false,
        error: "Scheduled pickup time (pickupAt) is required for scheduled orders.",
      };
    }

    if (Number.isNaN(Date.parse(pickupAt))) {
      return {
        ok: false,
        error: "Scheduled pickup time must be a valid ISO-8601 date string.",
      };
    }

    return {
      ok: true,
      data: {
        type: "SCHEDULED",
        pickupAt,
      },
    };
  }

  return {
    ok: true,
    data: {
      type: "ASAP",
    },
  };
}

/**
 * Validates an individual line item in the checkout request.
 */
export function validateCheckoutItem(
  value: unknown,
  itemIndex: number = 0,
): ValidationResult<CheckoutItemRequest> {
  const itemLabel = `Item ${itemIndex + 1}`;

  if (!isRecord(value)) {
    return {
      ok: false,
      error: `${itemLabel} must be an object.`,
    };
  }

  const variationId =
    typeof value.variationId === "string" ? value.variationId.trim() : "";
  if (!variationId) {
    return {
      ok: false,
      error: `${itemLabel}: variationId is required.`,
    };
  }

  const quantity = value.quantity;
  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_ITEM_QUANTITY
  ) {
    return {
      ok: false,
      error: `${itemLabel}: quantity must be a whole number between 1 and ${MAX_ITEM_QUANTITY}.`,
    };
  }

  let notes: string | undefined = undefined;
  if (value.notes !== undefined && value.notes !== null) {
    if (typeof value.notes !== "string") {
      return {
        ok: false,
        error: `${itemLabel}: notes must be a string.`,
      };
    }
    const trimmedNotes = value.notes.trim();
    if (trimmedNotes.length > MAX_NOTES_LENGTH) {
      return {
        ok: false,
        error: `${itemLabel}: notes cannot exceed ${MAX_NOTES_LENGTH} characters.`,
      };
    }
    notes = trimmedNotes.length > 0 ? trimmedNotes : undefined;
  }

  let modifierOptionIds: string[] | undefined = undefined;
  if (
    value.modifierOptionIds !== undefined &&
    value.modifierOptionIds !== null
  ) {
    if (!isStringArray(value.modifierOptionIds)) {
      return {
        ok: false,
        error: `${itemLabel}: modifierOptionIds must be an array of nonempty strings.`,
      };
    }
    modifierOptionIds = value.modifierOptionIds.map((id) => id.trim());
  }

  return {
    ok: true,
    data: {
      variationId,
      quantity,
      notes,
      modifierOptionIds,
    },
  };
}

/**
 * Validates the full checkout request payload before resolving Square locations or checking store hours.
 */
export function validateCheckoutRequestBody(
  value: unknown,
): ValidationResult<CheckoutRequestBody> {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Request body must be a JSON object.",
    };
  }

  // 1. Customer contact
  const customerResult = validateCustomerContact(value.customer);
  if (!customerResult.ok) {
    return customerResult;
  }

  // 2. Pickup timing format
  const timingResult = validatePickupTimingRequest(value.pickupTiming);
  if (!timingResult.ok) {
    return timingResult;
  }

  // 3. Items array
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return {
      ok: false,
      error: "Checkout request must contain at least one item.",
    };
  }

  if (value.items.length > MAX_ITEMS) {
    return {
      ok: false,
      error: `Checkout request cannot contain more than ${MAX_ITEMS} items.`,
    };
  }

  const validatedItems: CheckoutItemRequest[] = [];
  for (let i = 0; i < value.items.length; i++) {
    const itemResult = validateCheckoutItem(value.items[i], i);
    if (!itemResult.ok) {
      return itemResult;
    }
    validatedItems.push(itemResult.data);
  }

  return {
    ok: true,
    data: {
      customer: customerResult.data,
      pickupTiming: timingResult.data,
      items: validatedItems,
    },
  };
}
