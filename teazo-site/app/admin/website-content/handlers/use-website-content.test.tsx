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
    collectionsRevision: 0,
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
              collectionsRevision: 1,
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
          collectionsRevision: 0,
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

  it("updates local logo state from confirmed upload without triggering redundant general PATCH", async () => {
    const { result } = await renderContentHook();

    act(() => {
      result.current.updateLogo("https://r2.teazo.com/logo/2026/11/confirmed.webp");
    });

    expect(result.current.content.logo).toBe(
      "https://r2.teazo.com/logo/2026/11/confirmed.webp",
    );
    // Ensure no redundant PATCH /api/website-content was dispatched
    expect(savedPatches()).toEqual([]);
  });

  it("transitions save status from idle to unsaved upon debounced input, and tracks hasUnsavedEdits", async () => {
    const { result } = await renderContentHook();

    expect(result.current.saveStatus).toBe("idle");
    expect(result.current.hasUnsavedEdits).toBe(false);

    act(() => {
      result.current.updateStory("Unsaved debounced story edit");
    });

    expect(result.current.saveStatus).toBe("unsaved");
    expect(result.current.hasUnsavedEdits).toBe(true);

    await waitFor(
      () => {
        expect(result.current.saveStatus).toBe("saved");
      },
      { timeout: 2500 },
    );

    expect(result.current.hasUnsavedEdits).toBe(false);
  });

  it("enforces collection limits when adding social links and holidays", async () => {
    const { result } = await renderContentHook();

    // Add up to 10 social links
    for (let i = 0; i < 10; i++) {
      let added = false;
      act(() => {
        added = result.current.addSocialLink();
      });
      expect(added).toBe(true);
    }
    expect(result.current.content.socialLinks).toHaveLength(10);

    // 11th should be refused
    let add11th = true;
    act(() => {
      add11th = result.current.addSocialLink();
    });
    expect(add11th).toBe(false);
    expect(result.current.content.socialLinks).toHaveLength(10);
    expect(result.current.errorMessage).toContain("Maximum limit of 10 social links reached");

    // Existing content has 1 holiday, add up to 16
    for (let i = 1; i < 16; i++) {
      let added = false;
      act(() => {
        added = result.current.addHoliday();
      });
      expect(added).toBe(true);
    }
    expect(result.current.content.holidays).toHaveLength(16);

    // 17th should be refused
    let add17th = true;
    act(() => {
      add17th = result.current.addHoliday();
    });
    expect(add17th).toBe(false);
    expect(result.current.content.holidays).toHaveLength(16);
    expect(result.current.errorMessage).toContain("Maximum limit of 16 holiday exceptions reached");
  });

  it("tracks invalid edits and drafts independently of the save queue", async () => {
    const { result } = await renderContentHook();
    act(() => { result.current.updateAddress({ email: "invalid" }); });
    await act(async () => { await result.current.flushPatch(); });
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(result.current.saveStatus).toBe("unsaved");
    act(() => { result.current.updateAddress({ email: makeContent().address.email }); });
    await act(async () => { await result.current.flushPatch(); });
    expect(result.current.hasUnsavedEdits).toBe(false);

    act(() => { result.current.addHoliday(); });
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(result.current.saveStatus).toBe("unsaved");
    const id = result.current.content.holidays.at(-1)!.id;
    await act(async () => { await result.current.removeHoliday(id); });
    expect(result.current.hasUnsavedEdits).toBe(false);
  });

  it("retains the dirty warning for invalid edits made during an in-flight save", async () => {
    const { result } = await renderContentHook();
    let finish!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    act(() => { result.current.updateStory("Submitted story"); });
    let save!: Promise<boolean>;
    act(() => { save = result.current.flushPatch(); });
    act(() => { result.current.updateStory(""); });
    expect(result.current.saveStatus).toBe("saving");
    await act(async () => { finish(Response.json({ success: true })); await save; });
    expect(result.current.content.story).toBe("");
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(result.current.saveStatus).toBe("unsaved");
  });

  it("refuses an eleventh delivery row and saves edits to the ten supported rows", async () => {
    const initialContent = makeContent();
    initialContent.deliveryLinks = Array.from({ length: 10 }, (_, i) => ({
      id: `delivery-${i}`, label: `Delivery ${i}`, icon: "", url: `https://example.com/${i}`, enabled: true,
    }));
    const { result } = renderHook(() => useWebsiteContent(initialContent));
    await waitFor(() => expect(result.current.carousel.carouselReady).toBe(true));
    act(() => { result.current.addDeliveryLink(); });
    expect(result.current.content.deliveryLinks).toHaveLength(10);
    expect(result.current.errorMessage).toContain("Maximum limit of 10 delivery links reached");
    act(() => { result.current.updateDeliveryLink("delivery-0", { label: "Updated" }); });
    await act(async () => { await result.current.flushPatch(); });
    expect(savedPatches().at(-1)?.deliveryLinks?.[0].label).toBe("Updated");
    expect(result.current.hasUnsavedEdits).toBe(false);
  });

  it("reports legacy over-capacity delivery edits without claiming they were saved", async () => {
    const initialContent = makeContent();
    initialContent.deliveryLinks = Array.from({ length: 11 }, (_, i) => ({
      id: `delivery-${i}`, label: `Delivery ${i}`, icon: "", url: `https://example.com/${i}`, enabled: true,
    }));
    const { result } = renderHook(() => useWebsiteContent(initialContent));
    await waitFor(() => expect(result.current.carousel.carouselReady).toBe(true));
    act(() => { result.current.updateDeliveryLink("delivery-0", { label: "Updated" }); });
    await act(async () => { await result.current.flushPatch(); });
    expect(result.current.errorMessage).toContain("up to 10 delivery links");
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(result.current.saveStatus).not.toBe("saved");
    expect(savedPatches()).toEqual([]);
    await act(async () => { result.current.removeDeliveryLink("delivery-10"); });
    expect(savedPatches().at(-1)?.deliveryLinks).toHaveLength(10);
    expect(result.current.hasUnsavedEdits).toBe(false);
  });

  it("isolates failed pending saves and blocks subsequent deletion until resolved", async () => {
    const { result } = await renderContentHook();

    // Mock API failure for PATCH
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/website-content/carousel") {
        return { ok: true, status: 200, json: async () => ({ success: true, images: [] }) };
      }
      if (url === "/api/website-content" && init?.method === "PATCH") {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: "Database temporarily unavailable" }),
        };
      }
      if (url === "/api/website-content" && init?.method === "DELETE") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ collectionsRevision: 1 }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    // Make an edit that fails saving
    act(() => {
      result.current.updateStory("Story that fails to save");
    });

    await waitFor(() => {
      expect(result.current.saveStatus).toBe("error");
    });
    expect(result.current.hasUnsavedEdits).toBe(true);

    // Attempting to delete holiday-1 while a pending save is failed must be blocked
    let deleteError: string | null = null;
    await act(async () => {
      deleteError = await result.current.removeHoliday("holiday-1");
    });

    expect(deleteError).toBe("Save pending changes successfully before deleting, or reload this page.");
    expect(result.current.content.holidays).toHaveLength(1);

    // Now mock PATCH succeeding
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/website-content/carousel") {
        return { ok: true, status: 200, json: async () => ({ success: true, images: [] }) };
      }
      if (url === "/api/website-content" && init?.method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ collectionsRevision: 1 }) };
      }
      if (url === "/api/website-content" && init?.method === "DELETE") {
        return { ok: true, status: 200, json: async () => ({ collectionsRevision: 1 }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    // Retrying deletion now flushes pending saves successfully, then deletes
    await act(async () => {
      deleteError = await result.current.removeHoliday("holiday-1");
    });

    expect(deleteError).toBeNull();
    expect(result.current.content.holidays).toHaveLength(0);
  });
});
