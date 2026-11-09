/**
 * Tests request-body validation for creating and editing menu items.
 *
 * Covers required names, integer-cent prices, USD currency,
 * optional descriptions, category IDs, modifier list IDs, and
 * partial update behavior.
 *
 * These are pure validators. No Square API or database
 * connections are required.
 */

import { describe, expect, it } from "vitest";

import {
  validateCreateMenuItemBody,
  validateUpdateMenuItemBody,
} from "./menu-item-validators";

function createBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "Brown Sugar Milk Tea",
    priceCents: 650,
    ...overrides,
  };
}

describe("Create menu item validation", () => {
  // ============================================================
  // Valid creation requests
  // ============================================================

  it("accepts a valid menu item", () => {
    expect(
      validateCreateMenuItemBody(createBody()),
    ).toEqual({
      ok: true,
      data: {
        name: "Brown Sugar Milk Tea",
        priceCents: 650,
        description: undefined,
        currency: undefined,
        categoryIds: undefined,
        modifierListIds: undefined,
      },
    });
  });

  it("trims the item name and description", () => {
    const result = validateCreateMenuItemBody(
      createBody({
        name: "  Milk Tea  ",
        description: "  Served cold  ",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        name: "Milk Tea",
        description: "Served cold",
      },
    });
  });

  it("accepts zero-priced menu items", () => {
    const result = validateCreateMenuItemBody(
      createBody({ priceCents: 0 }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { priceCents: 0 },
    });
  });

  it("accepts USD currency and valid associations", () => {
    const result = validateCreateMenuItemBody(
      createBody({
        currency: "USD",
        categoryIds: ["tea-1", "specials-2"],
        modifierListIds: ["size-1"],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        currency: "USD",
        categoryIds: ["tea-1", "specials-2"],
        modifierListIds: ["size-1"],
      },
    });
  });

  it("accepts empty category and modifier lists", () => {
    const result = validateCreateMenuItemBody(
      createBody({
        categoryIds: [],
        modifierListIds: [],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        categoryIds: [],
        modifierListIds: [],
      },
    });
  });

  // ============================================================
  // Invalid request structures and names
  // ============================================================

  it.each([
    null,
    undefined,
    [],
    "menu item",
    100,
  ])("rejects non-object create body %#", (value) => {
    expect(validateCreateMenuItemBody(value)).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
  });

  it.each([
    undefined,
    null,
    "",
    "  ",
    42,
  ])("rejects invalid item name %#", (name) => {
    expect(
      validateCreateMenuItemBody(
        createBody({ name }),
      ),
    ).toEqual({
      ok: false,
      error: "A menu item name is required.",
    });
  });

  // ============================================================
  // Price validation
  // ============================================================

  // Money is represented in whole cents to avoid float errors.
  it.each([
    -1,
    6.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    "650",
    null,
    undefined,
  ])("rejects invalid priceCents %#", (priceCents) => {
    expect(
      validateCreateMenuItemBody(
        createBody({ priceCents }),
      ),
    ).toEqual({
      ok: false,
      error: "priceCents must be a nonnegative whole number.",
    });
  });

  it("accepts the largest safe integer cent amount", () => {
    const result = validateCreateMenuItemBody(
      createBody({
        priceCents: Number.MAX_SAFE_INTEGER,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        priceCents: Number.MAX_SAFE_INTEGER,
      },
    });
  });

  // ============================================================
  // Optional field validation
  // ============================================================

  it("rejects a non-string description", () => {
    expect(
      validateCreateMenuItemBody(
        createBody({ description: 123 }),
      ),
    ).toEqual({
      ok: false,
      error: "description must be a string.",
    });
  });

  it.each(["EUR", "usd", "", 100])(
    "rejects unsupported currency %#",
    (currency) => {
      expect(
        validateCreateMenuItemBody(
          createBody({ currency }),
        ),
      ).toEqual({
        ok: false,
        error: "currency must be USD.",
      });
    },
  );

  it.each([
    "categoryIds",
    "modifierListIds",
  ])("rejects non-array %s", (field) => {
    const result = validateCreateMenuItemBody(
      createBody({ [field]: "item-1" }),
    );

    expect(result).toEqual({
      ok: false,
      error: `${field} must be an array of nonempty strings.`,
    });
  });

    it.each([
    { ids: ["", "item-2"] },
    { ids: ["  "] },
    { ids: [123] },
    { ids: [null] },
  ])("rejects invalid association identifiers $ids", ({ ids }) => {
    expect(
      validateCreateMenuItemBody(
        createBody({ categoryIds: ids }),
      ),
    ).toEqual({
      ok: false,
      error: "categoryIds must be an array of nonempty strings.",
    });
  });
});

