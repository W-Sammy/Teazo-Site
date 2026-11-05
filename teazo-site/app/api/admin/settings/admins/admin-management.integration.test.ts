/**
 * Integrated administrator-management authorization tests.
 *
 * Exercises the real administrator-management GET, POST, PATCH, and
 * DELETE routes, authorization guard, Settings queries, and actual
 * SQLite migrations.
 *
 * Covers Owner-only membership management, Admin denials,
 * account persistence, protected roles, stale sessions, write-origin
 * enforcement, soft deletion, and invitation failure handling.
 *
 * Auth.js sessions and invitation delivery are mocked.
 * All database operations use isolated, in-memory SQLite.
 *
 * No real administrators are created or modified, and no emails
 * or external network requests are sent.
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

// Mock only identity and outbound invitation delivery.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sendAdminInvite: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

// Run actual Settings and authorization SQL using the real migrations.
vi.mock("@/app/lib/d1", async () => ({
  ...(await import("@/test/sqlite-d1")).sqliteD1.module,
}));

// Avoid retaining one request's authorization result across
// independent simulated requests.
vi.mock("react", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("react")>();

  return {
    ...original,
    cache: (callback: (...args: never[]) => unknown) =>
      callback,
  };
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));

// Never issue actual password-setup invitations.
vi.mock("@/app/lib/admin-invite", () => ({
  sendAdminInvite: mocks.sendAdminInvite,
}));

// Import the real production API handlers.
import {
  GET as listAdmins,
  POST as createAdmin,
} from "./route";

import {
  PATCH as updateAdmin,
  DELETE as deleteAdmin,
} from "./[id]/route";

import { requireAdminApi } from "@/app/lib/admin";

const SITE_ORIGIN = "http://localhost:3000";
const ADMINS_URL =
  `${SITE_ORIGIN}/api/admin/settings/admins`;

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

const DELETED_ADMIN = {
  id: "synthetic-deleted",
  email: "deleted@example.invalid",
  username: "Deleted Admin",
  role: 2,
  sessionVersion: 2,
};

type SyntheticAccount = typeof OWNER;

type AccountRow = {
  id: string;
  username: string;
  email_normalized: string;
  role_id: number;
  can_invite_users: number;
  status: string;
  password_hash: string | null;
  session_version: number;
  deleted_at: string | null;
};

// Insert synthetic administrators into the actual database.
function insertAccount(
  account: SyntheticAccount,
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
       password_hash,
       session_version,
       deleted_at
     )
     VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7, ?8)`,
  ).run(
    account.id,
    account.email,
    account.email.toLowerCase(),
    account.username,
    account.role,
    "synthetic-password-hash",
    account.sessionVersion,
    deletedAt,
  );
}

// Read persisted account state without using mocked query results.
function getAccount(id: string): AccountRow | undefined {
  return sqliteD1.db.prepare(
    `SELECT
       id,
       username,
       email_normalized,
       role_id,
       can_invite_users,
       status,
       password_hash,
       session_version,
       deleted_at
     FROM admin_user
     WHERE id = ?1`,
  ).get(id) as AccountRow | undefined;
}

function findAccountByEmail(
  email: string,
): AccountRow | undefined {
  return sqliteD1.db.prepare(
    `SELECT
       id,
       username,
       email_normalized,
       role_id,
       can_invite_users,
       status,
       password_hash,
       session_version,
       deleted_at
     FROM admin_user
     WHERE email_normalized = ?1
       AND deleted_at IS NULL`,
  ).get(email.toLowerCase()) as AccountRow | undefined;
}

// Count actual active database membership records.
function activeAccountCount(): number {
  const row = sqliteD1.db.prepare(
    `SELECT COUNT(*) AS count
     FROM admin_user
     WHERE deleted_at IS NULL`,
  ).get() as { count: number };

  return row.count;
}

// Supply Auth.js identity and session-version information.
function signInAs(
  account: SyntheticAccount,
  version = account.sessionVersion,
) {
  mocks.auth.mockResolvedValue({
    user: {
      email: account.email,
    },
    adminId: account.id,
    sessionVersion: version,
  });
}

// Create an in-process request for the administrator endpoints.
function makeRequest(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  options: {
    id?: string;
    origin?: string | null;
    body?: unknown;
  } = {},
): Request {
  const url =
    options.id === undefined
      ? ADMINS_URL
      : `${ADMINS_URL}/${options.id}`;

  const headers = new Headers();

  if (options.origin !== null) {
    headers.set(
      "origin",
      options.origin ?? SITE_ORIGIN,
    );
  }

  if (
    method === "POST" ||
    method === "PATCH"
  ) {
    headers.set(
      "content-type",
      "application/json",
    );
  }

  return new Request(url, {
    method,
    headers,
    ...(
      method === "POST" || method === "PATCH"
        ? { body: JSON.stringify(options.body ?? {}) }
        : {}
    ),
  });
}

// The dynamic administrator endpoint expects an asynchronous params object.
function contextFor(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}

// Check a safe JSON denial response.
async function expectDenied(
  response: Response,
  status: number,
  message: string,
) {
  expect(response.status).toBe(status);

  expect(
    response.headers.get("cache-control"),
  ).toBe("no-store");

  expect(await response.json()).toEqual({
    error: message,
  });
}

describe("Administrator management SQLite integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Recreate a disposable database from the production migrations.
    sqliteD1.reset();

    insertAccount(OWNER);
    insertAccount(ADMIN);

    insertAccount(
      DELETED_ADMIN,
      "2026-11-01T00:00:00.000Z",
    );

    signInAs(OWNER);

    // The invitation sender is mocked and never contacts Brevo.
    mocks.sendAdminInvite.mockResolvedValue("captured");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    sqliteD1.db.close();
  });

  describe("Administrator listing", () => {
    it("allows the Owner to retrieve real administrator records", async () => {
      const response = await listAdmins(
        makeRequest("GET"),
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.canEdit).toBe(true);
      expect(body.admins).toHaveLength(2);

      expect(body.admins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: OWNER.id,
            role: 1,
            canManageAdmins: true,
          }),
          expect.objectContaining({
            id: ADMIN.id,
            role: 2,
            canManageAdmins: false,
          }),
        ]),
      );

      expect(
        body.admins.some(
          (admin: { id: string }) =>
            admin.id === DELETED_ADMIN.id,
        ),
      ).toBe(false);
    });

    it("rejects a regular Admin from listing administrator membership", async () => {
      signInAs(ADMIN);

      await expectDenied(
        await listAdmins(makeRequest("GET")),
        403,
        "You do not have permission to perform this action.",
      );
    });

    it("rejects unauthenticated administrator listing", async () => {
      mocks.auth.mockResolvedValue(null);

      await expectDenied(
        await listAdmins(makeRequest("GET")),
        401,
        "Authentication required.",
      );
    });

    it("rejects an outdated Owner session from listing administrators", async () => {
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET session_version = session_version + 1
         WHERE id = ?1`,
      ).run(OWNER.id);

      await expectDenied(
        await listAdmins(makeRequest("GET")),
        401,
        "Authentication required.",
      );
    });

    it("does not grant Admin access through the retired invitation flag", async () => {
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET can_invite_users = 1
         WHERE id = ?1`,
      ).run(ADMIN.id);

      signInAs(ADMIN);

      const response = await listAdmins(
        makeRequest("GET"),
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Creating administrator accounts", () => {
    const newEmail = "new-admin@example.invalid";

    it("allows the Owner to create a role-2 Admin in SQLite", async () => {
      const response = await createAdmin(
        makeRequest("POST", {
          body: {
            username: "New Synthetic Admin",
            email: newEmail,
          },
        }),
      );

      expect(response.status).toBe(201);

      const body = await response.json();

      expect(body.admin).toMatchObject({
        username: "New Synthetic Admin",
        email: newEmail,
        role: 2,
        canManageAdmins: false,
      });

      const saved = findAccountByEmail(newEmail);

      expect(saved).toMatchObject({
        role_id: 2,
        can_invite_users: 0,
        status: "invited",
        password_hash: null,
        session_version: 0,
      });

      expect(activeAccountCount()).toBe(3);

      expect(
        mocks.sendAdminInvite,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.sendAdminInvite,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: saved?.id,
          email: newEmail,
          username: "New Synthetic Admin",
          role: 2,
          invitedBy: OWNER.username,
        }),
      );
    });

    it("ignores client-supplied Owner roles and legacy management flags", async () => {
      const response = await createAdmin(
        makeRequest("POST", {
          body: {
            username: "Privilege Injection Attempt",
            email: newEmail,
            role: 1,
            role_id: 1,
            canManageAdmins: true,
            can_invite_users: 1,
          },
        }),
      );

      expect(response.status).toBe(201);

      expect(
        findAccountByEmail(newEmail),
      ).toMatchObject({
        role_id: 2,
        can_invite_users: 0,
      });

      // The original Owner remains the only Owner.
      expect(getAccount(OWNER.id)?.role_id).toBe(1);
    });

    it("prevents a regular Admin from creating another administrator", async () => {
      signInAs(ADMIN);

      const response = await createAdmin(
        makeRequest("POST", {
          body: {
            username: "Unauthorized Admin",
            email: newEmail,
          },
        }),
      );

      expect(response.status).toBe(403);
      expect(findAccountByEmail(newEmail)).toBeUndefined();

      expect(
        mocks.sendAdminInvite,
      ).not.toHaveBeenCalled();
    });

    it("rejects account creation from another origin", async () => {
      const response = await createAdmin(
        makeRequest("POST", {
          origin: "https://attacker.example.invalid",
          body: {
            username: "Cross-Origin Admin",
            email: newEmail,
          },
        }),
      );

      expect(response.status).toBe(403);
      expect(findAccountByEmail(newEmail)).toBeUndefined();

      expect(
        mocks.sendAdminInvite,
      ).not.toHaveBeenCalled();
    });

    it("rejects account creation without an Origin header", async () => {
      const response = await createAdmin(
        makeRequest("POST", {
          origin: null,
          body: {
            username: "Originless Admin",
            email: newEmail,
          },
        }),
      );

      expect(response.status).toBe(403);
      expect(findAccountByEmail(newEmail)).toBeUndefined();
    });

    it("rejects account creation from a stale Owner session", async () => {
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET session_version = session_version + 1
         WHERE id = ?1`,
      ).run(OWNER.id);

      const response = await createAdmin(
        makeRequest("POST", {
          body: {
            username: "Stale Session Admin",
            email: newEmail,
          },
        }),
      );

      expect(response.status).toBe(401);
      expect(findAccountByEmail(newEmail)).toBeUndefined();
    });

    it("does not create duplicate active email records", async () => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await createAdmin(
        makeRequest("POST", {
          body: {
            username: "Duplicate Admin",
            email: ADMIN.email,
          },
        }),
      );

      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        error:
          "The admin could not be added. The email may already exist.",
      });

      expect(activeAccountCount()).toBe(2);

      expect(
        mocks.sendAdminInvite,
      ).not.toHaveBeenCalled();

      expect(errorSpy).toHaveBeenCalled();
    });

    it("does not report account creation as failed when invitation delivery fails", async () => {
      mocks.sendAdminInvite.mockRejectedValueOnce(
        new Error("Synthetic email delivery failure."),
      );

      const response = await createAdmin(
        makeRequest("POST", {
          body: {
            username: "New Synthetic Admin",
            email: newEmail,
          },
        }),
      );

      expect(response.status).toBe(201);

      const body = await response.json();

      expect(body.invitation.submitted).toBe(false);
      expect(body.invitation.message).toContain(
        "could not be sent",
      );

      // The account was saved before the invitation failed.
      expect(findAccountByEmail(newEmail)?.role_id).toBe(2);
    });
  });

  describe("Updating administrator accounts", () => {
    it("allows the Owner to update an Admin username without changing security fields", async () => {
      const before = getAccount(ADMIN.id);

      const response = await updateAdmin(
        makeRequest("PATCH", {
          id: ADMIN.id,
          body: {
            username: "Updated Synthetic Admin",
          },
        }),
        contextFor(ADMIN.id),
      );

      expect(response.status).toBe(200);

      const after = getAccount(ADMIN.id);

      expect(after?.username).toBe(
        "Updated Synthetic Admin",
      );

      expect(after?.email_normalized).toBe(
        before?.email_normalized,
      );

      expect(after?.role_id).toBe(before?.role_id);
      expect(after?.password_hash).toBe(
        before?.password_hash,
      );

      expect(after?.session_version).toBe(
        before?.session_version,
      );
    });

    it("prevents a regular Admin from modifying account details", async () => {
      signInAs(ADMIN);

      const response = await updateAdmin(
        makeRequest("PATCH", {
          id: ADMIN.id,
          body: {
            username: "Unauthorized Change",
          },
        }),
        contextFor(ADMIN.id),
      );

      expect(response.status).toBe(403);

      expect(getAccount(ADMIN.id)?.username).toBe(
        ADMIN.username,
      );
    });

    it.each([
      ["role", { username: "Changed", role: 1 }],
      [
        "legacy permission",
        { username: "Changed", can_invite_users: 1 },
      ],
      [
        "management permission",
        { username: "Changed", canManageAdmins: true },
      ],
      [
        "session version",
        { username: "Changed", session_version: 0 },
      ],
      [
        "email",
        { username: "Changed", email: "other@example.invalid" },
      ],
    ])(
      "rejects attempts to update protected fields: %s",
      async (_label, body) => {
        const response = await updateAdmin(
          makeRequest("PATCH", {
            id: ADMIN.id,
            body,
          }),
          contextFor(ADMIN.id),
        );

        expect(response.status).toBe(400);

        expect(getAccount(ADMIN.id)?.username).toBe(
          ADMIN.username,
        );
      },
    );

    it("rejects cross-origin username modifications", async () => {
      const response = await updateAdmin(
        makeRequest("PATCH", {
          id: ADMIN.id,
          origin: "https://attacker.example.invalid",
          body: {
            username: "Cross-Origin Change",
          },
        }),
        contextFor(ADMIN.id),
      );

      expect(response.status).toBe(403);

      expect(getAccount(ADMIN.id)?.username).toBe(
        ADMIN.username,
      );
    });
  });

  describe("Removing administrator accounts", () => {
    it("allows the Owner to soft-delete a regular Admin", async () => {
      const response = await deleteAdmin(
        makeRequest("DELETE", {
          id: ADMIN.id,
        }),
        contextFor(ADMIN.id),
      );

      expect(response.status).toBe(204);

      expect(getAccount(ADMIN.id)?.deleted_at).not.toBeNull();
      expect(activeAccountCount()).toBe(1);

      // A deleted account must lose authorization immediately.
      signInAs(ADMIN);

      const result = await requireAdminApi(
        makeRequest("GET"),
        2,
      );

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.response.status).toBe(403);
      }
    });

    it("does not delete the current Owner account", async () => {
      const response = await deleteAdmin(
        makeRequest("DELETE", {
          id: OWNER.id,
        }),
        contextFor(OWNER.id),
      );

      // The current DELETE handler reports 204 even when
      // its SQL deliberately matches no Owner row.
      // Verify the database's protective behavior directly.
      expect(response.status).toBe(204);

      expect(getAccount(OWNER.id)?.deleted_at).toBeNull();
      expect(getAccount(OWNER.id)?.role_id).toBe(1);
    });

    it("prevents a regular Admin from deleting an administrator", async () => {
      signInAs(ADMIN);

      const response = await deleteAdmin(
        makeRequest("DELETE", {
          id: OWNER.id,
        }),
        contextFor(OWNER.id),
      );

      expect(response.status).toBe(403);

      expect(getAccount(OWNER.id)?.deleted_at).toBeNull();
    });

    it("rejects cross-origin administrator deletion", async () => {
      const response = await deleteAdmin(
        makeRequest("DELETE", {
          id: ADMIN.id,
          origin: "https://attacker.example.invalid",
        }),
        contextFor(ADMIN.id),
      );

      expect(response.status).toBe(403);

      expect(getAccount(ADMIN.id)?.deleted_at).toBeNull();
    });

    it("rejects deletion from an outdated Owner session", async () => {
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET session_version = session_version + 1
         WHERE id = ?1`,
      ).run(OWNER.id);

      const response = await deleteAdmin(
        makeRequest("DELETE", {
          id: ADMIN.id,
        }),
        contextFor(ADMIN.id),
      );

      expect(response.status).toBe(401);

      expect(getAccount(ADMIN.id)?.deleted_at).toBeNull();
    });
  });
});
