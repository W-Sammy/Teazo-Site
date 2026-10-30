/**
 * Tests real analytics SQL against isolated, in-memory SQLite.
 *
 * Uses the production analytics table migrations and actual
 * analytics query functions. No D1 proxy or production
 * database is accessed.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/app/lib/d1", () => ({
  prepare: mocks.prepare,
}));

import {
  listAnalyticsMetrics,
  recordMenuItemView,
  recordPageView,
} from "./analytics";

let db: DatabaseSync;

type BindValue =
  | string
  | number
  | bigint
  | null;

function prepareSql(sql: string) {
  const statement = db.prepare(sql);

  let parameters: BindValue[] = [];

  const api = {
    bind(...values: BindValue[]) {
      parameters = values;
      return api;
    },

    async run() {
      const result = statement.run(...parameters);

      return {
        success: true,
        results: [],
        meta: {
          changes: Number(result.changes),
        },
      };
    },

    async first<T>() {
      return (
        statement.get(...parameters) as T | undefined
      ) ?? null;
    },

    async all<T>() {
      return {
        success: true,
        results: statement.all(...parameters) as T[],
        meta: {},
      };
    },
  };

  return api;
}

function addPage(
  date: string,
  key: string,
  name: string,
  count: number,
) {
  db.prepare(
    `INSERT INTO page_metrics
       (metric_date, page_key, page_name, event_count)
     VALUES (?, ?, ?, ?)`,
  ).run(date, key, name, count);
}

function addItem(
  date: string,
  id: string,
  name: string,
  count: number,
) {
  db.prepare(
    `INSERT INTO menu_item_metrics
       (metric_date, square_item_id,
        item_name_snapshot, event_count)
     VALUES (?, ?, ?, ?)`,
  ).run(date, id, name, count);
}

describe("Analytics SQLite integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // October 30 in the Los Angeles time zone.
    vi.setSystemTime(
      new Date("2026-10-30T19:00:00.000Z"),
    );

    db = new DatabaseSync(":memory:");

    for (const migration of [
      "0005_menu_item_analytics.sql",
      "0006_page_analytics.sql",
    ]) {
      const sql = readFileSync(
        join(process.cwd(), "migrations", migration),
        "utf8",
      );

      db.exec(sql);
    }

    mocks.prepare.mockImplementation(prepareSql);
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aggregates daily counts within each reporting period", async () => {
    addPage("2026-10-30", "menu", "Menu", 3);
    addPage("2026-10-29", "menu", "Menu", 5);
    addPage("2026-10-23", "menu", "Menu", 7);
    addPage("2026-10-01", "menu", "Menu", 11);
    addPage("2026-09-30", "menu", "Menu", 100);

    addItem("2026-10-30", "ITEM-1", "Milk Tea", 2);
    addItem("2026-10-29", "ITEM-1", "Milk Tea", 4);
    addItem("2026-10-23", "ITEM-1", "Milk Tea", 6);
    addItem("2026-10-01", "ITEM-1", "Milk Tea", 8);
    addItem("2026-09-30", "ITEM-1", "Milk Tea", 100);

    const metrics = await listAnalyticsMetrics();

    expect(metrics["24-hours"].pages[0].event_count)
      .toBe(3);

    expect(metrics["7-days"].pages[0].event_count)
      .toBe(8);

    expect(metrics["30-days"].pages[0].event_count)
      .toBe(26);

    expect(
      metrics["24-hours"].menuItems[0].event_count,
    ).toBe(2);

    expect(
      metrics["7-days"].menuItems[0].event_count,
    ).toBe(6);

    expect(
      metrics["30-days"].menuItems[0].event_count,
    ).toBe(20);

    // The date outside the 30-day window is excluded.
    expect(
      metrics["30-days"].pages[0].event_count,
    ).not.toBe(126);
  });

  it("orders metrics by total count and applies the top-five limit", async () => {
    const counts = [4, 9, 2, 7, 6, 5, 1];

    counts.forEach((count, index) => {
      addPage(
        "2026-10-30",
        `page-${index}`,
        `Page ${index}`,
        count,
      );

      addItem(
        "2026-10-30",
        `item-${index}`,
        `Item ${index}`,
        count,
      );
    });

    const metrics = await listAnalyticsMetrics();

    for (const period of [
      "24-hours",
      "7-days",
      "30-days",
    ] as const) {
      expect(
        metrics[period].pages.map(
          (row) => row.event_count,
        ),
      ).toEqual([9, 7, 6, 5, 4]);

      expect(
        metrics[period].menuItems.map(
          (row) => row.event_count,
        ),
      ).toEqual([9, 7, 6, 5, 4]);
    }
  });

  it("uses stable ID ordering when counts are tied", async () => {
    addPage("2026-10-30", "gallery", "Gallery", 5);
    addPage("2026-10-30", "contact", "Contact", 5);

    addItem("2026-10-30", "ITEM-B", "Tea B", 5);
    addItem("2026-10-30", "ITEM-A", "Tea A", 5);

    const metrics = await listAnalyticsMetrics();

    expect(
      metrics["24-hours"].pages.map(
        (row) => row.page_path,
      ),
    ).toEqual(["contact", "gallery"]);

    expect(
      metrics["24-hours"].menuItems.map(
        (row) => row.square_item_id,
      ),
    ).toEqual(["ITEM-A", "ITEM-B"]);
  });

  it("increments repeated views through real database upserts", async () => {
    await recordPageView("2026-10-30", "menu");
    await recordPageView("2026-10-30", "menu");

    await recordMenuItemView(
      "2026-10-30",
      "ITEM-1",
      "Milk Tea",
    );

    await recordMenuItemView(
      "2026-10-30",
      "ITEM-1",
      "Updated Milk Tea",
    );

    const page = db.prepare(
      `SELECT event_count
         FROM page_metrics
        WHERE metric_date = ?
          AND page_key = ?`,
    ).get("2026-10-30", "menu");

    const item = db.prepare(
      `SELECT event_count, item_name_snapshot
         FROM menu_item_metrics
        WHERE metric_date = ?
          AND square_item_id = ?`,
    ).get("2026-10-30", "ITEM-1");

    expect(page?.event_count).toBe(2);

    expect(item).toMatchObject({
      event_count: 2,
      item_name_snapshot: "Updated Milk Tea",
    });

    const metrics = await listAnalyticsMetrics();

    expect(
      metrics["24-hours"].menuItems[0].event_count,
    ).toBe(2);
  });

  it("returns empty metrics when no analytics records exist", async () => {
    const metrics = await listAnalyticsMetrics();

    for (const period of [
      "24-hours",
      "7-days",
      "30-days",
    ] as const) {
      expect(metrics[period]).toEqual({
        menuItems: [],
        pages: [],
      });
    }
  });

  it("preserves the latest date for aggregated metrics", async () => {
    addPage("2026-10-28", "menu", "Menu", 4);
    addPage("2026-10-30", "menu", "Menu", 6);

    addItem("2026-10-28", "ITEM-1", "Tea", 3);
    addItem("2026-10-30", "ITEM-1", "Tea", 7);

    const metrics = await listAnalyticsMetrics();

    expect(metrics["7-days"].pages[0]).toMatchObject({
      event_count: 10,
      metric_date: "2026-10-30",
    });

    expect(
      metrics["7-days"].menuItems[0],
    ).toMatchObject({
      event_count: 10,
      metric_date: "2026-10-30",
    });
  });
});
