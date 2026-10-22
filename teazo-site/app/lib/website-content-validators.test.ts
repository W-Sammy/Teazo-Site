import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  isValidHolidayDate,
  parseHolidayDate,
  validateHolidays,
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
