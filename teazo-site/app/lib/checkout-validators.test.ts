import { describe, expect, it } from "vitest";
import { toE164Phone, validateCheckoutRequestBody } from "@/app/lib/checkout-validators";

describe("toE164Phone", () => {
  it.each([
    ["4155550199", "+14155550199"],
    ["(415) 555-0199", "+14155550199"],
    ["415.555.0199", "+14155550199"],
    [" 1 415 555 0199 ", "+14155550199"],
    ["+1 (415) 555-0199", "+14155550199"],
    ["+44 20 7946 0958", "+442079460958"],
    ["+52 55 1234 5678", "+525512345678"],
  ])("reads %j as %s", (input, expected) => {
    expect(toE164Phone(input)).toBe(expected);
  });

  it.each([
    ["too short", "555-0199"],
    ["11 digits not starting with 1", "24155550199"],
    ["area code starting with 0", "0155550199"],
    ["exchange starting with 1", "4151550199"],
    ["international without a plus", "442079460958"],
    ["+1 with too many digits", "+1 415 555 01999"],
    ["more than 15 digits", "+4420794609581234"],
    ["letters", "415-555-CALL"],
    ["empty", ""],
  ])("refuses %s", (_label, input) => {
    expect(toE164Phone(input)).toBeNull();
  });

  it("refuses values that are not strings", () => {
    expect(toE164Phone(4155550199)).toBeNull();
    expect(toE164Phone(undefined)).toBeNull();
  });
});

const checkoutAttemptId = "11111111-1111-4111-8111-111111111111";
const customer = {
  displayName: "Test Customer",
  email: "test@example.com",
  phone: "(415) 555-0100",
};
const items = [
  { catalogObjectId: "ITEM1", variationId: "VAR1", quantity: 1 },
];

// Supply a valid attempt ID by default so existing tests still exercise
// their intended customer, pickup timing, and cart validation rules.
function checkoutBody(overrides: Record<string, unknown> = {}) {
  return {
    checkoutAttemptId,
    customer,
    pickupTiming: { type: "ASAP" },
    items,
    ...overrides,
  };
}

describe("validateCheckoutRequestBody", () => {
  it("accepts a valid ASAP order and returns the phone in E.164", () => {
    const result = validateCheckoutRequestBody(checkoutBody());

    expect(result).toEqual({
      ok: true,
      data: {
        checkoutAttemptId,
        customer: {
          ...customer,
          phone: "+14155550100",
        },
        pickupTiming: { type: "ASAP" },
        items: [
          {
            catalogObjectId: "ITEM1",
            variationId: "VAR1",
            quantity: 1,
            notes: undefined,
            modifierOptionIds: undefined,
          },
        ],
      },
    });
  });

  it("preserves and trims a valid attempt UUID", () => {
    const result = validateCheckoutRequestBody(
      checkoutBody({
        checkoutAttemptId: "  22222222-2222-4222-8222-222222222222  ",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.checkoutAttemptId).toBe(
        "22222222-2222-4222-8222-222222222222",
      );
    }
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
    ["not a UUID", "checkout-attempt-1"],
    ["invalid version", "11111111-1111-0111-8111-111111111111"],
    ["invalid variant", "11111111-1111-4111-1111-111111111111"],
    ["number", 12345],
  ])("rejects %s checkout attempt ID", (_label, value) => {
    const result = validateCheckoutRequestBody(
      checkoutBody({ checkoutAttemptId: value }),
    );

    expect(result).toEqual({
      ok: false,
      error: "A valid checkout attempt ID is required.",
    });
  });

  it.each([
    ["missing parent item", { items: [{ variationId: "VAR1", quantity: 1 }] }, "catalogObjectId"],
    ["blank parent item", { items: [{ catalogObjectId: " ", variationId: "VAR1", quantity: 1 }] }, "catalogObjectId"],
    ["missing size", { items: [{ catalogObjectId: "ITEM1", quantity: 1 }] }, "variationId"],
    ["no customer", { customer: undefined }, "Customer details are required."],
    ["a bad email", { customer: { ...customer, email: "nope" } }, "email"],
    ["a bad phone", { customer: { ...customer, phone: "555" } }, "phone"],
    ["a long name", { customer: { ...customer, displayName: "x".repeat(101) } }, "name"],
    ["an unknown timing type", { pickupTiming: { type: "LATER" } }, "ASAP"],
    ["a scheduled order with no time", { pickupTiming: { type: "SCHEDULED" } }, "pickupAt"],
    ["a scheduled order with a bad time", { pickupTiming: { type: "SCHEDULED", pickupAt: "soon" } }, "ISO-8601"],
    ["an empty cart", { items: [] }, "at least one item"],
    ["quantity 0", { items: [{ catalogObjectId: "ITEM1", variationId: "V", quantity: 0 }] }, "quantity"],
    ["quantity 51", { items: [{ catalogObjectId: "ITEM1", variationId: "V", quantity: 51 }] }, "quantity"],
    ["a fractional quantity", { items: [{ catalogObjectId: "ITEM1", variationId: "V", quantity: 1.5 }] }, "quantity"],
    ["a note over 150 characters", { items: [{ catalogObjectId: "ITEM1", variationId: "V", quantity: 1, notes: "x".repeat(151) }] }, "notes"],
    ["blank option IDs", { items: [{ catalogObjectId: "ITEM1", variationId: "V", quantity: 1, modifierOptionIds: [" "] }] }, "modifierOptionIds"],
    ["more than 50 lines", { items: Array(51).fill(items[0]) }, "more than 50"],
    ["a body that is not an object", [], "JSON object"],
  ])("refuses %s", (_label, overrides, message) => {
    const body = Array.isArray(overrides)
      ? overrides
      : checkoutBody(overrides);

    const result = validateCheckoutRequestBody(body);
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toContain(message);
    }
  });
});
