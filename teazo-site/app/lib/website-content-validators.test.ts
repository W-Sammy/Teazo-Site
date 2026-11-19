import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  isValidDestination,
  isValidHolidayDate,
  isValidLogoFile,
  normalizeDestination,
  parseAndNormalizeDestination,
  parseHolidayDate,
  validateHolidays,
  validateLogo,
  validateSocialLinks,
  validateWebsiteContentPatch,
  estimateWebsiteContentPatchStatements,
  getWebsiteContentPatchByteSize,
  MAX_SOCIAL_LINKS,
  MAX_HOLIDAYS,
  MAX_D1_STATEMENTS,
  MAX_WEBSITE_CONTENT_PAYLOAD_BYTES,
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

describe("validateLogo and validateWebsiteContentPatch (Phase 4)", () => {
  it("accepts valid root-relative path and absolute URLs", () => {
    expect(validateLogo("/TEAZO_logo.svg").valid).toBe(true);
    expect(validateLogo("/custom/path/logo.webp").valid).toBe(true);
    expect(validateLogo("https://r2.teazo.com/logo/2026/11/test.webp").valid).toBe(true);
    expect(validateLogo("http://localhost:3000/TEAZO_logo.svg").valid).toBe(true);

    const patch = { logo: "https://r2.teazo.com/logo/2026/11/logo.png" };
    const validation = validateWebsiteContentPatch(patch);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it.each([
    ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "Embedded image data and data URLs are not permitted"],
    ["DATA:image/jpeg;base64,/9j/4AAQSkZJRg==", "Embedded image data and data URLs are not permitted"],
    ["https://example.com/logo.png;base64,123", "Embedded image data and data URLs are not permitted"],
  ])("strictly rejects base64 and data URLs %j", (dataUrl, expectedError) => {
    const res = validateLogo(dataUrl);
    expect(res.valid).toBe(false);
    expect(res.error).toContain(expectedError);

    const patchValidation = validateWebsiteContentPatch({ logo: dataUrl });
    expect(patchValidation.valid).toBe(false);
    expect(patchValidation.errors[0]).toContain(expectedError);
  });

  it("rejects oversized logo references (> 2048 characters)", () => {
    const oversized = "https://example.com/logo/" + "a".repeat(2050);
    const res = validateLogo(oversized);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("too long");

    const patchValidation = validateWebsiteContentPatch({ logo: oversized });
    expect(patchValidation.valid).toBe(false);
    expect(patchValidation.errors[0]).toContain("too long");
  });

  it.each([
    ["javascript:alert(1)", "Enter a valid website logo URL"],
    ["//evil.com/logo.png", "Protocol-relative paths are not supported"],
    ["https://", "Enter a valid website logo URL"],
    ["http://invalid space/logo.png", "whitespace characters"],
    ["", "Website logo cannot be empty"],
    ["   ", "Website logo cannot be empty"],
    [123 as unknown as string, "Website logo must be a text URL or path"],
  ])("rejects invalid logo value %j", (input, expectedError) => {
    const res = validateLogo(input);
    expect(res.valid).toBe(false);
    expect(res.error).toContain(expectedError);

    const patchValidation = validateWebsiteContentPatch({ logo: input });
    expect(patchValidation.valid).toBe(false);
    expect(patchValidation.errors[0]).toContain(expectedError);
  });
});

describe("isValidLogoFile (Phase 4)", () => {
  function makeMockFile(name: string, type: string, size: number): File {
    const file = new File([], name, { type });
    Object.defineProperty(file, "size", { value: size });
    return file;
  }

  it.each([
    ["logo.png", "image/png"],
    ["logo.jpg", "image/jpeg"],
    ["logo.webp", "image/webp"],
  ])("accepts supported image format %s (%s)", (name, type) => {
    const file = makeMockFile(name, type, 1024);
    const res = isValidLogoFile(file);
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it.each([
    ["logo.gif", "image/gif"],
    ["logo.svg", "image/svg+xml"],
    ["logo.bmp", "image/bmp"],
    ["document.pdf", "application/pdf"],
    ["script.js", "application/javascript"],
  ])("rejects unsupported format %s (%s)", (name, type) => {
    const file = makeMockFile(name, type, 1024);
    const res = isValidLogoFile(file);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Unsupported image format. Please upload PNG, JPG, or WebP.");
  });

  it("accepts exactly 4 MiB", () => {
    expect(isValidLogoFile(makeMockFile("logo.png", "image/png", 4 * 1024 * 1024)).valid).toBe(true);
  });

  it("rejects files just over 4 MiB", () => {
    const file = makeMockFile("large.png", "image/png", 4 * 1024 * 1024 + 1);
    const res = isValidLogoFile(file);
    expect(res.valid).toBe(false);
    expect(res.error).toBe("Image file is too large. Must be 4 MiB or less.");
  });

  it("rejects empty files (0 bytes)", () => {
    const file = makeMockFile("empty.png", "image/png", 0);
    const res = isValidLogoFile(file);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("The image file is empty.");
  });

  it("rejects undefined file", () => {
    const res = isValidLogoFile(undefined);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("No image file provided.");
  });
});

describe("Phase 5 collection capacity and transaction budgets", () => {
  it("enforces MAX_SOCIAL_LINKS limit of 10", () => {
    const tenLinks = Array.from({ length: MAX_SOCIAL_LINKS }, (_, i) => ({
      id: `social-${i + 1}`,
      label: `Platform ${i + 1}`,
      icon: "",
      url: `https://example.com/${i + 1}`,
      enabled: true,
    }));

    expect(validateSocialLinks(tenLinks).valid).toBe(true);

    const elevenLinks = [
      ...tenLinks,
      {
        id: "social-11",
        label: "Platform 11",
        icon: "",
        url: "https://example.com/11",
        enabled: true,
      },
    ];

    const result = validateSocialLinks(elevenLinks);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`You can add up to ${MAX_SOCIAL_LINKS} social links.`);
  });

  it("enforces MAX_HOLIDAYS limit of 16", () => {
    const sixteenHolidays = Array.from({ length: MAX_HOLIDAYS }, (_, i) => ({
      id: `holiday-${i + 1}`,
      name: `Holiday ${i + 1}`,
      date: `12-${String(i + 1).padStart(2, "0")}`,
      closed: true,
    }));

    expect(validateHolidays(sixteenHolidays).valid).toBe(true);

    const seventeenHolidays = [
      ...sixteenHolidays,
      {
        id: "holiday-17",
        name: "Holiday 17",
        date: "12-17",
        closed: true,
      },
    ];

    const result = validateHolidays(seventeenHolidays);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`You can add up to ${MAX_HOLIDAYS} holiday exceptions.`);
  });

  it("calculates statement counts accurately across patch permutations", () => {
    expect(estimateWebsiteContentPatchStatements({})).toBe(0);
    expect(estimateWebsiteContentPatchStatements({ story: "New story" })).toBe(1);
    expect(estimateWebsiteContentPatchStatements({ logo: "/logo.png" })).toBe(1);
    expect(estimateWebsiteContentPatchStatements({ onlineOrderingEnabled: false })).toBe(1);
    expect(estimateWebsiteContentPatchStatements({ address: { businessName: "New" } })).toBe(1);
    expect(
      estimateWebsiteContentPatchStatements({
        hours: [
          { day: "Sun", start: 10, end: 18, closed: false },
          { day: "Mon", start: 10, end: 18, closed: false },
          { day: "Tue", start: 10, end: 18, closed: false },
          { day: "Wed", start: 10, end: 18, closed: false },
          { day: "Thu", start: 10, end: 18, closed: false },
          { day: "Fri", start: 10, end: 18, closed: false },
          { day: "Sat", start: 10, end: 18, closed: false },
        ],
      }),
    ).toBe(7);

    // Social links: 1 claim revision + 1 delete + 2 inserts = 4 statements
    expect(
      estimateWebsiteContentPatchStatements({
        socialLinks: [
          { id: "fb", label: "FB", icon: "", url: "https://fb.com", enabled: true },
          { id: "ig", label: "IG", icon: "", url: "https://ig.com", enabled: true },
        ],
      }),
    ).toBe(4);

    // Holidays: 1 claim revision + 1 delete + 2 inserts = 4 statements
    expect(
      estimateWebsiteContentPatchStatements({
        holidays: [
          { id: "h1", name: "H1", date: "12-25", closed: true },
          { id: "h2", name: "H2", date: "01-01", closed: true },
        ],
      }),
    ).toBe(4);
  });

  it("accepts the largest supported combined save without exceeding statement budget", () => {
    const maxSocialLinks = Array.from({ length: MAX_SOCIAL_LINKS }, (_, i) => ({
      id: `social-${i + 1}`,
      label: `Social ${i + 1}`,
      icon: "",
      url: `https://example.com/social-${i + 1}`,
      enabled: true,
    }));

    const maxHolidays = Array.from({ length: MAX_HOLIDAYS }, (_, i) => ({
      id: `holiday-${i + 1}`,
      name: `Holiday ${i + 1}`,
      date: `10-${String(i + 1).padStart(2, "0")}`,
      closed: true,
    }));

    const fullPatch = {
      collectionsRevision: 0,
      story: "Full story within character limits.",
      logo: "/images/logo.png",
      onlineOrderingEnabled: true,
      contactFormEnabled: true,
      address: {
        businessName: "TEAZO",
        streetAddress: "1050 Taraval St.",
        locality: "San Francisco, CA 94116",
        phone: "+1 (415) 748-7398",
        email: "teazosf@hotmail.com",
        mapQuery: "1050 Taraval St",
      },
      hours: [
        { day: "Sun", start: 10, end: 20, closed: false },
        { day: "Mon", start: 10, end: 20, closed: false },
        { day: "Tue", start: 10, end: 20, closed: false },
        { day: "Wed", start: 10, end: 20, closed: false },
        { day: "Thu", start: 10, end: 20, closed: false },
        { day: "Fri", start: 10, end: 20, closed: false },
        { day: "Sat", start: 10, end: 20, closed: false },
      ],
      socialLinks: maxSocialLinks,
      holidays: maxHolidays,
    };

    const count = estimateWebsiteContentPatchStatements(fullPatch);
    expect(count).toBe(MAX_D1_STATEMENTS);
    expect(count).toBeLessThanOrEqual(40);

    const validation = validateWebsiteContentPatch(fullPatch);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("rejects an update that exceeds the 40 statements budget", () => {
    const maxSocialLinks = Array.from({ length: MAX_SOCIAL_LINKS }, (_, i) => ({
      id: `social-${i + 1}`,
      label: `Social ${i + 1}`,
      icon: "",
      url: `https://example.com/social-${i + 1}`,
      enabled: true,
    }));

    const maxHolidays = Array.from({ length: MAX_HOLIDAYS }, (_, i) => ({
      id: `holiday-${i + 1}`,
      name: `Holiday ${i + 1}`,
      date: `10-${String(i + 1).padStart(2, "0")}`,
      closed: true,
    }));

    // Adding delivery links on top of the max combined patch exceeds 40 statements
    const oversizedPatch = {
      collectionsRevision: 0,
      story: "Story",
      logo: "/logo.png",
      onlineOrderingEnabled: true,
      contactFormEnabled: true,
      address: { businessName: "TEAZO" },
      hours: [
        { day: "Sun", start: 10, end: 20, closed: false },
        { day: "Mon", start: 10, end: 20, closed: false },
        { day: "Tue", start: 10, end: 20, closed: false },
        { day: "Wed", start: 10, end: 20, closed: false },
        { day: "Thu", start: 10, end: 20, closed: false },
        { day: "Fri", start: 10, end: 20, closed: false },
        { day: "Sat", start: 10, end: 20, closed: false },
      ],
      socialLinks: maxSocialLinks,
      holidays: maxHolidays,
      deliveryLinks: [
        { id: "deliv-1", label: "Uber", icon: "", url: "https://ubereats.com", enabled: true },
      ],
    };

    const count = estimateWebsiteContentPatchStatements(oversizedPatch);
    expect(count).toBe(42);

    const validation = validateWebsiteContentPatch(oversizedPatch);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      `Update requires 42 database operations, exceeding the maximum budget of ${MAX_D1_STATEMENTS}.`,
    );
  });

  it("rejects an update whose serialized payload exceeds 1,000,000 bytes", () => {
    // Generate a very large story to exceed 1MB
    const hugeStory = "a".repeat(MAX_WEBSITE_CONTENT_PAYLOAD_BYTES + 50);
    const oversizedPayloadPatch = {
      story: hugeStory,
    };

    const byteSize = getWebsiteContentPatchByteSize(oversizedPayloadPatch);
    expect(byteSize).toBeGreaterThan(MAX_WEBSITE_CONTENT_PAYLOAD_BYTES);

    const validation = validateWebsiteContentPatch(oversizedPayloadPatch);
    expect(validation.valid).toBe(false);
    expect(
      validation.errors.some((err) =>
        err.includes("exceeds the maximum allowed size of 1000000 bytes"),
      ),
    ).toBe(true);
  });
});
