import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  removeSettingsAdmin: vi.fn(),
  updateSettingsAdminUsername: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/queries/settings", () => ({
  removeSettingsAdmin: mocks.removeSettingsAdmin,
  updateSettingsAdminUsername: mocks.updateSettingsAdminUsername,
}));

import { DELETE, PATCH } from "./route";

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

const updatedAdmin = {
  id: "disposable-admin-id",
  username: "Updated Admin",
  email: "disposable@example.invalid",
  role: 2,
  canManageAdmins: false,
  canResendInvitation: false,
  canReceiveOwnership: true,
};

function makePatchRequest(
  body: string = JSON.stringify({
    username: "Updated Admin",
  }),
): Request {
  return new Request(
    "http://localhost:3000/api/admin/settings/admins/disposable-admin-id",
    {
      method: "PATCH",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body,
    },
  );
}

function ownerAccess() {
  return {
    ok: true,
    admin: {
      id: "owner-id",
      username: "Test Owner",
      role_id: 1,
    },
  };
}

describe("Admin Settings PATCH username editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminApi.mockResolvedValue(ownerAccess());
    mocks.updateSettingsAdminUsername.mockResolvedValue(updatedAdmin);
  });

  it.each([401, 403] as const)(
    "rejects unauthorized PATCH with HTTP %i before database access",
    async (status) => {
      mocks.requireAdminApi.mockResolvedValue({
        ok: false,
        response: Response.json(
          { error: "Access denied." },
          { status },
        ),
      });

      const response = await PATCH(makePatchRequest(), context);

      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        1,
      );
      expect(response.status).toBe(status);
      expect(mocks.updateSettingsAdminUsername).not.toHaveBeenCalled();
    },
  );

  it.each([
    { id: "disposable-admin-id", role: 2 },
    { id: "owner-id", role: 1 },
  ])(
    "allows Owner to update a role-$role account username",
    async ({ id, role }) => {
      const admin = {
        ...updatedAdmin,
        id,
        role,
        canManageAdmins: role === 1,
      };
      mocks.updateSettingsAdminUsername.mockResolvedValue(admin);

      const response = await PATCH(
        makePatchRequest(
          JSON.stringify({ username: "  Updated Admin  " }),
        ),
        { params: Promise.resolve({ id }) },
      );

      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        1,
      );
      expect(mocks.updateSettingsAdminUsername).toHaveBeenCalledOnce();
      expect(mocks.updateSettingsAdminUsername).toHaveBeenCalledWith(
        id,
        "Updated Admin",
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ admin });
    },
  );

  it("accepts a username with exactly 40 characters", async () => {
    const username = "x".repeat(40);
    mocks.updateSettingsAdminUsername.mockResolvedValue({
      ...updatedAdmin,
      username,
    });

    const response = await PATCH(
      makePatchRequest(JSON.stringify({ username })),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSettingsAdminUsername).toHaveBeenCalledWith(
      "disposable-admin-id",
      username,
    );
  });

  it("rejects an empty account ID", async () => {
    const response = await PATCH(
      makePatchRequest(),
      { params: Promise.resolve({ id: "  " }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid administrator ID.",
    });
    expect(mocks.updateSettingsAdminUsername).not.toHaveBeenCalled();
  });

  it.each([
    { description: "malformed JSON", body: "{" },
    { description: "null JSON", body: "null" },
    { description: "array JSON", body: "[]" },
    { description: "string JSON", body: '"unexpected"' },
  ])("rejects $description with HTTP 400", async ({ body }) => {
    const response = await PATCH(makePatchRequest(body), context);

    expect(response.status).toBe(400);
    expect(mocks.updateSettingsAdminUsername).not.toHaveBeenCalled();
  });

  it.each([
    { description: "no fields", body: {} },
    {
      description: "email-only update",
      body: { email: "new@example.invalid" },
    },
    {
      description: "role elevation",
      body: { username: "Updated Admin", role_id: 1 },
    },
    {
      description: "role field",
      body: { username: "Updated Admin", role: 1 },
    },
    {
      description: "management privilege",
      body: { username: "Updated Admin", canManageAdmins: true },
    },
    {
      description: "legacy management flag",
      body: { username: "Updated Admin", can_invite_users: 1 },
    },
    {
      description: "email modification",
      body: {
        username: "Updated Admin",
        email: "other@example.invalid",
      },
    },
    {
      description: "session modification",
      body: { username: "Updated Admin", session_version: 0 },
    },
  ])("rejects $description", async ({ body }) => {
    const response = await PATCH(
      makePatchRequest(JSON.stringify(body)),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Only the username field may be updated.",
    });
    expect(mocks.updateSettingsAdminUsername).not.toHaveBeenCalled();
  });

  it.each([
    { description: "null username", username: null },
    { description: "numeric username", username: 123 },
    { description: "array username", username: ["Updated Admin"] },
    {
      description: "object username",
      username: { value: "Updated Admin" },
    },
  ])("rejects $description", async ({ username }) => {
    const response = await PATCH(
      makePatchRequest(JSON.stringify({ username })),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Username must be a string.",
    });
    expect(mocks.updateSettingsAdminUsername).not.toHaveBeenCalled();
  });

  it.each(["", "  ", "\n\t"])(
    "rejects a blank username %j",
    async (username) => {
      const response = await PATCH(
        makePatchRequest(JSON.stringify({ username })),
        context,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Username is required.",
      });
      expect(mocks.updateSettingsAdminUsername).not.toHaveBeenCalled();
    },
  );

  it("rejects usernames longer than 40 characters", async () => {
    const response = await PATCH(
      makePatchRequest(
        JSON.stringify({ username: "x".repeat(41) }),
      ),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Username must be 40 characters or fewer.",
    });
    expect(mocks.updateSettingsAdminUsername).not.toHaveBeenCalled();
  });

  it("returns 404 when the account is missing", async () => {
    mocks.updateSettingsAdminUsername.mockRejectedValue(
      new Error("Admin not found or cannot be changed."),
    );

    const response = await PATCH(makePatchRequest(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Admin not found or cannot be changed.",
    });
  });

  it("returns 500 without exposing database details on unexpected failures", async () => {
    mocks.updateSettingsAdminUsername.mockRejectedValue(
      new Error("Sensitive database connection details"),
    );
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await PATCH(makePatchRequest(), context);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "The administrator username could not be updated.",
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
