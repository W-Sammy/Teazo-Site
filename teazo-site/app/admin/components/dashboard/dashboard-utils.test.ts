/**
 * Tests dashboard event filtering and date presentation.
 *
 * Covers optional event dates, inclusive scheduling
 * boundaries, and compact Pacific-time date formatting.
 *
 * No database, network, or external services are accessed.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AdminEvent } from "@/app/types/admin-event";

import {
  formatEventDate,
  formatEventDuration,
  isEventActive,
} from "./dashboard-utils";

const past = "2026-07-14T19:00:00.000Z";
const now = "2026-07-15T19:00:00.000Z";
const future = "2026-07-16T19:00:00.000Z";

const event: AdminEvent = {
  id: "event-1",
  name: "Tea Promotion",
  description: "Special promotion",
  imageUrl: "/TEAZO_logo.svg",
  startAt: past,
  endAt: future,
  appliesToAll: true,
  categoryIds: [],
  itemIds: [],
};

describe("Dashboard active-event filtering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Events without dates have no scheduling restrictions.
  it("includes events without either date", () => {
    expect(
      isEventActive({
        ...event,
        startAt: null,
        endAt: null,
      }),
    ).toBe(true);
  });

  // An omitted end date must not bypass a future start.
  it("excludes start-only events that have not started", () => {
    expect(
      isEventActive({
        ...event,
        startAt: future,
        endAt: null,
      }),
    ).toBe(false);
  });

  // Once started, an event without an end date remains active.
  it("includes start-only events that have already started", () => {
    expect(
      isEventActive({
        ...event,
        startAt: past,
        endAt: null,
      }),
    ).toBe(true);
  });

  // The start boundary is inclusive.
  it("includes start-only events at their exact start time", () => {
    expect(
      isEventActive({
        ...event,
        startAt: now,
        endAt: null,
      }),
    ).toBe(true);
  });

  // An event without a start date is immediately active
  // when its expiration remains in the future.
  it("includes end-only events that have not expired", () => {
    expect(
      isEventActive({
        ...event,
        startAt: null,
        endAt: future,
      }),
    ).toBe(true);
  });

  // A missing start date must not prevent expiration.
  it("excludes expired end-only events", () => {
    expect(
      isEventActive({
        ...event,
        startAt: null,
        endAt: past,
      }),
    ).toBe(false);
  });

  // The end boundary is inclusive.
  it("includes end-only events at their exact end time", () => {
    expect(
      isEventActive({
        ...event,
        startAt: null,
        endAt: now,
      }),
    ).toBe(true);
  });

  // Existing fully scheduled events remain supported.
  it("includes events between their start and end dates", () => {
    expect(isEventActive(event)).toBe(true);
  });

  // Fully scheduled future events must remain hidden.
  it("excludes fully scheduled upcoming events", () => {
    expect(
      isEventActive({
        ...event,
        startAt: future,
        endAt: "2026-07-17T19:00:00.000Z",
      }),
    ).toBe(false);
  });

  // Fully scheduled expired events must remain hidden.
  it("excludes fully scheduled ended events", () => {
    expect(
      isEventActive({
        ...event,
        startAt: "2026-07-13T19:00:00.000Z",
        endAt: past,
      }),
    ).toBe(false);
  });
});

describe("Dashboard event date formatting", () => {
  // Preserve the dashboard's existing compact date format.
  it("formats a complete date range", () => {
    expect(formatEventDuration(past, future)).toBe(
      "07/14/26 – 07/16/26",
    );
  });

  // A missing end date must not produce a trailing separator.
  it("formats an event with only a start date", () => {
    expect(formatEventDuration(past, null)).toBe(
      "Starts 07/14/26",
    );
  });

  // A missing start date must not produce a leading separator.
  it("formats an event with only an end date", () => {
    expect(formatEventDuration(null, future)).toBe(
      "Ends 07/16/26",
    );
  });

  // Undated events require no scheduling information.
  it("omits the schedule when both dates are missing", () => {
    expect(formatEventDuration(null, null)).toBe("");
  });

  // Missing dates must not display Unix epoch timestamps.
  it("returns an empty string for a null date", () => {
    expect(formatEventDate(null)).toBe("");
  });

  // Malformed dates must produce safe fallback text.
  it("returns a fallback for an invalid date", () => {
    expect(formatEventDate("invalid-date")).toBe(
      "Date unavailable",
    );
  });
});