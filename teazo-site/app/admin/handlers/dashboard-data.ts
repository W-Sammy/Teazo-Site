import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { DashboardMetrics } from "@/app/types/dashboard";
import type { StorageUsage } from "@/app/types/storage-usage";
import { getEvents } from "@/app/admin/events/handlers/get-events";
import { getWebsiteContent } from "@/app/admin/website-content/handlers/get-website-content";
import { getStorageUsage } from "@/app/admin/handlers/get-storage-usage";

type DashboardFixture = {
  metrics: DashboardMetrics;
};

export type DashboardData = {
  metrics: DashboardMetrics;
  events: AdminEvent[];
  websiteContent: WebsiteContent;
  storageUsage: StorageUsage[];
};

/**
 * Loads dashboard data from local fixtures for now.
 * Replace this function's data sources with API calls when the endpoints are ready.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const fixturePath = path.join(
    process.cwd(),
    "app",
    "admin",
    "dashboard-sample.txt",
  );
  const [fixtureContents, events, websiteContent, storageUsage] = await Promise.all([
    readFile(fixturePath, "utf8"),
    getEvents(),
    getWebsiteContent(),
    getStorageUsage(),
  ]);

  const fixture = JSON.parse(fixtureContents) as DashboardFixture;

  return {
    metrics: fixture.metrics,
    events,
    websiteContent,
    storageUsage,
  };
}
