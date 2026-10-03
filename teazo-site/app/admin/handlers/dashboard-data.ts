import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { DashboardMetrics, DashboardPeriod, MenuItemMetric, PageMetric } from "@/app/types/dashboard";
import type { StorageUsage } from "@/app/types/storage-usage";
import { listActiveEvents } from "@/app/lib/queries/events";
import { getWebsiteContent } from "@/app/admin/website-content/handlers/get-website-content";
import { getStorageUsage } from "@/app/admin/handlers/get-storage-usage";

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
    metrics: normalizeMetrics(fixture.metrics),
    events,
    websiteContent,
    storageUsage,
  };
}
