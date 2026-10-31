/**
 * Tests the Admin Events collection API.
 *
 * Endpoint: /api/admin/events
 *
 * Coverage includes:
 * - GET event listings.
 * - POST event creation delegation.
 * - DELETE cleanup of ended events.
 * - Authentication and authorization.
 * - Database and unexpected failure responses.
 * - No-cache response headers.
 *
 * Authorization, event queries, and saveEvent() are mocked.
 * No actual HTTP server or database connection is required.
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
  listEvents,
  softDeleteEndedEvents,
} from "@/app/lib/queries/events";
import { saveEvent } from "@/app/lib/event-api";
import { DELETE, GET, POST } from "./route";

// Isolate the route handlers from authorization,
// database operations, and event creation logic.
vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {
    status: number;

    constructor(status: number) {
      super("Database unavailable");
      this.status = status;
    }
  },
}));

vi.mock("@/app/lib/queries/events", () => ({
  listEvents: vi.fn(),
  softDeleteEndedEvents: vi.fn(),
}));

vi.mock("@/app/lib/event-api", () => ({
  saveEvent: vi.fn(),
}));

// Construct requests for the collection endpoint.
function request(
  method: string,
  body?: unknown,
): Request {
  return new Request(
    "http://localhost:3000/api/admin/events",
    {
      method,
      ...(body !== undefined
        ? {
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        : {}),
    },
  );
}

// Simulate an authorization failure for the next request.
function unauthorized(status = 401) {
  vi.mocked(requireAdminApi).mockResolvedValueOnce({
    ok: false,
    response: Response.json(
      { error: "Access denied." },
      { status },
    ),
  });
}

// Model D1 failures with an explicit status so the route's
// database-specific error handling can be verified.
function databaseError(status: number): Error {
  const error = new Error("D1 unavailable");
  Object.setPrototypeOf(error, D1Error.prototype);
  return Object.assign(error, { status });
}

describe("/api/admin/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Expected errors are intentionally triggered by tests.
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Default behavior is an authorized Admin with successful
    // event operations.
    vi.mocked(requireAdminApi).mockResolvedValue({
      ok: true,
      admin: {
        id: "admin-1",
        role_id: 2,
      },
    } as never);

    vi.mocked(listEvents).mockResolvedValue([]);

    vi.mocked(softDeleteEndedEvents).mockResolvedValue(
      undefined,
    );

    vi.mocked(saveEvent).mockResolvedValue(
      Response.json(
        { id: "event-new" },
        { status: 201 },
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // GET — Event listings
  // ============================================================

  it("returns the event list", async () => {
    vi.mocked(listEvents).mockResolvedValueOnce([
      {
        id: "event-1",
        name: "Fall Promotion",
        description: "Seasonal promotion",
        imageUrl: "/example.png",
        startAt: "2026-11-01T12:00:00Z",
        endAt: "2026-11-02T12:00:00Z",
        appliesToAll: true,
        categoryIds: [],
        itemIds: [],
      },
    ]);

    const response = await GET(request("GET"));

    expect(response.status).toBe(200);

    const events = await response.json();

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Fall Promotion");
  });

  it("returns an empty array when there are no events", async () => {
    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  // The event listing requires a valid Admin session,
  // but allows the route's view-level permission threshold.
  it("requires Admin authorization before listing events", async () => {
    const req = request("GET");

    await GET(req);

    expect(requireAdminApi).toHaveBeenCalledWith(
      req,
      3,
    );
  });

  it("rejects unauthorized event-list requests", async () => {
    unauthorized();

    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
    expect(listEvents).not.toHaveBeenCalled();
  });

  // Database failures use 503; unexpected application
  // failures use 500.
  it("returns 503 when D1 cannot list events", async () => {
    vi.mocked(listEvents).mockRejectedValueOnce(
      databaseError(503),
    );

    const response = await GET(request("GET"));

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: "The events could not be loaded.",
    });
  });

  it("returns 500 for unexpected event-list failures", async () => {
    vi.mocked(listEvents).mockRejectedValueOnce(
      new Error("Unexpected failure"),
    );

    const response = await GET(request("GET"));

    expect(response.status).toBe(500);
  });

  // Event data should not be cached because administrators
  // need to see newly created or updated events.
  it("sets no-store on event listings", async () => {
    const response = await GET(request("GET"));

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });

  // ============================================================
  // POST — Event creation
  // ============================================================

  // Creation uses the shared saveEvent() implementation.
  // Validation and media uploads are tested separately
  // in event-api.test.ts.
  it("delegates event creation to saveEvent", async () => {
    const req = request("POST");

    const response = await POST(req);

    expect(saveEvent).toHaveBeenCalledWith(
      req,
      null,
    );

    expect(response.status).toBe(201);

    expect(await response.json()).toEqual({
      id: "event-new",
    });
  });

  // ============================================================
  // DELETE — Ended-event cleanup and permissions
  // ============================================================

  // Bulk deletion requires edit-level Admin permissions.
  it("requires edit permission for deleting ended events", async () => {
    const req = request("DELETE", {
      endedOnly: true,
    });

    await DELETE(req);

    expect(requireAdminApi).toHaveBeenCalledWith(
      req,
      2,
    );
  });

  it("rejects unauthorized ended-event cleanup", async () => {
    unauthorized(403);

    const response = await DELETE(
      request("DELETE", {
        endedOnly: true,
      }),
    );

    expect(response.status).toBe(403);

    expect(softDeleteEndedEvents).not.toHaveBeenCalled();
  });

  // This endpoint supports ended-event cleanup only.
  // Requests attempting other deletion operations must
  // not invoke the database cleanup function.
  it("rejects deletion without endedOnly=true", async () => {
    const response = await DELETE(
      request("DELETE", {
        endedOnly: false,
      }),
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "Only ended-event cleanup is supported here.",
    });

    expect(softDeleteEndedEvents).not.toHaveBeenCalled();
  });

  it("rejects deletion when endedOnly is missing", async () => {
    const response = await DELETE(
      request("DELETE", {}),
    );

    expect(response.status).toBe(400);
    expect(softDeleteEndedEvents).not.toHaveBeenCalled();
  });

  // Malformed JSON must not accidentally trigger deletion.
  it("rejects malformed deletion requests", async () => {
    const response = await DELETE(
      new Request(
        "http://localhost:3000/api/admin/events",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{invalid",
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(softDeleteEndedEvents).not.toHaveBeenCalled();
  });

  it("successfully deletes ended events", async () => {
    const response = await DELETE(
      request("DELETE", {
        endedOnly: true,
      }),
    );

    expect(response.status).toBe(204);

    expect(softDeleteEndedEvents).toHaveBeenCalledOnce();
  });

  it("returns 503 when ended-event cleanup fails", async () => {
    vi.mocked(softDeleteEndedEvents).mockRejectedValueOnce(
      new Error("Database failure"),
    );

    const response = await DELETE(
      request("DELETE", {
        endedOnly: true,
      }),
    );

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: "The ended events could not be deleted.",
    });
  });

  it("sets no-store on error responses", async () => {
    const response = await DELETE(
      request("DELETE", {
        endedOnly: false,
      }),
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });
});
