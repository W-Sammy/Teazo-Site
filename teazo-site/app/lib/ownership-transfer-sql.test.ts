import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

// Use Node's built-in SQLite without requiring a newer
// @types/node package in this project.
type SqlParameter = string | number | null;

type SqliteStatement = {
  run: (...params: SqlParameter[]) => unknown;
  get: (...params: SqlParameter[]) => unknown;
  all: (...params: SqlParameter[]) => unknown[];
};

type TestDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as {
  DatabaseSync: new (location: string) => TestDatabase;
};

// Read the actual migration rather than copying its
// triggers into our tests.
const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "migrations",
    "0011_ownership_transfer.sql",
  ),
  "utf8",
);

type AdminRow = {
  id: string;
  role_id: number;
  status: string;
  can_invite_users: number;
  session_version: number;
};

type TransferRow = {
  id: string;
  status: string;
  resolved_at: number | null;
};

let db: TestDatabase;

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}

// Create only the prerequisite schema needed by the real
// ownership-transfer migration. The constraints relevant
// to role changes match the application database.
//
// Every test receives its own disposable in-memory database.
function createTestDatabase(): TestDatabase {
  const database = new DatabaseSync(":memory:");

  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE role (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
    );

    INSERT INTO role (id, name)
    VALUES
      (1, 'Owner'),
      (2, 'Admin');

    CREATE TABLE admin_user (
      id TEXT PRIMARY KEY NOT NULL,
      role_id INTEGER NOT NULL
        REFERENCES role(id),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'invited', 'suspended')),
      deleted_at TEXT,
      can_invite_users INTEGER NOT NULL DEFAULT 0
        CHECK (can_invite_users IN (0, 1))
        CHECK (can_invite_users = 0 OR role_id = 2),
      session_version INTEGER NOT NULL DEFAULT 0
        CHECK (session_version >= 0)
    );

    CREATE UNIQUE INDEX ux_admin_user_single_owner
      ON admin_user(role_id)
      WHERE role_id = 1 AND deleted_at IS NULL;

    INSERT INTO admin_user (
      id,
      role_id,
      status,
      can_invite_users,
      session_version
    )
    VALUES
      ('owner-id', 1, 'active', 0, 3),
      ('recipient-id', 2, 'active', 1, 7);
  `);

  database.exec(migrationSql);

  return database;
}

function getAdmin(id: string): AdminRow {
  const row = db.prepare(
    `SELECT
       id,
       role_id,
       status,
       can_invite_users,
       session_version
     FROM admin_user
     WHERE id = ?1`,
  ).get(id);

  if (!row) {
    throw new Error(`Synthetic account not found: ${id}`);
  }

  return row as AdminRow;
}

function getTransfer(id = "transfer-1"): TransferRow {
  const row = db.prepare(
    `SELECT id, status, resolved_at
     FROM ownership_transfer_request
     WHERE id = ?1`,
  ).get(id);

  if (!row) {
    throw new Error(`Synthetic transfer not found: ${id}`);
  }

  return row as TransferRow;
}

function activeOwnerCount(): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
     FROM admin_user
     WHERE role_id = 1
       AND status = 'active'
       AND deleted_at IS NULL`,
  ).get() as { count: number };

  return row.count;
}

type PendingOptions = {
  ownerId?: string;
  recipientId?: string;
  createdAt?: number;
  expiresAt?: number;
};

// Create a synthetic pending request without sending email.
// The token hash is deliberately generated from test data.
function insertPendingTransfer(
  id = "transfer-1",
  options: PendingOptions = {},
): void {
  const now = unixTime();

  const tokenHash = createHash("sha256")
    .update(`synthetic-token-for-${id}`)
    .digest("hex");

  db.prepare(
    `INSERT INTO ownership_transfer_request (
       id,
       owner_admin_id,
       recipient_admin_id,
       token_hash,
       status,
       created_at,
       expires_at
     )
     VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6)`,
  ).run(
    id,
    options.ownerId ?? "owner-id",
    options.recipientId ?? "recipient-id",
    tokenHash,
    options.createdAt ?? now - 60,
    options.expiresAt ?? now + 3600,
  );
}

function resolveTransfer(
  decision: "accepted" | "declined" | "canceled",
  id = "transfer-1",
): void {
  db.prepare(
    `UPDATE ownership_transfer_request
     SET status = ?1,
         resolved_at = ?2
     WHERE id = ?3`,
  ).run(decision, unixTime(), id);
}

