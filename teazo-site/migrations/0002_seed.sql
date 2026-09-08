-- TEAZO — seed data.
-- Every value below is lifted verbatim from the current source so that the
-- first DB-backed render is byte-identical to what is on the site today.
-- Sources are cited per block.

-- ---------------------------------------------------------------------------
-- Roles — matches AdminRole = 1 | 2 | 3 on branch steven-create-admins
-- (teazo-site/app/types/admin-perms.ts)
-- ---------------------------------------------------------------------------
INSERT INTO role (id, key, label, rank) VALUES
  (1, 'owner',   'Owner',   10),
  (2, 'manager', 'Manager', 20),
  (3, 'staff',   'Staff',   30);

-- ---------------------------------------------------------------------------
-- Business profile — app/(site)/contact/contact-content.ts:22-32
-- ---------------------------------------------------------------------------
INSERT INTO business_profile (
  id, business_name, street_address, locality, phone, email, map_query
) VALUES (
  1,
  'TEAZO',
  '1050 Taraval St.',
  'San Francisco, CA 94116-2423',
  '+1 (415) 748-7398',
  'teazosf@hotmail.com',
  '1050 Taraval St, San Francisco, CA 94116'
);

-- ---------------------------------------------------------------------------
-- Hours — app/(site)/contact/contact-content.ts:33-41
-- day_of_week 0 = Monday, matching the order the contact card renders.
-- ---------------------------------------------------------------------------
INSERT INTO business_hours (day_of_week, display_text, opens_at, closes_at) VALUES
  (0, '11:00 AM - 8:00 PM',  '11:00', '20:00'),
  (1, '11:00 AM - 6:00 PM',  '11:00', '18:00'),
  (2, '11:00 AM - 8:00 PM',  '11:00', '20:00'),
  (3, '11:00 AM - 8:00 PM',  '11:00', '20:00'),
  (4, '11:00 AM - 10:00 PM', '11:00', '22:00'),
  (5, '11:00 AM - 10:00 PM', '11:00', '22:00'),
  (6, '11:00 AM - 8:00 PM',  '11:00', '20:00');

-- ---------------------------------------------------------------------------
-- Outbound links
--   social   — app/(site)/contact/page.tsx:39-43
--   delivery — app/(site)/delivery/page.tsx:70-72
-- Note: app/(site)/page.tsx:109-122 renders the same four social icons with
-- href="" — that divergence is exactly what this table removes.
-- ---------------------------------------------------------------------------
INSERT INTO site_link (key, link_group, label, url, aria_label, sort_order) VALUES
  ('facebook',  'social', 'Facebook',  'https://www.facebook.com/people/TEAZO/100063111166083', 'TEAZO on Facebook',  1),
  ('email',     'social', 'Email',     'mailto:teazosf@hotmail.com',                            'Email TEAZO',        2),
  ('instagram', 'social', 'Instagram', 'https://www.instagram.com/teazosf/',                    'TEAZO on Instagram', 3),
  ('yelp',      'social', 'Yelp',      'https://www.yelp.com/biz/teazo-san-francisco',          'TEAZO on Yelp',      4),
  ('ubereats',  'delivery', 'UBER EATS', 'https://www.ubereats.com/store/teazo/HmB7kkvSQdeWw6qSClzgzg?srsltid=AfmBOoranl_YtSY-qug2w6ZzmFcwawnUN1t6RJMvTnqq32BwwVXubRgr', NULL, 1),
  ('doordash',  'delivery', 'DOORDASH',  'https://www.doordash.com/en/store/teazo-san-francisco-849601/1213761/?srsltid=AfmBOortGz8HB9dVSbrcnGxXWHRoalBu_ObBQ_Fv-r0SRKiFrYvWQawu', NULL, 2),
  ('postmates', 'delivery', 'POSTMATES', 'https://postmates.com/store/teazo/HmB7kkvSQdeWw6qSClzgzg', NULL, 3);

-- ---------------------------------------------------------------------------
-- Editable copy — lifted from the inline JSX literals.
--   delivery headings  app/(site)/delivery/page.tsx:60-65
--   static menu helper app/(site)/static-menu/static-menu-content.tsx:57-59
-- ---------------------------------------------------------------------------
INSERT INTO content_block (key, page_key, slot_key, block_type, value) VALUES
  ('delivery.heading_line1',  'delivery',    'heading_line1',  'text', 'HUNGRY AT HOME?'),
  ('delivery.heading_line2',  'delivery',    'heading_line2',  'text', 'WE DELIVER.'),
  ('static_menu.helper_text', 'static_menu', 'helper_text',    'text', 'Use the button above to open our menu.'),
  ('gallery.heading',         'gallery',     'heading',        'text', 'GALLERY');

-- ---------------------------------------------------------------------------
-- Sync state. The Square client is pinned to Sandbox at app/lib/square.ts:8,
-- so every cached row and every curation row starts life in the sandbox
-- keyspace. Sandbox and production catalogs share no object ids — the
-- square_env column on those tables is what makes the cutover survivable.
-- ---------------------------------------------------------------------------
INSERT INTO square_sync_state (key, square_env) VALUES ('catalog', 'sandbox');

-- ---------------------------------------------------------------------------
-- Menu sections — titles and subtitles from app/(site)/menu/page.tsx:156-696.
-- square_category_id is left NULL for every row: the 71 mock items carry
-- hand-written slugs ('specials', 'souffle-pancake') that match no Square
-- object, so the real ids must be filled in by the catalog sync.
-- 'TEAZO Special' is intentionally permanent-NULL — it is a curated grouping
-- with no Square CATEGORY behind it.
-- ---------------------------------------------------------------------------
INSERT INTO menu_section (square_env, title, subtitle, sort_order) VALUES
  ('sandbox', 'TEAZO Special',            NULL,                                                        1),
  ('sandbox', 'Japanese Soufflé Pancake', 'Think cottony clouds of heaven that melt in your mouth',    2),
  ('sandbox', 'Tiramisu Cheezo',          NULL,                                                        3),
  ('sandbox', 'Cheezo Tea',               'Fresh brewed premium tea with salty cheese cream',          4),
  ('sandbox', 'Milk Tea',                 NULL,                                                        5),
  ('sandbox', 'Fresh Fruit Tea',          NULL,                                                        6),
  ('sandbox', 'Matcha',                   NULL,                                                        7),
  ('sandbox', 'Caffeine Free Drink',      NULL,                                                        8),
  ('sandbox', 'Dessert & Cake',           NULL,                                                        9),
  ('sandbox', 'Snack',                    NULL,                                                       10);

-- ---------------------------------------------------------------------------
-- Gallery tags — the distinct tag vocabulary used by the admin gallery mock
-- at app/admin/gallery/page.tsx:15-57.
-- ---------------------------------------------------------------------------
INSERT INTO gallery_tag (name, name_normalized) VALUES
  ('Matcha',          'matcha'),
  ('Recommendations', 'recommendations'),
  ('Milk Tea',        'milk tea'),
  ('Shop',            'shop'),
  ('Promotions',      'promotions'),
  ('Limited Time',    'limited time'),
  ('Cheezo Tea',      'cheezo tea'),
  ('Trending',        'trending'),
  ('Food',            'food');
