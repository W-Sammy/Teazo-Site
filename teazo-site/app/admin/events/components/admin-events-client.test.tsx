/**
 * Tests Admin Events sorting and optional-date presentation.
 *
 * Covers:
 * - Default List View.
 * - Alphabetical event sorting.
 * - Start-date sorting with nullable dates.
 * - Alphabetical ordering within the undated event group.
 * - Sorting in both List View and Card View.
 * - Optional-date labels and event statuses.
 * - Status filtering.
 *
 * Uses the actual AdminEventsClient, list, grid, and
 * view toggle components.
 *
 * Images and image preparation are mocked.
 * No production services are accessed.
 */

// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import type { AdminEvent } from "@/app/types/admin-event";

// Avoid loading actual event images in jsdom.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      data-testid="admin-event-image"
      data-src={src}
      aria-hidden={alt === ""}
    >
      {alt}
    </span>
  ),
}));

// Image preparation is unrelated to sorting and display.
// The real event form is retained but its image-processing
// dependencies are isolated from these tests.
vi.mock("@/app/lib/image-conversion", () => ({
  defaultMaxImageSize: 10 * 1024 * 1024,
  isHeicImage: vi.fn(() => false),
  prepareImageForStorage: vi.fn(),
}));

import AdminEventsClient from "./admin-events-client";

const baseEvent: AdminEvent = {
  id: "event-base",
  name: "Base Promotion",
  description: "",
  imageUrl: "/TEAZO_logo.svg",
  startAt: null,
  endAt: null,
  appliesToAll: true,
  categoryIds: [],
  itemIds: [],
};

// Deliberately supply the records in an unsorted order.
// Names and dates are arranged differently so alphabetical
// sorting cannot accidentally satisfy date-sort assertions.
const events: AdminEvent[] = [
  {
    ...baseEvent,
    id: "undated-z",
    name: "Zulu Ongoing",
  },
  {
    ...baseEvent,
    id: "dated-late",
    name: "Beta Scheduled",
    startAt: "2026-12-20T18:00:00.000Z",
    endAt: "2026-12-31T18:00:00.000Z",
  },
  {
    ...baseEvent,
    id: "dated-early",
    name: "Delta Scheduled",
    startAt: "2026-11-20T18:00:00.000Z",
    endAt: null,
  },
  {
    ...baseEvent,
    id: "undated-a",
    name: "Alpha Ongoing",
  },
  {
    ...baseEvent,
    id: "dated-middle",
    name: "Charlie Scheduled",
    startAt: "2026-12-01T18:00:00.000Z",
    endAt: null,
  },
  {
    ...baseEvent,
    id: "end-only",
    name: "Echo Limited",
    startAt: null,
    endAt: "2026-12-31T18:00:00.000Z",
  },
  {
    ...baseEvent,
    id: "expired",
    name: "Foxtrot Expired",
    startAt: null,
    endAt: "2026-11-01T18:00:00.000Z",
  },
];

function renderEvents(
  initialEvents: AdminEvent[] = events,
) {
  return render(
    <AdminEventsClient
      initialEvents={initialEvents}
      categories={[]}
      items={[]}
      initialEditEventId={null}
    />,
  );
}

// Read the event name column from each actual table row.
function listEventNames(): string[] {
  const table = screen.getByRole("table");

  const rows = within(table)
    .getAllByRole("row")
    .slice(1);

  return rows.map((row) => {
    const cells = within(row).getAllByRole("cell");

    return cells[3].textContent ?? "";
  });
}

// Read event names from the actual grid card headings.
function cardEventNames(): string[] {
  return screen.getAllByRole("article").map(
    (article) =>
      within(article).getByRole("heading")
        .textContent ?? "",
  );
}

function changeSort(value: string) {
  fireEvent.change(
    screen.getByLabelText("Sort by:"),
    {
      target: { value },
    },
  );
}

function selectCardView() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Card View",
    }),
  );
}

function selectListView() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "List View",
    }),
  );
}

function findEventRow(name: string) {
  return within(
    screen.getByRole("table"),
  ).getByRole("row", {
    name: new RegExp(name),
  });
}

