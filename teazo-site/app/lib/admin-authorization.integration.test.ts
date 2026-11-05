/**
 * Integrated authorization tests for the Teazo administration system.
 *
 * Tests the real admin authorization guard and administrator lookup
 * using synthetic accounts stored in an isolated SQLite database.
 *
 * Covers Owner/Admin permissions, missing or invalid sessions,
 * suspended and deleted accounts, session-version invalidation,
 * administrator membership restrictions, write origins, and
 * database failures.
 *
 * Auth.js is mocked at the session boundary. The administrator
 * lookup and authorization logic are real production functions.
 *
 * No actual accounts, sessions, external services, or production
 * database records are accessed or modified.
 */

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { sqliteD1 } from "@/test/sqlite-d1";

// Mock only the Auth.js session boundary.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

// Run actual administrator lookup SQL against the existing
// in-memory database helper and real schema migrations.
vi.mock("@/app/lib/d1", async () => ({
  ...(await import("@/test/sqlite-d1")).sqliteD1.module,
}));

// Authorization results should be recalculated for each simulated
// request, rather than cached across independent test calls.
vi.mock("react", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("react")>();

  return {
    ...original,
    cache: (callback: (...args: never[]) => unknown) =>
      callback,
  };
});

// The API guard uses unstable_rethrow only for framework
// control-flow errors. Ordinary SQLite failures are handled.
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  redirect: vi.fn(),
}));

import {
  getAdmin,
  requireAdminApi,
} from "./admin";

const SITE_ORIGIN = "http://localhost:3000";

const OWNER = {
  id: "synthetic-owner",
  email: "owner@example.invalid",
  username: "Synthetic Owner",
  role: 1,
  sessionVersion: 3,
};

const ADMIN = {
  id: "synthetic-admin",
  email: "admin@example.invalid",
  username: "Synthetic Admin",
  role: 2,
  sessionVersion: 7,
};

const SUSPENDED = {
  id: "synthetic-suspended",
  email: "suspended@example.invalid",
  username: "Suspended Admin",
  role: 2,
  sessionVersion: 2,
};

const DELETED = {
  id: "synthetic-deleted",
  email: "deleted@example.invalid",
  username: "Deleted Admin",
  role: 2,
  sessionVersion: 4,
};

type SyntheticAccount = typeof OWNER;

