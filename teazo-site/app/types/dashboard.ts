export type DashboardPeriod = "24-hours" | "7-days" | "30-days";

export type DashboardVisitType = "menu-items" | "pages";

// The metric tables are intentionally shaped like the future database records.
export type MenuItemMetric = {
  metric_date: string;
  square_item_id: string;
  item_name_snapshot: string;
  event_count: number;
};

export type PageMetric = {
  metric_date: string;
  page_path: string;
  page_name_snapshot: string;
  event_count: number;
};

export type DashboardPeriodMetrics<T> = Record<DashboardPeriod, T[]>;

export type DashboardMetrics = {
  menuItems: DashboardPeriodMetrics<MenuItemMetric>;
  pages: DashboardPeriodMetrics<PageMetric>;
};
