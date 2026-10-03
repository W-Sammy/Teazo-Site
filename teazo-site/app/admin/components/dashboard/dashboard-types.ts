import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { DashboardMetrics, DashboardPeriod, DashboardVisitType, MenuItemMetric, PageMetric } from "@/app/types/dashboard";
import type { StorageUsage } from "@/app/types/storage-usage";

export type DashboardClientProps = { metrics: DashboardMetrics; events: AdminEvent[]; websiteContent: WebsiteContent; storageUsage: StorageUsage[] };
export type DashboardVisitMetric = MenuItemMetric | PageMetric;
export type DashboardPeriodOption = { value: DashboardPeriod; label: string };
export type DashboardVisitTypeOption = { value: DashboardVisitType; label: string };
export const periodOptions: DashboardPeriodOption[] = [
  { value: "24-hours", label: "Past 24 hours" },
  { value: "7-days", label: "7 days" },
  { value: "30-days", label: "30 days" },
];
export const visitTypeOptions: DashboardVisitTypeOption[] = [
  { value: "menu-items", label: "Menu items" },
  { value: "pages", label: "Front-facing pages" },
];
export type DashboardSummary = { totalVisits: number; topItem: MenuItemMetric | undefined };
