
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  removeSettingsAdmin: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/queries/settings", () => ({
  removeSettingsAdmin: mocks.removeSettingsAdmin,
}));

import { DELETE } from "./route";

const context = {
  params: Promise.resolve({ id: "disposable-admin-id" }),
};

function makeRequest(): Request {
  return new Request(
    "http://localhost:3000/api/admin/settings/admins/disposable-admin-id",
    {
      method: "DELETE",
      headers: {
        origin: "http://localhost:3000",
      },
    },
  );
}

describe("Admin Settings DELETE authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.removeSettingsAdmin.mockResolvedValue(undefined);
  });

  it.each([401, 403] as const)(
    "rejects unauthorized deletion with %i",
    async (status) => {
      mocks.requireAdminApi.mockResolvedValue({
        ok: false,
        response: Response.json(
          { error: "Access denied." },
          { status },
        ),
      });

      const response = await DELETE(
        makeRequest(),
        context,
      );

      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        1,
      );

      expect(response.status).toBe(status);
      expect(mocks.removeSettingsAdmin).not.toHaveBeenCalled();
    },
  );

  it("allows Owner to delete an Admin", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: {
        id: "owner-id",
        username: "Test Owner",
        role_id: 1,
      },
    });

    const response = await DELETE(
      makeRequest(),
      context,
    );

    expect(mocks.requireAdminApi).toHaveBeenCalledWith(
      expect.any(Request),
      1,
    );

    expect(mocks.removeSettingsAdmin).toHaveBeenCalledWith(
      "disposable-admin-id",
    );

    expect(response.status).toBe(204);
  });

  it("rejects an empty administrator ID", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: {
        id: "owner-id",
        username: "Test Owner",
        role_id: 1,
      },
    });

    const response = await DELETE(
      makeRequest(),
      {
        params: Promise.resolve({ id: " " }),
      },
    );

    expect(response.status).toBe(400);
    expect(mocks.removeSettingsAdmin).not.toHaveBeenCalled();
  });

  it("returns 400 when the deletion query fails", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: {
        id: "owner-id",
        username: "Test Owner",
        role_id: 1,
      },
    });

    mocks.removeSettingsAdmin.mockRejectedValue(
      new Error("Database unavailable"),
    );

    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await DELETE(
        makeRequest(),
        context,
      );

      expect(response.status).toBe(400);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
