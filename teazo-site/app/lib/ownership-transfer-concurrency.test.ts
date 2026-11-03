import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

type SqlParameter = string | number | null;

type SqliteStatement = {
  get: (...params: SqlParameter[]) => unknown;
  run: (...params: SqlParameter[]) => unknown;
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

// Load the real migration from the repository.
// Do not replace its triggers with test-only versions.
const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "migrations",
    "0011_ownership_transfer.sql",
  ),
  "utf8",
);

const TEST_TOKEN = Buffer.alloc(32, 11).toString(
  "base64url",
);

const TEST_HASH = createHash("sha256")
  .update(TEST_TOKEN)
  .digest("hex");

type AdminRow = {
  id: string;
  role_id: number;
  session_version: number;
};

type TransferRow = {
  id: string;
  status: string;
  resolved_at: number | null;
};

let directory: string;
let first: TestDatabase;
let second: TestDatabase;

function currentTime(): number {
  return Math.floor(Date.now() / 1000);
}

function initializeDatabase(db: TestDatabase): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 0;

    CREATE TABLE role (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
    );

    INSERT INTO role (id, name)
    VALUES (1, 'Owner'), (2, 'Admin');

    CREATE TABLE admin_user (
      id TEXT PRIMARY KEY NOT NULL,
      role_id INTEGER NOT NULL REFERENCES role(id),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (
          status IN ('active', 'invited', 'suspended')
        ),
      deleted_at TEXT,
      can_invite_users INTEGER NOT NULL DEFAULT 0
        CHECK (can_invite_users IN (0, 1))
        CHECK (
          can_invite_users = 0 OR role_id = 2
        ),
      session_version INTEGER NOT NULL DEFAULT 0
        CHECK (session_version >= 0)
    );

    CREATE UNIQUE INDEX ux_admin_user_single_owner
      ON admin_user(role_id)
      WHERE role_id = 1
        AND deleted_at IS NULL;

    INSERT INTO admin_user (
      id,
      role_id,
      status,
      can_invite_users,
      session_version
    )
    VALUES
      ('owner-id', 1, 'active', 0, 3),
      ('recipient-id', 2, 'active', 1, 7),
      ('other-admin-id', 2, 'active', 0, 5);
  `);

  db.exec(migrationSql);
}

function insertPending(
  db: TestDatabase,
  id = "transfer-1",
  recipientId = "recipient-id",
): void {
  const now = currentTime();

  const hash = createHash("sha256")
    .update(
      id === "transfer-1"
        ? TEST_TOKEN
        : `synthetic-token-${id}`,
    )
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
     VALUES (
       ?1, 'owner-id', ?2, ?3,
       'pending', ?4, ?5
     )`,
  ).run(
    id,
    recipientId,
    hash,
    now - 60,
    now + 3600,
  );
}

// Match the real application's conditional decision UPDATE.
// The actual migration triggers handle role changes and
// session-version increments when status becomes accepted.
function decide(
  db: TestDatabase,
  decision: "accepted" | "declined",
): boolean {
  const now = currentTime();

  const row = db.prepare(
    `UPDATE ownership_transfer_request
        SET status = ?1,
            resolved_at = ?2
      WHERE token_hash = ?3
        AND recipient_admin_id = ?4
        AND status = 'pending'
        AND expires_at > ?2
        AND EXISTS (
          SELECT 1
            FROM admin_user
           WHERE id =
             ownership_transfer_request.owner_admin_id
             AND role_id = 1
             AND status = 'active'
             AND deleted_at IS NULL
        )
        AND EXISTS (
          SELECT 1
            FROM admin_user
           WHERE id =
             ownership_transfer_request.recipient_admin_id
             AND role_id = 2
             AND status = 'active'
             AND deleted_at IS NULL
        )
     RETURNING id`,
  ).get(
    decision,
    now,
    TEST_HASH,
    "recipient-id",
  );

  return Boolean(row);
}

function getAdmin(
  db: TestDatabase,
  id: string,
): AdminRow {
  const row = db.prepare(
    `SELECT id, role_id, session_version
       FROM admin_user
      WHERE id = ?1`,
  ).get(id);

  if (!row) {
    throw new Error(`Missing synthetic account: ${id}`);
  }

  return row as AdminRow;
}

function getTransfer(db: TestDatabase): TransferRow {
  const row = db.prepare(
    `SELECT id, status, resolved_at
       FROM ownership_transfer_request
      WHERE id = 'transfer-1'`,
  ).get();

  if (!row) {
    throw new Error("Synthetic transfer not found.");
  }

  return row as TransferRow;
}

