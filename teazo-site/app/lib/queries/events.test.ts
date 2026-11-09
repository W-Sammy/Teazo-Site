/**
 * Tests database-query behavior for Admin Events.
 *
 * Coverage includes:
 * - Event listing and result mapping.
 * - Square catalog environment and target associations.
 * - Active-event date filtering.
 * - Event existence checks.
 * - Event creation and updates.
 * - Image metadata and safe replacement.
 * - Individual and bulk soft deletion.
 *
 * D1 prepare() and batch() are mocked. Tests inspect the SQL
 * statements and bound parameters without modifying a database.
 *
 * Square environment selection and public media URLs are also
 * mocked to keep these tests deterministic.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { batch, prepare } from "@/app/lib/d1";
import { toPublicUrl } from "@/app/lib/media";
import { getSquareEnvironment } from "@/app/lib/square-config";
import {
  createEvent,
  eventExists,
  listActiveEvents,
  listEvents,
  softDeleteEndedEvents,
  softDeleteEvent,
  updateEvent,
  type EventInput,
} from "./events";

// Mock D1 so tests can inspect the generated statements
// without connecting to Cloudflare or the local D1 proxy.
vi.mock("@/app/lib/d1", () => ({
  batch: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock("@/app/lib/media", () => ({
  toPublicUrl: vi.fn(
    (key: string) => `https://media.example/${key}`,
  ),
}));

vi.mock("@/app/lib/square-config", () => ({
  getSquareEnvironment: vi.fn(() => "sandbox"),
}));

// Capture SQL and bound arguments for assertions.
type CapturedStatement = {
  sql: string;
  args: unknown[];
};

const statements: CapturedStatement[] = [];

// Each array supplies successive mock query responses.
// This allows tests to control multiple D1 operations.
let allResults: unknown[] = [];
let firstResults: unknown[] = [];
let runResults: unknown[] = [];

const START = "2026-11-01T18:00:00.000Z";
const END = "2026-11-01T21:00:00.000Z";

// Return a complete, valid event input that individual
// test cases can customize with partial overrides.
function input(
  overrides: Partial<EventInput> = {},
): EventInput {
  return {
    name: "Fall Special",
    description: "Seasonal promotion",
    startAt: START,
    endAt: END,
    appliesToAll: false,
    categoryIds: ["category-1"],
    itemIds: ["item-1"],
    ...overrides,
  };
}

// Model a database event row before mapping it into
// the public AdminEvent representation.
function eventRow(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "event-1",
    name: "Fall Special",
    description: "Seasonal promotion",
    start_at: START,
    end_at: END,
    applies_to_all: 0,
    image_r2_key: null,
    ...overrides,
  };
}

// Locate a generated SQL statement by its text.
function statementContaining(text: string) {
  return statements.find((statement) =>
    statement.sql.includes(text),
  );
}

// Reusable replacement-image metadata for tests that
// verify media insertion and cleanup scheduling.
const newMedia = {
  id: "media-new",
  stored: {
    bucket: "teazo-media",
    key: "events/new.png",
    size: 3,
  },
  mimeType: "image/png",
  originalFilename: "new.png",
  adminId: "admin-1",
};

describe("Event database queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    statements.length = 0;
    allResults = [];
    firstResults = [];
    runResults = [];

    vi.mocked(getSquareEnvironment).mockReturnValue("sandbox");

    // Implement a minimal D1 statement interface.
    // Calls to bind(), all(), first(), and run() are
    // recorded or resolved with test-controlled results.
    vi.mocked(prepare).mockImplementation((sql) => {
      const captured: CapturedStatement = {
        sql: String(sql),
        args: [],
      };

      statements.push(captured);

      const statement = {
        bind(...args: unknown[]) {
          captured.args = args;
          return statement;
        },

        async all() {
          return allResults.length > 0
            ? allResults.shift()
            : { results: [] };
        },

        async first() {
          return firstResults.length > 0
            ? firstResults.shift()
            : null;
        },

        async run() {
          return runResults.length > 0
            ? runResults.shift()
            : { meta: { changes: 1 } };
        },
      };

      return statement as never;
    });

    vi.mocked(batch).mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // Event listing and database result mapping
  // ============================================================

  it("lists nondeleted events", async () => {
    allResults = [
      { results: [eventRow()] },
      { results: [] },
    ];

    const events = await listEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("event-1");

    expect(statements[0].sql).toContain(
      "event.deleted_at IS NULL",
    );
  });

  it("orders events by start date and ID", async () => {
    await listEvents();

    expect(statements[0].sql).toContain(
      "ORDER BY event.start_at ASC, event.id ASC",
    );
  });

  it("returns an empty list when no events exist", async () => {
    const events = await listEvents();

    expect(events).toEqual([]);
  });

  // Events without uploaded images use the Admin Dashboard
  // fallback icon instead of a missing image URL.
  it("uses the fallback image when no event image exists", async () => {
    allResults = [
      { results: [eventRow()] },
      { results: [] },
    ];

    const events = await listEvents();

    expect(events[0].imageUrl).toBe(
      "/admin_icons/admin_svg/teazo_dash_icon.svg",
    );
  });

  it("generates the public image URL for stored media", async () => {
    allResults = [
      {
        results: [
          eventRow({
            image_r2_key: "events/fall.png",
          }),
        ],
      },
      { results: [] },
    ];

    const events = await listEvents();

    expect(toPublicUrl).toHaveBeenCalledWith(
      "events/fall.png",
    );

    expect(events[0].imageUrl).toBe(
      "https://media.example/events/fall.png",
    );
  });

  // D1 stores applies_to_all as an integer; the application
  // must map it to a boolean for the Admin UI.
  it("maps boolean appliesToAll values", async () => {
    allResults = [
      {
        results: [
          eventRow({ applies_to_all: 1 }),
          eventRow({
            id: "event-2",
            applies_to_all: 0,
          }),
        ],
      },
      { results: [] },
    ];

    const events = await listEvents();

    expect(events[0].appliesToAll).toBe(true);
    expect(events[1].appliesToAll).toBe(false);
  });

  // Catalog targets from other events must not be assigned
  // to the event being mapped.
  it("maps category and item targets to their events", async () => {
    allResults = [
      { results: [eventRow()] },
      {
        results: [
          {
            event_id: "event-1",
            target_id: "category-1",
            target_type: "category",
          },
          {
            event_id: "event-1",
            target_id: "item-1",
            target_type: "item",
          },
          {
            event_id: "another-event",
            target_id: "item-unrelated",
            target_type: "item",
          },
        ],
      },
    ];

    const events = await listEvents();

    expect(events[0].categoryIds).toEqual(["category-1"]);
    expect(events[0].itemIds).toEqual(["item-1"]);
  });

  // Sandbox and production Square catalog identifiers are
  // distinct and must not be mixed in target queries.
  it("loads targets for the selected Square environment", async () => {
    vi.mocked(getSquareEnvironment).mockReturnValueOnce(
      "production",
    );

    await listEvents();

    expect(statements[1].args).toEqual(["production"]);
  });

  // ============================================================
  // Active-event date filtering
  // ============================================================

  // Freeze time to verify inclusive start/end boundaries.
  // Events ending exactly now are still active.
  it("filters active events inclusively by start and end time", async () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(
        new Date("2026-10-25T12:00:00.000Z"),
      );

      allResults = [
        {
          results: [
            eventRow({
              id: "active-1",
              start_at: "2026-10-25T12:00:00.000Z",
              end_at: "2026-10-25T12:00:00.000Z",
            }),
            eventRow({
              id: "ended",
              end_at: "2026-10-25T11:59:59.000Z",
            }),
            eventRow({
              id: "upcoming",
              start_at: "2026-10-25T12:00:01.000Z",
            }),
            eventRow({
              id: "active-2",
              start_at: "2026-10-24T12:00:00.000Z",
              end_at: "2026-10-26T12:00:00.000Z",
            }),
          ],
        },
        { results: [] },
      ];

      const active = await listActiveEvents();

      expect(active.map((event) => event.id)).toEqual([
        "active-1",
        "active-2",
      ]);
    } finally {
      // Always restore real timers for other test suites.
      vi.useRealTimers();
    }
  });

  // ============================================================
  // Event existence checks
  // ============================================================

  it("checks whether a nondeleted event exists", async () => {
    firstResults = [{ id: "event-1" }];

    expect(await eventExists("event-1")).toBe(true);

    expect(statements[0].args).toEqual(["event-1"]);

    expect(statements[0].sql).toContain(
      "deleted_at IS NULL",
    );
  });

  it("returns false when an event does not exist", async () => {
    firstResults = [null];

    expect(await eventExists("missing-event")).toBe(false);
  });

  // ============================================================
  // Event creation and Square targeting
  // ============================================================

  it("creates an event and its category/item associations", async () => {
    const id = await createEvent(
      input(),
      "admin-1",
    );

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const eventInsert = statements.find((statement) =>
      /INSERT INTO event\s*\(/.test(statement.sql),
    );

    expect(eventInsert).toBeDefined();

    expect(eventInsert?.args).toEqual([
      id,
      "Fall Special",
      "Seasonal promotion",
      null,
      START,
      END,
      0,
      "admin-1",
    ]);

    expect(statementContaining("INSERT INTO event_category")?.args).toEqual([
      id,
      "category-1",
      "sandbox",
    ]);

    expect(statementContaining("INSERT INTO event_item")?.args).toEqual([
      id,
      "item-1",
      "sandbox",
    ]);

    expect(batch).toHaveBeenCalledOnce();
  });

  // Duplicate target IDs should not generate duplicate
  // association records; blank IDs should be discarded.
  it("normalizes duplicate and empty target IDs", async () => {
    await createEvent(
      input({
        categoryIds: [
          " category-1 ",
          "category-1",
          "",
          "  ",
        ],
        itemIds: [
          "item-1",
          " item-1 ",
          "item-2",
        ],
      }),
      "admin-1",
    );

    const categories = statementContaining(
      "INSERT INTO event_category",
    );

    const items = statementContaining(
      "INSERT INTO event_item",
    );

    expect(categories?.args).toEqual([
      expect.any(String),
      "category-1",
      "sandbox",
    ]);

    expect(items?.args).toEqual([
      expect.any(String),
      "item-1",
      "sandbox",
      expect.any(String),
      "item-2",
      "sandbox",
    ]);
  });

  // All-item promotions do not require explicit category
  // or product association records.
  it("does not create individual targets when appliesToAll is true", async () => {
    await createEvent(
      input({ appliesToAll: true }),
      "admin-1",
    );

    expect(
      statementContaining("INSERT INTO event_category"),
    ).toBeUndefined();

    expect(
      statementContaining("INSERT INTO event_item"),
    ).toBeUndefined();
  });

  it("saves media metadata with a newly created event", async () => {
    await createEvent(
      input(),
      "admin-1",
      newMedia as never,
    );

    const mediaInsert = statementContaining(
      "INSERT INTO media_asset",
    );

    expect(mediaInsert?.args).toEqual([
      "media-new",
      "teazo-media",
      "events/new.png",
      "image/png",
      3,
      "new.png",
      "admin-1",
    ]);

    const eventInsert = statements.find((statement) =>
      /INSERT INTO event\s*\(/.test(statement.sql),
    );

    expect(eventInsert?.args[3]).toBe("media-new");
  });

  // ============================================================
  // Event editing and association replacement
  // ============================================================

  it("returns false instead of updating a missing event", async () => {
    firstResults = [null];

    const updated = await updateEvent(
      "missing-event",
      input(),
    );

    expect(updated).toBe(false);
    expect(batch).not.toHaveBeenCalled();
  });

  // Updating an event must replace its previous catalog
  // associations rather than append duplicate targets.
  it("updates event details and replaces targeted associations", async () => {
    firstResults = [{ image_media_id: null }];

    const updated = await updateEvent(
      "event-1",
      input({
        name: "Updated Promotion",
        categoryIds: ["category-2"],
        itemIds: [],
      }),
    );

    expect(updated).toBe(true);

    const update = statementContaining("UPDATE event");

    expect(update?.args).toEqual([
      "Updated Promotion",
      "Seasonal promotion",
      null,
      START,
      END,
      0,
      "event-1",
    ]);

    expect(
      statementContaining("DELETE FROM event_category")?.args,
    ).toEqual(["event-1", "sandbox"]);

    expect(
      statementContaining("DELETE FROM event_item")?.args,
    ).toEqual(["event-1", "sandbox"]);

    expect(
      statementContaining("INSERT INTO event_category")?.args,
    ).toEqual([
      "event-1",
      "category-2",
      "sandbox",
    ]);

    expect(batch).toHaveBeenCalledOnce();
  });

  // ============================================================
  // Media replacement and safe cleanup scheduling
  // ============================================================

  // COALESCE preserves the current image when an update
  // does not provide a replacement media ID.
  it("preserves the existing image when no replacement is supplied", async () => {
    firstResults = [
      { image_media_id: "media-existing" },
    ];

    await updateEvent("event-1", input());

    const update = statementContaining("UPDATE event");

    expect(update?.sql).toContain(
      "COALESCE(?3, image_media_id)",
    );

    expect(update?.args[2]).toBeNull();

    expect(
      statementContaining("pending_r2_deletion"),
    ).toBeUndefined();
  });

  // When replacing an image, the old asset is soft-deleted
  // only if no other content references it. Eligible media
  // is queued for later R2 cleanup.
  it("queues replaced event images for safe R2 deletion", async () => {
    firstResults = [
      { image_media_id: "media-old" },
    ];

    await updateEvent(
      "event-1",
      input(),
      newMedia as never,
    );

    const update = statementContaining("UPDATE event");

    expect(update?.args[2]).toBe("media-new");

    const oldMediaUpdate = statements.find((statement) =>
      statement.sql.includes("UPDATE media_asset"),
    );

    expect(oldMediaUpdate?.args).toEqual(["media-old"]);

    expect(oldMediaUpdate?.sql).toContain("NOT EXISTS");

    const queueInsert = statementContaining(
      "INSERT INTO pending_r2_deletion",
    );

    expect(queueInsert?.args).toEqual(["media-old"]);
    expect(batch).toHaveBeenCalledOnce();
  });

  // Reusing the same media ID should not schedule an
  // unnecessary R2 deletion.
  it("does not queue media deletion when the image ID is unchanged", async () => {
    firstResults = [
      { image_media_id: "media-new" },
    ];

    await updateEvent(
      "event-1",
      input(),
      newMedia as never,
    );

    expect(
      statementContaining("INSERT INTO pending_r2_deletion"),
    ).toBeUndefined();
  });

  // ============================================================
  // Individual and ended-event deletion
  // ============================================================

  // Events use soft deletion so records are marked deleted
  // instead of being physically removed.
  it("soft-deletes an existing event", async () => {
    runResults = [{ meta: { changes: 1 } }];

    const deleted = await softDeleteEvent("event-1");

    expect(deleted).toBe(true);

    expect(statements[0].sql).toContain(
      "SET deleted_at",
    );

    expect(statements[0].sql).toContain(
      "deleted_at IS NULL",
    );

    expect(statements[0].args).toEqual(["event-1"]);
  });

  it("returns false when no event was deleted", async () => {
    runResults = [{ meta: { changes: 0 } }];

    expect(await softDeleteEvent("missing")).toBe(false);
  });

  // Bulk cleanup must target only events whose end time
  // has passed, leaving active and upcoming events intact.
  it("soft-deletes only events that have ended", async () => {
    await softDeleteEndedEvents();

    expect(statements[0].sql).toContain(
      "end_at < strftime",
    );

    expect(statements[0].sql).toContain(
      "deleted_at IS NULL",
    );
  });
});
