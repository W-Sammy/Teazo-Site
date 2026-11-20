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

// delivery tests
describe("delivery hook tests", () => {
  const platform = {
      id: "delivery-one", label: "First Delivery", icon: "",
      url: "https://example.com/first", enabled: true,
  };
  const secondPlatform = {
      ...platform, id: "delivery-two", label: "Second Delivery", url: "https://example.com/second",
  };

  // use the real validators, but replace fetch so no actual settings or database records change
  const fetchMock = vi.fn<typeof fetch>();
  // reuse fixture above, adding only delivery platforms needed
  function makeDeliveryContent(): WebsiteContent {
      return { ...makeContent(), deliveryLinks: [{ ...platform }, { ...secondPlatform }] };
  }

  // ignore separate carousel request; return only website content save payloads
  function savedPatches(): Partial<WebsiteContent>[] {
      return fetchMock.mock.calls
          .filter(([url]) => url === "/api/website-content")
          .map(([, options]) => JSON.parse(String(options?.body)) as Partial<WebsiteContent>);
  }

  async function setup() {
      const hook = renderHook(() => useWebsiteContent(makeDeliveryContent()));
      // wait for existing carousel initialization before testing delivery
      await waitFor(() => expect(hook.result.current.carousel.carouselReady).toBe(true));
      // fake timers let us check the typing delay without waiting in real time
      vi.useFakeTimers();
      return hook;
  }

  async function advance(ms: number) {
      // lets react finish updates caused by timers and resolved requests
      await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  }

  beforeEach(() => {
      fetchMock.mockReset();
      fetchMock.mockImplementation(async (url) => {
          if (url === "/api/admin/website-content/carousel") {
              return Response.json({ success: true, images: [] });
          }
          if (url === "/api/website-content") {
              return Response.json({ success: true });
          }
          throw new Error(`Unexpected request: ${String(url)}`);
      });
      vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
  });

  describe("delivery save handling", () => {
      it("loads delivery links without submitting a save", async () => {
          const { result } = await setup();
          expect(result.current.content.deliveryLinks).toEqual([platform, secondPlatform]);
          expect(savedPatches()).toEqual([]);
      });

      it("keeps a new blank platform local without saving it", async () => {
          const { result } = await setup();
          act(() => result.current.addDeliveryLink());
          await advance(1000);

          expect(result.current.content.deliveryLinks).toHaveLength(3);
          expect(result.current.content.deliveryLinks?.[2]).toMatchObject({ label: "", url: "" });
          expect(savedPatches()).toEqual([]);
      });

      it("waits for the typing delay and saves only the latest edit", async () => {
          const { result } = await setup();
          act(() => result.current.updateDeliveryLink(platform.id, { label: "First Edit" }));
          await advance(300);

          act(() => result.current.updateDeliveryLink(platform.id, { label: "Latest Edit" }));
          await advance(599);

          expect(savedPatches()).toEqual([]);
          await advance(1);
          expect(savedPatches()).toEqual([{
              deliveryLinks: [{ ...platform, label: "Latest Edit" }, secondPlatform],
          }]);
      });

      it("saves visibility immediately and preserves the other platform", async () => {
          const { result } = await setup();
          await act(async () => result.current.updateDeliveryLink(secondPlatform.id, { enabled: false }));
          expect(savedPatches()).toEqual([{
              deliveryLinks: [platform, { ...secondPlatform, enabled: false }],
          }]);
          expect(result.current.content.deliveryLinks).toHaveLength(2);
      });

      it("removes only the selected platform and saves immediately", async () => {
          const { result } = await setup();
          await act(async () => result.current.removeDeliveryLink(secondPlatform.id));
          expect(savedPatches()).toEqual([{ deliveryLinks: [platform] }]);
          expect(result.current.content.deliveryLinks).toEqual([platform]);
      });

      it("saves an empty list after the final platform is removed", async () => {
          const { result } = await setup();
          await act(async () => result.current.removeDeliveryLink(secondPlatform.id));
          await act(async () => result.current.removeDeliveryLink(platform.id));
          expect(savedPatches().at(-1)).toEqual({ deliveryLinks: [] });
      });

      it.each([
          { label: "" }, { label: "   " }, { url: "" },
          { url: "tea@example.com" }, { url: "example.com" },
      ])("does not submit an invalid delivery edit: %j", async (patch) => {
          const { result } = await setup();
          act(() => result.current.updateDeliveryLink(platform.id, patch));
          await advance(1000);
          expect(savedPatches()).toEqual([]);
      });

      it("leaves a blank draft out when another platform is saved", async () => {
          const { result } = await setup();
          act(() => result.current.addDeliveryLink());
          act(() => result.current.updateDeliveryLink(platform.id, { label: "Updated" }));
          await advance(600);
          expect(savedPatches()).toEqual([{
              deliveryLinks: [{ ...platform, label: "Updated" }, secondPlatform],
          }]);
          expect(result.current.content.deliveryLinks).toHaveLength(3);
      });

      it("shows saving while a request is pending, then saved after success", async () => {
          const { result } = await setup();
          let finish!: (response: Response) => void;
          fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
          act(() => result.current.updateDeliveryLink(platform.id, { enabled: false }));
          expect(result.current.saveStatus).toBe("saving");
          await act(async () => { finish(Response.json({ success: true })); });
          expect(result.current.saveStatus).toBe("saved");
          expect(result.current.errorMessage).toBe("");
      });

      it("shows an error instead of saved when the API rejects the save", async () => {
          const { result } = await setup();
          fetchMock.mockResolvedValueOnce(Response.json({ error: "Delivery save unavailable" }, { status: 503 }));
          await act(async () => result.current.updateDeliveryLink(platform.id, { enabled: false }));
          expect(result.current.saveStatus).toBe("error");
          expect(result.current.errorMessage).toBe("Delivery save unavailable");
      });

      it("shows a network error and allows a fresh edit to save successfully", async () => {
          const { result } = await setup();
          fetchMock.mockRejectedValueOnce(new Error("Connection lost"));
          await act(async () => result.current.updateDeliveryLink(platform.id, { enabled: false }));

          expect(result.current.saveStatus).toBe("error");
          expect(result.current.errorMessage).toBe("Connection lost");
          
          await act(async () => result.current.updateDeliveryLink(platform.id, { enabled: true }));
          expect(result.current.saveStatus).toBe("saved");
          expect(result.current.errorMessage).toBe("");
      });

      it("flushes a waiting valid edit on blur without sending the timer save twice", async () => {
          const { result } = await setup();
          act(() => result.current.updateDeliveryLink(platform.id, { label: "Edited" }));

          await act(async () => { await result.current.flushPatch(); });
          expect(savedPatches()).toHaveLength(1);

          await advance(1000);
          expect(savedPatches()).toHaveLength(1);
      });

      // catch an older valid edit being saved after the current input becomes invalid
      it("discards a waiting delivery save when its URL becomes an email and the field loses focus", async () => {
          const { result } = await setup();
          act(() => result.current.updateDeliveryLink(platform.id, { label: "Edited" }));
          act(() => result.current.updateDeliveryLink(platform.id, { url: "tea@example.com" }));

          // the section calls flushPatch after leaving the field
          await act(async () => { await result.current.flushPatch(); });
          await advance(1000);
          expect(savedPatches()).toEqual([]);
      });

      // make sure delivery shares the save queue safely with other sections
      it("keeps another section's waiting save when an invalid delivery edit clears its own save", async () => {
          const { result } = await setup();
          act(() => result.current.updateStory("This story should still save."));
          act(() => result.current.updateDeliveryLink(platform.id, { label: "Updated" }));
          act(() => result.current.updateDeliveryLink(platform.id, { url: "tea@example.com" }));

          await act(async () => { await result.current.flushPatch(); });
          await advance(1000);

          // discard only invalid delivery data, rather than emptying the whole shared queue
          expect(savedPatches()).toEqual([{ story: "This story should still save." }]);
      });

      it("does not bring a removed platform back through an older waiting save", async () => {
          const { result } = await setup();
          act(() => result.current.updateDeliveryLink(platform.id, { label: "Waiting Edit" }));
          await act(async () => result.current.removeDeliveryLink(platform.id));
          await advance(1000);

          expect(savedPatches()).toEqual([{ deliveryLinks: [secondPlatform] }]);
          expect(result.current.content.deliveryLinks).toEqual([secondPlatform]);
      });

      it("saves the corrected URL after an invalid edit without reusing the older URL", async () => {
          const { result } = await setup();
          act(() => result.current.updateDeliveryLink(platform.id, { url: "tea@example.com" }));
          await advance(1000);
          expect(savedPatches()).toEqual([]);

          act(() => result.current.updateDeliveryLink(platform.id, { url: "https://example.com/corrected" }));
          await advance(600);

          expect(savedPatches()).toEqual([{
              deliveryLinks: [{ ...platform, url: "https://example.com/corrected" }, secondPlatform],
          }]);
      });
  });
});