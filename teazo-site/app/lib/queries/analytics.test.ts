/**
 * Automated tests for analytics database queries.
 *
 * Covers page and menu-item tracking, shop-local dates,
 * rate limiting, dashboard metric retrieval, and cleanup.
 *
 * D1 is fully mocked. No production database is accessed.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/app/lib/d1", () => ({
  prepare: mocks.prepare,
}));

import {
  consumeAnalyticsRateLimit,
  deleteExpiredAnalytics,
  getShopMetricDate,
  isAnalyticsPageKey,
  listAnalyticsMetrics,
  recordMenuItemView,
  recordPageView,
  shiftMetricDate,
} from "./analytics";

type StatementCall = {
  sql: string;
  params: unknown[];
};

const statements: StatementCall[] = [];

let rateCount = 1;

const menuRows = [
  {
    metric_date: "2026-10-30",
    square_item_id: "item-1",
    item_name_snapshot: "Milk Tea",
    event_count: 12,
  },
];

const pageRows = [
  {
    metric_date: "2026-10-30",
    page_path: "menu",
    page_name_snapshot: "Menu",
    event_count: 25,
  },
];

function setupDatabase() {
  mocks.prepare.mockImplementation((sql: string) => {
    const statement: StatementCall = {
      sql,
      params: [],
    };

    statements.push(statement);

    const query = {
      bind: vi.fn((...params: unknown[]) => {
        statement.params = params;
        return query;
      }),

      run: vi.fn(async () => ({
        success: true,
        meta: { changes: 1 },
      })),

      first: vi.fn(async () => ({
        event_count: rateCount,
      })),

      all: vi.fn(async () => ({
        success: true,
        results: sql.includes("FROM menu_item_metrics")
          ? menuRows
          : pageRows,
        meta: {},
      })),
    };

    return query;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();

  statements.length = 0;
  rateCount = 1;

  setupDatabase();
});

describe("Analytics date helpers", () => {
  it("uses the Los Angeles calendar date before local midnight", () => {
    expect(
      getShopMetricDate(
        new Date("2026-07-15T06:59:59.000Z"),
      ),
    ).toBe("2026-07-14");
  });

  it("changes the shop date at Pacific midnight", () => {
    expect(
      getShopMetricDate(
        new Date("2026-07-15T07:00:00.000Z"),
      ),
    ).toBe("2026-07-15");
  });

  it("handles Pacific Standard Time in winter", () => {
    expect(
      getShopMetricDate(
        new Date("2026-01-15T07:30:00.000Z"),
      ),
    ).toBe("2026-01-14");
  });

  it("shifts dates correctly across month and year boundaries", () => {
    expect(
      shiftMetricDate("2026-01-01", -1),
    ).toBe("2025-12-31");

    expect(
      shiftMetricDate("2026-10-30", -29),
    ).toBe("2026-10-01");
  });

  it("rejects malformed dates and noninteger shifts", () => {
    expect(() =>
      shiftMetricDate("invalid", 1),
    ).toThrow("Invalid metric date");

    expect(() =>
      shiftMetricDate("2026-10-30", 1.5),
    ).toThrow("Invalid metric date");
  });
});

describe("Analytics page tracking", () => {
  it("accepts only approved page keys", () => {
    for (const page of [
      "home",
      "menu",
      "gallery",
      "contact",
      "delivery",
      "static-menu",
    ]) {
      expect(isAnalyticsPageKey(page)).toBe(true);
    }

    for (const page of [
      "",
      "admin",
      "unknown",
      null,
      123,
      {},
    ]) {
      expect(isAnalyticsPageKey(page)).toBe(false);
    }
  });

  it("records page views using the approved page name", async () => {
    await recordPageView("2026-10-30", "menu");

    expect(statements).toHaveLength(1);

    expect(statements[0].sql).toContain(
      "INSERT INTO page_metrics",
    );

    expect(statements[0].sql).toContain(
      "ON CONFLICT",
    );

    expect(statements[0].params).toEqual([
      "2026-10-30",
      "menu",
      "Menu",
    ]);
  });

  it("rejects invalid dates before accessing D1", async () => {
    await expect(
      recordPageView("not-a-date", "menu"),
    ).rejects.toThrow("Invalid metric date");

    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});

describe("Analytics menu-item tracking", () => {
  it("normalizes item IDs and names before recording views", async () => {
    await recordMenuItemView(
      "2026-10-30",
      "  item-1  ",
      "  Milk Tea  ",
    );

    expect(statements).toHaveLength(1);

    expect(statements[0].sql).toContain(
      "INSERT INTO menu_item_metrics",
    );

    expect(statements[0].sql).toContain(
      "ON CONFLICT",
    );

    expect(statements[0].params).toEqual([
      "2026-10-30",
      "item-1",
      "Milk Tea",
    ]);
  });

  it("rejects invalid item identifiers and names", async () => {
    await expect(
      recordMenuItemView("2026-10-30", " ", "Milk Tea"),
    ).rejects.toThrow("Invalid Square item ID");

    await expect(
      recordMenuItemView(
        "2026-10-30",
        "x".repeat(201),
        "Milk Tea",
      ),
    ).rejects.toThrow("Invalid Square item ID");

    await expect(
      recordMenuItemView("2026-10-30", "item-1", " "),
    ).rejects.toThrow("Invalid menu item name");

    await expect(
      recordMenuItemView(
        "2026-10-30",
        "item-1",
        "x".repeat(301),
      ),
    ).rejects.toThrow("Invalid menu item name");

    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});

describe("Analytics rate limiting", () => {
  it("allows exactly 30 recorded events", async () => {
    rateCount = 30;

    const allowed = await consumeAnalyticsRateLimit(
      "test-session",
      new Date("2026-10-30T18:00:00Z"),
    );

    expect(allowed).toBe(true);

    expect(statements[0].params).toEqual([
      "test-session",
      "2026-10-30T17:50:00.000Z",
      "2026-10-30T18:00:00.000Z",
    ]);
  });

  it("rejects the 31st event", async () => {
    rateCount = 31;

    const allowed = await consumeAnalyticsRateLimit(
      "test-session",
    );

    expect(allowed).toBe(false);
  });

  it("fails closed if D1 provides no rate-limit count", async () => {
    mocks.prepare.mockImplementationOnce(() => ({
      bind: () => ({
        first: async () => null,
      }),
    }));

    const allowed = await consumeAnalyticsRateLimit(
      "test-session",
    );

    expect(allowed).toBe(false);
  });
});

describe("Dashboard analytics retrieval", () => {
  it("retrieves page and menu metrics for all three periods", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(
      new Date("2026-10-30T19:00:00.000Z"),
    );

    try {
      const metrics = await listAnalyticsMetrics();

      expect(Object.keys(metrics)).toEqual([
        "24-hours",
        "7-days",
        "30-days",
      ]);

      for (const period of [
        "24-hours",
        "7-days",
        "30-days",
      ] as const) {
        expect(metrics[period].menuItems).toEqual(menuRows);
        expect(metrics[period].pages).toEqual(pageRows);
      }

      expect(statements).toHaveLength(6);

      const ranges = statements.map(
        (statement) => statement.params,
      );

      expect(ranges).toEqual([
        ["2026-10-30", "2026-10-30"],
        ["2026-10-30", "2026-10-30"],
        ["2026-10-24", "2026-10-30"],
        ["2026-10-24", "2026-10-30"],
        ["2026-10-01", "2026-10-30"],
        ["2026-10-01", "2026-10-30"],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Analytics cleanup queries", () => {
  it("deletes only records older than the cutoff", async () => {
    const result = await deleteExpiredAnalytics(
      "2026-10-01",
    );

    expect(statements).toHaveLength(3);

    expect(statements[0].sql).toContain(
      "DELETE FROM page_metrics WHERE metric_date < ?1",
    );

    expect(statements[1].sql).toContain(
      "DELETE FROM menu_item_metrics WHERE metric_date < ?1",
    );

    expect(statements[2].sql).toContain(
      "DELETE FROM analytics_rate_limit WHERE window_started_at < ?1",
    );

    expect(statements[0].params).toEqual([
      "2026-10-01",
    ]);

    expect(statements[1].params).toEqual([
      "2026-10-01",
    ]);

    expect(statements[2].params).toEqual([
      "2026-10-01T00:00:00.000Z",
    ]);

    expect(result.pages).toEqual({ changes: 1 });
    expect(result.menuItems).toEqual({ changes: 1 });
    expect(result.rateLimits).toEqual({ changes: 1 });
  });

  it("rejects an invalid cleanup date without accessing D1", async () => {
    await expect(
      deleteExpiredAnalytics("invalid-date"),
    ).rejects.toThrow("Invalid cleanup date");

    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
