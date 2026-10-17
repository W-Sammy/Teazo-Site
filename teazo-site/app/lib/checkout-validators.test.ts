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

const customer = { displayName: "Test Customer", email: "test@example.com", phone: "(415) 555-0100" };
const items = [{ variationId: "VAR1", quantity: 1 }];

describe("validateCheckoutRequestBody", () => {
  it("accepts a valid ASAP order and returns the phone in E.164", () => {
    const result = validateCheckoutRequestBody({ customer, pickupTiming: { type: "ASAP" }, items });
    expect(result).toEqual({
      ok: true,
      data: {
        customer: { ...customer, phone: "+14155550100" },
        pickupTiming: { type: "ASAP" },
        items: [{ variationId: "VAR1", quantity: 1, notes: undefined, modifierOptionIds: undefined }],
      },
    });
  });

  it.each([
    ["no customer", { pickupTiming: { type: "ASAP" }, items }, "Customer details are required."],
    ["a bad email", { customer: { ...customer, email: "nope" }, pickupTiming: { type: "ASAP" }, items }, "email"],
    ["a bad phone", { customer: { ...customer, phone: "555" }, pickupTiming: { type: "ASAP" }, items }, "phone"],
    ["a long name", { customer: { ...customer, displayName: "x".repeat(101) }, pickupTiming: { type: "ASAP" }, items }, "name"],
    ["an unknown timing type", { customer, pickupTiming: { type: "LATER" }, items }, "ASAP"],
    ["a scheduled order with no time", { customer, pickupTiming: { type: "SCHEDULED" }, items }, "pickupAt"],
    ["a scheduled order with a bad time", { customer, pickupTiming: { type: "SCHEDULED", pickupAt: "soon" }, items }, "ISO-8601"],
    ["an empty cart", { customer, pickupTiming: { type: "ASAP" }, items: [] }, "at least one item"],
    ["quantity 0", { customer, pickupTiming: { type: "ASAP" }, items: [{ variationId: "V", quantity: 0 }] }, "quantity"],
    ["quantity 51", { customer, pickupTiming: { type: "ASAP" }, items: [{ variationId: "V", quantity: 51 }] }, "quantity"],
    ["a fractional quantity", { customer, pickupTiming: { type: "ASAP" }, items: [{ variationId: "V", quantity: 1.5 }] }, "quantity"],
    ["a note over 150 characters", { customer, pickupTiming: { type: "ASAP" }, items: [{ variationId: "V", quantity: 1, notes: "x".repeat(151) }] }, "notes"],
    ["blank option IDs", { customer, pickupTiming: { type: "ASAP" }, items: [{ variationId: "V", quantity: 1, modifierOptionIds: [" "] }] }, "modifierOptionIds"],
    ["more than 50 lines", { customer, pickupTiming: { type: "ASAP" }, items: Array(51).fill(items[0]) }, "more than 50"],
    ["a body that is not an object", [], "JSON object"],
  ])("refuses %s", (_label, body, message) => {
    const result = validateCheckoutRequestBody(body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});
