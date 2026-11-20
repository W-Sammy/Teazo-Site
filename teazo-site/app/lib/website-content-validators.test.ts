import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  isValidHolidayDate,
  parseHolidayDate,
  validateHolidays,
  validateWebsiteContentPatch,
} from "@/app/lib/website-content-validators";

describe("holiday dates", () => {
  it("parse yearly, one-time and half-picked dates", () => {
    expect(parseHolidayDate("12-25")).toEqual({ year: null, month: 12, day: 25 });
    expect(parseHolidayDate("2026-11-26")).toEqual({ year: 2026, month: 11, day: 26 });
    expect(parseHolidayDate("12-")).toEqual({ year: null, month: 12, day: null });
    expect(parseHolidayDate("2026--")).toEqual({ year: 2026, month: null, day: null });
    expect(parseHolidayDate("")).toEqual({ year: null, month: null, day: null });
  });

  it("allow Feb 29 for a yearly holiday and only in leap years for a one-time one", () => {
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(2, 2028)).toBe(29);
    expect(daysInMonth(2, 2027)).toBe(28);
    expect(daysInMonth(2, 2100)).toBe(28);
    expect(isValidHolidayDate("02-29")).toBe(true);
    expect(isValidHolidayDate("2028-02-29")).toBe(true);
    expect(isValidHolidayDate("2027-02-29")).toBe(false);
  });

  it.each(["12-25", "2026-11-26", "2026-01-01"])("accept %s", (date) => {
    expect(isValidHolidayDate(date)).toBe(true);
  });

  it.each(["", "12-", "2026--", "13-01", "04-31", "2026-4-1", "1999-12-25", "12/25", "2026-12-25T00:00"])(
    "refuse %j",
    (date) => {
      expect(isValidHolidayDate(date)).toBe(false);
    },
  );
});

describe("validateHolidays", () => {
  const holiday = (date: string, name = "Holiday") => ({ id: date, name, date, closed: true });

  it("allows a one-time date on the same day as a yearly holiday", () => {
    expect(validateHolidays([holiday("12-25"), holiday("2026-12-25")]).valid).toBe(true);
  });

  it("refuses the same date twice", () => {
    expect(validateHolidays([holiday("12-25"), holiday("12-25")]).valid).toBe(false);
    expect(validateHolidays([holiday("2026-11-26"), holiday("2026-11-26")]).valid).toBe(false);
  });

  it("refuses an impossible date and a missing name", () => {
    expect(validateHolidays([holiday("2027-02-29")]).valid).toBe(false);
    expect(validateHolidays([holiday("12-25", " ")]).valid).toBe(false);
  });
});

// delivery tests
describe("delivery link validation", () => {
  const platform = {
    id: "delivery-test", label: "Test Delivery", icon: "",
    url: "https://example.com/order", enabled: true,
  };

  function validateDelivery(deliveryLinks: unknown) {
    // deliberately allow malformed values here to test what an actual request could contain
    return validateWebsiteContentPatch({ deliveryLinks } as Parameters<typeof validateWebsiteContentPatch>[0]);
  }

  it.each(["http://example.com/order", "https://example.com/order"])("accepts a complete platform with %s", (url) => {
    expect(validateDelivery([{ ...platform, url }]).valid).toBe(true);
  });

  it("accepts an empty list so the final platform can be removed", () => {
    expect(validateDelivery([]).valid).toBe(true);
  });

  it("accepts a complete hidden platform", () => {
    expect(validateDelivery([{ ...platform, enabled: false }]).valid).toBe(true);
  });

  it("accepts exactly 16 name characters", () => {
    expect(validateDelivery([{ ...platform, label: "abcdefghijklmnop" }]).valid).toBe(true);
  });

  it.each([true, false])("rejects a 17 character name when visibility is %s", (enabled) => {
    expect(validateDelivery([{ ...platform, label: "abcdefghijklmnopq", enabled }]).valid).toBe(false);
  });

  it.each([
    { name: "null list", value: null },
    { name: "string list", value: "not a list" },
    { name: "object list", value: {} },
    { name: "null entry", value: [null] },
    { name: "numeric entry", value: [42] },
    { name: "array entry", value: [[]] },
    { name: "numeric name", value: [{ ...platform, label: 123 }] },
    { name: "numeric URL", value: [{ ...platform, url: 123 }] },
    { name: "string visibility", value: [{ ...platform, enabled: "false" }] },
    { name: "missing visibility", value: [{ id: platform.id, label: platform.label, url: platform.url }] },
  ])("returns validation errors without throwing for $name", ({ value }) => {
    const result = validateDelivery(value);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("still rejects email destinations on hidden delivery items", () => {
    expect(validateDelivery([{ ...platform, url: "tea@example.com", enabled: false }]).valid).toBe(false);
  });

  it("continues allowing email destinations and longer names for social links", () => {
    const result = validateWebsiteContentPatch({
      socialLinks: [{ ...platform, label: "A longer social platform name", url: "tea@example.com" }],
    });
    expect(result.valid).toBe(true);
  });
});