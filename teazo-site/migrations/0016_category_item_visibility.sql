-- Preserve existing visibility while making future changes category-specific.
CREATE TABLE menu_section_item_display (
  section_id TEXT NOT NULL,
  square_catalog_object_id TEXT NOT NULL,
  square_env TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  hide_on_website INTEGER NOT NULL DEFAULT 0 CHECK (hide_on_website IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  PRIMARY KEY (section_id, square_catalog_object_id, square_env),
  FOREIGN KEY (section_id, square_env)
    REFERENCES menu_section(id, square_env) ON DELETE CASCADE,
  FOREIGN KEY (square_catalog_object_id, square_env)
    REFERENCES catalog_item_cache(square_object_id, square_env) ON DELETE RESTRICT
);

INSERT INTO menu_section
  (id, square_env, title, section_type, sort_order, is_published, default_item_visible)
SELECT 'category:' || env || ':uncategorized', env, 'Uncategorized', 'uncategorized', 999999, 1, 1
FROM (SELECT 'sandbox' AS env UNION ALL SELECT 'production')
WHERE NOT EXISTS (SELECT 1 FROM menu_section WHERE square_env = env AND section_type = 'uncategorized');

INSERT INTO menu_section_item_display
  (section_id, square_catalog_object_id, square_env, hide_on_website, updated_at, updated_by)
SELECT section.id, item.square_catalog_object_id, item.square_env,
       item.hide_on_website, item.updated_at, item.updated_by
FROM menu_item_display AS item
JOIN menu_section AS section ON section.square_env = item.square_env
WHERE section.section_type <> 'custom' OR EXISTS (
  SELECT 1 FROM menu_section_item AS membership
  WHERE membership.section_id = section.id AND membership.square_env = item.square_env
    AND membership.square_catalog_object_id = item.square_catalog_object_id
);
