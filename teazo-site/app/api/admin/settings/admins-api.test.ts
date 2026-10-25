/**
 * Tests the Admin Settings frontend API helper for resending invitations.
 *
 * Global fetch is stubbed to verify the exact backend URL, safe encoding of
 * admin IDs, successful responses, and API error propagation.
 *
 * No network request is made.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { resendAdminInvitation } from "./admins-api";

// Replace fetch at the browser boundary; no server is contacted.
const fakeFetch = vi.fn();

describe("Admin Settings API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fakeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Invitation submitted for delivery.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fakeFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The resend route is directly under /api/admin/[id], not settings.
  it("uses the correct backend resend endpoint", async () => {
    await resendAdminInvitation("admin-123");

    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/admin/admin-123/resend-invitation",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("does not include the obsolete settings/admins route", async () => {
    await resendAdminInvitation("admin-123");

    const requestUrl = fakeFetch.mock.calls[0][0];

    expect(requestUrl).not.toContain(
      "/api/admin/settings/admins/",
    );

    expect(requestUrl).not.toContain(
      "/api/admin/admins/",
    );
  });

  // Escape path-sensitive characters in dynamic admin identifiers.
  it("URL-encodes administrator IDs", async () => {
    await resendAdminInvitation("admin/test");

    expect(fakeFetch.mock.calls[0][0]).toBe(
      "/api/admin/admin%2Ftest/resend-invitation",
    );
  });

  it("returns the backend success message", async () => {
    const result = await resendAdminInvitation("admin-123");

    expect(result).toEqual({
      message: "Invitation submitted for delivery.",
    });
  });

  // Let the UI handle permission or delivery errors from the backend.
  it("propagates API failures", async () => {
    fakeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "You do not have permission to resend invitations.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      resendAdminInvitation("admin-123"),
    ).rejects.toThrow();
  });
});
