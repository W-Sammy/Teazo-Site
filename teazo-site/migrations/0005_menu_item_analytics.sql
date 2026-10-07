-- 0005: daily Square menu-item analytics.
-- Menu-item page views are recorded by the future item-detail view hook.

CREATE TABLE menu_item_metrics (
  metric_date        TEXT NOT NULL,
  square_item_id     TEXT NOT NULL,
  item_name_snapshot TEXT NOT NULL,
  event_count        INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (metric_date, square_item_id)
);

CREATE TABLE analytics_rate_limit (
  identifier         TEXT PRIMARY KEY NOT NULL,
  window_started_at  TEXT NOT NULL,
  event_count        INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0)
);

CREATE INDEX ix_menu_item_metrics_date ON menu_item_metrics (metric_date);
