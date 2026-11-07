import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  isValidDestination,
  isValidHolidayDate,
  normalizeDestination,
  parseAndNormalizeDestination,
  parseHolidayDate,
  validateHolidays,
  validateSocialLinks,
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

describe("destination parser and normalizer (Phase 3)", () => {
  it.each([
    ["instagram.com/teazosf", "https://instagram.com/teazosf", "url"],
    ["www.instagram.com/teazosf", "https://www.instagram.com/teazosf", "url"],
    ["facebook.com/people/TEAZO/100063111166083", "https://facebook.com/people/TEAZO/100063111166083", "url"],
    ["yelp.com/biz/teazo-san-francisco", "https://yelp.com/biz/teazo-san-francisco", "url"],
    ["sub.domain.co.uk:8080/path?q=1#hash", "https://sub.domain.co.uk:8080/path?q=1#hash", "url"],
  ])("normalizes domain-only value %s to %s", (input, expected, kind) => {
    const res = parseAndNormalizeDestination(input);
    expect(res).toEqual({ ok: true, destination: expected, kind });
    expect(normalizeDestination(input)).toBe(expected);
    expect(isValidDestination(input)).toBe(true);
  });

  it.each([
    ["https://instagram.com/teazosf", "https://instagram.com/teazosf"],
    ["http://facebook.com/teazo", "http://facebook.com/teazo"],
    ["HTTPS://INSTAGRAM.COM/TEAZOSF", "https://instagram.com/TEAZOSF"],
  ])("accepts full URL %s and normalizes scheme/host to %s", (input, expected) => {
    const res = parseAndNormalizeDestination(input);
    expect(res).toEqual({ ok: true, destination: expected, kind: "url" });
    expect(normalizeDestination(input)).toBe(expected);
    expect(isValidDestination(input)).toBe(true);
  });

  it.each([
    ["teazosf@hotmail.com", "mailto:teazosf@hotmail.com"],
    ["user.name+tag@sub.domain.com", "mailto:user.name+tag@sub.domain.com"],
  ])("normalizes bare email %s to %s", (input, expected) => {
    const res = parseAndNormalizeDestination(input);
    expect(res).toEqual({ ok: true, destination: expected, kind: "email" });
    expect(normalizeDestination(input)).toBe(expected);
    expect(isValidDestination(input)).toBe(true);
  });

  it.each([
    ["mailto:teazosf@hotmail.com", "mailto:teazosf@hotmail.com"],
    ["mailto:123support@example.com", "mailto:123support@example.com"],
    ["MAILTO:123@example.com?subject=Hello", "mailto:123@example.com?subject=Hello"],
    ["MAILTO:teazosf@hotmail.com", "mailto:teazosf@hotmail.com"],
    ["mailto:  teazosf@hotmail.com  ", "mailto:teazosf@hotmail.com"],
    ["mailto:user@domain.com?subject=Hello", "mailto:user@domain.com?subject=Hello"],
  ])("accepts explicit mailto %s and normalizes to %s", (input, expected) => {
    const res = parseAndNormalizeDestination(input);
    expect(res).toEqual({ ok: true, destination: expected, kind: "email" });
    expect(normalizeDestination(input)).toBe(expected);
    expect(isValidDestination(input)).toBe(true);
  });

  it.each([
    "123support@example.com",
    "mailto:123support@example.com",
    "example.com:8080/path",
    "https://example.com./path",
    "https://bücher.example/path",
  ])("keeps a normalized destination valid on subsequent reads: %s", (input) => {
    const parsed = parseAndNormalizeDestination(input);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parseAndNormalizeDestination(parsed.destination)).toEqual(parsed);
    }
  });

  it.each([
    "https://.",
    "https://..",
    "https://example..com",
    "http://.example.com",
    "https://-example.com",
    "https://example-.com",
    `https://${"a".repeat(64)}.com`,
    `https://${Array(4).fill("a".repeat(63)).join(".")}`,
  ])("rejects malformed website hostname %s", (input) => {
    expect(isValidDestination(input)).toBe(false);
    expect(normalizeDestination(input)).toBeNull();
  });

  it.each([
    ["   instagram.com/teazosf   ", "https://instagram.com/teazosf", "url"],
    ["   https://example.com   ", "https://example.com/", "url"],
    ["   teazosf@hotmail.com   ", "mailto:teazosf@hotmail.com", "email"],
    ["   mailto:teazosf@hotmail.com   ", "mailto:teazosf@hotmail.com", "email"],
  ])("trims surrounding whitespace for %j to %s", (input, expected, kind) => {
    const res = parseAndNormalizeDestination(input);
    expect(res).toEqual({ ok: true, destination: expected, kind });
  });

  it.each([
    ["javascript:alert(1)", 'Unsupported scheme "javascript:". Only http:, https:, and mailto: destinations are supported.'],
    ["data:text/html,<script>alert(1)</script>", 'Unsupported scheme "data:". Only http:, https:, and mailto: destinations are supported.'],
    ["ftp://files.example.com", 'Unsupported scheme "ftp:". Only http:, https:, and mailto: destinations are supported.'],
    ["file:///etc/passwd", 'Unsupported scheme "file:". Only http:, https:, and mailto: destinations are supported.'],
    ["tel:+14157487398", 'Unsupported scheme "tel:". Only http:, https:, and mailto: destinations are supported.'],
  ])("rejects unsupported scheme %s", (input, errorSubstring) => {
    const res = parseAndNormalizeDestination(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe(errorSubstring);
    }
    expect(normalizeDestination(input)).toBeNull();
    expect(isValidDestination(input)).toBe(false);
  });

  it.each([
    ["/about", "Relative paths are not supported."],
    ["../contact", "Relative paths are not supported."],
    ["//instagram.com/teazo", "Relative paths are not supported."],
  ])("rejects relative and protocol-relative path %s", (input, errorSubstring) => {
    const res = parseAndNormalizeDestination(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain(errorSubstring);
    }
  });

  it.each([
    ["", "Destination cannot be empty"],
    ["   ", "Destination cannot be empty"],
    ["https://", "Enter a valid website destination"],
    ["http://", "Enter a valid website destination"],
    ["mailto:", "Enter a valid email address after mailto:"],
    ["mailto:bad email", "Enter a valid email address after mailto:"],
    ["not a url or email", "Enter a valid website destination"],
    ["http://has space.com", "Enter a valid website destination"],
    ["justwords", "Enter a valid website destination"],
  ])("rejects malformed destination %j with descriptive error", (input, errorSubstring) => {
    const res = parseAndNormalizeDestination(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain(errorSubstring);
    }
    expect(normalizeDestination(input)).toBeNull();
    expect(isValidDestination(input)).toBe(false);
  });

  it("rejects overlong destinations exceeding 2048 characters", () => {
    const overlong = "https://example.com/" + "a".repeat(2050);
    const res = parseAndNormalizeDestination(overlong);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("too long");
    }
  });
});

