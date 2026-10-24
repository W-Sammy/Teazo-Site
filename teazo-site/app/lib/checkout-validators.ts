import type {
  CheckoutRequestBody,
  CheckoutItemRequest,
  CustomerContact,
  PickupTiming,
} from "@/app/types/checkout";
import { isValidEmail } from "@/app/lib/website-content-validators";

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

/** A US or Canadian number: area code and exchange can't start with 0 or 1. */
const NANP_NUMBER = /^1[2-9]\d{2}[2-9]\d{6}$/;

/**
 * Turns a phone number as the customer typed it into E.164 (+14155550199),
 * the format Square stores and texts. Ten digits, or eleven starting with 1,
 * are read as US numbers. Anything else needs a leading + and a country code.
 * Returns null for anything that can't be a real number.
 */
export function toE164Phone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    if (digits.startsWith("1")) return NANP_NUMBER.test(digits) ? `+${digits}` : null;
    return /^[2-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }

  const national = digits.length === 10 ? `1${digits}` : digits;
  return NANP_NUMBER.test(national) ? `+${national}` : null;
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

  const phone = toE164Phone(value.phone);
  if (!phone) {
    return {
      ok: false,
      error:
        "A valid customer phone number is required, such as (415) 555-0199, or an international number starting with +.",
    };
  }

  return {
    ok: true,
    data: {
      displayName,
      email: (value.email as string).trim(),
      phone,
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

  const catalogObjectId =
    typeof value.catalogObjectId === "string" ? value.catalogObjectId.trim() : "";
  if (!catalogObjectId) {
    return { ok: false, error: `${itemLabel}: catalogObjectId is required.` };
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
      catalogObjectId,
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
