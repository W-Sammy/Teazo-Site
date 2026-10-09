import "server-only";

import { prepare } from "@/app/lib/d1";
import type { MenuItemMetric, PageMetric } from "@/app/types/dashboard";

export const SHOP_TIME_ZONE = "America/Los_Angeles";
export const ANALYTICS_PAGE_KEYS = {
  home: "Home",
  menu: "Menu",
  gallery: "Gallery",
  contact: "Contact",
  delivery: "Delivery",
  "static-menu": "Static Menu",
} as const;

export type AnalyticsPageKey = keyof typeof ANALYTICS_PAGE_KEYS;

const periodDays = {
  "24-hours": 1,
  "7-days": 7,
  "30-days": 30,
} as const;

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getShopMetricDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftMetricDate(date: string, days: number): string {
  if (!isDate(date) || !Number.isInteger(days)) throw new Error("Invalid metric date");
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function isAnalyticsPageKey(value: unknown): value is AnalyticsPageKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ANALYTICS_PAGE_KEYS, value);
}

export async function recordPageView(date: string, pageKey: AnalyticsPageKey) {
  if (!isDate(date)) throw new Error("Invalid metric date");
  await prepare(
    `INSERT INTO page_metrics (metric_date, page_key, page_name, event_count)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT (metric_date, page_key) DO UPDATE SET
       event_count = page_metrics.event_count + 1,
       page_name = excluded.page_name`,
  ).bind(date, pageKey, ANALYTICS_PAGE_KEYS[pageKey]).run();
}

export async function recordMenuItemView(date: string, itemId: string, itemName: string) {
  if (!isDate(date)) throw new Error("Invalid metric date");
  const squareItemId = itemId.trim();
  const name = itemName.trim();
  if (!squareItemId || squareItemId.length > 200) throw new Error("Invalid Square item ID");
  if (!name || name.length > 300) throw new Error("Invalid menu item name");

  await prepare(
    `INSERT INTO menu_item_metrics (metric_date, square_item_id, item_name_snapshot, event_count)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT (metric_date, square_item_id) DO UPDATE SET
       event_count = menu_item_metrics.event_count + 1,
       item_name_snapshot = excluded.item_name_snapshot`,
  ).bind(date, squareItemId, name).run();
}

export async function consumeAnalyticsRateLimit(rateKey: string, now = new Date()) {
  const windowStart = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const currentTime = now.toISOString();

  const result = await prepare(
    `INSERT INTO analytics_rate_limit (identifier, window_started_at, event_count)
     VALUES (?1, ?3, 1)
     ON CONFLICT (identifier) DO UPDATE SET
       event_count = CASE
         WHEN analytics_rate_limit.window_started_at < ?2 THEN 1
         ELSE analytics_rate_limit.event_count + 1
       END,
       window_started_at = CASE
         WHEN analytics_rate_limit.window_started_at < ?2 THEN ?3
         ELSE analytics_rate_limit.window_started_at
       END
     RETURNING event_count`,
  ).bind(rateKey, windowStart, currentTime).first<{ event_count: number }>();

  return (result?.event_count ?? Number.MAX_SAFE_INTEGER) <= 30;
}

export async function listAnalyticsMetrics() {
  const today = getShopMetricDate();
  const results = await Promise.all(
    Object.entries(periodDays).map(async ([period, days]) => {
      const fromDate = shiftMetricDate(today, -(days - 1));
      const [menuItems, pages] = await Promise.all([
        prepare(
          `SELECT square_item_id, item_name_snapshot, SUM(event_count) AS event_count,
                  MAX(metric_date) AS metric_date
             FROM menu_item_metrics
            WHERE metric_date >= ?1 AND metric_date <= ?2
            GROUP BY square_item_id, item_name_snapshot
            ORDER BY event_count DESC, square_item_id ASC
            LIMIT 5`,
        ).bind(fromDate, today).all<MenuItemMetric>(),
        prepare(
          `SELECT page_key AS page_path, page_name AS page_name_snapshot,
                  SUM(event_count) AS event_count, MAX(metric_date) AS metric_date
             FROM page_metrics
            WHERE metric_date >= ?1 AND metric_date <= ?2
            GROUP BY page_key, page_name
            ORDER BY event_count DESC, page_key ASC
            LIMIT 5`,
        ).bind(fromDate, today).all<PageMetric>(),
      ]);
      return [period, { menuItems: menuItems.results, pages: pages.results }] as const;
    }),
  );

  return Object.fromEntries(results) as Record<keyof typeof periodDays, { menuItems: MenuItemMetric[]; pages: PageMetric[] }>;
}

export async function deleteExpiredAnalytics(cutoffDate: string) {
  if (!isDate(cutoffDate)) throw new Error("Invalid cleanup date");
  const [pages, menuItems, rateLimits] = await Promise.all([
    prepare("DELETE FROM page_metrics WHERE metric_date < ?1").bind(cutoffDate).run(),
    prepare("DELETE FROM menu_item_metrics WHERE metric_date < ?1").bind(cutoffDate).run(),
    prepare("DELETE FROM analytics_rate_limit WHERE window_started_at < ?1").bind(`${cutoffDate}T00:00:00.000Z`).run(),
  ]);
  return { pages: pages.meta, menuItems: menuItems.meta, rateLimits: rateLimits.meta };
}
