import type {
  CreateMenuItemBody,
  UpdateMenuItemBody,
} from "@/app/types/menu-item";

type ValidationResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

const allowedCurrencies = new Set(["USD"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.trim().length > 0,
    )
  );
}

function validateName(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function validatePriceCents(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null;
  }

  return value;
}

function validateCurrency(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !allowedCurrencies.has(value)
  ) {
    return null;
  }

  return value;
}

export function validateCreateMenuItemBody(
  value: unknown,
): ValidationResult<CreateMenuItemBody> {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Request body must be a JSON object.",
    };
  }

  const name = validateName(value.name);

  if (!name) {
    return {
      ok: false,
      error: "A menu item name is required.",
    };
  }

  const priceCents = validatePriceCents(value.priceCents);

  if (priceCents === null) {
    return {
      ok: false,
      error: "priceCents must be a nonnegative whole number.",
    };
  }

  if (
    value.description !== undefined &&
    typeof value.description !== "string"
  ) {
    return {
      ok: false,
      error: "description must be a string.",
    };
  }

  if (
    value.currency !== undefined &&
    validateCurrency(value.currency) === null
  ) {
    return {
      ok: false,
      error: "currency must be USD.",
    };
  }

  if (
    value.categoryIds !== undefined &&
    !isStringArray(value.categoryIds)
  ) {
    return {
      ok: false,
      error: "categoryIds must be an array of nonempty strings.",
    };
  }

  if (
    value.modifierListIds !== undefined &&
    !isStringArray(value.modifierListIds)
  ) {
    return {
      ok: false,
      error: "modifierListIds must be an array of nonempty strings.",
    };
  }

  return {
    ok: true,
    data: {
      name,
      priceCents,
      description:
        typeof value.description === "string"
          ? value.description.trim()
          : undefined,
      currency:
        typeof value.currency === "string"
          ? value.currency
          : undefined,
      categoryIds:
        value.categoryIds as string[] | undefined,
      modifierListIds:
        value.modifierListIds as string[] | undefined,
    },
  };
}

export function validateUpdateMenuItemBody(
  value: unknown,
): ValidationResult<UpdateMenuItemBody> {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Request body must be a JSON object.",
    };
  }

  const allowedFields = [
    "name",
    "description",
    "priceCents",
    "currency",
    "categoryIds",
    "modifierListIds",
  ];

  const suppliedFields = Object.keys(value).filter((key) =>
    allowedFields.includes(key),
  );

  if (suppliedFields.length === 0) {
    return {
      ok: false,
      error: "At least one menu item field must be provided.",
    };
  }

  const data: UpdateMenuItemBody = {};

  if (value.name !== undefined) {
    const name = validateName(value.name);

    if (!name) {
      return {
        ok: false,
        error: "name must be a nonempty string.",
      };
    }

    data.name = name;
  }

  if (value.description !== undefined) {
    if (typeof value.description !== "string") {
      return {
        ok: false,
        error: "description must be a string.",
      };
    }

    data.description = value.description.trim();
  }

  if (value.priceCents !== undefined) {
    const priceCents = validatePriceCents(value.priceCents);

    if (priceCents === null) {
      return {
        ok: false,
        error: "priceCents must be a nonnegative whole number.",
      };
    }

    data.priceCents = priceCents;
  }

  if (value.currency !== undefined) {
    const currency = validateCurrency(value.currency);

    if (!currency) {
      return {
        ok: false,
        error: "currency must be USD.",
      };
    }

    data.currency = currency;
  }

  if (value.categoryIds !== undefined) {
    if (!isStringArray(value.categoryIds)) {
      return {
        ok: false,
        error: "categoryIds must be an array of nonempty strings.",
      };
    }

    data.categoryIds = value.categoryIds;
  }

  if (value.modifierListIds !== undefined) {
    if (!isStringArray(value.modifierListIds)) {
      return {
        ok: false,
        error: "modifierListIds must be an array of nonempty strings.",
      };
    }

    data.modifierListIds = value.modifierListIds;
  }

  return {
    ok: true,
    data,
  };
}