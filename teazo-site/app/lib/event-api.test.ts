/**
 * Tests the shared Admin Events saveEvent() operation.
 *
 * Coverage includes:
 * - Admin authorization.
 * - Event creation and editing.
 * - Required fields and date validation.
 * - Square catalog target input parsing.
 * - Event image validation and R2 uploads.
 * - Cleanup after rejected database writes.
 *
 * Admin authorization, D1 operations, and R2 storage are mocked.
 * No real events or media assets are created or modified.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import {
  createEvent,
  eventExists,
  updateEvent,
} from "@/app/lib/queries/events";
import {
  deleteMediaNow,
  MAX_MEDIA_BYTES,
  mintKey,
  putMedia,
} from "@/app/lib/media";
import { saveEvent } from "./event-api";

// Mock authorization and database operations to isolate
// saveEvent() from real sessions and D1 requests.
vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {
    status: number;

    constructor(status: number) {
      super("Database failure");
      this.name = "D1Error";
      this.status = status;
    }
  },
}));

vi.mock("@/app/lib/queries/events", () => ({
  createEvent: vi.fn(),
  eventExists: vi.fn(),
  updateEvent: vi.fn(),
}));

// Replace R2 operations with mock functions.
// The upload size limit remains 10 MB so boundary tests
// use the same configured limit as the implementation.
vi.mock("@/app/lib/media", () => ({
  MAX_MEDIA_BYTES: 10 * 1024 * 1024,
  mintKey: vi.fn(
    (directory: string, extension: string) =>
      `${directory}/test.${extension}`,
  ),
  putMedia: vi.fn(),
  deleteMediaNow: vi.fn(),
}));

const START = "2026-11-01T18:00:00.000Z";
const END = "2026-11-01T21:00:00.000Z";

// Construct valid FormData by default so individual tests
// can override only the fields relevant to their scenario.
function makeForm(
  overrides: Record<string, string> = {},
  image?: File,
): FormData {
  const values = {
    name: "Fall Promotion",
    description: "Special seasonal promotion",
    startAt: START,
    endAt: END,
    appliesToAll: "false",
    categoryIds: '["category-1"]',
    itemIds: '["item-1"]',
    ...overrides,
  };

  const form = new FormData();

  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }

  if (image) {
    form.set("imageFile", image);
  }

  return form;
}

// Model an event submission without starting a web server.
function makeRequest(form: FormData): Request {
  return new Request(
    "http://localhost:3000/api/admin/events",
    {
      method: "POST",
      body: form,
    },
  );
}

// Create a small test image with a configurable MIME type.
function makeImage(
  type = "image/png",
  filename = "event.png",
): File {
  return new File(
    [new Uint8Array([1, 2, 3])],
    filename,
    { type },
  );
}

// Simulate a D1Error with a specific HTTP status so
// cleanup behavior can be tested independently of D1.
function makeD1Error(status: number): Error {
  const error = new Error("Database failure");

  Object.setPrototypeOf(error, D1Error.prototype);

  return Object.assign(error, { status });
}

describe("saveEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Suppress expected error logs from negative test cases.
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Default to an authorized Admin and successful operations.
    // Individual tests override these defaults when needed.
    vi.mocked(requireAdminApi).mockResolvedValue({
      ok: true,
      admin: {
        id: "admin-1",
        role_id: 2,
      },
    } as never);

    vi.mocked(createEvent).mockResolvedValue("event-new");
    vi.mocked(eventExists).mockResolvedValue(true);
    vi.mocked(updateEvent).mockResolvedValue(true);

    vi.mocked(putMedia).mockResolvedValue({
      bucket: "teazo-media",
      key: "events/test.png",
      size: 3,
    } as never);

    vi.mocked(deleteMediaNow).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // Authorization
  // ============================================================

  it("rejects unauthorized event creation", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    });

    const response = await saveEvent(
      makeRequest(makeForm()),
      null,
    );

    expect(response.status).toBe(401);
    expect(createEvent).not.toHaveBeenCalled();
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("requires an authenticated Admin with editing permissions", async () => {
    const request = makeRequest(makeForm());

    await saveEvent(request, null);

    expect(requireAdminApi).toHaveBeenCalledWith(request, 2);
  });

  // ============================================================
  // Event creation and input validation
  // ============================================================

  it("creates a valid event", async () => {
    const response = await saveEvent(
      makeRequest(makeForm()),
      null,
    );

    expect(response.status).toBe(201);

    expect(await response.json()).toEqual({
      id: "event-new",
    });

    expect(createEvent).toHaveBeenCalledWith(
      {
        name: "Fall Promotion",
        description: "Special seasonal promotion",
        startAt: START,
        endAt: END,
        appliesToAll: false,
        categoryIds: ["category-1"],
        itemIds: ["item-1"],
      },
      "admin-1",
      undefined,
    );
  });

  // Leading/trailing whitespace should not be stored as
  // part of an event's name or description.
  it("trims event names and descriptions", async () => {
    await saveEvent(
      makeRequest(
        makeForm({
          name: "  Fall Promotion  ",
          description: "  Seasonal special  ",
        }),
      ),
      null,
    );

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Fall Promotion",
        description: "Seasonal special",
      }),
      "admin-1",
      undefined,
    );
  });

  it("rejects an empty event name", async () => {
    const response = await saveEvent(
      makeRequest(makeForm({ name: "   " })),
      null,
    );

    expect(response.status).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects an empty description", async () => {
    const response = await saveEvent(
      makeRequest(makeForm({ description: "" })),
      null,
    );

    expect(response.status).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid start date", async () => {
    const response = await saveEvent(
      makeRequest(
        makeForm({ startAt: "not-a-date" }),
      ),
      null,
    );

    expect(response.status).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid end date", async () => {
    const response = await saveEvent(
      makeRequest(
        makeForm({ endAt: "invalid" }),
      ),
      null,
    );

    expect(response.status).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  // Prevent saving an event whose ending time is earlier
  // than its starting time.
  it("rejects end dates earlier than start dates", async () => {
    const response = await saveEvent(
      makeRequest(
        makeForm({
          startAt: "2026-11-02T12:00:00Z",
          endAt: "2026-11-01T12:00:00Z",
        }),
      ),
      null,
    );

    expect(response.status).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  // Equal timestamps are currently allowed by the backend.
  // This records the intended boundary behavior.
  it("allows matching start and end timestamps", async () => {
    const response = await saveEvent(
      makeRequest(
        makeForm({
          startAt: START,
          endAt: START,
        }),
      ),
      null,
    );

    expect(response.status).toBe(201);
  });

  // ============================================================
  // Event targeting and catalog input
  // ============================================================

  it("parses appliesToAll correctly", async () => {
    await saveEvent(
      makeRequest(
        makeForm({ appliesToAll: "true" }),
      ),
      null,
    );

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        appliesToAll: true,
      }),
      "admin-1",
      undefined,
    );
  });

  // Malformed JSON is treated as an empty target list,
  // preventing parsing errors from interrupting the save.
  it("discards malformed target JSON", async () => {
    const response = await saveEvent(
      makeRequest(
        makeForm({
          categoryIds: "{invalid-json",
          itemIds: "invalid",
        }),
      ),
      null,
    );

    expect(response.status).toBe(201);

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryIds: [],
        itemIds: [],
      }),
      "admin-1",
      undefined,
    );
  });

  // Only string identifiers should be forwarded to
  // Square catalog target queries.
  it("ignores non-string target IDs", async () => {
    await saveEvent(
      makeRequest(
        makeForm({
          categoryIds: '["category-1",42,null]',
          itemIds: '["item-1",false,{}]',
        }),
      ),
      null,
    );

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryIds: ["category-1"],
        itemIds: ["item-1"],
      }),
      "admin-1",
      undefined,
    );
  });

  // ============================================================
  // Event editing
  // ============================================================

  it("updates an existing event", async () => {
    const response = await saveEvent(
      makeRequest(makeForm()),
      "event-existing",
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      id: "event-existing",
    });

    expect(eventExists).toHaveBeenCalledWith(
      "event-existing",
    );

    expect(updateEvent).toHaveBeenCalledWith(
      "event-existing",
      expect.objectContaining({
        name: "Fall Promotion",
      }),
      undefined,
    );

    expect(createEvent).not.toHaveBeenCalled();
  });

  // A missing event must be rejected before an image is
  // uploaded, preventing unnecessary R2 objects.
  it("returns 404 when updating a nonexistent event", async () => {
    vi.mocked(eventExists).mockResolvedValueOnce(false);

    const response = await saveEvent(
      makeRequest(makeForm()),
      "missing-event",
    );

    expect(response.status).toBe(404);
    expect(updateEvent).not.toHaveBeenCalled();
    expect(putMedia).not.toHaveBeenCalled();
  });

  // ============================================================
  // Event image uploads and validation
  // ============================================================

  it("uploads valid PNG event images", async () => {
    const response = await saveEvent(
      makeRequest(
        makeForm({}, makeImage()),
      ),
      null,
    );

    expect(response.status).toBe(201);

    expect(mintKey).toHaveBeenCalledWith(
      "events",
      "png",
    );

    expect(putMedia).toHaveBeenCalledWith(
      "events/test.png",
      expect.any(Uint8Array),
      "image/png",
    );

    expect(createEvent).toHaveBeenCalledWith(
      expect.any(Object),
      "admin-1",
      expect.objectContaining({
        mimeType: "image/png",
        originalFilename: "event.png",
        adminId: "admin-1",
      }),
    );
  });

  // JPEG uploads use the normalized jpg extension.
  it("uses jpg extension for JPEG images", async () => {
    await saveEvent(
      makeRequest(
        makeForm(
          {},
          makeImage("image/jpeg", "photo.jpeg"),
        ),
      ),
      null,
    );

    expect(mintKey).toHaveBeenCalledWith(
      "events",
      "jpg",
    );
  });

  it("supports WebP images", async () => {
    const response = await saveEvent(
      makeRequest(
        makeForm(
          {},
          makeImage("image/webp", "photo.webp"),
        ),
      ),
      null,
    );

    expect(response.status).toBe(201);

    expect(mintKey).toHaveBeenCalledWith(
      "events",
      "webp",
    );
  });

  it("rejects unsupported image types", async () => {
    const response = await saveEvent(
      makeRequest(
        makeForm(
          {},
          makeImage("application/pdf", "test.pdf"),
        ),
      ),
      null,
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "Use a JPEG, PNG, or WebP image.",
    });

    expect(putMedia).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  // Reject oversized images before uploading or saving
  // their metadata to D1.
  it("rejects images larger than the configured limit", async () => {
    const oversizedImage = new File(
      [new Uint8Array(MAX_MEDIA_BYTES + 1)],
      "large.png",
      { type: "image/png" },
    );

    const response = await saveEvent(
      makeRequest(
        makeForm({}, oversizedImage),
      ),
      null,
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "The event image must be 10 MB or smaller.",
    });

    expect(putMedia).not.toHaveBeenCalled();
  });

  // Empty files are treated as no image rather than as
  // valid media assets.
  it("does not upload empty image files", async () => {
    const emptyImage = new File(
      [],
      "empty.png",
      { type: "image/png" },
    );

    const response = await saveEvent(
      makeRequest(
        makeForm({}, emptyImage),
      ),
      null,
    );

    expect(response.status).toBe(201);

    expect(putMedia).not.toHaveBeenCalled();

    expect(createEvent).toHaveBeenCalledWith(
      expect.any(Object),
      "admin-1",
      undefined,
    );
  });

  it("returns an error if media storage fails", async () => {
    vi.mocked(putMedia).mockRejectedValueOnce(
      new Error("R2 upload failed"),
    );

    const response = await saveEvent(
      makeRequest(
        makeForm({}, makeImage()),
      ),
      null,
    );

    expect(response.status).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  // ============================================================
  // Failed writes and R2 cleanup
  // ============================================================

  // If an event update fails after uploading a replacement
  // image, the newly uploaded R2 object must be cleaned up.
  it("cleans up new media when an update is rejected", async () => {
    vi.mocked(updateEvent).mockResolvedValueOnce(false);

    const response = await saveEvent(
      makeRequest(
        makeForm({}, makeImage()),
      ),
      "event-existing",
    );

    expect(response.status).toBe(404);

    expect(deleteMediaNow).toHaveBeenCalledWith(
      "events/test.png",
    );
  });

  // An explicitly rejected D1 write permits cleanup because
  // the application knows the database did not save the media.
  it("cleans up uploaded media after a rejected D1 write", async () => {
    vi.mocked(createEvent).mockRejectedValueOnce(
      makeD1Error(400),
    );

    const response = await saveEvent(
      makeRequest(
        makeForm({}, makeImage()),
      ),
      null,
    );

    expect(response.status).toBe(503);

    expect(deleteMediaNow).toHaveBeenCalledWith(
      "events/test.png",
    );
  });

  // An uncertain server-side database failure could mean
  // the write succeeded. Immediate deletion would risk
  // removing media referenced by an event.
  it("does not immediately delete media after uncertain server failures", async () => {
    vi.mocked(createEvent).mockRejectedValueOnce(
      makeD1Error(503),
    );

    const response = await saveEvent(
      makeRequest(
        makeForm({}, makeImage()),
      ),
      null,
    );

    expect(response.status).toBe(503);

    expect(deleteMediaNow).not.toHaveBeenCalled();
  });

  // A secondary R2 cleanup failure must not replace the
  // original event save error returned to the caller.
  it("preserves the original failure if cleanup also fails", async () => {
    vi.mocked(updateEvent).mockResolvedValueOnce(false);

    vi.mocked(deleteMediaNow).mockRejectedValueOnce(
      new Error("Cleanup failed"),
    );

    const response = await saveEvent(
      makeRequest(
        makeForm({}, makeImage()),
      ),
      "event-existing",
    );

    expect(response.status).toBe(404);

    expect(await response.json()).toEqual({
      error: "Event not found.",
    });
  });
});
