import { createHash } from "node:crypto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Keep all database operations mocked.
// These tests must never access real D1 records.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  bind: vi.fn(),
  first: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/app/lib/d1", () => ({
  prepare: mocks.prepare,
}));

import {
  cancelOwnershipTransfer,
  createOwnershipTransfer,
  decideOwnershipTransfer,
  expireOwnershipTransfers,
  findOwnershipTransfer,
  findPendingOwnershipTransfer,
} from "./ownership-transfer";

const NOW = 1_800_000_000;
const ONE_DAY = 24 * 60 * 60;

// A synthetic 32-byte token, never a real invitation token.
const TEST_TOKEN = Buffer.alloc(32, 7).toString("base64url");

const TEST_TOKEN_HASH = createHash("sha256")
  .update(TEST_TOKEN)
  .digest("hex");

const parties = {
  owner_id: "owner-id",
  owner_username: "Test Owner",
  owner_email: "owner@example.invalid",
  recipient_id: "recipient-id",
  recipient_username: "Test Admin",
  recipient_email: "admin@example.invalid",
};

const expectedParties = {
  owner: {
    id: "owner-id",
    username: "Test Owner",
    email: "owner@example.invalid",
  },
  recipient: {
    id: "recipient-id",
    username: "Test Admin",
    email: "admin@example.invalid",
  },
};

const validTransferRow = {
  ...parties,
  id: "transfer-id",
  expires_at: NOW + 3600,
};

