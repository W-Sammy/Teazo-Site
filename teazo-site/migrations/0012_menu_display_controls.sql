-- Website-only menu curation. Square remains authoritative for catalog data.
ALTER TABLE menu_section ADD COLUMN section_type TEXT NOT NULL DEFAULT 'square'
  CHECK (section_type IN ('square', 'uncategorized', 'custom'));

ALTER TABLE menu_section ADD COLUMN default_item_visible INTEGER NOT NULL DEFAULT 1
  CHECK (default_item_visible IN (0,1));

CREATE INDEX ix_menu_section_env_order
  ON menu_section (square_env, sort_order, id);
