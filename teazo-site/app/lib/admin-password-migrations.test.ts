import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let db: DatabaseSync;

function migration(filename: string): string {
  return readFileSync(
    join(process.cwd(), "migrations", filename),
    "utf8",
  );
}

function addAdmin(id: string, passwordHash: string | null = null) {
  db.prepare(
    "INSERT INTO admin_user (id, password_hash) VALUES (?, ?)",
  ).run(id, passwordHash);
}

function addToken(
  id: string,
  adminId: string,
  purpose: "setup" | "reset",
  createdAt = 1_800_000_000,
) {
  db.prepare(
    `INSERT INTO admin_password_token (
      id, admin_user_id, token_hash, purpose,
      created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    adminId,
    `hash-${id}`,
    purpose,
    createdAt,
    createdAt + 3600,
  );
}

function token(id: string) {
  return db.prepare(
    `SELECT id, purpose, used_at
     FROM admin_password_token WHERE id = ?`,
  ).get(id) as
    | { id: string; purpose: string; used_at: number | null }
    | undefined;
}

describe("Admin password D1 migrations", () => {
  beforeEach(() => {
    db = new DatabaseSync(":memory:");

    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE admin_user (
        id TEXT PRIMARY KEY NOT NULL,
        password_hash TEXT
      );
    `);

    db.exec(migration("0007_admin_password_tokens.sql"));
    db.exec(migration("0008_consume_password_tokens.sql"));
    db.exec(migration("0009_replace_admin_setup_tokens.sql"));

    addAdmin("admin-1");
    addAdmin("admin-2");
  });

  afterEach(() => {
    db.close();
  });

  it("creates the password token table", () => {
    const row = db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = 'admin_password_token'`,
    ).get();

    expect(row).toBeDefined();
  });

  it("creates both token invalidation triggers", () => {
    const rows = db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' ORDER BY name`,
    ).all() as Array<{ name: string }>;

    const names = rows.map((row) => row.name);

    expect(names).toContain(
      "trg_admin_user_consume_password_tokens",
    );
    expect(names).toContain(
      "trg_replace_admin_setup_tokens",
    );
  });

  it("adds session_version with default zero", () => {
    const row = db.prepare(
      "SELECT session_version FROM admin_user WHERE id = 'admin-1'",
    ).get() as { session_version: number };

    expect(row.session_version).toBe(0);
  });

  it("rejects unsupported token purposes", () => {
    expect(() => {
      db.prepare(
        `INSERT INTO admin_password_token (
          id, admin_user_id, token_hash, purpose,
          created_at, expires_at
        ) VALUES ('bad', 'admin-1', 'bad-hash', 'other', 100, 200)`,
      ).run();
    }).toThrow();
  });

  it("rejects expiration times before creation", () => {
    expect(() => {
      db.prepare(
        `INSERT INTO admin_password_token (
          id, admin_user_id, token_hash, purpose,
          created_at, expires_at
        ) VALUES ('bad', 'admin-1', 'bad-hash', 'reset', 200, 100)`,
      ).run();
    }).toThrow();
  });

  it("rejects duplicate token hashes", () => {
    addToken("token-1", "admin-1", "reset");

    expect(() => {
      db.prepare(
        `INSERT INTO admin_password_token (
          id, admin_user_id, token_hash, purpose,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        "token-2",
        "admin-1",
        "hash-token-1",
        "reset",
        100,
        200,
      );
    }).toThrow();
  });

  it("invalidates an older setup link when a replacement is issued", () => {
    addToken("setup-old", "admin-1", "setup");
    addToken("setup-new", "admin-1", "setup", 1_800_000_100);

    expect(token("setup-old")?.used_at).not.toBeNull();
    expect(token("setup-new")?.used_at).toBeNull();
  });

  it("does not invalidate setup tokens belonging to another admin", () => {
    addToken("admin-2-setup", "admin-2", "setup");
    addToken("admin-1-old", "admin-1", "setup");
    addToken("admin-1-new", "admin-1", "setup");

    expect(token("admin-2-setup")?.used_at).toBeNull();
    expect(token("admin-1-old")?.used_at).not.toBeNull();
  });

  it("does not invalidate reset tokens when inserting another reset token", () => {
    addToken("reset-1", "admin-1", "reset");
    addToken("reset-2", "admin-1", "reset");

    expect(token("reset-1")?.used_at).toBeNull();
    expect(token("reset-2")?.used_at).toBeNull();
  });

  it("invalidates all outstanding tokens after a password change", () => {
    addToken("setup-1", "admin-1", "setup");
    addToken("reset-1", "admin-1", "reset");
    addToken("reset-2", "admin-1", "reset");

    db.prepare(
      `UPDATE admin_user
       SET password_hash = 'new-hash',
           session_version = session_version + 1
       WHERE id = 'admin-1'`,
    ).run();

    expect(token("setup-1")?.used_at).not.toBeNull();
    expect(token("reset-1")?.used_at).not.toBeNull();
    expect(token("reset-2")?.used_at).not.toBeNull();

    const row = db.prepare(
      "SELECT session_version FROM admin_user WHERE id = 'admin-1'",
    ).get() as { session_version: number };

    expect(row.session_version).toBe(1);
  });

  it("does not consume tokens when the password hash is unchanged", () => {
    addAdmin("admin-3", "existing-hash");
    addToken("reset-3", "admin-3", "reset");

    db.prepare(
      `UPDATE admin_user
       SET password_hash = 'existing-hash'
       WHERE id = 'admin-3'`,
    ).run();

    expect(token("reset-3")?.used_at).toBeNull();
  });

  it("does not consume another admin's tokens", () => {
    addToken("admin-1-reset", "admin-1", "reset");
    addToken("admin-2-reset", "admin-2", "reset");

    db.prepare(
      `UPDATE admin_user SET password_hash = 'changed'
       WHERE id = 'admin-1'`,
    ).run();

    expect(token("admin-1-reset")?.used_at).not.toBeNull();
    expect(token("admin-2-reset")?.used_at).toBeNull();
  });

  it("deletes tokens when the owning admin is deleted", () => {
    addToken("delete-test", "admin-1", "reset");

    db.prepare("DELETE FROM admin_user WHERE id = 'admin-1'").run();

    expect(token("delete-test")).toBeUndefined();
  });
});
