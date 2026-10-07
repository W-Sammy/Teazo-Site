-- 0006: daily regular website page analytics.
-- Page keys are intentionally separate from Square menu-item identifiers.

CREATE TABLE page_metrics (
  metric_date TEXT NOT NULL,
  page_key TEXT NOT NULL,
  page_name TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (metric_date, page_key)
);

CREATE INDEX ix_page_metrics_date ON page_metrics (metric_date);
