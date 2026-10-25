/**
 * Tests event date formatting for the Teazo website.
 *
 * Verifies that event timestamps display in the
 * America/Los_Angeles timezone, including daylight-saving
 * transitions, optional year formatting, and invalid input.
 *
 * No database, network, or external service mocks are needed.
 */

import { describe, expect, it } from "vitest";

import { formatEventDate } from "./event-date";

describe("formatEventDate", () => {
  // Verify the default display format and optional year.
  it("formats a valid date without the year by default", () => {
    expect(formatEventDate("2026-10-25T00:30:00Z")).toBe(
      "Oct 24, 5:30 PM",
    );
  });

  it("includes the year when requested", () => {
    const result = formatEventDate(
      "2026-10-25T00:30:00Z",
      true,
    );

    expect(result).toContain("Oct 24");
    expect(result).toContain("2026");
    expect(result).toContain("5:30 PM");
  });

  // Verify UTC timestamps are converted to Pacific time.
  // An event may display on the previous calendar day.
  it("converts UTC dates to America/Los_Angeles", () => {
    expect(formatEventDate("2026-07-15T02:00:00Z")).toBe(
      "Jul 14, 7:00 PM",
    );
  });

  // Los Angeles alternates between PST and PDT.
  // These tests protect against fixed-offset formatting.
  it("uses Pacific Standard Time during winter", () => {
    expect(formatEventDate("2026-01-15T20:00:00Z")).toBe(
      "Jan 15, 12:00 PM",
    );
  });

  it("uses Pacific Daylight Time during summer", () => {
    expect(formatEventDate("2026-07-15T19:00:00Z")).toBe(
      "Jul 15, 12:00 PM",
    );
  });

  it("handles a date crossing midnight in Los Angeles", () => {
    expect(formatEventDate("2026-11-02T07:30:00Z")).toBe(
      "Nov 1, 11:30 PM",
    );
  });

  // During the fall daylight-saving transition, 1:30 AM
  // occurs twice. Both UTC timestamps should display the
  // same local clock time.
  it("handles the repeated hour during daylight-saving fallback", () => {
    const beforeFallback = formatEventDate(
      "2026-11-01T08:30:00Z",
    );

    const afterFallback = formatEventDate(
      "2026-11-01T09:30:00Z",
    );

    expect(beforeFallback).toBe("Nov 1, 1:30 AM");
    expect(afterFallback).toBe("Nov 1, 1:30 AM");
  });

  // Invalid timestamps should produce a safe display string
  // instead of an exception or misleading date.
  it("returns a fallback for invalid dates", () => {
    expect(formatEventDate("not-a-date")).toBe(
      "Date unavailable",
    );
  });

  it("returns a fallback for an empty date", () => {
    expect(formatEventDate("")).toBe("Date unavailable");
  });

  it("returns the same fallback when includeYear is true", () => {
    expect(formatEventDate("invalid", true)).toBe(
      "Date unavailable",
    );
  });
});
