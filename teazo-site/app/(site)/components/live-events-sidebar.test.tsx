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

function renderSidebar(
  suppliedEvents: AdminEvent[] = events,
) {
  return render(
    <LiveEventsSidebar events={suppliedEvents} />,
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
        "Available across the entire menu.",
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
    renderSidebar();

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

    expect(
      within(dialog).getByText(
        "Available on selected menu items.",
      ),
    ).toBeTruthy();

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
