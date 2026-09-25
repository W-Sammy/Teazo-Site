import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { DashboardMetrics } from "@/app/types/dashboard";
import { getEvents } from "@/app/admin/events/handlers/get-events";
import { getWebsiteContent } from "@/app/admin/website-content/handlers/get-website-content";

type DashboardFixture = {
  metrics: DashboardMetrics;
};

export type DashboardData = {
  metrics: DashboardMetrics;
  events: AdminEvent[];
  websiteContent: WebsiteContent;
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
  const [fixtureContents, events, websiteContent] = await Promise.all([
    readFile(fixturePath, "utf8"),
    getEvents(),
    getWebsiteContent(),
  ]);

  const fixture = JSON.parse(fixtureContents) as DashboardFixture;

  return {
    metrics: fixture.metrics,
    events,
    websiteContent,
  };
}
