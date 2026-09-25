export type DashboardPeriod = "24-hours" | "7-days" | "30-days";

// The metric table is intentionally shaped like the future database record.
// metric_date and square_item_id together form the composite primary key.
export type MenuItemMetric = {
  metric_date: string;
  square_item_id: string;
  item_name_snapshot: string;
  event_count: number;
};

export type DashboardMetrics = Record<DashboardPeriod, MenuItemMetric[]>;
