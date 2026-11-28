/**
 * SQLite integration tests for event persistence.
 *
 * Covers:
 * - Square environment isolation.
 * - Optional start and end dates.
 * - Event creation and editing.
 * - Active-event filtering.
 * - Ended-event cleanup.
 * - Database constraint enforcement.
 *
 * Uses an isolated in-memory SQLite database with the
 * repository migrations applied. No external services
 * or production databases are accessed.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { sqliteD1 } from "@/test/sqlite-d1";

import {
  createEvent,
  listActiveEvents,
  listEvents,
  softDeleteEndedEvents,
  updateEvent,
  type EventInput,
} from "./events";

vi.mock(
  "@/app/lib/d1",
  async () => (await import("@/test/sqlite-d1")).sqliteD1.module,
);

const input: EventInput = {
  name: "Updated event",
  description: "",
  startAt: "2026-10-01T00:00:00.000Z",
  endAt: "2026-11-01T00:00:00.000Z",
  appliesToAll: false,
  categoryIds: ["new-category"],
  itemIds: ["new-item"],
};

beforeEach(() => {
  sqliteD1.reset();

  for (const id of ["event-1", "event-2"]) {
    sqliteD1.db.prepare(
      "INSERT INTO event (id, name, start_at, end_at) VALUES (?, ?, ?, ?)",
    ).run(id, id, input.startAt, input.endAt);

    for (const environment of ["sandbox", "production"]) {
      sqliteD1.db.prepare(
        "INSERT INTO event_item (event_id, square_catalog_object_id, square_env) VALUES (?, ?, ?)",
      ).run(id, `${environment}-item`, environment);

      sqliteD1.db.prepare(
        "INSERT INTO event_category (event_id, square_category_id, square_env) VALUES (?, ?, ?)",
      ).run(id, `${environment}-category`, environment);
    }
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe.each(["sandbox", "production"] as const)(
  "event targets in %s",
  (environment) => {
    it.each([false, true])(
      "preserves the other environment when appliesToAll is %s",
      async (appliesToAll) => {
        vi.stubEnv("SQUARE_ENVIRONMENT", environment);

        const otherEnvironment =
          environment === "sandbox"
            ? "production"
            : "sandbox";

        expect(
          await updateEvent("event-1", {
            ...input,
            appliesToAll,
          }),
        ).toBe(true);

        const activeEvents = await listEvents();

        expect(
          activeEvents.find(
            (event) => event.id === "event-1",
          ),
        ).toMatchObject({
          appliesToAll,
          itemIds: appliesToAll ? [] : ["new-item"],
          categoryIds: appliesToAll ? [] : ["new-category"],
        });

        expect(
          activeEvents.find(
            (event) => event.id === "event-2",
          ),
        ).toMatchObject({
          itemIds: [`${environment}-item`],
          categoryIds: [`${environment}-category`],
        });

        vi.stubEnv("SQUARE_ENVIRONMENT", otherEnvironment);

        for (const event of await listEvents()) {
          expect(event.itemIds).toEqual([
            `${otherEnvironment}-item`,
          ]);

          expect(event.categoryIds).toEqual([
            `${otherEnvironment}-category`,
          ]);
        }
      },
    );
  },
);

describe("optional event dates in SQLite", () => {
  // Verify that all four date combinations can be
  // persisted by the migrated database schema.
  it.each([
    {
      name: "no dates",
      startAt: null,
      endAt: null,
    },
    {
      name: "start only",
      startAt: input.startAt,
      endAt: null,
    },
    {
      name: "end only",
      startAt: null,
      endAt: input.endAt,
    },
    {
      name: "both dates",
      startAt: input.startAt,
      endAt: input.endAt,
    },
  ])("stores an event with $name", ({
    name,
    startAt,
    endAt,
  }) => {
    sqliteD1.db.prepare(
      `INSERT INTO event
        (id, name, start_at, end_at)
       VALUES (?, ?, ?, ?)`,
    ).run("optional-event", name, startAt, endAt);

    const stored = sqliteD1.db.prepare(
      `SELECT name, start_at, end_at
         FROM event
        WHERE id = ?`,
    ).get("optional-event");

    expect(stored).toMatchObject({
      name,
      start_at: startAt,
      end_at: endAt,
    });
  });

  // Exercise the actual application createEvent query,
  // including its bound null dates and catalog associations.
  it("creates an unscheduled event through the database query", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");

    const adminId = "optional-event-test-admin";

    // Insert a test administrator using the existing
    // administrator schema and seeded Admin role.
    sqliteD1.db.prepare(
      `INSERT INTO admin_user
        (id, email, email_normalized, username, role_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      adminId,
      "event-test@example.com",
      "event-test@example.com",
      "Event Test Admin",
      2,
    );

    const id = await createEvent(
      {
        ...input,
        name: "Unscheduled Promotion",
        startAt: null,
        endAt: null,
      },
      adminId,
    );

    const stored = sqliteD1.db.prepare(
      `SELECT start_at, end_at, created_by
         FROM event
        WHERE id = ?`,
    ).get(id);

    expect(stored).toMatchObject({
      start_at: null,
      end_at: null,
      created_by: adminId,
    });

    const events = await listEvents();

    expect(
      events.find((event) => event.id === id),
    ).toMatchObject({
      name: "Unscheduled Promotion",
      startAt: null,
      endAt: null,
      categoryIds: ["new-category"],
      itemIds: ["new-item"],
    });
  });

  // Clear an existing schedule through the application
  // query and verify that SQLite stores actual NULL values.
  it("clears both dates when updating an existing event", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");

    expect(
      await updateEvent("event-1", {
        ...input,
        startAt: null,
        endAt: null,
      }),
    ).toBe(true);

    const stored = sqliteD1.db.prepare(
      `SELECT start_at, end_at
         FROM event
        WHERE id = ?`,
    ).get("event-1");

    expect(stored).toMatchObject({
      start_at: null,
      end_at: null,
    });

    expect(
      (await listEvents()).find(
        (event) => event.id === "event-1",
      ),
    ).toMatchObject({
      startAt: null,
      endAt: null,
      categoryIds: ["new-category"],
      itemIds: ["new-item"],
    });

    expect(
      sqliteD1.db.prepare(
        "PRAGMA foreign_key_check",
      ).all(),
    ).toEqual([]);
  });

  // Freeze the JavaScript clock to verify all optional
  // scheduling combinations against persisted records.
  it("returns only currently active events with optional dates", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");

    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-11-15T12:00:00.000Z"),
    );

    const past = "2026-11-14T12:00:00.000Z";
    const future = "2026-11-16T12:00:00.000Z";

    const insert = sqliteD1.db.prepare(
      `INSERT INTO event
        (id, name, start_at, end_at)
       VALUES (?, ?, ?, ?)`,
    );

    insert.run("ongoing", "Ongoing", null, null);
    insert.run("started", "Started", past, null);
    insert.run("upcoming", "Upcoming", future, null);
    insert.run("limited", "Limited", null, future);
    insert.run("expired", "Expired", null, past);
    insert.run("scheduled", "Scheduled", past, future);

    const active = await listActiveEvents();

    expect(
      active.map((event) => event.id).sort(),
    ).toEqual([
      "limited",
      "ongoing",
      "scheduled",
      "started",
    ]);
  });

  // Execute the real ended-event cleanup SQL.
  // Use dates safely in the past and future because SQLite
  // evaluates its own clock independently of fake timers.
  it("preserves ongoing events during ended-event cleanup", async () => {
    const past = "2000-01-01T00:00:00.000Z";
    const future = "9999-01-01T00:00:00.000Z";

    const insert = sqliteD1.db.prepare(
      `INSERT INTO event
        (id, name, start_at, end_at)
       VALUES (?, ?, ?, ?)`,
    );

    insert.run("ongoing", "Ongoing", null, null);
    insert.run("started", "Started", past, null);
    insert.run("upcoming", "Upcoming", future, null);
    insert.run("limited", "Limited", null, future);
    insert.run("expired", "Expired", null, past);

    await softDeleteEndedEvents();

    const remaining = sqliteD1.db.prepare(
      `SELECT id
         FROM event
        WHERE deleted_at IS NULL
          AND id IN (
            'ongoing',
            'started',
            'upcoming',
            'limited',
            'expired'
          )
        ORDER BY id`,
    ).all();

    expect(
      remaining.map((row) => row.id),
    ).toEqual([
      "limited",
      "ongoing",
      "started",
      "upcoming",
    ]);

    const expired = sqliteD1.db.prepare(
      `SELECT deleted_at
         FROM event
        WHERE id = ?`,
    ).get("expired");

    expect(expired?.deleted_at).toEqual(
      expect.any(String),
    );
  });

  // Removing mandatory dates must not weaken the
  // database's chronological ordering constraint.
  it("rejects an end date earlier than the start date", () => {
    expect(() =>
      sqliteD1.db.prepare(
        `INSERT INTO event
          (id, name, start_at, end_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        "invalid-event",
        "Invalid event",
        "2026-12-01T00:00:00.000Z",
        "2026-11-01T00:00:00.000Z",
      ),
    ).toThrow(/CHECK constraint failed/);
  });

  // Equal timestamps remain valid at the database level.
  it("accepts equal start and end timestamps", () => {
    const date = "2026-11-01T00:00:00.000Z";

    expect(() =>
      sqliteD1.db.prepare(
        `INSERT INTO event
          (id, name, start_at, end_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        "equal-dates",
        "Equal dates",
        date,
        date,
      ),
    ).not.toThrow();
  });

  // Name must remain nonnullable after the migration.
  it("rejects an event without a name", () => {
    expect(() =>
      sqliteD1.db.prepare(
        `INSERT INTO event
          (id, start_at, end_at)
         VALUES (?, ?, ?)`,
      ).run("missing-name", null, null),
    ).toThrow(/NOT NULL constraint failed/);
  });
});