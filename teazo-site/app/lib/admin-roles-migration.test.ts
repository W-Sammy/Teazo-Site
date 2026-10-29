import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TZ-485: Verify migration of legacy Owner, Can Edit, and Can View
// accounts without connecting to the actual local or production D1.
//
// Each test creates an independent in-memory SQLite database,
// seeds representative legacy accounts, and executes the real
// 0010_admin_roles.sql migration from the repository.

type AdminSnapshot = {
  id: string;
  email: string;
  email_normalized: string;
  username: string;
  role_id: number;
  can_invite_users: number;
  password_hash: string | null;
  session_version: number;
  status: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  deleted_at: string | null;
};

let db: DatabaseSync;

// Read the actual migration rather than duplicating its SQL
// inside the test. This detects future migration regressions.
function migrationSql(): string {
  return readFileSync(
    join(process.cwd(), "migrations", "0010_admin_roles.sql"),
    "utf8",
  );
}

// Reproduce the relevant legacy role/account structure,
// including foreign keys and legacy permission constraints.
//
// This intentionally models only the schema needed for
// role migration; it does not recreate the entire TEAZO D1.
function createLegacySchema() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE role (
      id INTEGER PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      rank INTEGER NOT NULL
    );

    CREATE TABLE admin_user (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      email_normalized TEXT NOT NULL,
      username TEXT NOT NULL,

      role_id INTEGER NOT NULL
        REFERENCES role(id) ON DELETE RESTRICT,

      can_invite_users INTEGER NOT NULL DEFAULT 0
        CHECK (can_invite_users IN (0, 1))
        CHECK (can_invite_users = 0 OR role_id = 2),

      password_hash TEXT,
      session_version INTEGER NOT NULL DEFAULT 0,

      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'invited', 'suspended')),

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT,
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX ux_admin_user_email
      ON admin_user(email_normalized)
      WHERE deleted_at IS NULL;

    CREATE UNIQUE INDEX ux_admin_user_single_owner
      ON admin_user(role_id)
      WHERE role_id = 1 AND deleted_at IS NULL;
  `);
}

// These are the three original TEAZO roles.
function seedLegacyRoles() {
  db.exec(`
    INSERT INTO role (id, key, label, rank)
    VALUES
      (1, 'owner', 'Owner', 10),
      (2, 'edit', 'Can Edit', 20),
      (3, 'view', 'Can View', 30);
  `);
}

// Seed accounts with distinct IDs, emails, credentials,
// statuses, and permission values to detect data loss.
function seedLegacyAccounts() {
  const insert = db.prepare(`
    INSERT INTO admin_user (
      id,
      email,
      email_normalized,
      username,
      role_id,
      can_invite_users,
      password_hash,
      session_version,
      status,
      created_at,
      updated_at,
      last_login_at,
      deleted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createdAt = "2026-09-01T12:00:00.000Z";
  const updatedAt = "2026-09-20T12:00:00.000Z";
  const lastLoginAt = "2026-09-21T12:00:00.000Z";
  const deletedAt = "2026-09-22T12:00:00.000Z";

  const accounts = [
    {
      id: "legacy-owner",
      username: "Legacy Owner",
      role: 1,
      canInvite: 0,
      status: "active",
      deletedAt: null,
    },
    {
      id: "legacy-can-edit",
      username: "Legacy Can Edit",
      role: 2,
      canInvite: 1,
      status: "active",
      deletedAt: null,
    },
    {
      id: "legacy-can-view",
      username: "Legacy Can View",
      role: 3,
      canInvite: 0,
      status: "active",
      deletedAt: null,
    },
    {
      id: "legacy-invited-viewer",
      username: "Invited Can View",
      role: 3,
      canInvite: 0,
      status: "invited",
      deletedAt: null,
    },
    {
      id: "legacy-deleted-viewer",
      username: "Deleted Can View",
      role: 3,
      canInvite: 0,
      status: "active",
      deletedAt,
    },
  ];

  for (const account of accounts) {
    const email = `${account.id}@example.invalid`;

    insert.run(
      account.id,
      email,
      email,
      account.username,
      account.role,
      account.canInvite,
      `test-hash-${account.id}`,
      3,
      account.status,
      createdAt,
      updatedAt,
      lastLoginAt,
      account.deletedAt,
    );
  }
}

// Capture all representative account columns so the test
// can compare their values before and after migration.
function getAccounts(): AdminSnapshot[] {
  return db.prepare(`
    SELECT
      id,
      email,
      email_normalized,
      username,
      role_id,
      can_invite_users,
      password_hash,
      session_version,
      status,
      created_at,
      updated_at,
      last_login_at,
      deleted_at
    FROM admin_user
    ORDER BY id
  `).all() as unknown as AdminSnapshot[];
}

