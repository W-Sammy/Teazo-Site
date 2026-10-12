import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { DashboardMetrics, DashboardPeriod, MenuItemMetric, PageMetric } from "@/app/types/dashboard";
import type { StorageUsage } from "@/app/types/storage-usage";
import { listActiveEvents } from "@/app/lib/queries/events";
import { getWebsiteContent } from "@/app/admin/website-content/handlers/get-website-content";
import { getStorageUsage } from "@/app/admin/handlers/get-storage-usage";
import { listAnalyticsMetrics } from "@/app/lib/queries/analytics";

type DashboardFixture = {
  metrics: DashboardMetrics | LegacyDashboardMetrics;
};

type LegacyDashboardMetrics = Record<DashboardPeriod, MenuItemMetric[]>;

const periods: DashboardPeriod[] = ["24-hours", "7-days", "30-days"];

function normalizeMetrics(metrics: DashboardFixture["metrics"]): DashboardMetrics {
  if ("menuItems" in metrics && "pages" in metrics) return metrics;

  // Keep older local fixtures usable while the analytics data source is being migrated.
  const legacyMetrics = metrics as LegacyDashboardMetrics;
  const emptyPages = periods.reduce<Record<DashboardPeriod, PageMetric[]>>((pages, period) => {
    pages[period] = [];
    return pages;
  }, {} as Record<DashboardPeriod, PageMetric[]>);

  return {
    menuItems: legacyMetrics,
    pages: emptyPages,
  };
}

async function loadMetrics(fixture: DashboardFixture): Promise<DashboardMetrics> {
  if (!process.env.D1_PROXY_URL || !process.env.PROXY_TOKEN) return normalizeMetrics(fixture.metrics);

  try {
    const live = await listAnalyticsMetrics();
    return {
      menuItems: {
        "24-hours": live["24-hours"].menuItems,
        "7-days": live["7-days"].menuItems,
        "30-days": live["30-days"].menuItems,
      },
      pages: {
        "24-hours": live["24-hours"].pages,
        "7-days": live["7-days"].pages,
        "30-days": live["30-days"].pages,
      },
    };
  } catch (error) {
    // Keep the dashboard available during the migration/deployment window.
    console.error("Could not load live analytics; using dashboard fixture:", error);
    return normalizeMetrics(fixture.metrics);
  }
}

export type DashboardData = {
  metrics: DashboardMetrics;
  events: AdminEvent[];
  websiteContent: WebsiteContent;
  storageUsage: StorageUsage[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const fixturePath = path.join(process.cwd(), "app", "admin", "dashboard-sample.txt");
  const [fixtureContents, events, websiteContent, storageUsage] = await Promise.all([
    readFile(fixturePath, "utf8"),
    listActiveEvents(),
    getWebsiteContent(),
    getStorageUsage(),
  ]);
  const fixture = JSON.parse(fixtureContents) as DashboardFixture;

  return {
    // Visit metrics are still supplied by the existing dashboard fixture until
    // the page-visit tracking table is connected.
    metrics: await loadMetrics(fixture),
    events,
    websiteContent,
    storageUsage,
  };
}