function ownerCount(db: TestDatabase): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
       FROM admin_user
      WHERE role_id = 1
        AND deleted_at IS NULL`,
  ).get() as { count: number };

  return row.count;
}

function pendingCount(db: TestDatabase): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
       FROM ownership_transfer_request
      WHERE status = 'pending'`,
  ).get() as { count: number };

  return row.count;
}

function expectAcceptedState(db: TestDatabase): void {
  expect(getTransfer(db).status).toBe("accepted");

  expect(getAdmin(db, "owner-id")).toMatchObject({
    role_id: 2,
    session_version: 4,
  });

  expect(getAdmin(db, "recipient-id")).toMatchObject({
    role_id: 1,
    session_version: 8,
  });

  expect(ownerCount(db)).toBe(1);
}

describe("Ownership transfer concurrent SQLite transactions", () => {
  beforeEach(() => {
    // A new temporary database is created for each test.
    directory = mkdtempSync(
      join(tmpdir(), "teazo-transfer-test-"),
    );

    const file = join(directory, "concurrent.sqlite");

    first = new DatabaseSync(file);
    initializeDatabase(first);

    // An independent connection to the same test file.
    second = new DatabaseSync(file);

    second.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 0;
    `);
  });

  afterEach(() => {
    // Roll back any unfinished transaction after a failure.
    try {
      first?.exec("ROLLBACK");
    } catch {
      // No open transaction is normal.
    }

    second?.close();
    first?.close();

    rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  it("does not allow competing acceptance transactions to both succeed", () => {
    insertPending(first);

    // Connection A begins accepting the offer but has
    // not committed its changes yet.
    first.exec("BEGIN IMMEDIATE");

    expect(decide(first, "accepted")).toBe(true);

    // Other connections must not see uncommitted changes.
    expect(getAdmin(second, "owner-id").role_id).toBe(1);
    expect(getAdmin(second, "recipient-id").role_id).toBe(2);
    expect(getTransfer(second).status).toBe("pending");

    // Connection B cannot write while A holds the lock.
    expect(() => {
      decide(second, "accepted");
    }).toThrow(/database is locked|SQLITE_BUSY/i);

    // Complete the first acceptance.
    first.exec("COMMIT");

    // Retrying from B cannot accept the consumed offer.
    expect(decide(second, "accepted")).toBe(false);

    expectAcceptedState(first);
    expectAcceptedState(second);
  });

  it("rolls back an interrupted acceptance completely", () => {
    insertPending(first);

    first.exec("BEGIN IMMEDIATE");

    expect(decide(first, "accepted")).toBe(true);

    // Simulate interruption before commit.
    first.exec("ROLLBACK");

    expect(getTransfer(second)).toMatchObject({
      status: "pending",
      resolved_at: null,
    });

    expect(getAdmin(second, "owner-id")).toMatchObject({
      role_id: 1,
      session_version: 3,
    });

    expect(getAdmin(second, "recipient-id")).toMatchObject({
      role_id: 2,
      session_version: 7,
    });

    expect(ownerCount(second)).toBe(1);

    // The legitimate recipient can still accept after
    // the failed attempt was completely rolled back.
    expect(decide(second, "accepted")).toBe(true);

    expectAcceptedState(second);
  });

  it("does not allow an acceptance to overtake a committed decline", () => {
    insertPending(first);

    first.exec("BEGIN IMMEDIATE");

    expect(decide(first, "declined")).toBe(true);

    // Competing acceptance cannot write concurrently.
    expect(() => {
      decide(second, "accepted");
    }).toThrow(/database is locked|SQLITE_BUSY/i);

    first.exec("COMMIT");

    // The declined offer is permanently unavailable.
    expect(decide(second, "accepted")).toBe(false);

    expect(getTransfer(second).status).toBe("declined");

    expect(getAdmin(second, "owner-id")).toMatchObject({
      role_id: 1,
      session_version: 3,
    });

    expect(getAdmin(second, "recipient-id")).toMatchObject({
      role_id: 2,
      session_version: 7,
    });

    expect(ownerCount(second)).toBe(1);
  });

  it("prevents competing pending offers across two connections", () => {
    first.exec("BEGIN IMMEDIATE");

    insertPending(first);

    // A second connection attempts to create a different
    // pending offer while the first transaction is open.
    expect(() => {
      insertPending(
        second,
        "transfer-2",
        "other-admin-id",
      );
    }).toThrow(/database is locked|SQLITE_BUSY/i);

    first.exec("COMMIT");

    // After the lock is released, the unique pending
    // constraint still prevents the competing offer.
    expect(() => {
      insertPending(
        second,
        "transfer-2",
        "other-admin-id",
      );
    }).toThrow(/UNIQUE constraint failed/i);

    expect(pendingCount(first)).toBe(1);
    expect(pendingCount(second)).toBe(1);
    expect(ownerCount(second)).toBe(1);
  });
});
