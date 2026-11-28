/**
 * Tests the public Events sidebar and details modal.
 *
 * Covers empty states, event presentation, sidebar
 * controls, event selection, modal dismissal, keyboard
 * interaction, and outside-click behavior.
 *
 * Images are mocked. No production services are used.
 */

// @vitest-environment jsdom

import {
  afterEach,
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

import type {
  AdminEvent,
  EventCategory,
  EventItem,
} from "@/app/types/admin-event";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      role="img"
      aria-label={alt || "Decorative event image"}
      data-testid="event-test-image"
      data-src={src}
    />
  ),
}));

import LiveEventsSidebar from "./live-events-sidebar";

const eventOne: AdminEvent = {
  id: "event-1",
  name: "Fall Tea Festival",
  description: "Enjoy our seasonal tea specials.",
  imageUrl:
    "https://images.example.invalid/fall-tea.webp",
  startAt: "2026-10-30T18:00:00.000Z",
  endAt: "2026-10-30T21:00:00.000Z",
  appliesToAll: true,
  categoryIds: [],
  itemIds: [],
};

const eventTwo: AdminEvent = {
  id: "event-2",
  name: "Milk Tea Promotion",
  description: "",
  imageUrl:
    "https://images.example.invalid/milk-tea.webp",
  startAt: "2026-10-30T19:00:00.000Z",
  endAt: "2026-10-30T22:00:00.000Z",
  appliesToAll: false,
  categoryIds: ["milk-tea"],
  itemIds: ["item-1"],
};

const events = [eventOne, eventTwo];

// Supply catalog target names for the selected-event modal test.
const eventCategories: EventCategory[] = [
  { id: "milk-tea", name: "Milk Tea" },
];
const eventItems: EventItem[] = [
  { id: "item-1", name: "Brown Sugar Milk Tea" },
];

function renderSidebar(
  suppliedEvents: AdminEvent[] = events,
  targets: {
    categories?: EventCategory[];
    items?: EventItem[];
  } = {},
) {
  return render(
    <LiveEventsSidebar
      events={suppliedEvents}
      categories={targets.categories}
      items={targets.items}
    />,
  );
}

function openSidebar() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /Show live events/,
    }),
  );
}

function selectEvent(name: string) {
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(
        `${name}.*View event details`,
      ),
    }),
  );
}

