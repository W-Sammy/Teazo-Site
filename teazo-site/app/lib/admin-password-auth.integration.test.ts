/**
 * Integrated password setup/reset and administrator session tests.
 *
 * Exercises the real password-token service, password completion API,
 * administrator credentials query, authorization guard, and SQLite
 * migrations against an isolated in-memory database.
 *
 * Covers token eligibility and expiration, hashed token storage,
 * setup-link replacement, single-use reset links, password updates,
 * session-version invalidation, and safe API failures.
 *
 * Auth.js sessions, password hashing, rate-limit approval, and email
 * delivery are mocked. The actual SQL and database triggers run.
 *
 * No real passwords, accounts, email, or production data are used.
 */

import { createHash } from "node:crypto";

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

// External dependencies are isolated before production imports.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  hashPassword: vi.fn(),
  consumePasswordRequestLimit: vi.fn(),
  sendAdminPasswordChangedEmail: vi.fn(),
  after: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

// Use real SQLite queries and triggers instead of Cloudflare D1.
vi.mock("@/app/lib/d1", async () => ({
  ...(await import("@/test/sqlite-d1")).sqliteD1.module,
}));

// Only the hashing boundary is mocked. The tests verify that
// the service stores its returned hash and never plaintext.
vi.mock("@/app/lib/password", () => ({
  hashPassword: mocks.hashPassword,
}));

// Isolate password request throttling from these token/SQL tests.
vi.mock("@/app/lib/password-request-rate-limit", () => ({
  consumePasswordRequestLimit:
    mocks.consumePasswordRequestLimit,
}));

// Next.js schedules confirmation email delivery after responding.
// Record scheduling without executing the callback.
vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("@/app/lib/admin-password-email", () => ({
  sendAdminPasswordChangedEmail:
    mocks.sendAdminPasswordChangedEmail,
}));

// Prevent React's render cache from sharing authorization
// results across separate simulated requests in this test.
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

import {
  createPasswordToken,
  findValidPasswordToken,
} from "./admin-password-tokens";

import { findAdminCredentials } from "./admin-credentials";
import { requireAdminApi } from "./admin";

import {
  POST as completePassword,
} from "@/app/api/admin/password/complete/route";

const SITE_ORIGIN = "http://localhost:3000";
const COMPLETE_URL =
  `${SITE_ORIGIN}/api/admin/password/complete`;

const TEST_DATE = new Date("2026-11-04T20:00:00.000Z");

const TEST_PASSWORD = "Synthetic-Password-123";
const TEST_IP = "192.0.2.10";

type SyntheticAccount = {
  id: string;
  email: string;
  username: string;
  role: 1 | 2;
  status: "active" | "invited";
  passwordHash: string | null;
  sessionVersion: number;
};

const OWNER: SyntheticAccount = {
  id: "synthetic-owner",
  email: "owner@example.invalid",
  username: "Synthetic Owner",
  role: 1,
  status: "active",
  passwordHash: "synthetic-existing-owner-hash",
  sessionVersion: 3,
};

const ADMIN: SyntheticAccount = {
  id: "synthetic-admin",
  email: "admin@example.invalid",
  username: "Synthetic Admin",
  role: 2,
  status: "active",
  passwordHash: "synthetic-existing-admin-hash",
  sessionVersion: 5,
};

const INVITED: SyntheticAccount = {
  id: "synthetic-invited",
  email: "invited@example.invalid",
  username: "Synthetic Invited Admin",
  role: 2,
  status: "invited",
  passwordHash: null,
  sessionVersion: 2,
};

type AccountRow = {
  id: string;
  role_id: number;
  status: string;
  password_hash: string | null;
  session_version: number;
};

type TokenRow = {
  admin_user_id: string;
  token_hash: string;
  purpose: string;
  expires_at: number;
  used_at: number | null;
};