describe("Admin Events sorting and presentation", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-11-27T20:00:00.000Z"),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // List View remains the initial view regardless
  // of the event schedules being displayed.
  it("defaults to List View", () => {
    renderEvents();

    expect(
      screen.getByRole("table"),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: "List View",
      }).getAttribute("aria-pressed"),
    ).toBe("true");

    expect(
      screen.getByRole("button", {
        name: "Card View",
      }).getAttribute("aria-pressed"),
    ).toBe("false");

    expect(
      screen.queryAllByRole("article"),
    ).toHaveLength(0);
  });

  // The original default alphabetical sorting remains
  // unchanged when some event dates are omitted.
  it("defaults to alphabetical Name A to Z sorting", () => {
    renderEvents();

    expect(
      (
        screen.getByLabelText(
          "Sort by:",
        ) as HTMLSelectElement
      ).value,
    ).toBe("name-asc");

    expect(listEventNames()).toEqual([
      "Alpha Ongoing",
      "Beta Scheduled",
      "Charlie Scheduled",
      "Delta Scheduled",
      "Echo Limited",
      "Foxtrot Expired",
      "Zulu Ongoing",
    ]);
  });

  // Reverse alphabetical sorting must remain independent
  // of whether events have scheduled dates.
  it("sorts events by Name Z to A", () => {
    renderEvents();

    changeSort("name-desc");

    expect(listEventNames()).toEqual([
      "Zulu Ongoing",
      "Foxtrot Expired",
      "Echo Limited",
      "Delta Scheduled",
      "Charlie Scheduled",
      "Beta Scheduled",
      "Alpha Ongoing",
    ]);
  });

  // Events without scheduled
  // starts appear first in Start (Soonest) order.
  it("places events without start dates first for Start Soonest", () => {
    renderEvents();

    changeSort("start-asc");

    expect(listEventNames()).toEqual([
      "Alpha Ongoing",
      "Echo Limited",
      "Foxtrot Expired",
      "Zulu Ongoing",
      "Delta Scheduled",
      "Charlie Scheduled",
      "Beta Scheduled",
    ]);
  });

  // Latest sorting reverses the dated events and
  // places events without scheduled starts last.
  it("places events without start dates last for Start Latest", () => {
    renderEvents();

    changeSort("start-desc");

    expect(listEventNames()).toEqual([
      "Beta Scheduled",
      "Charlie Scheduled",
      "Delta Scheduled",
      "Alpha Ongoing",
      "Echo Limited",
      "Foxtrot Expired",
      "Zulu Ongoing",
    ]);
  });

  // When every event lacks a start date, the ordering
  // should remain predictable in both sorting modes.
  it("sorts undated events alphabetically in both date sorting modes", () => {
    renderEvents(
      events.filter(
        (event) => event.startAt === null,
      ),
    );

    const expected = [
      "Alpha Ongoing",
      "Echo Limited",
      "Foxtrot Expired",
      "Zulu Ongoing",
    ];

    changeSort("start-asc");

    expect(listEventNames()).toEqual(expected);

    changeSort("start-desc");

    expect(listEventNames()).toEqual(expected);
  });

  // The date-sort selection must persist when the
  // administrator switches between list and card views.
  it("preserves Start Soonest ordering in Card View", () => {
    renderEvents();

    changeSort("start-asc");

    const expected = listEventNames();

    selectCardView();

    expect(
      screen.queryByRole("table"),
    ).toBeNull();

    expect(cardEventNames()).toEqual(expected);

    expect(
      screen.getByRole("button", {
        name: "Card View",
      }).getAttribute("aria-pressed"),
    ).toBe("true");

    selectListView();

    expect(listEventNames()).toEqual(expected);
  });

  // Date sorting must also work when changed directly
  // while the administrator is using Card View.
  it("supports Start Latest sorting in Card View", () => {
    renderEvents();

    selectCardView();
    changeSort("start-desc");

    expect(cardEventNames()).toEqual([
      "Beta Scheduled",
      "Charlie Scheduled",
      "Delta Scheduled",
      "Alpha Ongoing",
      "Echo Limited",
      "Foxtrot Expired",
      "Zulu Ongoing",
    ]);
  });

  // Both missing date columns should explicitly indicate
  // that no scheduling restriction has been configured.
  it("displays Not set for both missing dates in List View", () => {
    renderEvents();

    const row = findEventRow("Alpha Ongoing");

    const cells = within(row).getAllByRole("cell");

    expect(cells[6].textContent).toBe("Not set");
    expect(cells[7].textContent).toBe("Not set");
    expect(cells[8].textContent).toBe("active");
  });

  // Each optional date must be handled independently.
  it("displays the supplied date and Not set for start-only events", () => {
    renderEvents();

    const row = findEventRow("Delta Scheduled");

    const cells = within(row).getAllByRole("cell");

    expect(cells[6].textContent).toBe(
      "Nov 20, 2026 at 10:00 AM",
    );

    expect(cells[7].textContent).toBe("Not set");
    expect(cells[8].textContent).toBe("active");
  });

  // An end-only event should retain its expiration
  // date without displaying an artificial start date.
  it("displays Not set and the expiration date for end-only events", () => {
    renderEvents();

    const row = findEventRow("Echo Limited");

    const cells = within(row).getAllByRole("cell");

    expect(cells[6].textContent).toBe("Not set");

    expect(cells[7].textContent).toBe(
      "Dec 31, 2026 at 10:00 AM",
    );

    expect(cells[8].textContent).toBe("active");
  });

  // A missing start date does not mean the event
  // remains active after its configured expiration.
  it("displays ended status for expired events without a start date", () => {
    renderEvents();

    const row = findEventRow("Foxtrot Expired");

    const cells = within(row).getAllByRole("cell");

    expect(cells[6].textContent).toBe("Not set");
    expect(cells[8].textContent).toBe("ended");
  });

  // Card View must use the same missing-date labels
  // and status behavior as List View.
  it("displays missing dates correctly in Card View", () => {
    renderEvents();

    selectCardView();

    const card = screen.getAllByRole("article")
      .find((article) =>
        within(article).queryByRole("heading", {
          name: "Alpha Ongoing",
        }),
      );

    expect(card).toBeDefined();

    const missingDates = within(card!).getAllByText(
      "Not set",
    );

    expect(missingDates).toHaveLength(2);

    expect(
      within(card!).getByText("active"),
    ).toBeTruthy();
  });

  // Active filtering must include undated and open-ended
  // events but exclude upcoming and expired events.
  it("includes optional-date events in the active status filter", () => {
    renderEvents();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /^active\b/i,
      }),
    );

    expect(listEventNames()).toEqual([
      "Alpha Ongoing",
      "Delta Scheduled",
      "Echo Limited",
      "Zulu Ongoing",
    ]);
  });

  // Upcoming filtering must include future start-only
  // events as well as fully scheduled future events.
  it("includes future start-only events in the upcoming status filter", () => {
    renderEvents();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /^upcoming\b/i,
      }),
    );

    expect(listEventNames()).toEqual([
      "Beta Scheduled",
      "Charlie Scheduled",
    ]);
  });

  // Ended filtering must include expired end-only events.
  it("includes expired end-only events in the ended status filter", () => {
    renderEvents();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /^ended\b/i,
      }),
    );

    expect(listEventNames()).toEqual([
      "Foxtrot Expired",
    ]);
  });

  // Status filtering and date sorting must work together.
  it("sorts undated active events before dated active events", () => {
    renderEvents();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /^active\b/i,
      }),
    );

    changeSort("start-asc");

    expect(listEventNames()).toEqual([
      "Alpha Ongoing",
      "Echo Limited",
      "Zulu Ongoing",
      "Delta Scheduled",
    ]);
  });

  // Sorting and filtering must not mutate the event
  // collection originally supplied by the parent.
  it("does not mutate the original event ordering", () => {
    const originalOrder = events.map(
      (event) => event.id,
    );

    renderEvents();

    changeSort("start-desc");
    changeSort("start-asc");
    changeSort("name-desc");

    expect(
      events.map((event) => event.id),
    ).toEqual(originalOrder);
  });
});