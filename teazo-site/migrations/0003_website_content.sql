-- ---------------------------------------------------------------------------
-- 0003_website_content.sql
-- Add contact form toggle to business_profile, seed content blocks for story
-- and logo, and clean up duplicate email row from site_link.
-- ---------------------------------------------------------------------------

ALTER TABLE business_profile ADD COLUMN contact_form_enabled INTEGER NOT NULL DEFAULT 1 CHECK (contact_form_enabled IN (0,1));

INSERT INTO content_block (key, page_key, slot_key, block_type, value) VALUES
  ('home.story', 'home', 'story', 'text', 'TEAZO is specializing in bringing you high qualities drink, snack and dessert. We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used. From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!'),
  ('site.logo', 'site', 'logo', 'text', '/TEAZO_logo.svg')
ON CONFLICT (key) DO NOTHING;

DELETE FROM site_link WHERE key = 'email' AND link_group = 'social';
UPDATE site_link SET sort_order = 2 WHERE key = 'instagram' AND link_group = 'social';
UPDATE site_link SET sort_order = 3 WHERE key = 'yelp' AND link_group = 'social';