describe("Update menu item validation", () => {
  // ============================================================
  // Valid partial updates
  // ============================================================

  it("accepts a name-only update", () => {
    expect(
      validateUpdateMenuItemBody({
        name: "  Updated Tea  ",
      }),
    ).toEqual({
      ok: true,
      data: {
        name: "Updated Tea",
      },
    });
  });

  it("accepts a price-only update", () => {
    expect(
      validateUpdateMenuItemBody({
        priceCents: 700,
      }),
    ).toEqual({
      ok: true,
      data: {
        priceCents: 700,
      },
    });
  });

  it("accepts clearing an optional description", () => {
    expect(
      validateUpdateMenuItemBody({
        description: "  ",
      }),
    ).toEqual({
      ok: true,
      data: {
        description: "",
      },
    });
  });

  it("accepts clearing category and modifier associations", () => {
    expect(
      validateUpdateMenuItemBody({
        categoryIds: [],
        modifierListIds: [],
      }),
    ).toEqual({
      ok: true,
      data: {
        categoryIds: [],
        modifierListIds: [],
      },
    });
  });

  it("accepts multiple valid updated fields", () => {
    expect(
      validateUpdateMenuItemBody({
        name: "  New Menu Item ",
        description: "  Updated  ",
        priceCents: 725,
        currency: "USD",
        categoryIds: ["category-1"],
        modifierListIds: ["modifier-1"],
      }),
    ).toEqual({
      ok: true,
      data: {
        name: "New Menu Item",
        description: "Updated",
        priceCents: 725,
        currency: "USD",
        categoryIds: ["category-1"],
        modifierListIds: ["modifier-1"],
      },
    });
  });

  // ============================================================
  // Invalid partial updates
  // ============================================================

  it.each([
    null,
    undefined,
    [],
    "update",
  ])("rejects non-object update body %#", (value) => {
    expect(validateUpdateMenuItemBody(value)).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
  });

  it("rejects an empty update", () => {
    expect(validateUpdateMenuItemBody({})).toEqual({
      ok: false,
      error: "At least one menu item field must be provided.",
    });
  });

  it("rejects updates containing only unknown fields", () => {
    expect(
      validateUpdateMenuItemBody({
        unknownField: "value",
      }),
    ).toEqual({
      ok: false,
      error: "At least one menu item field must be provided.",
    });
  });

  it("rejects empty updated names", () => {
    expect(
      validateUpdateMenuItemBody({
        name: "   ",
      }),
    ).toEqual({
      ok: false,
      error: "name must be a nonempty string.",
    });
  });

  it("rejects invalid updated descriptions", () => {
    expect(
      validateUpdateMenuItemBody({
        description: null,
      }),
    ).toEqual({
      ok: false,
      error: "description must be a string.",
    });
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "750",
  ])("rejects invalid updated price %#", (priceCents) => {
    expect(
      validateUpdateMenuItemBody({
        priceCents,
      }),
    ).toEqual({
      ok: false,
      error: "priceCents must be a nonnegative whole number.",
    });
  });

  it("rejects unsupported updated currency", () => {
    expect(
      validateUpdateMenuItemBody({
        currency: "EUR",
      }),
    ).toEqual({
      ok: false,
      error: "currency must be USD.",
    });
  });

  it("rejects invalid updated category IDs", () => {
    expect(
      validateUpdateMenuItemBody({
        categoryIds: ["valid", ""],
      }),
    ).toEqual({
      ok: false,
      error: "categoryIds must be an array of nonempty strings.",
    });
  });

  it("rejects invalid updated modifier IDs", () => {
    expect(
      validateUpdateMenuItemBody({
        modifierListIds: [null],
      }),
    ).toEqual({
      ok: false,
      error: "modifierListIds must be an array of nonempty strings.",
    });
  });
});