function runMigration() {
  db.exec(migrationSql());
}

describe("TZ-485 legacy administrator role migration", () => {
  beforeEach(() => {
    db = new DatabaseSync(":memory:");

    createLegacySchema();
    seedLegacyRoles();
    seedLegacyAccounts();
  });

  afterEach(() => {
    db.close();
  });

  // Validate each legacy role's resulting database role.
  it("preserves Owner and converts Can Edit and Can View to Admin", () => {
    runMigration();

    const roles = Object.fromEntries(
      getAccounts().map((account) => [
        account.id,
        account.role_id,
      ]),
    );

    expect(roles).toEqual({
      "legacy-can-edit": 2,
      "legacy-can-view": 2,
      "legacy-deleted-viewer": 2,
      "legacy-invited-viewer": 2,
      "legacy-owner": 1,
    });
  });

  // Only role and legacy management flags may change.
  // Account identity, credentials, and historical metadata
  // must remain byte-for-byte identical in this fixture.
  it("preserves account IDs, emails, usernames, credentials, and metadata", () => {
    const before = getAccounts();

    runMigration();

    const after = getAccounts();

    expect(after).toHaveLength(before.length);

    const preservedFields = [
      "id",
      "email",
      "email_normalized",
      "username",
      "password_hash",
      "session_version",
      "status",
      "created_at",
      "updated_at",
      "last_login_at",
      "deleted_at",
    ] as const;

    for (const original of before) {
      const migrated = after.find(
        (account) => account.id === original.id,
      );

      expect(migrated).toBeDefined();

      for (const field of preservedFields) {
        expect(migrated?.[field]).toEqual(original[field]);
      }
    }
  });

  // The retired Can View role must no longer exist,
  // and Can Edit must be renamed to Admin.
  it("leaves only the approved Owner and Admin role definitions", () => {
    runMigration();

    const roles = db.prepare(`
      SELECT id, key, label, rank
      FROM role
      ORDER BY id
    `).all();

    expect(roles).toEqual([
      {
        id: 1,
        key: "owner",
        label: "Owner",
        rank: 10,
      },
      {
        id: 2,
        key: "admin",
        label: "Admin",
        rank: 20,
      },
    ]);
  });

  // Management privileges must no longer depend on the
  // retired per-account can_invite_users setting.
  it("clears all legacy administrator-management permission flags", () => {
    const before = getAccounts();

    expect(
      before.find(
        (account) => account.id === "legacy-can-edit",
      )?.can_invite_users,
    ).toBe(1);

    runMigration();

    for (const account of getAccounts()) {
      expect(account.can_invite_users).toBe(0);
    }

    // The existing API authorization tests separately
    // verify that management access requires Owner role 1.
  });

  // Invited and deleted accounts must not be activated,
  // restored, or removed as a side effect of migration.
  it("preserves invited and soft-deleted account states", () => {
    runMigration();

    const accounts = getAccounts();

    const invited = accounts.find(
      (account) => account.id === "legacy-invited-viewer",
    );

    const deleted = accounts.find(
      (account) => account.id === "legacy-deleted-viewer",
    );

    expect(invited?.role_id).toBe(2);
    expect(invited?.status).toBe("invited");
    expect(invited?.deleted_at).toBeNull();

    expect(deleted?.role_id).toBe(2);
    expect(deleted?.deleted_at).toBe(
      "2026-09-22T12:00:00.000Z",
    );
  });

  // Role 3 must have no remaining references before its
  // definition is deleted, and exactly one Owner must remain.
  it("preserves foreign-key integrity and the single-Owner invariant", () => {
    runMigration();

    const violations = db.prepare(
      "PRAGMA foreign_key_check",
    ).all();

    expect(violations).toEqual([]);

    const retiredRoleAccounts = db.prepare(`
      SELECT COUNT(*) AS count
      FROM admin_user
      WHERE role_id = 3
    `).get() as { count: number };

    expect(retiredRoleAccounts.count).toBe(0);

    const activeOwners = db.prepare(`
      SELECT COUNT(*) AS count
      FROM admin_user
      WHERE role_id = 1
        AND deleted_at IS NULL
    `).get() as { count: number };

    expect(activeOwners.count).toBe(1);
  });

  // A repeated migration should not create additional
  // account changes or reintroduce retired roles.
  it("remains safe if the migration SQL is executed again", () => {
    runMigration();

    const afterFirstRun = getAccounts();

    expect(() => runMigration()).not.toThrow();

    expect(getAccounts()).toEqual(afterFirstRun);

    expect(
      db.prepare("SELECT COUNT(*) AS count FROM role").get(),
    ).toEqual({ count: 2 });
  });
});
