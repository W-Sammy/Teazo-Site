
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  listSettingsAdmins: vi.fn(),
  createSettingsAdmin: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/queries/settings", () => ({
  listSettingsAdmins: mocks.listSettingsAdmins,
  createSettingsAdmin: mocks.createSettingsAdmin,
}));

import { GET, POST } from "./route";

const owner = {
  id: "owner-id",
  username: "Test Owner",
  role_id: 1,
};

const admin = {
  id: "admin-id",
  username: "Test Admin",
  role_id: 2,
};

const administratorList = [
  {
    id: "owner-id",
    username: "Test Owner",
    email: "owner@example.invalid",
    role: 1,
  },
  {
    id: "admin-id",
    username: "Test Admin",
    email: "admin@example.invalid",
    role: 2,
  },
];

function makeGetRequest(): Request {
  return new Request(
    "http://localhost:3000/api/admin/settings/admins",
    { method: "GET" },
  );
}

function makePostRequest(body: unknown): Request {
  return new Request(
    "http://localhost:3000/api/admin/settings/admins",
    {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

function deny(status: 401 | 403) {
  mocks.requireAdminApi.mockResolvedValue({
    ok: false,
    response: Response.json(
      { error: "Access denied." },
      { status },
    ),
  });
}

describe("Admin Settings GET authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSettingsAdmins.mockResolvedValue(
      administratorList,
    );
  });

  it.each([
    { role: 1, viewer: owner, canEdit: true },
    { role: 2, viewer: admin, canEdit: false },
  ])(
    "allows role $role to view administrators",
    async ({ viewer, canEdit }) => {
      mocks.requireAdminApi.mockResolvedValue({
        ok: true,
        admin: viewer,
      });

      const response = await GET(makeGetRequest());

      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        2,
      );

      expect(response.status).toBe(200);
      expect(mocks.listSettingsAdmins).toHaveBeenCalledOnce();

      expect(await response.json()).toEqual({
        admins: administratorList,
        canEdit,
      });
    },
  );

  it.each([401, 403] as const)(
    "rejects unauthorized GET requests with %i",
    async (status) => {
      deny(status);

      const response = await GET(makeGetRequest());

      expect(response.status).toBe(status);
      expect(mocks.listSettingsAdmins).not.toHaveBeenCalled();
    },
  );

  it("returns 503 when listing administrators fails", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: owner,
    });

    mocks.listSettingsAdmins.mockRejectedValue(
      new Error("Database unavailable"),
    );

    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await GET(makeGetRequest());

      expect(response.status).toBe(503);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe("Admin Settings POST authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createSettingsAdmin.mockResolvedValue({
      id: "new-admin-id",
      username: "Disposable Admin",
      email: "disposable@example.invalid",
      role: 2,
    });
  });

  it.each([401, 403] as const)(
    "rejects unauthorized creation with %i",
    async (status) => {
      deny(status);

      const response = await POST(
        makePostRequest({
          username: "Disposable Admin",
          email: "disposable@example.invalid",
        }),
      );

      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        1,
      );

      expect(response.status).toBe(status);
      expect(mocks.createSettingsAdmin).not.toHaveBeenCalled();
    },
  );

  it("allows Owner to create an Admin", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: owner,
    });

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
      }),
    );

    expect(response.status).toBe(201);

    expect(mocks.createSettingsAdmin).toHaveBeenCalledWith({
      username: "Disposable Admin",
      email: "disposable@example.invalid",
    });

    expect(await response.json()).toEqual({
      admin: {
        id: "new-admin-id",
        username: "Disposable Admin",
        email: "disposable@example.invalid",
        role: 2,
      },
    });
  });

  it("ignores client-supplied elevated privileges", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: owner,
    });

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
        role: 1,
        canManageAdmins: true,
      }),
    );

    expect(response.status).toBe(201);

    expect(mocks.createSettingsAdmin).toHaveBeenCalledWith({
      username: "Disposable Admin",
      email: "disposable@example.invalid",
    });

    expect(mocks.createSettingsAdmin).toHaveBeenCalledOnce();
  });

  it.each([
    {},
    { username: "", email: "test@example.invalid" },
    { username: "Test", email: "" },
    { username: 123, email: "test@example.invalid" },
    { username: "Test", email: 123 },
    null,
    [],
  ])("rejects invalid creation input: %j", async (body) => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: owner,
    });

    const response = await POST(makePostRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.createSettingsAdmin).not.toHaveBeenCalled();
  });
});
