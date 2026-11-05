/**
 * SQLite integration tests for Teazo menu-item view tracking.
 *
 * Runs the real menu-item view POST endpoint, analytics handler,
 * and analytics SQL against the actual database migrations in
 * an isolated, in-memory SQLite database.
 *
 * Covers persistence, repeat views, item-name updates, shop-local
 * dates, anonymous session isolation, the 30-event rate limit,
 * 10-minute window behavior, and database failures.
 *
 * No live D1 proxy, Square API, production database, or external
 * network service is accessed.
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

// Mock only the external Next.js cookie interface.
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

// Allow the real server-only analytics module to run in Vitest.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

// Execute actual queries through the existing SQLite adapter.
// Export D1Error because the route checks this error type.
vi.mock("@/app/lib/d1", async () => {
  const { sqliteD1 } = await import("@/test/sqlite-d1");

  class D1Error extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = "D1Error";
      this.status = status;
    }
  }

  return {
    ...sqliteD1.module,
    D1Error,
  };
});

// Import the real route and follow its actual persistence chain.
import { POST } from "./route";

const API_URL =
  "http://localhost:3000/api/analytics/menu-item-view";

const SESSION_COOKIE = "teazo_analytics_session";
const ITEM_ID = "SYNTHETIC-ITEM-1";
const ITEM_NAME = "Synthetic Milk Tea";

const FIRST_SESSION = "synthetic-visitor-one";
const SECOND_SESSION = "synthetic-visitor-two";

const START_TIME = "2026-11-04T20:00:00.000Z";

// Type the rows returned by the real SQLite database.
type MetricRow = {
  metric_date: string;
  square_item_id: string;
  item_name_snapshot: string;
  event_count: number;
};

type RateRow = {
  identifier: string;
  window_started_at: string;
  event_count: number;
};

// Simulate the cookie collection returned by Next.js.
// Setting a value changes the visitor represented by later requests.
function setSession(session?: string) {
  mocks.cookies.mockResolvedValue({
    get: (name: string) =>
      name === SESSION_COOKIE && session !== undefined
        ? {
            name,
            value: session,
          }
        : undefined,
  });
}

// Submit a real Request object to the actual POST handler.
// The request never leaves the test process.
function makeRequest(
  itemId: string = ITEM_ID,
  itemName: string = ITEM_NAME,
) {
  return new Request(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      itemId,
      itemName,
    }),
  });
}

// Retrieve actual stored metrics by date and Square item ID.
function getMetric(
  date: string,
  itemId: string = ITEM_ID,
): MetricRow | undefined {
  return sqliteD1.db.prepare(
    `SELECT
       metric_date,
       square_item_id,
       item_name_snapshot,
       event_count
     FROM menu_item_metrics
     WHERE metric_date = ?1
       AND square_item_id = ?2`,
  ).get(date, itemId) as MetricRow | undefined;
}

// Return all persisted menu-item metrics in a stable order.
function getMetrics(): MetricRow[] {
  return sqliteD1.db.prepare(
    `SELECT
       metric_date,
       square_item_id,
       item_name_snapshot,
       event_count
     FROM menu_item_metrics
     ORDER BY metric_date, square_item_id`,
  ).all() as MetricRow[];
}

// Independently derive the identifier used by rate limiting.
function hashSession(session: string) {
  return createHash("sha256")
    .update(session)
    .digest("hex");
}

// Retrieve the actual rate-limit row for one visitor.
function getRateRow(
  session: string,
): RateRow | undefined {
  return sqliteD1.db.prepare(
    `SELECT
       identifier,
       window_started_at,
       event_count
     FROM analytics_rate_limit
     WHERE identifier = ?1`,
  ).get(hashSession(session)) as RateRow | undefined;
}

// Count the total number of session identifiers in SQLite.
function rateRowCount(): number {
  const row = sqliteD1.db.prepare(
    `SELECT COUNT(*) AS count
     FROM analytics_rate_limit`,
  ).get() as { count: number };

  return row.count;
}

// Extract a new anonymous session created by the route.
function getNewSession(response: Response): string {
  const header =
    response.headers.get("set-cookie") ?? "";

  const match = header.match(
    /^teazo_analytics_session=([^;]+);/,
  );

  expect(match).not.toBeNull();

  return match?.[1] ?? "";
}

// Record repeated views through the actual route.
async function recordViews(
  count: number,
  itemId: string = ITEM_ID,
  itemName: string = ITEM_NAME,
) {
  const responses: Response[] = [];

  for (let index = 0; index < count; index++) {
    responses.push(
      await POST(makeRequest(itemId, itemName)),
    );
  }

  return responses;
}

describe("Menu-item tracking SQLite integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Every test receives a new SQLite database with the
    // production schema migrations applied.
    sqliteD1.reset();

    // Freeze time so rate-limit windows and dates are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(START_TIME));

    setSession(FIRST_SESSION);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    sqliteD1.db.close();
  });

  describe("Menu-item view persistence", () => {
    it("persists a view under the shop-local date", async () => {
      const response = await POST(makeRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
      });

      // November 4 at 20:00 UTC is November 4 in Los Angeles.
      expect(getMetric("2026-11-04")).toEqual({
        metric_date: "2026-11-04",
        square_item_id: ITEM_ID,
        item_name_snapshot: ITEM_NAME,
        event_count: 1,
      });

      expect(getRateRow(FIRST_SESSION)?.event_count).toBe(1);
    });

    it("increments repeat views instead of creating duplicate item rows", async () => {
      const responses = await recordViews(3);

      expect(
        responses.map((response) => response.status),
      ).toEqual([200, 200, 200]);

      expect(getMetrics()).toEqual([
        {
          metric_date: "2026-11-04",
          square_item_id: ITEM_ID,
          item_name_snapshot: ITEM_NAME,
          event_count: 3,
        },
      ]);

      expect(getRateRow(FIRST_SESSION)?.event_count).toBe(3);
    });

    it("updates the latest saved item name on a repeat view", async () => {
      await POST(makeRequest(ITEM_ID, "Original Milk Tea"));

      await POST(
        makeRequest(ITEM_ID, "Renamed Milk Tea"),
      );

      expect(getMetric("2026-11-04")).toEqual({
        metric_date: "2026-11-04",
        square_item_id: ITEM_ID,
        item_name_snapshot: "Renamed Milk Tea",
        event_count: 2,
      });
    });

    it("normalizes whitespace before saving the Square ID and name", async () => {
      const response = await POST(
        makeRequest(
          `  ${ITEM_ID}  `,
          `  ${ITEM_NAME}  `,
        ),
      );

      expect(response.status).toBe(200);

      expect(getMetrics()).toEqual([
        {
          metric_date: "2026-11-04",
          square_item_id: ITEM_ID,
          item_name_snapshot: ITEM_NAME,
          event_count: 1,
        },
      ]);
    });

    it("tracks separate Square items independently", async () => {
      await POST(
        makeRequest("SYNTHETIC-ITEM-A", "Tea A"),
      );

      await POST(
        makeRequest("SYNTHETIC-ITEM-A", "Tea A"),
      );

      await POST(
        makeRequest("SYNTHETIC-ITEM-B", "Tea B"),
      );

      expect(
        getMetric(
          "2026-11-04",
          "SYNTHETIC-ITEM-A",
        )?.event_count,
      ).toBe(2);

      expect(
        getMetric(
          "2026-11-04",
          "SYNTHETIC-ITEM-B",
        )?.event_count,
      ).toBe(1);

      expect(getMetrics()).toHaveLength(2);
    });

    it("creates separate daily counts across Pacific midnight", async () => {
      // November 4 at 23:59:59 Pacific Standard Time.
      vi.setSystemTime(
        new Date("2026-11-05T07:59:59.000Z"),
      );

      expect((await POST(makeRequest())).status).toBe(200);

      // One second later, the Los Angeles date is November 5.
      vi.setSystemTime(
        new Date("2026-11-05T08:00:00.000Z"),
      );

      expect((await POST(makeRequest())).status).toBe(200);

      expect(
        getMetric("2026-11-04")?.event_count,
      ).toBe(1);

      expect(
        getMetric("2026-11-05")?.event_count,
      ).toBe(1);

      expect(getMetrics()).toHaveLength(2);
    });

    it("rejects invalid input before writing metrics or consuming the rate limit", async () => {
      const response = await POST(
        new Request(API_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            itemId: "",
            itemName: ITEM_NAME,
          }),
        }),
      );

      expect(response.status).toBe(400);

      expect(getMetrics()).toEqual([]);
      expect(rateRowCount()).toBe(0);
    });
  });

  describe("Rate-limit persistence", () => {
    it("accepts the first 30 events and rejects the 31st", async () => {
      const allowed = await recordViews(30);

      expect(
        allowed.every((response) => response.status === 200),
      ).toBe(true);

      const rejected = await POST(makeRequest());

      expect(rejected.status).toBe(429);

      expect(await rejected.json()).toEqual({
        error: "Analytics rate limit exceeded.",
      });

      // Only accepted views become menu-item metrics.
      expect(
        getMetric("2026-11-04")?.event_count,
      ).toBe(30);

      // The SQL increments the rate-limit counter before checking
      // the 30-event allowance, including the rejected request.
      expect(
        getRateRow(FIRST_SESSION)?.event_count,
      ).toBe(31);
    });

    it("shares one rate limit across different menu items", async () => {
      const first = await recordViews(
        15,
        "SYNTHETIC-ITEM-A",
        "Tea A",
      );

      const second = await recordViews(
        15,
        "SYNTHETIC-ITEM-B",
        "Tea B",
      );

      expect(
        [...first, ...second].every(
          (response) => response.status === 200,
        ),
      ).toBe(true);

      const rejected = await POST(
        makeRequest("SYNTHETIC-ITEM-C", "Tea C"),
      );

      expect(rejected.status).toBe(429);

      expect(
        getMetric(
          "2026-11-04",
          "SYNTHETIC-ITEM-A",
        )?.event_count,
      ).toBe(15);

      expect(
        getMetric(
          "2026-11-04",
          "SYNTHETIC-ITEM-B",
        )?.event_count,
      ).toBe(15);

      expect(
        getMetric(
          "2026-11-04",
          "SYNTHETIC-ITEM-C",
        ),
      ).toBeUndefined();
    });

    it("maintains independent rate limits for separate sessions", async () => {
      await recordViews(30);

      expect(
        (await POST(makeRequest())).status,
      ).toBe(429);

      // A second visitor has a separate hashed identifier
      // and can record a valid view.
      setSession(SECOND_SESSION);

      const response = await POST(makeRequest());

      expect(response.status).toBe(200);

      expect(
        getRateRow(FIRST_SESSION)?.event_count,
      ).toBe(31);

      expect(
        getRateRow(SECOND_SESSION)?.event_count,
      ).toBe(1);

      expect(rateRowCount()).toBe(2);

      // Counts aggregate by item and day, across visitors.
      expect(
        getMetric("2026-11-04")?.event_count,
      ).toBe(31);
    });

    it("preserves the same rate window at exactly ten minutes", async () => {
      await recordViews(30);

      vi.setSystemTime(
        new Date("2026-11-04T20:10:00.000Z"),
      );

      const response = await POST(makeRequest());

      // SQL resets only when the saved start is strictly older
      // than the calculated ten-minute cutoff.
      expect(response.status).toBe(429);

      expect(
        getMetric("2026-11-04")?.event_count,
      ).toBe(30);
    });

    it("starts a new rate window after ten minutes have elapsed", async () => {
      await recordViews(30);

      // One millisecond beyond the previous ten-minute boundary.
      vi.setSystemTime(
        new Date("2026-11-04T20:10:00.001Z"),
      );

      const response = await POST(makeRequest());

      expect(response.status).toBe(200);

      expect(
        getRateRow(FIRST_SESSION)?.event_count,
      ).toBe(1);

      expect(
        getRateRow(FIRST_SESSION)?.window_started_at,
      ).toBe("2026-11-04T20:10:00.001Z");

      expect(
        getMetric("2026-11-04")?.event_count,
      ).toBe(31);
    });
  });

  describe("Anonymous session persistence", () => {
    it("uses a hashed identifier for a newly created session", async () => {
      // A first-time visitor has no previous analytics cookie.
      setSession(undefined);

      const response = await POST(makeRequest());

      expect(response.status).toBe(200);

      const session = getNewSession(response);

      expect(session).toBeTruthy();

      const stored = getRateRow(session);

      expect(stored).toBeDefined();
      expect(stored?.identifier).toBe(
        hashSession(session),
      );

      expect(stored?.identifier).toMatch(
        /^[0-9a-f]{64}$/,
      );

      expect(stored?.identifier).not.toBe(session);

      expect(
        response.headers.get("cache-control"),
      ).toBe("no-store");
    });

    it("reuses the same persisted rate-limit record for an existing session", async () => {
      setSession(undefined);

      const first = await POST(makeRequest());

      const newSession = getNewSession(first);

      // Simulate the browser returning the cookie next time.
      setSession(newSession);

      const second = await POST(makeRequest());

      expect(second.status).toBe(200);

      expect(
        second.headers.get("set-cookie"),
      ).toBeNull();

      expect(rateRowCount()).toBe(1);

      expect(
        getRateRow(newSession)?.event_count,
      ).toBe(2);

      expect(
        getMetric("2026-11-04")?.event_count,
      ).toBe(2);
    });
  });

  describe("Database failure handling", () => {
    it("does not save a view when the rate-limit table is unavailable", async () => {
      // Simulate an analytics database failure using only the
      // isolated test database.
      sqliteD1.db.exec(
        "DROP TABLE analytics_rate_limit",
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await POST(makeRequest());

      // This in-memory adapter raises a SQLite error directly,
      // rather than wrapping it as a network D1Error.
      expect(response.status).toBe(500);

      expect(await response.json()).toEqual({
        error: "Analytics is temporarily unavailable.",
      });

      expect(
        response.headers.get("cache-control"),
      ).toBe("no-store");

      expect(getMetrics()).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it("does not report success when metric persistence fails", async () => {
      // Allow the rate-limit operation to succeed, then force
      // the metric INSERT to fail in SQLite.
      sqliteD1.db.exec(
        "DROP TABLE menu_item_metrics",
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await POST(makeRequest());

      expect(response.status).toBe(500);

      const body = await response.json();

      expect(body).toEqual({
        error: "Analytics is temporarily unavailable.",
      });

      // The rate-limit operation is a separate SQL statement,
      // so its recorded attempt is not rolled back here.
      expect(
        getRateRow(FIRST_SESSION)?.event_count,
      ).toBe(1);

      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
