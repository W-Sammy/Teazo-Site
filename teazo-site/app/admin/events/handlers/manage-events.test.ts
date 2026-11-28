/**
 * Tests the Admin Events management hook.
 *
 * Covers:
 * - Nullable date serialization in FormData.
 * - Event creation and editing.
 * - Clearing existing event dates.
 * - Refreshing event records after successful saves.
 * - Preserving ongoing events during ended-event cleanup.
 * - Error handling and client state preservation.
 *
 * HTTP requests are mocked.
 * No external services or databases are accessed.
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
} from "@testing-library/react";

import type {
  AdminEvent,
  EventFormValues,
} from "@/app/types/admin-event";

import { useEvents } from "./manage-events";

const fetchMock = vi.fn<typeof fetch>();

const START = "2026-11-01T18:00:00.000Z";
const END = "2026-12-31T18:00:00.000Z";

const existingEvent: AdminEvent = {
  id: "event-1",
  name: "Existing Promotion",
  description: "Existing event description",
  imageUrl: "/TEAZO_logo.svg",
  startAt: START,
  endAt: END,
  appliesToAll: false,
  categoryIds: ["category-1"],
  itemIds: ["item-1"],
};

function formValues(
  overrides: Partial<EventFormValues> = {},
): EventFormValues {
  return {
    name: "New Promotion",
    description: "",
    startAt: null,
    endAt: null,
    appliesToAll: false,
    categoryIds: [],
    itemIds: [],
    imageFile: null,
    ...overrides,
  };
}

function jsonResponse(
  value: unknown,
  status = 200,
): Response {
  return Response.json(value, { status });
}

// Retrieve the actual FormData submitted by the hook.
function submittedForm(
  callIndex = 0,
): FormData {
  const body =
    fetchMock.mock.calls[callIndex]?.[1]?.body;

  expect(body).toBeInstanceOf(FormData);

  return body as FormData;
}

// Model a successful save followed by an event-list refresh.
function mockSuccessfulSave(
  refreshedEvents: AdminEvent[],
  status = 201,
) {
  fetchMock
    .mockResolvedValueOnce(
      jsonResponse({ id: "event-1" }, status),
    )
    .mockResolvedValueOnce(
      jsonResponse(refreshedEvents),
    );
}

describe("Admin Events management hook", () => {
  beforeEach(() => {
    fetchMock.mockReset();

    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-11-27T20:00:00.000Z"),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Preserve the initial records supplied by the parent.
  it("initializes with the supplied event records", () => {
    const { result } = renderHook(() =>
      useEvents([existingEvent]),
    );

    expect(result.current.events).toEqual([
      existingEvent,
    ]);

    expect(result.current.errorMessage).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // FormData must contain empty strings for omitted dates,
  // allowing the API to convert them back to null.
  it("submits an event containing only a name", async () => {
    const created: AdminEvent = {
      ...existingEvent,
      name: "New Promotion",
      description: "",
      startAt: null,
      endAt: null,
      categoryIds: [],
      itemIds: [],
    };

    mockSuccessfulSave([created]);

    const { result } = renderHook(() =>
      useEvents([]),
    );

    await act(async () => {
      expect(
        await result.current.createEvent(
          formValues(),
        ),
      ).toBe(true);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/events",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );

    const form = submittedForm();

    expect(form.get("name")).toBe("New Promotion");
    expect(form.get("description")).toBe("");
    expect(form.get("startAt")).toBe("");
    expect(form.get("endAt")).toBe("");
    expect(form.get("appliesToAll")).toBe("false");
    expect(form.get("categoryIds")).toBe("[]");
    expect(form.get("itemIds")).toBe("[]");
    expect(form.has("imageFile")).toBe(false);

    expect(result.current.events).toEqual([
      created,
    ]);

    expect(result.current.errorMessage).toBe("");
  });

  // A configured date must be preserved while an omitted
  // date is serialized as an empty string.
  it.each([
    {
      scenario: "only a start date",
      startAt: START,
      endAt: null,
      expectedStart: START,
      expectedEnd: "",
    },
    {
      scenario: "only an end date",
      startAt: null,
      endAt: END,
      expectedStart: "",
      expectedEnd: END,
    },
    {
      scenario: "both dates",
      startAt: START,
      endAt: END,
      expectedStart: START,
      expectedEnd: END,
    },
  ])("serializes an event with $scenario", async ({
    startAt,
    endAt,
    expectedStart,
    expectedEnd,
  }) => {
    mockSuccessfulSave([]);

    const { result } = renderHook(() =>
      useEvents([]),
    );

    await act(async () => {
      expect(
        await result.current.createEvent(
          formValues({
            startAt,
            endAt,
          }),
        ),
      ).toBe(true);
    });

    const form = submittedForm();

    expect(form.get("startAt")).toBe(expectedStart);
    expect(form.get("endAt")).toBe(expectedEnd);
  });

  // Optional dates must not interfere with the existing
  // event image and catalog association submission.
  it("retains image and catalog data when dates are omitted", async () => {
    const image = new File(
      ["test image"],
      "promotion.png",
      { type: "image/png" },
    );

    mockSuccessfulSave([]);

    const { result } = renderHook(() =>
      useEvents([]),
    );

    await act(async () => {
      expect(
        await result.current.createEvent(
          formValues({
            imageFile: image,
            categoryIds: ["category-1"],
            itemIds: ["item-1"],
          }),
        ),
      ).toBe(true);
    });

    const form = submittedForm();

    expect(form.get("startAt")).toBe("");
    expect(form.get("endAt")).toBe("");

    expect(form.get("categoryIds")).toBe(
      '["category-1"]',
    );

    expect(form.get("itemIds")).toBe(
      '["item-1"]',
    );

    const submittedImage = form.get("imageFile");

    expect(submittedImage).toBeInstanceOf(File);

    expect((submittedImage as File).name).toBe(
      "promotion.png",
    );

    expect((submittedImage as File).type).toBe(
      "image/png",
    );
  });

  // Clearing existing dates must send a PATCH request
  // with empty date fields rather than creating a new event.
  it("clears both dates when updating an existing event", async () => {
    const updated: AdminEvent = {
      ...existingEvent,
      startAt: null,
      endAt: null,
    };

    mockSuccessfulSave([updated], 200);

    const { result } = renderHook(() =>
      useEvents([existingEvent]),
    );

    await act(async () => {
      expect(
        await result.current.updateEvent(
          existingEvent,
          formValues({
            name: existingEvent.name,
            description: existingEvent.description,
            categoryIds: existingEvent.categoryIds,
            itemIds: existingEvent.itemIds,
          }),
        ),
      ).toBe(true);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/events/event-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.any(FormData),
      }),
    );

    const form = submittedForm();

    expect(form.get("startAt")).toBe("");
    expect(form.get("endAt")).toBe("");
    expect(form.has("imageFile")).toBe(false);

    expect(result.current.events).toEqual([
      updated,
    ]);
  });

  // Each existing date must be independently removable.
  it.each([
    {
      scenario: "start date",
      startAt: null,
      endAt: END,
      expectedStart: "",
      expectedEnd: END,
    },
    {
      scenario: "end date",
      startAt: START,
      endAt: null,
      expectedStart: START,
      expectedEnd: "",
    },
  ])("clears only the $scenario when editing", async ({
    startAt,
    endAt,
    expectedStart,
    expectedEnd,
  }) => {
    mockSuccessfulSave(
      [
        {
          ...existingEvent,
          startAt,
          endAt,
        },
      ],
      200,
    );

    const { result } = renderHook(() =>
      useEvents([existingEvent]),
    );

    await act(async () => {
      expect(
        await result.current.updateEvent(
          existingEvent,
          formValues({
            name: existingEvent.name,
            startAt,
            endAt,
          }),
        ),
      ).toBe(true);
    });

    const form = submittedForm();

    expect(form.get("startAt")).toBe(expectedStart);
    expect(form.get("endAt")).toBe(expectedEnd);

    expect(result.current.events[0]).toMatchObject({
      startAt,
      endAt,
    });
  });

  // A successful creation must refresh the records using
  // the existing no-store request to the Admin Events API.
  it("refreshes event records after successful creation", async () => {
    mockSuccessfulSave([existingEvent]);

    const { result } = renderHook(() =>
      useEvents([]),
    );

    await act(async () => {
      await result.current.createEvent(formValues());
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/events",
      { cache: "no-store" },
    );

    expect(result.current.events).toEqual([
      existingEvent,
    ]);
  });

  // Failed creation must leave existing client records intact.
  it("preserves existing events when creation fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: "Unable to create event." },
        400,
      ),
    );

    const { result } = renderHook(() =>
      useEvents([existingEvent]),
    );

    await act(async () => {
      expect(
        await result.current.createEvent(
          formValues(),
        ),
      ).toBe(false);
    });

    expect(result.current.events).toEqual([
      existingEvent,
    ]);

    expect(result.current.errorMessage).toBe(
      "Failed to create the event.",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // Failed edits must not remove or overwrite the
  // existing event schedule in client state.
  it("preserves the original event when an update fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: "Unable to update event." },
        503,
      ),
    );

    const { result } = renderHook(() =>
      useEvents([existingEvent]),
    );

    await act(async () => {
      expect(
        await result.current.updateEvent(
          existingEvent,
          formValues(),
        ),
      ).toBe(false);
    });

    expect(result.current.events).toEqual([
      existingEvent,
    ]);

    expect(result.current.errorMessage).toBe(
      "Failed to update the event.",
    );
  });

  // Ended-event cleanup must retain every event without
  // an expiration date, including upcoming start-only events.
  it("preserves ongoing events during ended-event cleanup", async () => {
    const initialEvents: AdminEvent[] = [
      {
        ...existingEvent,
        id: "no-dates",
        startAt: null,
        endAt: null,
      },
      {
        ...existingEvent,
        id: "started",
        startAt: START,
        endAt: null,
      },
      {
        ...existingEvent,
        id: "upcoming",
        startAt: END,
        endAt: null,
      },
      {
        ...existingEvent,
        id: "active-end-only",
        startAt: null,
        endAt: END,
      },
      {
        ...existingEvent,
        id: "expired-end-only",
        startAt: null,
        endAt: "2026-11-20T18:00:00.000Z",
      },
      {
        ...existingEvent,
        id: "expired-scheduled",
        startAt: START,
        endAt: "2026-11-20T18:00:00.000Z",
      },
      {
        ...existingEvent,
        id: "active-scheduled",
      },
    ];

    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const { result } = renderHook(() =>
      useEvents(initialEvents),
    );

    await act(async () => {
      expect(
        await result.current.deleteEndedEvents(),
      ).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/events",
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          endedOnly: true,
        }),
      },
    );

    expect(
      result.current.events.map((event) => event.id),
    ).toEqual([
      "no-dates",
      "started",
      "upcoming",
      "active-end-only",
      "active-scheduled",
    ]);

    expect(result.current.errorMessage).toBe("");
  });

  // An event ending at the exact current time remains
  // active, consistent with the inclusive status boundary.
  it("preserves events ending at the exact current time", async () => {
    const boundaryEvent: AdminEvent = {
      ...existingEvent,
      startAt: null,
      endAt: new Date(Date.now()).toISOString(),
    };

    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const { result } = renderHook(() =>
      useEvents([boundaryEvent]),
    );

    await act(async () => {
      expect(
        await result.current.deleteEndedEvents(),
      ).toBe(true);
    });

    expect(result.current.events).toEqual([
      boundaryEvent,
    ]);
  });

  // Failed bulk cleanup must not remove any events
  // from the administrator's current list.
  it("preserves all event records when ended-event cleanup fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: "Database unavailable." },
        503,
      ),
    );

    const initialEvents: AdminEvent[] = [
      {
        ...existingEvent,
        id: "ongoing",
        startAt: null,
        endAt: null,
      },
      {
        ...existingEvent,
        id: "expired",
        startAt: null,
        endAt: START,
      },
    ];

    const { result } = renderHook(() =>
      useEvents(initialEvents),
    );

    await act(async () => {
      expect(
        await result.current.deleteEndedEvents(),
      ).toBe(false);
    });

    expect(result.current.events).toEqual(
      initialEvents,
    );

    expect(result.current.errorMessage).toBe(
      "Failed to delete ended events.",
    );
  });

  // Undated events must remain manually deletable.
  it("allows manual deletion of an event without dates", async () => {
    const ongoingEvent: AdminEvent = {
      ...existingEvent,
      id: "ongoing",
      startAt: null,
      endAt: null,
    };

    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const { result } = renderHook(() =>
      useEvents([existingEvent, ongoingEvent]),
    );

    await act(async () => {
      expect(
        await result.current.deleteEvent(
          ongoingEvent,
        ),
      ).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/events/ongoing",
      { method: "DELETE" },
    );

    expect(result.current.events).toEqual([
      existingEvent,
    ]);
  });

  // A failed individual deletion must preserve the
  // existing event and display an operation error.
  it("preserves an undated event when manual deletion fails", async () => {
    const ongoingEvent: AdminEvent = {
      ...existingEvent,
      startAt: null,
      endAt: null,
    };

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: "Unable to delete event." },
        503,
      ),
    );

    const { result } = renderHook(() =>
      useEvents([ongoingEvent]),
    );

    await act(async () => {
      expect(
        await result.current.deleteEvent(
          ongoingEvent,
        ),
      ).toBe(false);
    });

    expect(result.current.events).toEqual([
      ongoingEvent,
    ]);

    expect(result.current.errorMessage).toBe(
      "Failed to delete the event.",
    );
  });
});