describe("validateSocialLinks destination validation (Phase 3)", () => {
  it("accepts valid domain-only, full URLs, bare emails, and explicit mailto", () => {
    const links = [
      { id: "instagram", label: "Instagram", url: "instagram.com/teazosf", enabled: true, icon: "" },
      { id: "facebook", label: "Facebook", url: "https://facebook.com/teazo", enabled: true, icon: "" },
      { id: "email", label: "Email", url: "teazosf@hotmail.com", enabled: true, icon: "" },
      { id: "yelp", label: "Yelp", url: "mailto:support@teazo.com", enabled: true, icon: "" },
    ];
    const validation = validateSocialLinks(links);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("rejects unsupported scheme in social links with clear error", () => {
    const links = [
      { id: "xss", label: "Bad Link", url: "javascript:alert(1)", enabled: true, icon: "" },
    ];
    const validation = validateSocialLinks(links);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('Enter a valid link or email for "Bad Link"');
    expect(validation.errors[0]).toContain('Unsupported scheme "javascript:"');
  });

  it("rejects relative path in social links", () => {
    const links = [
      { id: "rel", label: "Relative", url: "/menu", enabled: true, icon: "" },
    ];
    const validation = validateSocialLinks(links);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain("Relative paths are not supported");
  });

  it("rejects malformed destination in validateWebsiteContentPatch", () => {
    const patch = {
      socialLinks: [
        { id: "bad", label: "Broken", url: "http://", enabled: true, icon: "" },
      ],
    };
    const validation = validateWebsiteContentPatch(patch);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('Enter a valid link or email for "Broken"');
  });
});