describe("Ownership transfer database operations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW * 1000));
    vi.resetAllMocks();

    mocks.prepare.mockReturnValue({
      bind: mocks.bind,
    });

    mocks.bind.mockReturnValue({
      first: mocks.first,
      run: mocks.run,
    });

    mocks.run.mockResolvedValue({
      success: true,
    });

    mocks.first.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("expiration and pending requests", () => {
    it("expires pending requests using the current time", async () => {
      await expireOwnershipTransfers();

      expect(mocks.prepare).toHaveBeenCalledWith(
        expect.stringMatching(
          /UPDATE ownership_transfer_request[\s\S]*status = 'expired'/,
        ),
      );

      expect(mocks.prepare.mock.calls[0][0]).toMatch(
        /status = 'pending'[\s\S]*expires_at <= \?1/,
      );

      expect(mocks.bind).toHaveBeenCalledWith(NOW);
      expect(mocks.run).toHaveBeenCalledOnce();
    });

    it("returns a pending request without exposing the token", async () => {
      mocks.first.mockResolvedValue({
        id: "transfer-id",
        recipient_admin_id: "recipient-id",
        recipient_username: "Test Admin",
        recipient_email: "admin@example.invalid",
        created_at: NOW - 60,
        expires_at: NOW + 3600,
      });

      const transfer =
        await findPendingOwnershipTransfer("owner-id");

      expect(transfer).toEqual({
        id: "transfer-id",
        recipientAdminId: "recipient-id",
        recipientUsername: "Test Admin",
        recipientEmail: "admin@example.invalid",
        createdAt: NOW - 60,
        expiresAt: NOW + 3600,
        status: "pending",
      });

      expect(transfer).not.toHaveProperty("token");
      expect(transfer).not.toHaveProperty("tokenHash");

      const lookupSql = mocks.prepare.mock.calls[1][0] as string;

      expect(lookupSql).toContain("t.owner_admin_id = ?1");
      expect(lookupSql).toContain("t.status = 'pending'");
      expect(lookupSql).toContain("t.expires_at > ?2");

      expect(mocks.bind).toHaveBeenLastCalledWith(
        "owner-id",
        NOW,
      );
    });

    it("returns null when no pending request exists", async () => {
      const transfer =
        await findPendingOwnershipTransfer("owner-id");

      expect(transfer).toBeNull();
    });

    it("rejects a missing Owner ID without querying D1", async () => {
      const transfer =
        await findPendingOwnershipTransfer("");

      expect(transfer).toBeNull();
      expect(mocks.prepare).not.toHaveBeenCalled();
    });

    it("fails closed when expiration cleanup fails", async () => {
      mocks.run.mockRejectedValue(
        new Error("Database unavailable"),
      );

      await expect(
        findPendingOwnershipTransfer("owner-id"),
      ).rejects.toThrow("Database unavailable");
    });
  });

  describe("creating a transfer", () => {
    it("rejects missing or identical account IDs", async () => {
      expect(
        await createOwnershipTransfer("", "recipient-id"),
      ).toBeNull();

      expect(
        await createOwnershipTransfer("owner-id", ""),
      ).toBeNull();

      expect(
        await createOwnershipTransfer("owner-id", "owner-id"),
      ).toBeNull();

      expect(mocks.prepare).not.toHaveBeenCalled();
    });

    it("rejects a recipient who fails database eligibility", async () => {
      mocks.first.mockResolvedValue(null);

      const result = await createOwnershipTransfer(
        "owner-id",
        "recipient-id",
      );

      expect(result).toBeNull();

      const lookupSql = mocks.prepare.mock.calls[1][0] as string;

      expect(lookupSql).toContain("o.role_id = 1");
      expect(lookupSql).toContain("r.role_id = 2");
      expect(lookupSql).toContain("o.status = 'active'");
      expect(lookupSql).toContain("r.status = 'active'");
      expect(lookupSql).toContain("o.deleted_at IS NULL");
      expect(lookupSql).toContain("r.deleted_at IS NULL");
    });

    it("creates a secure 24-hour token and stores its hash", async () => {
      mocks.first
        .mockResolvedValueOnce(parties)
        .mockResolvedValueOnce({ id: "inserted-id" });

      const result = await createOwnershipTransfer(
        "owner-id",
        "recipient-id",
      );

      expect(result).not.toBeNull();

      if (!result) {
        throw new Error("Expected a created transfer.");
      }

      expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(result.expiresAt).toBe(NOW + ONE_DAY);

      expect(result.owner).toEqual(expectedParties.owner);
      expect(result.recipient).toEqual(expectedParties.recipient);

      const digest = createHash("sha256")
        .update(result.token)
        .digest("hex");

      const insertSql = mocks.prepare.mock.calls[2][0] as string;

      expect(insertSql).toContain(
        "INSERT INTO ownership_transfer_request",
      );

      expect(insertSql).toContain("AND NOT EXISTS");
      expect(insertSql).toContain("status = 'pending'");
      expect(insertSql).toContain("o.role_id = 1");
      expect(insertSql).toContain("r.role_id = 2");

      expect(mocks.bind).toHaveBeenNthCalledWith(
        3,
        result.id,
        "owner-id",
        "recipient-id",
        digest,
        NOW,
        NOW + ONE_DAY,
      );

      // D1 receives the hash, never the original token.
      expect(mocks.bind.mock.calls[2]).not.toContain(
        result.token,
      );
    });

    it("does not create another transfer while one is pending", async () => {
      mocks.first
        .mockResolvedValueOnce(parties)
        .mockResolvedValueOnce(null);

      const result = await createOwnershipTransfer(
        "owner-id",
        "recipient-id",
      );

      expect(result).toBeNull();

      const insertSql = mocks.prepare.mock.calls[2][0] as string;

      expect(insertSql).toMatch(
        /NOT EXISTS\s*\([\s\S]*status = 'pending'/,
      );
    });
  });

  describe("reviewing and deciding an offer", () => {
    it("rejects malformed tokens without querying D1", async () => {
      const result = await findOwnershipTransfer(
        "invalid-token",
        "recipient-id",
      );

      expect(result).toBeNull();
      expect(mocks.prepare).not.toHaveBeenCalled();
    });

    it("scopes transfer lookup to the intended recipient", async () => {
      mocks.first.mockResolvedValue(validTransferRow);

      const transfer = await findOwnershipTransfer(
        TEST_TOKEN,
        "recipient-id",
      );

      expect(transfer).toEqual({
        id: "transfer-id",
        expiresAt: NOW + 3600,
        ...expectedParties,
      });

      const sql = mocks.prepare.mock.calls[0][0] as string;

      expect(sql).toContain("t.token_hash = ?1");
      expect(sql).toContain("t.recipient_admin_id = ?2");
      expect(sql).toContain("t.status = 'pending'");
      expect(sql).toContain("t.expires_at > ?3");
      expect(sql).toContain("o.role_id = 1");
      expect(sql).toContain("r.role_id = 2");

      expect(mocks.bind).toHaveBeenCalledWith(
        TEST_TOKEN_HASH,
        "recipient-id",
        NOW,
      );
    });

    it("returns null when an offer is no longer eligible", async () => {
      mocks.first.mockResolvedValue(null);

      const result = await findOwnershipTransfer(
        TEST_TOKEN,
        "recipient-id",
      );

      expect(result).toBeNull();
    });

    it("conditionally accepts a valid pending offer", async () => {
      mocks.first
        .mockResolvedValueOnce(validTransferRow)
        .mockResolvedValueOnce({ id: "transfer-id" });

      const result = await decideOwnershipTransfer(
        TEST_TOKEN,
        "recipient-id",
        "accepted",
      );

      expect(result).toEqual({
        id: "transfer-id",
        expiresAt: NOW + 3600,
        ...expectedParties,
      });

      const updateSql = mocks.prepare.mock.calls[1][0] as string;

      expect(updateSql).toContain(
        "UPDATE ownership_transfer_request",
      );
      expect(updateSql).toContain("status = 'pending'");
      expect(updateSql).toContain("expires_at > ?2");
      expect(updateSql).toContain("token_hash = ?3");
      expect(updateSql).toContain("recipient_admin_id = ?4");

      expect(mocks.bind).toHaveBeenNthCalledWith(
        2,
        "accepted",
        NOW,
        TEST_TOKEN_HASH,
        "recipient-id",
      );
    });

    it("records an explicit decline without requesting promotion", async () => {
      mocks.first
        .mockResolvedValueOnce(validTransferRow)
        .mockResolvedValueOnce({ id: "transfer-id" });

      const result = await decideOwnershipTransfer(
        TEST_TOKEN,
        "recipient-id",
        "declined",
      );

      expect(result?.id).toBe("transfer-id");

      expect(mocks.bind).toHaveBeenNthCalledWith(
        2,
        "declined",
        NOW,
        TEST_TOKEN_HASH,
        "recipient-id",
      );
    });

    it("does not update an invalid or resolved offer", async () => {
      mocks.first.mockResolvedValue(null);

      const result = await decideOwnershipTransfer(
        TEST_TOKEN,
        "recipient-id",
        "accepted",
      );

      expect(result).toBeNull();
      expect(mocks.prepare).toHaveBeenCalledOnce();
    });

    it("returns null if another request resolves the offer first", async () => {
      mocks.first
        .mockResolvedValueOnce(validTransferRow)
        .mockResolvedValueOnce(null);

      const result = await decideOwnershipTransfer(
        TEST_TOKEN,
        "recipient-id",
        "accepted",
      );

      expect(result).toBeNull();
    });
  });

  describe("canceling a transfer", () => {
    it("restricts cancellation to the initiating Owner", async () => {
      mocks.first.mockResolvedValue({ id: "transfer-id" });

      const result = await cancelOwnershipTransfer(
        "transfer-id",
        "owner-id",
      );

      expect(result).toBe(true);

      const sql = mocks.prepare.mock.calls[0][0] as string;

      expect(sql).toContain("status = 'canceled'");
      expect(sql).toContain("owner_admin_id = ?3");
      expect(sql).toContain("status = 'pending'");
      expect(sql).toContain("role_id = 1");

      expect(mocks.bind).toHaveBeenCalledWith(
        NOW,
        "transfer-id",
        "owner-id",
      );
    });

    it("returns false when no eligible pending transfer exists", async () => {
      mocks.first.mockResolvedValue(null);

      const result = await cancelOwnershipTransfer(
        "transfer-id",
        "owner-id",
      );

      expect(result).toBe(false);
    });
  });
});
