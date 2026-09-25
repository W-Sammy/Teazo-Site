import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { DashboardMetrics, DashboardPeriod, MenuItemMetric } from "@/app/types/dashboard";

export type DashboardClientProps = { metrics: DashboardMetrics; events: AdminEvent[]; websiteContent: WebsiteContent };
export type DashboardPeriodOption = { value: DashboardPeriod; label: string };
export const periodOptions: DashboardPeriodOption[] = [
  { value: "24-hours", label: "Past 24 hours" },
  { value: "7-days", label: "7 days" },
  { value: "30-days", label: "30 days" },
];
export type DashboardSummary = { totalVisits: number; topItem: MenuItemMetric | undefined };
