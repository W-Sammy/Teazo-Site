/**
 * Regression tests for migration 0017_optional_event_dates.sql.
 *
 * Verifies that rebuilding the event table preserves:
 * - Existing events, including soft-deleted records.
 * - Original timestamps and administrator references.
 * - Event image references.
 * - Sandbox and production catalog associations.
 * - Foreign keys and indexes.
 * - Event timestamp maintenance.
 * - Referenced-media deletion protection.
 *
 * Uses isolated in-memory SQLite databases.
 * No local D1 or production database is modified.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";

import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationsDirectory = existsSync(resolve("migrations"))
  ? resolve("migrations")
  : resolve("teazo-site/migrations");

const migrationName = "0017_optional_event_dates.sql";

const startAt = "2026-11-01T18:00:00.000Z";
const endAt = "2026-12-01T18:00:00.000Z";
const originalCreatedAt = "2026-10-01T12:00:00.000Z";
const originalUpdatedAt = "2026-10-02T12:00:00.000Z";
const originalDeletedAt = "2026-10-03T12:00:00.000Z";

let db: DatabaseSync;

// Apply every migration that precedes 0017.
// This also accommodates migration 0016 once the
// category visibility changes are merged into dev.
function createPreMigrationDatabase() {
  const database = new DatabaseSync(":memory:");

  database.exec("PRAGMA foreign_keys = ON");

  const migrations = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (!migrations.includes(migrationName)) {
    database.close();

    throw new Error(
      `Required migration not found: ${migrationName}`,
    );
  }

  try {
    for (const migration of migrations) {
      if (migration === migrationName) {
        break;
      }

      database.exec(
        readFileSync(
          join(migrationsDirectory, migration),
          "utf8",
        ),
      );
    }

    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

// Apply the actual migration inside a transaction,
// matching the atomic behavior expected of a D1 migration.
function applyMigration() {
  const migration = readFileSync(
    join(migrationsDirectory, migrationName),
    "utf8",
  );

  db.exec("BEGIN");

  try {
    db.exec(migration);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Populate a realistic pre-migration database with an
// administrator, event image, scheduled event, deleted event,
// and catalog associations in both Square environments.
function populateExistingData() {
  db.prepare(
    `INSERT INTO admin_user
      (id, email, email_normalized, username, role_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    "migration-admin",
    "migration-test@example.com",
    "migration-test@example.com",
    "Migration Test Admin",
    2,
  );

  db.prepare(
    `INSERT INTO media_asset
      (
        id,
        r2_bucket,
        r2_key,
        mime_type,
        byte_size,
        original_filename,
        purpose,
        uploaded_by
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "migration-media",
    "teazo-media",
    "events/migration-test.png",
    "image/png",
    1024,
    "migration-test.png",
    "event",
    "migration-admin",
  );

  db.prepare(
    `INSERT INTO event
      (
        id,
        name,
        description,
        image_media_id,
        start_at,
        end_at,
        applies_to_all,
        created_at,
        updated_at,
        created_by,
        deleted_at
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "migration-event",
    "Existing Promotion",
    "Existing promotion description",
    "migration-media",
    startAt,
    endAt,
    0,
    originalCreatedAt,
    originalUpdatedAt,
    "migration-admin",
    null,
  );

  db.prepare(
    `INSERT INTO event
      (
        id,
        name,
        start_at,
        end_at,
        created_at,
        updated_at,
        created_by,
        deleted_at
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "migration-deleted-event",
    "Previously Deleted Promotion",
    startAt,
    endAt,
    originalCreatedAt,
    originalUpdatedAt,
    "migration-admin",
    originalDeletedAt,
  );

  for (const environment of ["sandbox", "production"]) {
    db.prepare(
      `INSERT INTO event_item
        (event_id, square_catalog_object_id, square_env)
       VALUES (?, ?, ?)`,
    ).run(
      "migration-event",
      `${environment}-item`,
      environment,
    );

    db.prepare(
      `INSERT INTO event_category
        (event_id, square_category_id, square_env)
       VALUES (?, ?, ?)`,
    ).run(
      "migration-event",
      `${environment}-category`,
      environment,
    );
  }

  // Deleted events may still have associated records.
  // These must also survive the table rebuild.
  db.prepare(
    `INSERT INTO event_item
      (event_id, square_catalog_object_id, square_env)
     VALUES (?, ?, ?)`,
  ).run(
    "migration-deleted-event",
    "deleted-event-item",
    "sandbox",
  );

  db.prepare(
    `INSERT INTO event_category
      (event_id, square_category_id, square_env)
     VALUES (?, ?, ?)`,
  ).run(
    "migration-deleted-event",
    "deleted-event-category",
    "sandbox",
  );
}

// Capture complete rows rather than relying only on counts.
function snapshotEventData() {
  return {
    events: db.prepare(
      "SELECT * FROM event ORDER BY id",
    ).all(),

    items: db.prepare(
      `SELECT *
         FROM event_item
        ORDER BY event_id, square_env,
                 square_catalog_object_id`,
    ).all(),

    categories: db.prepare(
      `SELECT *
         FROM event_category
        ORDER BY event_id, square_env,
                 square_category_id`,
    ).all(),

    media: db.prepare(
      "SELECT * FROM media_asset WHERE id = ?",
    ).get("migration-media"),

    admin: db.prepare(
      "SELECT * FROM admin_user WHERE id = ?",
    ).get("migration-admin"),
  };
}

beforeEach(() => {
  db = createPreMigrationDatabase();
  populateExistingData();
});

afterEach(() => {
  db?.close();
});

describe("0017 optional event dates migration", () => {
  // Confirm that the test starts with the original schema
  // and that migration 0017 removes both NOT NULL constraints.
  it("makes event dates nullable while keeping name required", () => {
    const before = db.prepare(
      "PRAGMA table_info(event)",
    ).all();

    expect(
      before.find((column) => column.name === "start_at"),
    ).toMatchObject({
      notnull: 1,
    });

    expect(
      before.find((column) => column.name === "end_at"),
    ).toMatchObject({
      notnull: 1,
    });

    applyMigration();

    const after = db.prepare(
      "PRAGMA table_info(event)",
    ).all();

    expect(
      after.find((column) => column.name === "start_at"),
    ).toMatchObject({
      notnull: 0,
    });

    expect(
      after.find((column) => column.name === "end_at"),
    ).toMatchObject({
      notnull: 0,
    });

    expect(
      after.find((column) => column.name === "name"),
    ).toMatchObject({
      notnull: 1,
    });
  });

  // Compare complete pre-migration and post-migration
  // records, including timestamps, deleted events, image
  // references, administrators, and catalog associations.
  it("preserves all existing event records and related data", () => {
    const before = snapshotEventData();

    expect(before.events).toHaveLength(2);
    expect(before.items).toHaveLength(3);
    expect(before.categories).toHaveLength(3);

    expect(
      db.prepare("PRAGMA foreign_key_check").all(),
    ).toEqual([]);

    applyMigration();

    expect(snapshotEventData()).toEqual(before);

    expect(
      db.prepare("PRAGMA foreign_key_check").all(),
    ).toEqual([]);
  });

  // Confirm that the rebuilt tables still enforce their
  // original references to events, media, and administrators.
  it("preserves foreign-key constraints", () => {
    applyMigration();

    expect(
      db.prepare("PRAGMA foreign_keys").get(),
    ).toMatchObject({
      foreign_keys: 1,
    });

    expect(() =>
      db.prepare(
        `INSERT INTO event_item
          (event_id, square_catalog_object_id, square_env)
         VALUES (?, ?, ?)`,
      ).run(
        "nonexistent-event",
        "orphan-item",
        "sandbox",
      ),
    ).toThrow(/FOREIGN KEY constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO event_category
          (event_id, square_category_id, square_env)
         VALUES (?, ?, ?)`,
      ).run(
        "nonexistent-event",
        "orphan-category",
        "sandbox",
      ),
    ).toThrow(/FOREIGN KEY constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO event (id, name, image_media_id)
         VALUES (?, ?, ?)`,
      ).run(
        "invalid-media-event",
        "Invalid Media",
        "nonexistent-media",
      ),
    ).toThrow(/FOREIGN KEY constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO event (id, name, created_by)
         VALUES (?, ?, ?)`,
      ).run(
        "invalid-admin-event",
        "Invalid Admin",
        "nonexistent-admin",
      ),
    ).toThrow(/FOREIGN KEY constraint failed/);

    expect(
      db.prepare("PRAGMA foreign_key_check").all(),
    ).toEqual([]);
  });

  // Deleting an event must still cascade to its item and
  // category records without affecting unrelated events.
  it("preserves cascading deletion of event associations", () => {
    applyMigration();

    db.prepare(
      "DELETE FROM event WHERE id = ?",
    ).run("migration-event");

    expect(
      db.prepare(
        "SELECT * FROM event_item WHERE event_id = ?",
      ).all("migration-event"),
    ).toEqual([]);

    expect(
      db.prepare(
        "SELECT * FROM event_category WHERE event_id = ?",
      ).all("migration-event"),
    ).toEqual([]);

    expect(
      db.prepare(
        "SELECT * FROM event_item WHERE event_id = ?",
      ).all("migration-deleted-event"),
    ).toHaveLength(1);

    expect(
      db.prepare(
        "SELECT * FROM event_category WHERE event_id = ?",
      ).all("migration-deleted-event"),
    ).toHaveLength(1);
  });

  // Verify that all original explicit event indexes survive.
  it("restores the event and catalog association indexes", () => {
    const query = `
      SELECT name, tbl_name, sql
        FROM sqlite_master
       WHERE type = 'index'
         AND tbl_name IN (
           'event',
           'event_item',
           'event_category'
         )
         AND sql IS NOT NULL
       ORDER BY name
    `;

    const before = db.prepare(query).all();

    applyMigration();

    const after = db.prepare(query).all();

    expect(
      after.map(({ name, tbl_name }) => ({
        name,
        tbl_name,
      })),
    ).toEqual(
      before.map(({ name, tbl_name }) => ({
        name,
        tbl_name,
      })),
    );

    expect(after.map((index) => index.name)).toEqual([
      "ix_event_category_by_category",
      "ix_event_item_by_item",
      "ix_event_start",
    ]);

    // The event index must remain a partial index.
    const startIndex = after.find(
      (index) => index.name === "ix_event_start",
    );

    expect(startIndex?.sql).toMatch(
      /WHERE\s+deleted_at IS NULL/i,
    );
  });

  // The event timestamp trigger must still run after the
  // table has been replaced by the migration.
  it("preserves automatic event modification timestamps", () => {
    applyMigration();

    db.prepare(
      "UPDATE event SET name = ? WHERE id = ?",
    ).run(
      "Updated Promotion",
      "migration-event",
    );

    const event = db.prepare(
      `SELECT name, created_at, updated_at
         FROM event
        WHERE id = ?`,
    ).get("migration-event");

    expect(event).toMatchObject({
      name: "Updated Promotion",
      created_at: originalCreatedAt,
    });

    expect(event?.updated_at).not.toBe(originalUpdatedAt);

    expect(
      Number.isFinite(
        Date.parse(String(event?.updated_at)),
      ),
    ).toBe(true);
  });

  // Regression test for the trigger dependency that
  // caused the first local migration attempt to fail.
  it("preserves the referenced-media soft deletion guard", () => {
    applyMigration();

    expect(() =>
      db.prepare(
        `UPDATE media_asset
            SET deleted_at = ?
          WHERE id = ?`,
      ).run(
        "2026-12-01T00:00:00.000Z",
        "migration-media",
      ),
    ).toThrow(/media_asset is still referenced/);

    const media = db.prepare(
      "SELECT deleted_at FROM media_asset WHERE id = ?",
    ).get("migration-media");

    expect(media?.deleted_at).toBeNull();

    // Once the referencing event is soft-deleted,
    // the original guard permits media retirement.
    db.prepare(
      "UPDATE event SET deleted_at = ? WHERE id = ?",
    ).run(
      "2026-12-01T00:00:00.000Z",
      "migration-event",
    );

    expect(() =>
      db.prepare(
        "UPDATE media_asset SET deleted_at = ? WHERE id = ?",
      ).run(
        "2026-12-01T00:00:00.000Z",
        "migration-media",
      ),
    ).not.toThrow();
  });

  // Newly created events must support every optional-date
  // combination after upgrading an already populated database.
  it("accepts all optional date combinations after upgrading", () => {
    applyMigration();

    const insert = db.prepare(
      `INSERT INTO event
        (id, name, start_at, end_at)
       VALUES (?, ?, ?, ?)`,
    );

    insert.run(
      "no-dates",
      "No Dates",
      null,
      null,
    );

    insert.run(
      "start-only",
      "Start Only",
      startAt,
      null,
    );

    insert.run(
      "end-only",
      "End Only",
      null,
      endAt,
    );

    insert.run(
      "both-dates",
      "Both Dates",
      startAt,
      endAt,
    );

    const events = db.prepare(
      `SELECT id, start_at, end_at
         FROM event
        WHERE id IN (
          'no-dates',
          'start-only',
          'end-only',
          'both-dates'
        )
        ORDER BY id`,
    ).all();

    expect(events).toEqual([
      {
        id: "both-dates",
        start_at: startAt,
        end_at: endAt,
      },
      {
        id: "end-only",
        start_at: null,
        end_at: endAt,
      },
      {
        id: "no-dates",
        start_at: null,
        end_at: null,
      },
      {
        id: "start-only",
        start_at: startAt,
        end_at: null,
      },
    ]);
  });

  // The migration must not weaken chronological validation
  // or remove the requirement for an event name.
  it("retains chronological and required-name constraints", () => {
    applyMigration();

    expect(() =>
      db.prepare(
        `INSERT INTO event
          (id, name, start_at, end_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        "reversed-dates",
        "Invalid Dates",
        endAt,
        startAt,
      ),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        "INSERT INTO event (id) VALUES (?)",
      ).run("missing-name"),
    ).toThrow(/NOT NULL constraint failed/);
  });

  // A completed migration must not leave temporary
  // replacement or backup tables behind.
  it("removes all temporary migration tables", () => {
    applyMigration();

    const temporaryTables = db.prepare(
      `SELECT name
         FROM sqlite_master
        WHERE name IN (
          'event_new',
          'event_item_backup',
          'event_category_backup'
        )`,
    ).all();

    expect(temporaryTables).toEqual([]);
  });
});