// Create an administrator in the actual SQLite schema.
function insertAccount(
  account: SyntheticAccount,
  status = "active",
  deletedAt: string | null = null,
) {
  sqliteD1.db.prepare(
    `INSERT INTO admin_user (
       id,
       email,
       email_normalized,
       username,
       role_id,
       status,
       session_version,
       deleted_at
     )
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).run(
    account.id,
    account.email,
    account.email.toLowerCase(),
    account.username,
    account.role,
    status,
    account.sessionVersion,
    deletedAt,
  );
}

// Supply a synthetic session containing the identity fields
// normally populated by Auth.js.
function signInAs(
  account: SyntheticAccount,
  overrides: Record<string, unknown> = {},
) {
  mocks.auth.mockResolvedValue({
    user: {
      email: account.email,
    },
    adminId: account.id,
    sessionVersion: account.sessionVersion,
    ...overrides,
  });
}

// Create an in-process API request without contacting Next.js.
function makeRequest(
  method = "GET",
  origin?: string,
) {
  return new Request(
    `${SITE_ORIGIN}/api/admin/settings/admins`,
    {
      method,
      headers:
        origin === undefined
          ? {}
          : { origin },
    },
  );
}

// Assert the exact non-cacheable denial response.
async function expectDenied(
  request: Request,
  minRole: 1 | 2,
  status: number,
  message: string,
) {
  const result = await requireAdminApi(
    request,
    minRole,
  );

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error(
      "Expected the administrator request to be denied.",
    );
  }

  expect(result.response.status).toBe(status);

  expect(
    result.response.headers.get("cache-control"),
  ).toBe("no-store");

  expect(await result.response.json()).toEqual({
    error: message,
  });
}

describe("Integrated administrator authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Apply the real migrations to a fresh in-memory database.
    sqliteD1.reset();

    insertAccount(OWNER);
    insertAccount(ADMIN);
    insertAccount(SUSPENDED, "suspended");

    insertAccount(
      DELETED,
      "active",
      "2026-11-01T00:00:00.000Z",
    );

    signInAs(OWNER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    sqliteD1.db.close();
  });

  describe("Owner and Admin permissions", () => {
    it("allows the Owner to access Owner-only operations", async () => {
      const result = await requireAdminApi(
        makeRequest(),
        1,
      );

      expect(result.ok).toBe(true);

      if (!result.ok) return;

      expect(result.admin).toMatchObject({
        id: OWNER.id,
        role_id: 1,
        session_version: OWNER.sessionVersion,
      });
    });

    it("allows the Owner to perform ordinary administrator operations", async () => {
      const result = await requireAdminApi(
        makeRequest(),
        2,
      );

      expect(result.ok).toBe(true);
    });

    it("allows a regular Admin to manage permitted site content", async () => {
      signInAs(ADMIN);

      const result = await requireAdminApi(
        makeRequest("POST", SITE_ORIGIN),
        2,
      );

      expect(result.ok).toBe(true);

      if (!result.ok) return;

      expect(result.admin.role_id).toBe(2);
    });

    it("rejects a regular Admin from Owner-only operations", async () => {
      signInAs(ADMIN);

      await expectDenied(
        makeRequest(),
        1,
        403,
        "You do not have permission to perform this action.",
      );
    });

    it("does not grant Owner access through the legacy invitation flag", async () => {
      // The old can_invite_users flag must never override role_id.
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET can_invite_users = 1
         WHERE id = ?1`,
      ).run(ADMIN.id);

      signInAs(ADMIN);

      await expectDenied(
        makeRequest(),
        1,
        403,
        "You do not have permission to perform this action.",
      );
    });

    it("rejects Owner-only requests after an Owner is demoted", async () => {
      // Remove the old Owner role in the isolated database.
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET role_id = 2,
             session_version = session_version + 1
         WHERE id = ?1`,
      ).run(OWNER.id);

      signInAs(OWNER, {
        sessionVersion: OWNER.sessionVersion + 1,
      });

      await expectDenied(
        makeRequest(),
        1,
        403,
        "You do not have permission to perform this action.",
      );
    });
  });

  describe("Authentication and account eligibility", () => {
    it("rejects requests without an authenticated session", async () => {
      mocks.auth.mockResolvedValue(null);

      await expectDenied(
        makeRequest(),
        2,
        401,
        "Authentication required.",
      );
    });

    it("rejects sessions without an email address", async () => {
      signInAs(OWNER, {
        user: {},
      });

      await expectDenied(
        makeRequest(),
        2,
        401,
        "Authentication required.",
      );
    });

    it("rejects sessions without an administrator ID", async () => {
      signInAs(OWNER, {
        adminId: undefined,
      });

      await expectDenied(
        makeRequest(),
        2,
        401,
        "Authentication required.",
      );
    });

    it("rejects sessions without a numeric version", async () => {
      signInAs(OWNER, {
        sessionVersion: "3",
      });

      await expectDenied(
        makeRequest(),
        2,
        401,
        "Authentication required.",
      );
    });

    it("rejects an unknown administrator account", async () => {
      signInAs(ADMIN, {
        user: {
          email: "unknown@example.invalid",
        },
      });

      await expectDenied(
        makeRequest(),
        2,
        403,
        "You do not have permission to perform this action.",
      );
    });

    it("rejects a suspended administrator account", async () => {
      signInAs(SUSPENDED);

      await expectDenied(
        makeRequest(),
        2,
        403,
        "You do not have permission to perform this action.",
      );
    });

    it("rejects a soft-deleted administrator account", async () => {
      signInAs(DELETED);

      await expectDenied(
        makeRequest(),
        2,
        403,
        "You do not have permission to perform this action.",
      );
    });

    it("rejects a session whose administrator ID belongs to a different account", async () => {
      signInAs(OWNER, {
        adminId: ADMIN.id,
      });

      await expectDenied(
        makeRequest(),
        2,
        401,
        "Authentication required.",
      );
    });

    it("finds administrators by normalized email", async () => {
      signInAs(OWNER, {
        user: {
          email: "  OWNER@EXAMPLE.INVALID  ",
        },
      });

      const result = await requireAdminApi(
        makeRequest(),
        1,
      );

      expect(result.ok).toBe(true);
    });

    it("allows an eligible invited Admin to access permitted operations", async () => {
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET status = 'invited'
         WHERE id = ?1`,
      ).run(ADMIN.id);

      signInAs(ADMIN);

      const result = await requireAdminApi(
        makeRequest(),
        2,
      );

      expect(result.ok).toBe(true);
    });
  });

  describe("Session-version invalidation", () => {
    it("rejects an older session after the database version increases", async () => {
      signInAs(ADMIN);

      // Simulate the session_version increment produced by
      // a password reset or ownership transfer.
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET session_version = session_version + 1
         WHERE id = ?1`,
      ).run(ADMIN.id);

      await expectDenied(
        makeRequest(),
        2,
        401,
        "Authentication required.",
      );
    });

    it("allows a newly authenticated session using the current version", async () => {
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET session_version = session_version + 1
         WHERE id = ?1`,
      ).run(ADMIN.id);

      signInAs(ADMIN, {
        sessionVersion: ADMIN.sessionVersion + 1,
      });

      const result = await requireAdminApi(
        makeRequest(),
        2,
      );

      expect(result.ok).toBe(true);
    });

    it("rejects a session claiming a version newer than the database", async () => {
      signInAs(ADMIN, {
        sessionVersion: 999,
      });

      await expectDenied(
        makeRequest(),
        2,
        401,
        "Authentication required.",
      );
    });

    it("rejects a session after the administrator ID is changed in the database", async () => {
      signInAs(ADMIN);

      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET id = ?1
         WHERE id = ?2`,
      ).run(
        "replacement-admin-id",
        ADMIN.id,
      );

      await expectDenied(
        makeRequest(),
        2,
        401,
        "Authentication required.",
      );
    });
  });

  describe("Authenticated write-origin protection", () => {
    it("accepts same-origin administrator writes", async () => {
      const result = await requireAdminApi(
        makeRequest("POST", SITE_ORIGIN),
        1,
      );

      expect(result.ok).toBe(true);
    });

    it.each([
      "https://attacker.example.invalid",
      "http://localhost:4000",
      "https://localhost:3000",
    ])(
      "rejects writes from an untrusted origin: %s",
      async (origin) => {
        await expectDenied(
          makeRequest("POST", origin),
          2,
          403,
          "Request origin is not allowed.",
        );
      },
    );

    it("rejects authenticated writes without an Origin header", async () => {
      await expectDenied(
        makeRequest("POST"),
        2,
        403,
        "Request origin is not allowed.",
      );
    });

    it("allows safe GET requests without an Origin header", async () => {
      const result = await requireAdminApi(
        makeRequest("GET"),
        2,
      );

      expect(result.ok).toBe(true);
    });

    it("does not let a valid origin bypass Owner-only permissions", async () => {
      signInAs(ADMIN);

      await expectDenied(
        makeRequest("POST", SITE_ORIGIN),
        1,
        403,
        "You do not have permission to perform this action.",
      );
    });
  });

  describe("Authorization database failures", () => {
    it("returns a safe HTTP 503 response when the administrator database is unavailable", async () => {
      // Drop the administrator table only in the disposable DB.
      sqliteD1.db.exec("DROP TABLE admin_user");

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectDenied(
        makeRequest(),
        2,
        503,
        "Authorization is temporarily unavailable.",
      );

      expect(errorSpy).toHaveBeenCalledWith(
        "Admin API authorization lookup failed.",
      );
    });

    it("does not treat a database failure as authorization success", async () => {
      sqliteD1.db.exec("DROP TABLE admin_user");

      vi.spyOn(console, "error").mockImplementation(
        () => undefined,
      );

      const result = await requireAdminApi(
        makeRequest("POST", SITE_ORIGIN),
        1,
      );

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.response.status).toBe(503);
      }
    });
  });

  describe("Shared administrator lookup", () => {
    it("returns the authorized Owner for a valid current session", async () => {
      const admin = await getAdmin(1);

      expect(admin).toMatchObject({
        id: OWNER.id,
        username: OWNER.username,
        role_id: 1,
      });
    });

    it("returns null when a regular Admin requests Owner access", async () => {
      signInAs(ADMIN);

      expect(await getAdmin(1)).toBeNull();
    });

    it("returns null after a previously valid session becomes stale", async () => {
      signInAs(ADMIN);

      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET session_version = session_version + 1
         WHERE id = ?1`,
      ).run(ADMIN.id);

      expect(await getAdmin(2)).toBeNull();
    });
  });
});
