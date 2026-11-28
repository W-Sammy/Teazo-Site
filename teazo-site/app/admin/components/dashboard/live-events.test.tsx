/**
 * Tests dashboard live-event card rendering.
 *
 * Verifies optional-date presentation, event counts,
 * empty states, and navigation to the event editor.
 *
 * Next.js routing and image rendering are mocked.
 * No external services are accessed.
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
} from "@testing-library/react";

import type { AdminEvent } from "@/app/types/admin-event";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

// Capture navigation requests without starting Next.js.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

// Preserve image source information without loading images.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      data-testid="dashboard-event-image"
      data-src={src}
      aria-hidden={alt === ""}
    />
  ),
}));

import LiveEvents from "./live-events";

const event: AdminEvent = {
  id: "event-1",
  name: "Tea Promotion",
  description: "Special promotion",
  imageUrl: "/TEAZO_logo.svg",
  startAt: "2026-07-14T19:00:00.000Z",
  endAt: "2026-07-16T19:00:00.000Z",
  appliesToAll: true,
  categoryIds: [],
  itemIds: [],
};

describe("Dashboard live-event cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // A dashboard without active events must show the
  // existing empty state and a zero event count.
  it("displays an empty state when no events are active", () => {
    render(<LiveEvents events={[]} />);

    expect(
      screen.getByRole("heading", {
        name: "Currently live events",
      }),
    ).toBeTruthy();

    expect(
      screen.getByText("0 live"),
    ).toBeTruthy();

    expect(
      screen.getByText(
        "There are no active events right now.",
      ),
    ).toBeTruthy();

    expect(
      screen.queryByRole("button"),
    ).toBeNull();
  });

  // Verify the rendered date row for every supported
  // combination of optional event dates.
  it.each([
    {
      scenario: "both dates",
      startAt: event.startAt,
      endAt: event.endAt,
      expected: "07/14/26 – 07/16/26",
    },
    {
      scenario: "only a start date",
      startAt: event.startAt,
      endAt: null,
      expected: "Starts 07/14/26",
    },
    {
      scenario: "only an end date",
      startAt: null,
      endAt: event.endAt,
      expected: "Ends 07/16/26",
    },
    {
      scenario: "neither date",
      startAt: null,
      endAt: null,
      expected: null,
    },
  ])("renders an event with $scenario", ({
    startAt,
    endAt,
    expected,
  }) => {
    render(
      <LiveEvents
        events={[
          {
            ...event,
            startAt,
            endAt,
          },
        ]}
      />,
    );

    const card = screen.getByRole("button", {
      name: /Tea Promotion/,
    });

    expect(card).toBeTruthy();

    expect(
      screen.getByText("1 live"),
    ).toBeTruthy();

    if (expected === null) {
      // Undated events must not have an empty date row.
      expect(card.querySelector("p")).toBeNull();
      expect(card.textContent).toBe("Tea Promotion");
    } else {
      expect(
        card.querySelector("p")?.textContent,
      ).toBe(expected);
    }

    expect(
      screen.getByTestId("dashboard-event-image")
        .getAttribute("data-src"),
    ).toBe(event.imageUrl);
  });

  // Mixed schedules must coexist without changing the
  // supplied event order or incorrectly hiding cards.
  it("renders mixed optional-date events with the correct count", () => {
    render(
      <LiveEvents
        events={[
          {
            ...event,
            id: "ongoing",
            name: "Ongoing Promotion",
            startAt: null,
            endAt: null,
          },
          {
            ...event,
            id: "start-only",
            name: "Start Only Promotion",
            endAt: null,
          },
          {
            ...event,
            id: "end-only",
            name: "End Only Promotion",
            startAt: null,
          },
          {
            ...event,
            id: "scheduled",
            name: "Scheduled Promotion",
          },
        ]}
      />,
    );

    expect(
      screen.getByText("4 live"),
    ).toBeTruthy();

    const cards = screen.getAllByRole("button");

    expect(cards).toHaveLength(4);

    expect(
      cards.map((card) =>
        card.querySelector("h3")?.textContent,
      ),
    ).toEqual([
      "Ongoing Promotion",
      "Start Only Promotion",
      "End Only Promotion",
      "Scheduled Promotion",
    ]);

    expect(
      cards.map((card) =>
        card.querySelector("p")?.textContent ?? null,
      ),
    ).toEqual([
      null,
      "Starts 07/14/26",
      "Ends 07/16/26",
      "07/14/26 – 07/16/26",
    ]);
  });

  // An undated event must remain editable from the dashboard.
  // The event identifier must also be safely URL-encoded.
  it("opens the correct editor when an undated event is selected", () => {
    render(
      <LiveEvents
        events={[
          {
            ...event,
            id: "event/with spaces",
            startAt: null,
            endAt: null,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Tea Promotion",
      }),
    );

    expect(mocks.push).toHaveBeenCalledOnce();

    expect(mocks.push).toHaveBeenCalledWith(
      "/admin/events?edit=event%2Fwith%20spaces",
    );
  });
});