// Insert synthetic accounts into the actual admin_user table.
function insertAccount(account: SyntheticAccount) {
  sqliteD1.db.prepare(
    `INSERT INTO admin_user (
       id,
       email,
       email_normalized,
       username,
       role_id,
       status,
       password_hash,
       session_version
     )
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).run(
    account.id,
    account.email,
    account.email.toLowerCase(),
    account.username,
    account.role,
    account.status,
    account.passwordHash,
    account.sessionVersion,
  );
}

// Read the persisted account after a password operation.
function getAccount(id: string): AccountRow {
  const row = sqliteD1.db.prepare(
    `SELECT
       id,
       role_id,
       status,
       password_hash,
       session_version
     FROM admin_user
     WHERE id = ?1`,
  ).get(id) as AccountRow | undefined;

  if (!row) {
    throw new Error("Synthetic administrator not found.");
  }

  return row;
}

// Retrieve the database token row using the hash, never
// the plaintext token.
function getToken(token: string): TokenRow | undefined {
  const hash = createHash("sha256")
    .update(token)
    .digest("hex");

  return sqliteD1.db.prepare(
    `SELECT
       admin_user_id,
       token_hash,
       purpose,
       expires_at,
       used_at
     FROM admin_password_token
     WHERE token_hash = ?1`,
  ).get(hash) as TokenRow | undefined;
}

// Simulate the Auth.js session originally issued to an account.
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

// Check permissions through the real authorization guard.
async function accessStatus(
  account: SyntheticAccount,
  version: number,
  minRole: 1 | 2 = 2,
): Promise<number> {
  signInAs(account, version);

  const result = await requireAdminApi(
    new Request(
      `${SITE_ORIGIN}/api/admin/settings/admins`,
    ),
    minRole,
  );

  return result.ok
    ? 200
    : result.response.status;
}

// Build an in-process password completion request.
function completionRequest(
  token: string,
  purpose: "setup" | "reset",
  options: {
    password?: string;
    confirmPassword?: string;
    origin?: string;
    contentType?: string;
    ip?: string;
  } = {},
): Request {
  return new Request(COMPLETE_URL, {
    method: "POST",
    headers: {
      origin: options.origin ?? SITE_ORIGIN,
      "content-type":
        options.contentType ?? "application/json",
      "x-forwarded-for": options.ip ?? TEST_IP,
    },
    body: JSON.stringify({
      token,
      purpose,
      password: options.password ?? TEST_PASSWORD,
      confirmPassword:
        options.confirmPassword ?? TEST_PASSWORD,
    }),
  });
}

// Complete a token using the actual password API route.
async function submitPassword(
  token: string,
  purpose: "setup" | "reset",
  options: Parameters<typeof completionRequest>[2] = {},
) {
  return completePassword(
    completionRequest(token, purpose, options),
  );
}

// Check safe API failures without consuming a response twice.
async function expectApiError(
  response: Response,
  status: number,
  code?: string,
) {
  expect(response.status).toBe(status);

  expect(
    response.headers.get("cache-control"),
  ).toBe("no-store");

  const body = await response.json();

  expect(body).toHaveProperty("error");

  if (code) {
    expect(body.code).toBe(code);
  }

  return body;
}

// Create the mock's deterministic representation of a password hash.
// This is not a production password-hashing algorithm.
function syntheticHash(password: string) {
  return `synthetic-hash:${createHash("sha256")
    .update(password)
    .digest("hex")}`;
}

describe("Password setup/reset and authorization integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Start with a fresh database using the actual migrations.
    sqliteD1.reset();

    vi.useFakeTimers();
    vi.setSystemTime(TEST_DATE);

    vi.stubEnv("NEXT_PUBLIC_BASE_URL", SITE_ORIGIN);

    insertAccount(OWNER);
    insertAccount(ADMIN);
    insertAccount(INVITED);

    signInAs(OWNER);

    mocks.hashPassword.mockImplementation(
      async (password: string) =>
        syntheticHash(password),
    );

    mocks.consumePasswordRequestLimit.mockResolvedValue(
      true,
    );

    // Never run scheduled confirmation-email callbacks.
    mocks.after.mockImplementation(() => undefined);

    mocks.sendAdminPasswordChangedEmail.mockResolvedValue(
      "sent",
    );

    vi.spyOn(console, "error").mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    sqliteD1.db.close();
  });

  describe("Password-token eligibility", () => {
    it("creates a 24-hour setup token for an invited Admin", async () => {
      const created = await createPasswordToken(
        INVITED.id,
        "setup",
      );

      expect(created).not.toBeNull();

      if (!created) return;

      expect(created.token).toMatch(
        /^[A-Za-z0-9_-]{43}$/,
      );

      expect(created.expiresAt).toBe(
        Math.floor(Date.now() / 1000) + 24 * 3600,
      );

      const stored = getToken(created.token);

      expect(stored).toMatchObject({
        admin_user_id: INVITED.id,
        purpose: "setup",
        used_at: null,
      });

      expect(stored?.token_hash).not.toBe(
        created.token,
      );
    });

    it("creates a 30-minute reset token for an existing password account", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      expect(created).not.toBeNull();

      expect(created?.expiresAt).toBe(
        Math.floor(Date.now() / 1000) + 30 * 60,
      );

      expect(getToken(created?.token ?? "")).toMatchObject({
        admin_user_id: OWNER.id,
        purpose: "reset",
        used_at: null,
      });
    });

    it("rejects setup for accounts that already have a password", async () => {
      expect(
        await createPasswordToken(OWNER.id, "setup"),
      ).toBeNull();
    });

    it("rejects reset for accounts without a password", async () => {
      expect(
        await createPasswordToken(INVITED.id, "reset"),
      ).toBeNull();
    });

    it("rejects tokens for nonexistent accounts", async () => {
      expect(
        await createPasswordToken(
          "nonexistent-admin",
          "reset",
        ),
      ).toBeNull();
    });

    it("invalidates earlier setup links when another setup token is created", async () => {
      const first = await createPasswordToken(
        INVITED.id,
        "setup",
      );

      const second = await createPasswordToken(
        INVITED.id,
        "setup",
      );

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();

      if (!first || !second) return;

      expect(first.token).not.toBe(second.token);

      // The actual migration trigger retires older setup links.
      expect(getToken(first.token)?.used_at).not.toBeNull();
      expect(getToken(second.token)?.used_at).toBeNull();

      expect(
        await findValidPasswordToken(
          first.token,
          "setup",
        ),
      ).toBeNull();

      expect(
        await findValidPasswordToken(
          second.token,
          "setup",
        ),
      ).not.toBeNull();
    });

    it("rejects a token presented for the wrong purpose", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      expect(created).not.toBeNull();

      if (!created) return;

      expect(
        await findValidPasswordToken(
          created.token,
          "setup",
        ),
      ).toBeNull();

      expect(
        await findValidPasswordToken(
          created.token,
          "reset",
        ),
      ).not.toBeNull();
    });

    it("does not consume a token merely by validating it", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      await findValidPasswordToken(
        created.token,
        "reset",
      );

      await findValidPasswordToken(
        created.token,
        "reset",
      );

      expect(getToken(created.token)?.used_at).toBeNull();
    });
  });

  describe("Password setup and session invalidation", () => {
    it("activates an invited Admin and invalidates the old session", async () => {
      const created = await createPasswordToken(
        INVITED.id,
        "setup",
      );

      if (!created) {
        throw new Error("Expected a synthetic setup token.");
      }

      const response = await submitPassword(
        created.token,
        "setup",
      );

      expect(response.status).toBe(200);

      expect(await response.json()).toEqual({
        message:
          "Your password has been saved. Sign in to continue.",
      });

      expect(getAccount(INVITED.id)).toMatchObject({
        role_id: 2,
        status: "active",
        password_hash: syntheticHash(TEST_PASSWORD),
        session_version: INVITED.sessionVersion + 1,
      });

      // The old session must be rejected by the real guard.
      expect(
        await accessStatus(
          INVITED,
          INVITED.sessionVersion,
        ),
      ).toBe(401);

      // A new session can use the updated account version.
      expect(
        await accessStatus(
          INVITED,
          INVITED.sessionVersion + 1,
        ),
      ).toBe(200);

      expect(getToken(created.token)?.used_at).not.toBeNull();
    });

    it("makes newly configured password credentials available to the login query", async () => {
      const created = await createPasswordToken(
        INVITED.id,
        "setup",
      );

      if (!created) {
        throw new Error("Expected a synthetic setup token.");
      }

      expect(
        await findAdminCredentials(INVITED.email),
      ).toBeNull();

      expect(
        (await submitPassword(created.token, "setup")).status,
      ).toBe(200);

      // This is the real login credential lookup.
      // Argon2 verification is outside this test's mocked boundary.
      const credentials = await findAdminCredentials(
        INVITED.email,
      );

      expect(credentials).toMatchObject({
        id: INVITED.id,
        email_normalized: INVITED.email,
        password_hash: syntheticHash(TEST_PASSWORD),
        session_version: INVITED.sessionVersion + 1,
      });
    });

    it("rejects reuse of a completed setup token", async () => {
      const created = await createPasswordToken(
        INVITED.id,
        "setup",
      );

      if (!created) {
        throw new Error("Expected a synthetic setup token.");
      }

      expect(
        (await submitPassword(created.token, "setup")).status,
      ).toBe(200);

      const retry = await submitPassword(
        created.token,
        "setup",
      );

      await expectApiError(
        retry,
        400,
        "INVALID_TOKEN",
      );

      expect(
        getAccount(INVITED.id).session_version,
      ).toBe(INVITED.sessionVersion + 1);
    });
  });

  describe("Password reset and session invalidation", () => {
    it("changes an Owner password and rejects its old session", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      expect(
        await accessStatus(
          OWNER,
          OWNER.sessionVersion,
          1,
        ),
      ).toBe(200);

      const response = await submitPassword(
        created.token,
        "reset",
      );

      expect(response.status).toBe(200);

      expect(getAccount(OWNER.id)).toMatchObject({
        role_id: 1,
        status: "active",
        password_hash: syntheticHash(TEST_PASSWORD),
        session_version: OWNER.sessionVersion + 1,
      });

      expect(
        await accessStatus(
          OWNER,
          OWNER.sessionVersion,
          1,
        ),
      ).toBe(401);

      expect(
        await accessStatus(
          OWNER,
          OWNER.sessionVersion + 1,
          1,
        ),
      ).toBe(200);
    });

    it("invalidates all outstanding reset tokens when one password change succeeds", async () => {
      const first = await createPasswordToken(
        ADMIN.id,
        "reset",
      );

      const second = await createPasswordToken(
        ADMIN.id,
        "reset",
      );

      if (!first || !second) {
        throw new Error("Expected two synthetic reset tokens.");
      }

      expect(
        (await submitPassword(first.token, "reset")).status,
      ).toBe(200);

      // The real password-update trigger consumes both links.
      expect(getToken(first.token)?.used_at).not.toBeNull();
      expect(getToken(second.token)?.used_at).not.toBeNull();

      await expectApiError(
        await submitPassword(second.token, "reset"),
        400,
        "INVALID_TOKEN",
      );

      expect(
        getAccount(ADMIN.id).session_version,
      ).toBe(ADMIN.sessionVersion + 1);
    });

    it("rejects an expired reset token without changing credentials", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      const now = Math.floor(Date.now() / 1000);

      // Simulate an expired token while keeping the
      // database constraint expires_at > created_at valid.
      sqliteD1.db.prepare(
        `UPDATE admin_password_token
         SET created_at = ?1,
             expires_at = ?2
         WHERE token_hash = ?3`,
      ).run(
        now - 3600,
        now - 1,
        getToken(created.token)?.token_hash ?? "",
      );

      await expectApiError(
        await submitPassword(created.token, "reset"),
        400,
        "INVALID_TOKEN",
      );

      expect(getAccount(OWNER.id)).toMatchObject({
        password_hash: OWNER.passwordHash,
        session_version: OWNER.sessionVersion,
      });
    });

    it("rejects a token that expires during password hashing", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      // Expire the token between the initial eligibility
      // lookup and the final conditional password UPDATE.
      mocks.hashPassword.mockImplementationOnce(
        async (password: string) => {
          const now = Math.floor(Date.now() / 1000);

          sqliteD1.db.prepare(
            `UPDATE admin_password_token
             SET created_at = ?1,
                 expires_at = ?2
             WHERE token_hash = ?3`,
          ).run(
            now - 3600,
            now - 1,
            getToken(created.token)?.token_hash ?? "",
          );

          return syntheticHash(password);
        },
      );

      await expectApiError(
        await submitPassword(created.token, "reset"),
        400,
        "INVALID_TOKEN",
      );

      expect(getAccount(OWNER.id)).toMatchObject({
        password_hash: OWNER.passwordHash,
        session_version: OWNER.sessionVersion,
      });
    });

    it("rejects password reset for an account suspended after token creation", async () => {
      const created = await createPasswordToken(
        ADMIN.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET status = 'suspended'
         WHERE id = ?1`,
      ).run(ADMIN.id);

      await expectApiError(
        await submitPassword(created.token, "reset"),
        400,
        "INVALID_TOKEN",
      );

      expect(getAccount(ADMIN.id)).toMatchObject({
        status: "suspended",
        password_hash: ADMIN.passwordHash,
        session_version: ADMIN.sessionVersion,
      });
    });
  });

  describe("Password submission validation and security", () => {
    it("rejects a short password without changing account state", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      await expectApiError(
        await submitPassword(created.token, "reset", {
          password: "short",
          confirmPassword: "short",
        }),
        400,
        "INVALID_PASSWORD",
      );

      expect(mocks.hashPassword).not.toHaveBeenCalled();
      expect(getToken(created.token)?.used_at).toBeNull();
      expect(getAccount(OWNER.id).password_hash).toBe(
        OWNER.passwordHash,
      );
    });

    it("rejects mismatched passwords without consuming the token", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      await expectApiError(
        await submitPassword(created.token, "reset", {
          password: TEST_PASSWORD,
          confirmPassword: "Different-Synthetic-Password",
        }),
        400,
        "PASSWORD_MISMATCH",
      );

      expect(mocks.hashPassword).not.toHaveBeenCalled();
      expect(getToken(created.token)?.used_at).toBeNull();
    });

    it("rejects malformed tokens before invoking password hashing", async () => {
      await expectApiError(
        await submitPassword("invalid-token", "reset"),
        400,
        "INVALID_TOKEN",
      );

      expect(mocks.hashPassword).not.toHaveBeenCalled();
    });

    it("rejects cross-origin completion requests", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      const response = await submitPassword(
        created.token,
        "reset",
        {
          origin: "https://attacker.example.invalid",
        },
      );

      expect(response.status).toBe(403);
      expect(mocks.hashPassword).not.toHaveBeenCalled();
      expect(getToken(created.token)?.used_at).toBeNull();
    });

    it("rejects non-JSON password submissions", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      const response = await submitPassword(
        created.token,
        "reset",
        {
          contentType: "text/plain",
        },
      );

      expect(response.status).toBe(415);
      expect(mocks.hashPassword).not.toHaveBeenCalled();
    });

    it("enforces password submission rate limiting before token processing", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      mocks.consumePasswordRequestLimit.mockResolvedValueOnce(
        false,
      );

      const response = await submitPassword(
        created.token,
        "reset",
      );

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe(
        "900",
      );

      expect(
        mocks.consumePasswordRequestLimit,
      ).toHaveBeenCalledWith(
        {
          name: "password-complete-ip",
          limit: 20,
          windowMs: 15 * 60 * 1000,
        },
        TEST_IP,
      );

      expect(mocks.hashPassword).not.toHaveBeenCalled();
      expect(getToken(created.token)?.used_at).toBeNull();
    });

    it("fails safely when the password-token table is unavailable", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      // The schema damage is confined to this in-memory DB.
      sqliteD1.db.exec("DROP TABLE admin_password_token");

      const response = await submitPassword(
        created.token,
        "reset",
      );

      const body = await expectApiError(response, 503);

      expect(body.error).toBe(
        "Unable to complete the password update. Try signing in or request a new link.",
      );

      expect(JSON.stringify(body)).not.toContain(
        created.token,
      );

      expect(getAccount(OWNER.id)).toMatchObject({
        password_hash: OWNER.passwordHash,
        session_version: OWNER.sessionVersion,
      });

      expect(
        mocks.sendAdminPasswordChangedEmail,
      ).not.toHaveBeenCalled();
    });

    it("does not send confirmation email before successful completion", async () => {
      const created = await createPasswordToken(
        OWNER.id,
        "reset",
      );

      if (!created) {
        throw new Error("Expected a synthetic reset token.");
      }

      const response = await submitPassword(
        created.token,
        "reset",
      );

      expect(response.status).toBe(200);

      // Confirm that Next.js after() is scheduled, but that
      // no actual email delivery callback is executed.
      expect(mocks.after).toHaveBeenCalledOnce();

      expect(
        mocks.sendAdminPasswordChangedEmail,
      ).not.toHaveBeenCalled();

      expect(
        getAccount(OWNER.id).password_hash,
      ).toBe(syntheticHash(TEST_PASSWORD));

      expect(
        getAccount(OWNER.id).password_hash,
      ).not.toBe(TEST_PASSWORD);
    });
  });
});