describe("Public Events sidebar", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("does not display the sidebar when no events exist", () => {
    renderSidebar([]);

    expect(
      screen.queryByRole("button", {
        name: /Show live events/,
      }),
    ).toBeNull();

    expect(
      document.getElementById(
        "live-events-sidebar",
      ),
    ).toBeNull();
  });

  it("starts collapsed with the correct event count", () => {
    renderSidebar();

    const toggle = screen.getByRole("button", {
      name: "Show live events, 2 live events",
    });

    expect(
      toggle.getAttribute("aria-expanded"),
    ).toBe("false");

    const sidebar = document.getElementById(
      "live-events-sidebar",
    );

    expect(sidebar).not.toBeNull();

    expect(
      sidebar?.getAttribute("aria-hidden"),
    ).toBe("true");

    const eventButtons =
      sidebar?.querySelectorAll("button");

    expect(eventButtons).toHaveLength(2);

    for (const button of eventButtons ?? []) {
      expect(button.disabled).toBe(true);
    }
  });

  it("opens the sidebar and displays the supplied events", () => {
    renderSidebar();

    openSidebar();

    expect(
      screen.getByRole("heading", {
        name: "Live events",
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: /Fall Tea Festival.*View event details/,
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: /Milk Tea Promotion.*View event details/,
      }),
    ).toBeTruthy();

    expect(
      screen.getByLabelText("2 live events"),
    ).toBeTruthy();
  });

  it("preserves the supplied event ordering", () => {
    renderSidebar();

    openSidebar();

    const sidebar = document.getElementById(
      "live-events-sidebar",
    );

    const buttons = Array.from(
      sidebar?.querySelectorAll("button") ?? [],
    );

    expect(
      buttons.map((button) =>
        button.querySelector("h3")?.textContent,
      ),
    ).toEqual([
      "Fall Tea Festival",
      "Milk Tea Promotion",
    ]);
  });

  it("displays event dates in Pacific time", () => {
    renderSidebar();

    openSidebar();

    const eventButton = screen.getByRole(
      "button",
      {
        name: /Fall Tea Festival.*View event details/,
      },
    );

    expect(
      eventButton.textContent,
    ).toContain("Fall Tea Festival");

    expect(
      eventButton.textContent,
    ).toMatch(
      /Oct 30.*11:00.*Oct 30.*2:00/,
    );
  });

  // ============================================================
  // Optional event date presentation
  // ============================================================

  // Events without dates must display only their name,
  // without empty date rows or misleading timestamps.
  it("omits scheduling text from undated event cards", () => {
    renderSidebar([
      {
        ...eventOne,
        startAt: null,
        endAt: null,
      },
    ]);

    openSidebar();

    const button = screen.getByRole("button", {
      name: "Fall Tea Festival. View event details",
    });

    expect(button.textContent).toBe("Fall Tea Festival");
    expect(button.querySelector("p")).toBeNull();
  });

  // Start-only events display a readable start label
  // without an unnecessary trailing date separator.
  it("displays only the start date on a start-only event card", () => {
    renderSidebar([
      {
        ...eventOne,
        endAt: null,
      },
    ]);

    openSidebar();

    const button = screen.getByRole("button", {
      name: "Fall Tea Festival. Starts Oct 30, 11:00 AM. View event details",
    });

    expect(button.querySelector("p")?.textContent).toBe(
      "Starts Oct 30, 11:00 AM",
    );
  });

  // End-only events display an expiration label
  // without an unnecessary leading date separator.
  it("displays only the end date on an end-only event card", () => {
    renderSidebar([
      {
        ...eventOne,
        startAt: null,
      },
    ]);

    openSidebar();

    const button = screen.getByRole("button", {
      name: "Fall Tea Festival. Ends Oct 30, 2:00 PM. View event details",
    });

    expect(button.querySelector("p")?.textContent).toBe(
      "Ends Oct 30, 2:00 PM",
    );
  });

  // Undated event cards must remain fully interactive.
  // Their details modal must also omit the scheduling row.
  it("opens an undated event modal without displaying date text", () => {
    renderSidebar([
      {
        ...eventOne,
        startAt: null,
        endAt: null,
      },
    ]);

    openSidebar();
    selectEvent("Fall Tea Festival");

    const dialog = screen.getByRole("dialog");

    const heading = within(dialog).getByRole("heading", {
      name: "Fall Tea Festival",
    });

    expect(heading).toBeTruthy();

    expect(
      heading.nextElementSibling?.tagName,
    ).toBe("DIV");

    expect(
      within(dialog).getByText(eventOne.description),
    ).toBeTruthy();

    expect(
      within(dialog).getByText(
        "All menu items are included in this event.",
      ),
    ).toBeTruthy();

    expect(dialog.textContent).not.toContain("Date unavailable");
    expect(dialog.textContent).not.toContain("1970");
    expect(dialog.textContent).not.toContain("Starts ");
    expect(dialog.textContent).not.toContain("Ends ");
  });

  // The modal includes the year for a supplied start date
  // while omitting the missing expiration date.
  it("displays year-inclusive scheduling for a start-only event modal", () => {
    renderSidebar([
      {
        ...eventOne,
        endAt: null,
      },
    ]);

    openSidebar();
    selectEvent("Fall Tea Festival");

    const dialog = screen.getByRole("dialog");

    const heading = within(dialog).getByRole("heading", {
      name: "Fall Tea Festival",
    });

    const duration = heading.nextElementSibling;

    expect(duration?.tagName).toBe("P");
    expect(duration?.textContent).toContain("Starts Oct 30");
    expect(duration?.textContent).toContain("2026");
    expect(duration?.textContent).toContain("11:00 AM");
    expect(duration?.textContent).not.toContain("Ends");
    expect(duration?.textContent).not.toContain("–");
  });

  // The modal includes the year for a supplied end date
  // while omitting the missing start date.
  it("displays year-inclusive scheduling for an end-only event modal", () => {
    renderSidebar([
      {
        ...eventOne,
        startAt: null,
      },
    ]);

    openSidebar();
    selectEvent("Fall Tea Festival");

    const dialog = screen.getByRole("dialog");

    const heading = within(dialog).getByRole("heading", {
      name: "Fall Tea Festival",
    });

    const duration = heading.nextElementSibling;

    expect(duration?.tagName).toBe("P");
    expect(duration?.textContent).toContain("Ends Oct 30");
    expect(duration?.textContent).toContain("2026");
    expect(duration?.textContent).toContain("2:00 PM");
    expect(duration?.textContent).not.toContain("Starts");
    expect(duration?.textContent).not.toContain("–");
  });

  // A complete schedule must retain both timestamps
  // and the existing date range separator in the modal.
  it("preserves both dates in a fully scheduled event modal", () => {
    renderSidebar([eventOne]);

    openSidebar();
    selectEvent("Fall Tea Festival");

    const dialog = screen.getByRole("dialog");

    const heading = within(dialog).getByRole("heading", {
      name: "Fall Tea Festival",
    });

    const duration = heading.nextElementSibling;

    expect(duration?.tagName).toBe("P");
    expect(duration?.textContent).toContain("11:00 AM");
    expect(duration?.textContent).toContain("2:00 PM");
    expect(duration?.textContent).toContain("–");

    expect(
      duration?.textContent?.match(/2026/g),
    ).toHaveLength(2);
  });

  // Mixed event schedules must render together without
  // changing the supplied ordering or event count.
  it("renders mixed optional date combinations in the same sidebar", () => {
    renderSidebar([
      {
        ...eventOne,
        id: "no-dates",
        name: "Ongoing Promotion",
        startAt: null,
        endAt: null,
      },
      {
        ...eventOne,
        id: "start-only",
        name: "Start Only Promotion",
        endAt: null,
      },
      {
        ...eventOne,
        id: "end-only",
        name: "End Only Promotion",
        startAt: null,
      },
      {
        ...eventOne,
        id: "both-dates",
        name: "Scheduled Promotion",
      },
    ]);

    openSidebar();

    expect(screen.getByLabelText("4 live events")).toBeTruthy();

    const sidebar = document.getElementById(
      "live-events-sidebar",
    );

    const buttons = Array.from(
      sidebar?.querySelectorAll("button") ?? [],
    );

    expect(buttons).toHaveLength(4);

    expect(
      buttons.map((button) =>
        button.querySelector("h3")?.textContent,
      ),
    ).toEqual([
      "Ongoing Promotion",
      "Start Only Promotion",
      "End Only Promotion",
      "Scheduled Promotion",
    ]);

    expect(
      buttons.map((button) =>
        button.querySelector("p")?.textContent ?? null,
      ),
    ).toEqual([
      null,
      "Starts Oct 30, 11:00 AM",
      "Ends Oct 30, 2:00 PM",
      "Oct 30, 11:00 AM – Oct 30, 2:00 PM",
    ]);
  });

  it("displays the correct event image sources", () => {
    const { container } = renderSidebar();

    openSidebar();

    const imageSources = Array.from(
      container.querySelectorAll(
        "[data-testid='event-test-image']",
      ),
    ).map((image) =>
      image.getAttribute("data-src"),
    );

    expect(imageSources).toContain(
      eventOne.imageUrl,
    );

    expect(imageSources).toContain(
      eventTwo.imageUrl,
    );
  });

  it("does not render event thumbnails until the sidebar is first opened", () => {
    const { container } = renderSidebar();

    const eventImages = () =>
      Array.from(
        container.querySelectorAll(
          "[data-testid='event-test-image']",
        ),
      ).filter((image) =>
        [eventOne.imageUrl, eventTwo.imageUrl].includes(
          image.getAttribute("data-src") ?? "",
        ),
      );

    expect(eventImages()).toHaveLength(0);

    openSidebar();
    expect(eventImages()).toHaveLength(2);

    // Closing keeps the thumbnails so reopening does not reload them.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Close live events",
      }),
    );
    expect(eventImages()).toHaveLength(2);
  });

  it("closes and reopens the sidebar with its toggle", () => {
    renderSidebar();

    openSidebar();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Close live events",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Show live events",
      }).getAttribute("aria-expanded"),
    ).toBe("false");

    expect(
      document
        .getElementById("live-events-sidebar")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");

    openSidebar();

    expect(
      screen.getByRole("button", {
        name: "Close live events",
      }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("opens the selected event details modal", () => {
    renderSidebar();

    openSidebar();
    selectEvent("Fall Tea Festival");

    const dialog = screen.getByRole("dialog");

    expect(dialog).toBeTruthy();

    // Scope heading lookup to the modal.
    // The sidebar also displays this event's name.
    expect(
      within(dialog).getByRole("heading", {
        name: "Fall Tea Festival",
      }),
    ).toBeTruthy();

    expect(
      within(dialog).getByText(
        "Enjoy our seasonal tea specials.",
      ),
    ).toBeTruthy();

    expect(
      within(dialog).getByText(
        "All menu items are included in this event.",
      ),
    ).toBeTruthy();

    expect(
      within(dialog)
        .getByRole("img", {
          name: "Fall Tea Festival",
        })
        .getAttribute("data-src"),
    ).toBe(eventOne.imageUrl);
  });

  it("uses fallback text for events without descriptions", () => {
    renderSidebar(events, { categories: eventCategories, items: eventItems });

    openSidebar();
    selectEvent("Milk Tea Promotion");

    const dialog = screen.getByRole("dialog");

    // Scope the assertion to the event-details modal.
    expect(
      within(dialog).getByRole("heading", {
        name: "Milk Tea Promotion",
      }),
    ).toBeTruthy();

    expect(
      within(dialog).getByText(
        "Join us at Teazo for this special event.",
      ),
    ).toBeTruthy();

    // Targeted events list the selected category and item by name.
    const includedCategories = within(dialog).getByRole("list", {
      name: "Included categories",
    });
    expect(within(includedCategories).getByText("Milk Tea")).toBeTruthy();

    expect(
      within(
        within(dialog).getByRole("list", {
          name: "Included items",
        }),
      ).getByText("Brown Sugar Milk Tea"),
    ).toBeTruthy();

    expect(
      within(dialog).queryByText(
        "All menu items are included in this event.",
      ),
    ).toBeNull();

    expect(
      within(dialog)
        .getByRole("img", {
          name: "Milk Tea Promotion",
        })
        .getAttribute("data-src"),
    ).toBe(eventTwo.imageUrl);
  });

  it("closes the event modal using its close button", () => {
    renderSidebar();

    openSidebar();
    selectEvent("Fall Tea Festival");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Close event details",
      }),
    );

    expect(
      screen.queryByRole("dialog"),
    ).toBeNull();

    // Closing the modal does not close the sidebar.
    expect(
      screen.getByRole("button", {
        name: "Close live events",
      }),
    ).toBeTruthy();
  });

  it("closes the event modal with Escape", () => {
    renderSidebar();

    openSidebar();
    selectEvent("Fall Tea Festival");

    expect(
      screen.getByRole("dialog"),
    ).toBeTruthy();

    fireEvent.keyDown(document, {
      key: "Escape",
    });

    expect(
      screen.queryByRole("dialog"),
    ).toBeNull();
  });

  it("closes the sidebar with Escape and restores toggle focus", () => {
    renderSidebar();

    openSidebar();

    const toggle = screen.getByRole("button", {
      name: "Close live events",
    });

    fireEvent.keyDown(document, {
      key: "Escape",
    });

    expect(
      toggle.getAttribute("aria-expanded"),
    ).toBe("false");

    expect(
      document.activeElement,
    ).toBe(toggle);
  });

  it("closes the sidebar when clicking outside", () => {
    renderSidebar();

    openSidebar();

    fireEvent.pointerDown(document.body);

    expect(
      screen.getByRole("button", {
        name: "Show live events",
      }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("keeps the sidebar open when clicking inside it", () => {
    renderSidebar();

    openSidebar();

    fireEvent.pointerDown(
      screen.getByRole("heading", {
        name: "Live events",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Close live events",
      }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("keeps the sidebar open during event modal interaction", () => {
    renderSidebar();

    openSidebar();
    selectEvent("Fall Tea Festival");

    fireEvent.pointerDown(document.body);

    expect(
      screen.getByRole("dialog"),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: "Close live events",
      }).getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
