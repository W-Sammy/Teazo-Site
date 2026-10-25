import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { findAuthorizedAdmin } from "./admin-whitelist";
import {
  getAdmin,
  requireAdminApi,
  requireAdminPage,
} from "./admin";

vi.mock("server-only", () => ({}));

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();

  return {
    ...original,
    // Disable render-level memoization for isolated unit tests.
    cache: (fn: unknown) => fn,
  };
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("./admin-whitelist", () => ({
  findAuthorizedAdmin: vi.fn(),
}));

const databaseAdmin = {
  id: "admin-id",
  username: "test admin",
  email_normalized: "admin@example.com",
  role_id: 2,
  can_invite_users: 0,
  session_version: 4,
};

function session(
  version: number,
  adminId = "admin-id",
) {
  return {
    user: {
      email: "admin@example.com",
    },
    adminId,
    sessionVersion: version,
  };
}

function apiRequest(
  method = "GET",
  origin = "http://localhost:3000",
) {
  return new Request(
    "http://localhost:3000/api/admin/settings/admins",
    {
      method,
      headers: { Origin: origin },
    },
  );
}

describe("Admin session authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(auth).mockResolvedValue(
      session(4) as never,
    );

    vi.mocked(findAuthorizedAdmin).mockResolvedValue(
      databaseAdmin as never,
    );
  });

  it("allows a session matching the database version", async () => {
    const admin = await getAdmin(3);

    expect(admin).toEqual(databaseAdmin);
  });

  it("rejects a session with an outdated version", async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      session(3) as never,
    );

    const admin = await getAdmin(3);

    expect(admin).toBeNull();
  });

  it("rejects a session with a different administrator ID", async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      session(4, "other-admin-id") as never,
    );

    expect(await getAdmin(3)).toBeNull();
  });

  it("rejects sessions missing sessionVersion", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { email: "admin@example.com" },
      adminId: "admin-id",
    } as never);

    expect(await getAdmin(3)).toBeNull();
  });

  it("rejects sessions missing adminId", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { email: "admin@example.com" },
      sessionVersion: 4,
    } as never);

    expect(await getAdmin(3)).toBeNull();
  });

  it("rejects unauthenticated users", async () => {
    // Auth.js has overloaded signatures; the test intentionally
    // supplies a null session through the Vitest mock.
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const result = await requireAdminApi(apiRequest());

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects deleted or otherwise unauthorized accounts", async () => {
    vi.mocked(findAuthorizedAdmin).mockResolvedValueOnce(null);

    const result = await requireAdminApi(apiRequest());

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("rejects stale JWT sessions on protected API routes", async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      session(2) as never,
    );

    const result = await requireAdminApi(apiRequest());

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("redirects stale sessions away from protected pages", async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      session(2) as never,
    );

    await expect(
      requireAdminPage(3),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("rejects insufficient Admin roles", async () => {
    vi.mocked(findAuthorizedAdmin).mockResolvedValueOnce({
      ...databaseAdmin,
      role_id: 3,
    } as never);

    const result = await requireAdminApi(
      apiRequest(),
      2,
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("rejects cross-origin authenticated writes", async () => {
    const result = await requireAdminApi(
      apiRequest("POST", "https://other.example"),
      2,
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("allows authorized same-origin writes", async () => {
    const result = await requireAdminApi(
      apiRequest("POST"),
      2,
    );

    expect(result.ok).toBe(true);
  });

  it("returns 503 if the authorization database is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(findAuthorizedAdmin).mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    const result = await requireAdminApi(apiRequest());

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(503);
    }
  });
});
