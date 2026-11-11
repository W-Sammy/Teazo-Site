/**
 * Tests the individual Admin Event API.
 *
 * Endpoint: /api/admin/events/[id]
 *
 * Coverage includes:
 * - PATCH event updates.
 * - DELETE individual event soft deletion.
 * - Dynamic route parameter handling.
 * - Authentication and authorization.
 * - Missing-event and database error responses.
 * - No-cache error response headers.
 *
 * Authorization, saveEvent(), and softDeleteEvent() are mocked.
 * These tests do not alter actual event records.
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
import { softDeleteEvent } from "@/app/lib/queries/events";
import { saveEvent } from "@/app/lib/event-api";
import { DELETE, PATCH } from "./route";

// Mock the dependencies used by the route handlers.
vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/app/lib/queries/events", () => ({
  softDeleteEvent: vi.fn(),
}));

vi.mock("@/app/lib/event-api", () => ({
  saveEvent: vi.fn(),
}));

// Create a request without running a Next.js server.
function request(method: string): Request {
  return new Request(
    "http://localhost:3000/api/admin/events/event-1",
    {
      method,
    },
  );
}

// Next.js App Router provides dynamic route parameters
// through an asynchronous params object.
function context(id = "event-1") {
  return {
    params: Promise.resolve({ id }),
  };
}

describe("/api/admin/events/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Suppress logs from deliberately simulated failures.
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Default to an authorized Admin and successful operations.
    vi.mocked(requireAdminApi).mockResolvedValue({
      ok: true,
      admin: {
        id: "admin-1",
        role_id: 2,
      },
    } as never);

    vi.mocked(saveEvent).mockResolvedValue(
      Response.json({
        id: "event-1",
      }),
    );

    vi.mocked(softDeleteEvent).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // PATCH — Editing individual events
  // ============================================================

  // The route delegates update validation and persistence
  // to the shared saveEvent() helper.
  it("passes event updates to saveEvent", async () => {
    const req = request("PATCH");

    const response = await PATCH(
      req,
      context(),
    );

    expect(saveEvent).toHaveBeenCalledWith(
      req,
      "event-1",
    );

    expect(response.status).toBe(200);
  });

  it("uses the event ID from route parameters", async () => {
    await PATCH(
      request("PATCH"),
      context("another-event"),
    );

    expect(saveEvent).toHaveBeenCalledWith(
      expect.any(Request),
      "another-event",
    );
  });

  // If the shared save helper rejects an update, the route
  // should preserve the original error response.
  it("preserves unsuccessful update responses", async () => {
    vi.mocked(saveEvent).mockResolvedValueOnce(
      Response.json(
        { error: "Event not found." },
        { status: 404 },
      ),
    );

    const response = await PATCH(
      request("PATCH"),
      context("missing-event"),
    );

    expect(response.status).toBe(404);

    expect(await response.json()).toEqual({
      error: "Event not found.",
    });
  });

  // ============================================================
  // DELETE — Authorization and permissions
  // ============================================================

  it("requires authorization before deletion", async () => {
    const req = request("DELETE");

    await DELETE(req, context());

    expect(requireAdminApi).toHaveBeenCalledWith(
      req,
      2,
    );
  });

  it("rejects unauthorized deletion requests", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    });

    const response = await DELETE(
      request("DELETE"),
      context(),
    );

    expect(response.status).toBe(401);

    expect(softDeleteEvent).not.toHaveBeenCalled();
  });

  it("rejects deletion without sufficient permissions", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: "Access denied." },
        { status: 403 },
      ),
    });

    const response = await DELETE(
      request("DELETE"),
      context(),
    );

    expect(response.status).toBe(403);

    expect(softDeleteEvent).not.toHaveBeenCalled();
  });

  // ============================================================
  // DELETE — Successful deletion and missing events
  // ============================================================

  // Deleting an event uses a soft-delete operation rather
  // than physically removing the database row.
  it("soft-deletes an existing event", async () => {
    const response = await DELETE(
      request("DELETE"),
      context(),
    );

    expect(response.status).toBe(204);

    expect(softDeleteEvent).toHaveBeenCalledWith(
      "event-1",
    );
  });

  it("uses the correct ID when deleting", async () => {
    await DELETE(
      request("DELETE"),
      context("event-456"),
    );

    expect(softDeleteEvent).toHaveBeenCalledWith(
      "event-456",
    );
  });

  // Already-deleted or nonexistent events should produce
  // 404 rather than reporting a successful deletion.
  it("returns 404 when deleting a nonexistent event", async () => {
    vi.mocked(softDeleteEvent).mockResolvedValueOnce(false);

    const response = await DELETE(
      request("DELETE"),
      context("missing-event"),
    );

    expect(response.status).toBe(404);

    expect(await response.json()).toEqual({
      error: "Event not found.",
    });
  });

  // ============================================================
  // DELETE — Failure handling and response headers
  // ============================================================

  it("returns 503 when event deletion fails", async () => {
    vi.mocked(softDeleteEvent).mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    const response = await DELETE(
      request("DELETE"),
      context(),
    );

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: "The event could not be deleted.",
    });
  });

  // Error responses must not be cached, allowing clients
  // to retry after a failed deletion.
  it("sets no-store on deletion error responses", async () => {
    vi.mocked(softDeleteEvent).mockResolvedValueOnce(false);

    const response = await DELETE(
      request("DELETE"),
      context(),
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });

  // Explicitly verify that the delete query is never reached
  // when the authorization guard rejects the request.
  it("does not call the delete query when authorization fails", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    });

    await DELETE(
      request("DELETE"),
      context(),
    );

    expect(softDeleteEvent).not.toHaveBeenCalled();
  });
});
