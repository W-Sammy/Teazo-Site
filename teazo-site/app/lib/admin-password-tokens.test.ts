/**
 * Tests admin password setup/reset token generation and consumption.
 *
 * D1 queries and password hashing are mocked so tests can verify token
 * format, hashed storage, expiration, eligibility, and session invalidation
 * without persisting credentials or accessing a real database.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash } from "node:crypto";

import { prepare } from "./d1";
import { hashPassword } from "./password";
import {
  createPasswordToken,
  findValidPasswordToken,
  savePasswordWithToken,
} from "./admin-password-tokens";

// Keep all credential and database work inside mocks.
vi.mock("server-only", () => ({}));
vi.mock("./d1", () => ({ prepare: vi.fn() }));
vi.mock("./password", () => ({ hashPassword: vi.fn() }));

const first = vi.fn();
const bind = vi.fn();

// Capture generated SQL and bound values to verify security conditions.
const sqlStatements: string[] = [];
const boundValues: unknown[][] = [];

const VALID_TOKEN = "A".repeat(43);

function validTokenRow(purpose: "setup" | "reset" = "reset") {
  return {
    id: "token-id",
    admin_user_id: "admin-id",
    purpose,
  };
}

describe("Admin password token helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));

    sqlStatements.length = 0;
    boundValues.length = 0;

    bind.mockImplementation((...values: unknown[]) => {
      boundValues.push(values);
      return { first };
    });

    vi.mocked(prepare).mockImplementation((sql) => {
      sqlStatements.push(String(sql));
      return { bind } as never;
    });

    vi.mocked(hashPassword).mockResolvedValue("argon2id-test-hash");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Token generation and storage: only a SHA-256 hash reaches D1.
  it("generates a 43-character base64url token", async () => {
    first.mockResolvedValueOnce({ id: "row-id" });

    const result = await createPasswordToken("admin-id", "setup");

    expect(result).not.toBeNull();
    expect(result?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores the SHA-256 token hash rather than the original token", async () => {
    first.mockResolvedValueOnce({ id: "row-id" });

    const result = await createPasswordToken("admin-id", "reset");

    expect(result).not.toBeNull();

    const storedHash = boundValues[0][1];

    expect(storedHash).toBe(
      createHash("sha256").update(result!.token).digest("hex"),
    );

    expect(storedHash).not.toBe(result!.token);
  });

  it("creates unique tokens", async () => {
    first.mockResolvedValue({ id: "row-id" });

    const firstToken = await createPasswordToken("admin-id", "reset");
    const secondToken = await createPasswordToken("admin-id", "reset");

    expect(firstToken?.token).not.toBe(secondToken?.token);
  });

  // Setup links live longer than reset links by design.
  it("sets setup token expiration to 24 hours", async () => {
    first.mockResolvedValueOnce({ id: "row-id" });

    const result = await createPasswordToken("admin-id", "setup");

    expect(result?.expiresAt).toBe(
      Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    );
  });

  it("sets reset token expiration to 30 minutes", async () => {
    first.mockResolvedValueOnce({ id: "row-id" });

    const result = await createPasswordToken("admin-id", "reset");

    expect(result?.expiresAt).toBe(
      Math.floor(Date.now() / 1000) + 30 * 60,
    );
  });

  // Eligibility must be checked before a link can be issued.
  it("does not return a token for an ineligible account", async () => {
    first.mockResolvedValueOnce(null);

    const result = await createPasswordToken("ineligible", "reset");

    expect(result).toBeNull();
  });

  it("enforces account eligibility in the creation query", async () => {
    first.mockResolvedValueOnce(null);

    await createPasswordToken("admin-id", "setup");

    expect(sqlStatements[0]).toContain("deleted_at IS NULL");
    expect(sqlStatements[0]).toContain("password_hash IS NULL");
    expect(sqlStatements[0]).toContain("role_id IN (1, 2, 3)");
  });

  // Reject malformed inputs before touching D1.
  it("rejects malformed tokens before querying D1", async () => {
    const result = await findValidPasswordToken(
      "not-a-valid-token",
      "reset",
    );

    expect(result).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("accepts a valid unused token record", async () => {
    first.mockResolvedValueOnce(validTokenRow());

    const result = await findValidPasswordToken(
      VALID_TOKEN,
      "reset",
    );

    expect(result).toEqual(validTokenRow());
  });

  it("requires matching token purpose and expiration", async () => {
    first.mockResolvedValueOnce(null);

    await findValidPasswordToken(VALID_TOKEN, "setup");

    expect(sqlStatements[0]).toContain("t.purpose = ?2");
    expect(sqlStatements[0]).toContain("t.used_at IS NULL");
    expect(sqlStatements[0]).toContain("t.expires_at > ?3");
  });

  // Password validation happens before the hashing operation.
  it("rejects passwords shorter than six characters", async () => {
    const result = await savePasswordWithToken(
      VALID_TOKEN,
      "reset",
      "12345",
      "12345",
    );

    expect(result).toEqual({
      ok: false,
      reason: "invalid-password",
    });

    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("rejects passwords longer than 128 characters", async () => {
    const password = "A".repeat(129);

    const result = await savePasswordWithToken(
      VALID_TOKEN,
      "reset",
      password,
      password,
    );

    expect(result).toEqual({
      ok: false,
      reason: "invalid-password",
    });
  });

  it("rejects mismatched passwords", async () => {
    const result = await savePasswordWithToken(
      VALID_TOKEN,
      "reset",
      "Password123",
      "Different123",
    );

    expect(result).toEqual({
      ok: false,
      reason: "password-mismatch",
    });

    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens without performing password hashing", async () => {
    first.mockResolvedValueOnce(null);

    const result = await savePasswordWithToken(
      VALID_TOKEN,
      "reset",
      "NewPassword123",
      "NewPassword123",
    );

    expect(result).toEqual({
      ok: false,
      reason: "invalid-token",
    });

    expect(hashPassword).not.toHaveBeenCalled();
  });

  // A successful update persists a hash and rotates session_version.
  it("hashes valid passwords before saving them", async () => {
    first
      .mockResolvedValueOnce(validTokenRow())
      .mockResolvedValueOnce({
        id: "admin-id",
        email_normalized: "admin@example.com",
      });

    const result = await savePasswordWithToken(
      VALID_TOKEN,
      "reset",
      "NewPassword123",
      "NewPassword123",
    );

    expect(hashPassword).toHaveBeenCalledWith("NewPassword123");

    expect(result).toEqual({
      ok: true,
      adminEmail: "admin@example.com",
    });
  });

  it("increments session_version during password updates", async () => {
    first
      .mockResolvedValueOnce(validTokenRow())
      .mockResolvedValueOnce({
        id: "admin-id",
        email_normalized: "admin@example.com",
      });

    await savePasswordWithToken(
      VALID_TOKEN,
      "reset",
      "NewPassword123",
      "NewPassword123",
    );

    const updateSql = sqlStatements.find((sql) =>
      sql.includes("UPDATE admin_user"),
    );

    expect(updateSql).toContain(
      "session_version = session_version + 1",
    );
  });

  // Recheck eligibility at update time to prevent token-reuse races.
  it("rechecks token eligibility in the final UPDATE", async () => {
    first
      .mockResolvedValueOnce(validTokenRow())
      .mockResolvedValueOnce(null);

    const result = await savePasswordWithToken(
      VALID_TOKEN,
      "reset",
      "NewPassword123",
      "NewPassword123",
    );

    expect(result).toEqual({
      ok: false,
      reason: "invalid-token",
    });

    const updateSql = sqlStatements[1];

    expect(updateSql).toContain("deleted_at IS NULL");
    expect(updateSql).toContain("expires_at > ?6");
    expect(updateSql).toContain("used_at IS NULL");
  });

  // Spaces are meaningful password characters and must not be trimmed.
  it("preserves the exact password when hashing", async () => {
    first
      .mockResolvedValueOnce(validTokenRow())
      .mockResolvedValueOnce({
        id: "admin-id",
        email_normalized: "admin@example.com",
      });

    const password = "  MyPassword123  ";

    await savePasswordWithToken(
      VALID_TOKEN,
      "reset",
      password,
      password,
    );

    expect(hashPassword).toHaveBeenCalledWith(password);
  });
});
