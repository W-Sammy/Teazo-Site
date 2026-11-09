/**
 * Tests Website Content administration persistence.
 *
 * Covers debounced updates, immediate saves, invalid
 * edits, API errors, and pending changes on page unload.
 *
 * All fetch requests are mocked. No production website
 * settings or database records are modified.
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
  act,
  cleanup,
  renderHook,
  waitFor,
} from "@testing-library/react";

import type {
  WebsiteContent,
} from "@/app/types/website-content";

import {
  useWebsiteContent,
} from "./use-website-content";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

const DAYS = [
  "Sun", "Mon", "Tue", "Wed",
  "Thu", "Fri", "Sat",
];

function makeContent(): WebsiteContent {
  return {
    logo: "/TEAZO_logo.svg",
    story: "Original TEAZO story",
    socialLinks: [],
    address: {
      businessName: "TEAZO",
      streetAddress: "1050 Taraval St",
      locality: "San Francisco, CA 94116",
      phone: "+1 (415) 748-7398",
      email: "teazo@example.invalid",
      mapQuery: "",
    },
    hours: DAYS.map((day) => ({
      day,
      start: 9,
      end: 17,
      closed: false,
    })),
    holidays: [
      {
        id: "holiday-1",
        name: "Christmas",
        date: "12-25",
        closed: true,
      },
    ],
    carouselImages: [],
    contactFormEnabled: true,
    onlineOrderingEnabled: true,
  };
}

function savedPatches(): Partial<WebsiteContent>[] {
  return mocks.fetch.mock.calls
    .filter(
      (call) => call[0] === "/api/website-content",
    )
    .map((call) => {
      const options = call[1] as RequestInit;
      return JSON.parse(
        String(options.body),
      ) as Partial<WebsiteContent>;
    });
}

async function renderContentHook() {
  const hook = renderHook(() =>
    useWebsiteContent(makeContent()),
  );

  // The hook initializes Carousel settings on mount.
  // Wait until that unrelated request has finished.
  await waitFor(() => {
    expect(
      hook.result.current.carousel.carouselReady,
    ).toBe(true);
  });

  return hook;
}

describe("Website Content save handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.fetch.mockImplementation(
      async (url: string) => {
        if (
          url ===
          "/api/admin/website-content/carousel"
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              images: [],
            }),
          };
        }

        if (url === "/api/website-content") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
            }),
          };
        }

        throw new Error(
          `Unexpected request: ${url}`,
        );
      },
    );

    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads initial content without submitting a save request", async () => {
    const { result } = await renderContentHook();

    expect(result.current.content.story).toBe(
      "Original TEAZO story",
    );

    expect(result.current.saveStatus).toBe("idle");
    expect(savedPatches()).toEqual([]);
  });

  it("debounces valid story updates before saving", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateStory(
        "Updated TEAZO story",
      );
    });

    expect(result.current.content.story).toBe(
      "Updated TEAZO story",
    );

    expect(savedPatches()).toEqual([]);

    await waitFor(
      () => {
        expect(savedPatches()).toEqual([
          {
            story: "Updated TEAZO story",
          },
        ]);
      },
      { timeout: 2500 },
    );
  });

  it("does not save invalid story content", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateStory("");
    });

    await new Promise((resolve) =>
      setTimeout(resolve, 750),
    );

    expect(savedPatches()).toEqual([]);
  });

  it("saves valid contact address changes", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateAddress({
        streetAddress: "123 Updated Street",
      });
    });

    await waitFor(
      () => {
        expect(savedPatches()).toEqual([
          {
            address: {
              ...makeContent().address,
              streetAddress: "123 Updated Street",
            },
          },
        ]);
      },
      { timeout: 2500 },
    );
  });

  it("rejects invalid contact information without saving", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateAddress({
        email: "invalid-email",
      });
    });

    await new Promise((resolve) =>
      setTimeout(resolve, 750),
    );

    expect(savedPatches()).toEqual([]);
  });

  it("saves business-hour changes after the shorter debounce", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateDay(1, {
        closed: true,
      });
    });

    await waitFor(
      () => {
        expect(savedPatches()).toHaveLength(1);

        expect(
          savedPatches()[0].hours?.[1],
        ).toMatchObject({
          day: "Mon",
          closed: true,
        });
      },
      { timeout: 2500 },
    );
  });

  it("saves contact-form toggle changes immediately", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateContactFormEnabled(
        false,
      );
    });

    await waitFor(() => {
      expect(savedPatches()).toEqual([
        {
          contactFormEnabled: false,
        },
      ]);
    });
  });

  it("saves online-ordering toggle changes immediately", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateOnlineOrderingEnabled(
        false,
      );
    });

    await waitFor(() => {
      expect(savedPatches()).toEqual([
        {
          onlineOrderingEnabled: false,
        },
      ]);
    });

    expect(
      result.current.content.onlineOrderingEnabled,
    ).toBe(false);
  });

  it("saves valid holiday closure changes", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateHoliday(
        "holiday-1",
        {
          closed: false,
          start: 10,
          end: 15,
        },
      );
    });

    await waitFor(() => {
      expect(savedPatches()).toEqual([
        {
          holidays: [
            {
              id: "holiday-1",
              name: "Christmas",
              date: "12-25",
              closed: false,
              start: 10,
              end: 15,
            },
          ],
        },
      ]);
    });
  });

  it("does not save holidays with invalid dates", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateHoliday(
        "holiday-1",
        {
          date: "2027-02-29",
        },
      );
    });

    await new Promise((resolve) =>
      setTimeout(resolve, 750),
    );

    expect(savedPatches()).toEqual([]);
  });

  it("displays an error state when persistence fails", async () => {
    const { result } = await renderContentHook();

    mocks.fetch.mockImplementation(
      async (url: string) => {
        if (url === "/api/website-content") {
          return {
            ok: false,
            status: 503,
            json: async () => ({
              error: "Website settings unavailable",
            }),
          };
        }

        throw new Error(
          `Unexpected request: ${url}`,
        );
      },
    );

    act(() => {
      result.current.updateContactFormEnabled(
        false,
      );
    });

    await waitFor(() => {
      expect(result.current.saveStatus).toBe(
        "error",
      );

      expect(result.current.errorMessage).toBe(
        "Website settings unavailable",
      );
    });

    expect(savedPatches()).toEqual([
      {
        contactFormEnabled: false,
      },
    ]);
  });

  it("submits pending valid edits when the page unloads", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateStory(
        "Story pending before navigation",
      );
    });

    expect(savedPatches()).toEqual([]);

    act(() => {
      window.dispatchEvent(
        new Event("beforeunload"),
      );
    });

    await waitFor(() => {
      expect(savedPatches()).toEqual([
        {
          story: "Story pending before navigation",
        },
      ]);
    });

    const saveCall = mocks.fetch.mock.calls.find(
      (call) => call[0] === "/api/website-content",
    );

    expect(
      (saveCall?.[1] as RequestInit).keepalive,
    ).toBe(true);
  });
});