describe("Ownership transfer SQLite integration", () => {
  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("applies the actual migration and creates required database objects", () => {
    const objects = db.prepare(
      `SELECT type, name
       FROM sqlite_master
       WHERE name IN (
         'ownership_transfer_request',
         'ux_ownership_transfer_one_pending',
         'ix_ownership_transfer_recipient',
         'trg_ownership_transfer_status_transition',
         'trg_ownership_transfer_accept'
       )`,
    ).all();

    expect(objects).toEqual(
      expect.arrayContaining([
        {
          type: "table",
          name: "ownership_transfer_request",
        },
        {
          type: "index",
          name: "ux_ownership_transfer_one_pending",
        },
        {
          type: "index",
          name: "ix_ownership_transfer_recipient",
        },
        {
          type: "trigger",
          name: "trg_ownership_transfer_status_transition",
        },
        {
          type: "trigger",
          name: "trg_ownership_transfer_accept",
        },
      ]),
    );
  });

  it("preserves the initial administrator roles during migration", () => {
    expect(getAdmin("owner-id").role_id).toBe(1);
    expect(getAdmin("recipient-id").role_id).toBe(2);
    expect(activeOwnerCount()).toBe(1);
  });

  it("allows only one pending ownership request", () => {
    insertPendingTransfer();

    expect(() => {
      insertPendingTransfer("transfer-2");
    }).toThrow(/UNIQUE constraint failed/i);

    expect(getTransfer().status).toBe("pending");
    expect(activeOwnerCount()).toBe(1);
  });

  it("rejects requests for nonexistent administrator accounts", () => {
    expect(() => {
      insertPendingTransfer("transfer-2", {
        recipientId: "nonexistent-admin",
      });
    }).toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("atomically exchanges Owner and Admin roles on acceptance", () => {
    insertPendingTransfer();

    resolveTransfer("accepted");

    expect(getAdmin("owner-id")).toMatchObject({
      role_id: 2,
      can_invite_users: 0,
      session_version: 4,
    });

    expect(getAdmin("recipient-id")).toMatchObject({
      role_id: 1,
      can_invite_users: 0,
      session_version: 8,
    });

    expect(getTransfer().status).toBe("accepted");
    expect(getTransfer().resolved_at).not.toBeNull();

    expect(activeOwnerCount()).toBe(1);
  });

  it("declines an offer without changing either account", () => {
    insertPendingTransfer();

    resolveTransfer("declined");

    expect(getTransfer().status).toBe("declined");

    expect(getAdmin("owner-id")).toMatchObject({
      role_id: 1,
      session_version: 3,
    });

    expect(getAdmin("recipient-id")).toMatchObject({
      role_id: 2,
      session_version: 7,
    });

    expect(activeOwnerCount()).toBe(1);
  });

  it("cancels an offer without changing administrator roles", () => {
    insertPendingTransfer();

    resolveTransfer("canceled");

    expect(getTransfer().status).toBe("canceled");

    expect(getAdmin("owner-id").role_id).toBe(1);
    expect(getAdmin("recipient-id").role_id).toBe(2);

    expect(activeOwnerCount()).toBe(1);

    // Once canceled, the offer cannot be accepted.
    expect(() => {
      resolveTransfer("accepted");
    }).toThrow(/Invalid ownership transfer status transition/i);
  });

  it("rejects an expired ownership transfer", () => {
    const now = unixTime();

    insertPendingTransfer("transfer-1", {
      createdAt: now - 3600,
      expiresAt: now - 60,
    });

    expect(() => {
      resolveTransfer("accepted");
    }).toThrow(/Ownership transfer link expired/i);

    // The failed statement must not change request status.
    expect(getTransfer()).toMatchObject({
      status: "pending",
      resolved_at: null,
    });

    expect(getAdmin("owner-id").role_id).toBe(1);
    expect(getAdmin("recipient-id").role_id).toBe(2);
    expect(activeOwnerCount()).toBe(1);
  });

  it.each([
    "owner-id",
    "recipient-id",
  ])("rejects acceptance if %s becomes suspended", (adminId) => {
    insertPendingTransfer();

    db.prepare(
      `UPDATE admin_user
       SET status = 'suspended'
       WHERE id = ?1`,
    ).run(adminId);

    expect(() => {
      resolveTransfer("accepted");
    }).toThrow(
      /Ownership transfer accounts are no longer eligible/i,
    );

    expect(getTransfer().status).toBe("pending");

    expect(getAdmin("owner-id").role_id).toBe(1);
    expect(getAdmin("recipient-id").role_id).toBe(2);
  });

  it("prevents replay after successful acceptance", () => {
    insertPendingTransfer();

    resolveTransfer("accepted");

    expect(() => {
      resolveTransfer("accepted");
    }).toThrow(
      /Invalid ownership transfer status transition/i,
    );

    expect(getTransfer().status).toBe("accepted");
    expect(activeOwnerCount()).toBe(1);
  });

  it("prevents reopening a declined request", () => {
    insertPendingTransfer();

    resolveTransfer("declined");

    expect(() => {
      db.prepare(
        `UPDATE ownership_transfer_request
         SET status = 'pending',
             resolved_at = NULL
         WHERE id = ?1`,
      ).run("transfer-1");
    }).toThrow(
      /Invalid ownership transfer status transition/i,
    );

    expect(getTransfer().status).toBe("declined");
  });

  it("rolls back both accounts if recipient promotion fails", () => {
    insertPendingTransfer();

    // Inject a deliberate failure into this isolated database.
    // The previous Owner's demotion must also roll back.
    db.exec(`
      CREATE TRIGGER simulated_promotion_failure
      BEFORE UPDATE OF role_id ON admin_user
      WHEN OLD.id = 'recipient-id'
        AND NEW.role_id = 1
      BEGIN
        SELECT RAISE(
          ABORT,
          'Simulated recipient promotion failure'
        );
      END;
    `);

    expect(() => {
      resolveTransfer("accepted");
    }).toThrow(/Simulated recipient promotion failure/i);

    // Every change from the failed statement rolls back.
    expect(getAdmin("owner-id")).toMatchObject({
      role_id: 1,
      session_version: 3,
    });

    expect(getAdmin("recipient-id")).toMatchObject({
      role_id: 2,
      session_version: 7,
    });

    expect(getTransfer()).toMatchObject({
      status: "pending",
      resolved_at: null,
    });

    expect(activeOwnerCount()).toBe(1);
  });

  it("prevents directly promoting a second Owner", () => {
    expect(() => {
      db.prepare(
        `UPDATE admin_user
         SET role_id = 1,
             can_invite_users = 0
         WHERE id = 'recipient-id'`,
      ).run();
    }).toThrow(/UNIQUE constraint failed/i);

    expect(getAdmin("owner-id").role_id).toBe(1);
    expect(getAdmin("recipient-id").role_id).toBe(2);
    expect(activeOwnerCount()).toBe(1);
  });
});
